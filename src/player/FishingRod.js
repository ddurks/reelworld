import { FishingLine } from "./FishingLine.js";

export class FishingRod {
  constructor(scene, skeleton, handBone, skinnedMesh, reelGuy) {
    this.scene = scene;
    this.skeleton = skeleton;
    this.handBone = handBone;
    this.skinnedMesh = skinnedMesh;
    this.reelGuy = reelGuy;
    this.meshes = null;
    this.rootMesh = null;
    this.isVisible = false;
    this.bobber = null;
    this.bobberPhysics = null;
    this.fishingLine = new FishingLine(scene);
    this.rodTipPosition = null;
    this.bobberInWater = false;
    this.lastReelRotation = 0;
    this.lastBobberRippleTime = 0;
    this.bobberRippleCooldown = 1500;

    this.loadModel();
  }

  async loadModel() {
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "./assets/3d/",
        "reelrod.glb",
        this.scene
      );

      this.rootMesh = result.meshes[0];
      this.meshes = result.meshes;

      if (this.handBone && this.skinnedMesh) {
        this.rootMesh.attachToBone(this.handBone, this.skinnedMesh);
        this.rootMesh.rotation = new BABYLON.Vector3(Math.PI / 4, 0, 0);
        this.rootMesh.position = new BABYLON.Vector3(-0.15, 0, -0.1);
        this.rodTipPosition = new BABYLON.Vector3(0, 0, 2);
      }

      await this.loadBobber();
      this.hide();
    } catch (err) {
      console.error("Failed to load fishing rod:", err);
    }
  }

  async loadBobber() {
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "./assets/3d/",
        "bobber.glb",
        this.scene
      );

      this.bobber = result.meshes[0];
      this.bobber.rotation = new BABYLON.Vector3(Math.PI, 0, 0);
      this.bobber.setEnabled(false);

      this.bobberPhysics = new BABYLON.PhysicsAggregate(
        this.bobber,
        BABYLON.PhysicsShapeType.SPHERE,
        { mass: 0.1, restitution: 0.3, friction: 0.5, radius: 0.25 },
        this.scene
      );

      this.bobberPhysics.body.setGravityFactor(1);
      this.bobberPhysics.body.setMassProperties({
        inertia: new BABYLON.Vector3(0, 0, 0),
      });
      this.bobberPhysics.body.setAngularDamping(1.0);

      if (this.bobberPhysics.body.shape) {
        this.bobberPhysics.body.shape.filterMembershipMask = 16;
        this.bobberPhysics.body.shape.filterCollideMask = 0xffffffff;
      }
    } catch (err) {
      console.error("Failed to load bobber:", err);
    }
  }

  getRodTipWorldPosition() {
    if (!this.rootMesh) return null;

    const localTipOffset = new BABYLON.Vector3(0, 3.1, 0);
    this.rootMesh.computeWorldMatrix(true);
    const worldMatrix = this.rootMesh.getWorldMatrix();

    return BABYLON.Vector3.TransformCoordinates(localTipOffset, worldMatrix);
  }

  castLine(ponds) {
    if (!this.bobber || !this.rootMesh || !this.reelGuy) return;

    const characterRotation =
      this.reelGuy.model.rotationQuaternion || BABYLON.Quaternion.Identity();
    const characterForward = new BABYLON.Vector3(0, 0, -1);
    const castDirection = characterForward.rotateByQuaternionToRef(
      characterRotation,
      new BABYLON.Vector3()
    );
    castDirection.y = 0;
    castDirection.normalize();

    const startPos = this.getRodTipWorldPosition();
    if (!startPos) {
      console.warn("Cannot cast: rod tip position not available");
      return;
    }

    this.bobber.setEnabled(true);
    this.bobber.position = startPos.clone();
    this.bobberPhysics.body.disablePreStep = false;
    this.bobberPhysics.transformNode.position = startPos.clone();

    const castVelocity = castDirection.scale(18);
    castVelocity.y = 4;
    this.bobberPhysics.body.setLinearVelocity(castVelocity);

    setTimeout(() => {
      const rodTipPos = this.getRodTipWorldPosition();
      if (rodTipPos) {
        this.fishingLine.createPhysicsRope(
          rodTipPos,
          this.bobber.position,
          this.bobberPhysics
        );
      }
    }, 100);
  }

  updateLine(reelRotation = 0) {
    if (!this.bobber || !this.bobber.isEnabled() || !this.reelGuy) {
      return;
    }

    const rodTipPos = this.getRodTipWorldPosition();
    if (!rodTipPos) return;

    // Handle reeling based on rotation change
    const rotationDelta = reelRotation - this.lastReelRotation;

    // Positive rotation = reel in (remove segments), negative = reel out (add segments)
    // Trigger on larger threshold to avoid too frequent changes
    if (Math.abs(rotationDelta) > 10) {
      if (rotationDelta > 0) {
        this.fishingLine.reelIn();
      } else {
        this.fishingLine.reelOut();
      }
      this.lastReelRotation = reelRotation;
    }

    this.fishingLine.update(rodTipPos, this.bobber.position);
  }

  reelIn() {
    if (this.bobber) {
      this.bobber.setEnabled(false);
    }
    this.bobberInWater = false;
    this.lastReelRotation = 0;
    this.fishingLine.dispose();
  }

  update(ponds, reelRotation = 0) {
    this.updateLine(reelRotation);
    this.checkBobberWaterCollision(ponds);
  }

  checkBobberWaterCollision(ponds) {
    if (!this.bobber || !this.bobber.isEnabled() || !ponds) return;

    const bobberPos = this.bobber.position;
    const currentTime = Date.now();

    // Check if bobber is in water for each pond
    for (const pond of ponds) {
      const inXZBounds =
        bobberPos.x >= pond.bounds.minX &&
        bobberPos.x <= pond.bounds.maxX &&
        bobberPos.z >= pond.bounds.minZ &&
        bobberPos.z <= pond.bounds.maxZ;

      if (!inXZBounds) continue;

      const wasInWater = this.bobberInWater;
      const isNowInWater = bobberPos.y <= pond.waterSurfaceY + 0.5;

      // Create ripple when bobber just entered water or periodically while bobbing
      if (
        isNowInWater &&
        currentTime - this.lastBobberRippleTime > this.bobberRippleCooldown
      ) {
        const ripplePos = new BABYLON.Vector3(
          bobberPos.x,
          pond.waterSurfaceY,
          bobberPos.z
        );
        pond.createRipple(ripplePos, 0.5);
        this.lastBobberRippleTime = currentTime;
      }

      this.bobberInWater = isNowInWater;
      break;
    }
  }

  show(ponds) {
    if (this.meshes) {
      this.meshes.forEach((mesh) => mesh.setEnabled(true));
      this.isVisible = true;

      if (ponds) {
        ponds.forEach((pond) => pond.updateWaterRenderList());
      }
    }
  }

  hide() {
    if (this.meshes) {
      this.meshes.forEach((mesh) => mesh.setEnabled(false));
      this.isVisible = false;
    }
  }

  dispose() {
    if (this.meshes) {
      this.meshes.forEach((mesh) => mesh.dispose());
    }
    if (this.bobber) {
      this.bobber.dispose();
    }
    if (this.bobberPhysics) {
      this.bobberPhysics.dispose();
    }
    this.fishingLine.dispose();
  }
}
