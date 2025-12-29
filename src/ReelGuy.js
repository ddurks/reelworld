import { FishingRod } from "./FishingRod.js";

export class ReelGuy {
  constructor(scene, position, isMobile, camera, level, ponds = []) {
    this.scene = scene;
    this.position = position;
    this.isMobile = isMobile;
    this.camera = camera;
    this.level = level;
    this.ponds = ponds;
    this.model = null;
    this.physicsBody = null;
    this.bodyMesh = null;
    this.skeleton = null;
    this.animationsMap = new Map();
    this.fishingRod = null;
    this.isFishing = false;
    this.currentAction = "idle";
    this.waterBobTime = 0;
    this.isInWater = false;

    this.walkDirection = BABYLON.Vector3.Zero();
    this.defaultWalkVelocity = 10;
    this.walkVelocity = 10;
    this.walkStart = null;

    this.isJumping = false;
    this.isStartingJump = false;

    this.currentExpression = "normal";
    this.lastBlinkTime = 0;
    this.nextBlinkDelay = this.getRandomBlinkDelay();
  }

  getRandomBlinkDelay() {
    return 2000 + Math.random() * 4000;
  }

  async load() {
    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      "",
      "./assets/",
      "reelguy.glb",
      this.scene
    );

    this.model = result.meshes[0];

    result.meshes.forEach((mesh) => {
      if (mesh.material) {
        mesh.receiveShadows = true;
      }
    });

    this.faceMesh = result.meshes.find((m) =>
      m.name.toLowerCase().includes("face")
    );

    if (this.faceMesh && this.faceMesh.material) {
      this.faceTextures = {
        normal: new BABYLON.Texture(
          "./assets/faces/fisherman_faces-1.png",
          this.scene
        ),
        happy: new BABYLON.Texture(
          "./assets/faces/fisherman_faces-2.png",
          this.scene
        ),
        eyesClosed: new BABYLON.Texture(
          "./assets/faces/fisherman_faces-3.png",
          this.scene
        ),
        bored: new BABYLON.Texture(
          "./assets/faces/fisherman_faces-4.png",
          this.scene
        ),
        scared: new BABYLON.Texture(
          "./assets/faces/fisherman_faces-5.png",
          this.scene
        ),
        sad: new BABYLON.Texture(
          "./assets/faces/fisherman_faces-6.png",
          this.scene
        ),
      };

      Object.values(this.faceTextures).forEach((texture) => {
        texture.vScale = -1;
      });

      this.currentExpression = "normal";
    }

    this.bodyMesh = BABYLON.MeshBuilder.CreateCylinder(
      "characterBody",
      { height: 4, diameter: 1.5 },
      this.scene
    );

    this.bodyMesh.position = this.position;
    this.bodyMesh.isVisible = false;

    this.model.parent = this.bodyMesh;
    this.model.position = new BABYLON.Vector3(0, -2, 0);

    const physicsShape = new BABYLON.PhysicsShapeCapsule(
      new BABYLON.Vector3(0, -1.5, 0),
      new BABYLON.Vector3(0, -0.5, 0),
      0.5,
      this.scene
    );

    const physicsBody = new BABYLON.PhysicsBody(
      this.bodyMesh,
      BABYLON.PhysicsMotionType.DYNAMIC,
      false,
      this.scene
    );

    physicsBody.setMassProperties({
      mass: 1,
      centerOfMass: new BABYLON.Vector3(0, -1.5, 0),
      inertia: new BABYLON.Vector3(0, 0, 0),
    });

    physicsShape.filterMembershipMask = 1;
    physicsShape.filterCollideMask = 2;
    physicsBody.shape = physicsShape;
    physicsBody.setLinearDamping(0.999);
    physicsBody.setAngularDamping(1.0);

    this.bodyMesh.physicsBody = physicsBody;
    this.physicsBody = physicsBody;

    result.animationGroups.forEach((ag) => {
      this.animationsMap.set(ag.name, ag);
      ag.stop();
    });

    if (this.animationsMap.has("jump")) {
      this.animationsMap.get("jump").loopAnimation = false;
    }

    if (this.animationsMap.has("idle")) {
      this.animationsMap.get("idle").start(true);
    }

    this.model.getChildMeshes().forEach((mesh) => {
      if (mesh.skeleton) {
        this.skeleton = mesh.skeleton;
      }
    });

    if (this.skeleton) {
      const handBone = this.skeleton.bones.find((b) => b.name === "hand.r");
      const skinnedMesh = this.model
        .getChildMeshes()
        .find((m) => m.skeleton === this.skeleton);

      if (handBone && skinnedMesh) {
        this.fishingRod = new FishingRod(
          this.scene,
          this.skeleton,
          handBone,
          skinnedMesh,
          this
        );
      }
    }

    return this;
  }

  setFaceExpression(expression) {
    if (!this.faceMesh || !this.faceTextures || !this.faceMesh.material) return;

    const texture = this.faceTextures[expression];
    if (texture) {
      if (this.faceMesh.material.albedoTexture) {
        this.faceMesh.material.albedoTexture = texture;
      } else if (this.faceMesh.material.diffuseTexture) {
        this.faceMesh.material.diffuseTexture = texture;
      } else if (this.faceMesh.material.emissiveTexture) {
        this.faceMesh.material.emissiveTexture = texture;
      }
      this.currentExpression = expression;
    }
  }

  blink() {
    if (!this.faceMesh || !this.faceTextures) return;

    const previousExpression = this.currentExpression;
    this.setFaceExpression("eyesClosed");

    setTimeout(() => {
      this.setFaceExpression(previousExpression);
    }, 150);
  }

  toggleFishingMode() {
    if (!this.fishingRod) return;

    this.isFishing = !this.isFishing;

    if (this.isFishing) {
      this.fishingRod.show(this.ponds);

      setTimeout(() => {
        if (this.fishingRod) {
          this.fishingRod.castLine(this.ponds);
        }
      }, 500);

      const fishingAnim = this.animationsMap.get("fishing");
      if (fishingAnim) {
        for (const [name, anim] of this.animationsMap) {
          if (anim.isPlaying) {
            anim.stop();
          }
        }
        fishingAnim.start(true, 1.0);
      }
    } else {
      this.fishingRod.hide();
      this.fishingRod.reelIn();

      const fishingAnim = this.animationsMap.get("fishing");
      if (fishingAnim) {
        fishingAnim.stop();
      }
      const idleAnim = this.animationsMap.get("idle");
      if (idleAnim) {
        idleAnim.start(true, 1.0);
      }
    }
  }

  getPosition() {
    return this.bodyMesh.position;
  }

  getModelPosition() {
    return this.model.position;
  }

  applyWaterPhysics(delta) {
    if (!this.physicsBody || !this.ponds?.length) return;

    const playerPos = this.bodyMesh.position;
    let inWater = false;
    let waterSurfaceY = 0;

    for (const pond of this.ponds) {
      const inXZBounds =
        playerPos.x >= pond.bounds.minX &&
        playerPos.x <= pond.bounds.maxX &&
        playerPos.z >= pond.bounds.minZ &&
        playerPos.z <= pond.bounds.maxZ;

      if (!inXZBounds) continue;

      const depthInWater = pond.waterSurfaceY - playerPos.y;
      if (depthInWater > -1 && depthInWater < 4) {
        inWater = true;
        waterSurfaceY = pond.waterSurfaceY;
        break;
      }
    }

    this.isInWater = inWater;

    if (inWater) {
      this.waterBobTime += delta * 2;
      const bobAmount = Math.sin(this.waterBobTime) * 0.2;
      const targetY = waterSurfaceY + 0.99 + bobAmount;

      const yDiff = targetY - this.bodyMesh.position.y;
      const velocity = this.physicsBody.getLinearVelocity();
      velocity.y = yDiff * 5;
      velocity.x *= 0.85;
      velocity.z *= 0.85;
      this.physicsBody.setLinearVelocity(velocity);
    }
  }

  update(delta, input) {
    const {
      directionPressed,
      joystickPressed,
      keysPressed,
      joystick,
      jumpRequested,
      prevJumpRequested,
    } = input;

    if (this.fishingRod) {
      this.fishingRod.update(this.ponds);
    }

    this.applyWaterPhysics(delta);

    const currentTime = Date.now();
    if (currentTime - this.lastBlinkTime > this.nextBlinkDelay) {
      this.blink();
      this.lastBlinkTime = currentTime;
      this.nextBlinkDelay = this.getRandomBlinkDelay();
    }

    if (jumpRequested && !prevJumpRequested && !this.isJumping) {
      this.isStartingJump = true;
    }

    let play = this.currentAction;

    if (this.isFishing) {
      play = "fishing";
    } else if (this.isInWater) {
      play = "swim";
      if (directionPressed || joystickPressed) {
        this.applyMovement(
          directionPressed,
          joystickPressed,
          keysPressed,
          joystick
        );
      }
    } else if (this.isStartingJump) {
      play = "jump";
    } else if (directionPressed || joystickPressed) {
      if (this.isJumping) {
        play = "float";
      } else {
        play = "walk";
      }
      this.applyMovement(
        directionPressed,
        joystickPressed,
        keysPressed,
        joystick
      );
    } else {
      if (this.walkStart !== null) {
        this.walkStart = null;
        this.walkVelocity = this.defaultWalkVelocity;
      }
      play = "idle";
    }

    this.updateAnim(
      play,
      delta,
      this.isStartingJump
        ? () => {
            const impulse = new BABYLON.Vector3(0, 100, 0);
            this.physicsBody.applyImpulse(impulse, this.model.position);
            this.isStartingJump = false;
            this.isJumping = true;
          }
        : undefined
    );

    if (this.level.planeMeshes) {
      this.alignFeetToGround();
    }

    if (this.model.rotationQuaternion) {
      const euler = this.model.rotationQuaternion.toEulerAngles();
      this.bodyMesh.rotationQuaternion = BABYLON.Quaternion.RotationAxis(
        BABYLON.Vector3.Up(),
        euler.y
      );
    }
  }

  applyMovement(directionPressed, joystickPressed, keysPressed, joystick) {
    if (this.walkStart === null) {
      this.walkStart = Date.now();
    }

    const cameraDirection = this.camera.getForwardRay().direction.clone();
    cameraDirection.y = 0;
    cameraDirection.normalize();

    const cameraRight = BABYLON.Vector3.Cross(
      cameraDirection,
      BABYLON.Vector3.Up()
    ).normalize();

    let inputVec = BABYLON.Vector3.Zero();
    if (this.isMobile && joystick) {
      const forward = -joystick.forward;
      const right = -(joystick.right - joystick.left);
      inputVec = cameraDirection.scale(forward).add(cameraRight.scale(right));
    } else {
      let forward = 0,
        right = 0;
      if (keysPressed.w) forward += 1;
      if (keysPressed.s) forward -= 1;
      if (keysPressed.d) right -= 1;
      if (keysPressed.a) right += 1;
      inputVec = cameraDirection.scale(forward).add(cameraRight.scale(right));
    }

    if (inputVec.lengthSquared() > 0) {
      inputVec.normalize();
      this.walkDirection = BABYLON.Vector3.Lerp(
        this.walkDirection,
        inputVec,
        0.2
      );

      const targetAngle = Math.atan2(
        -this.walkDirection.x,
        -this.walkDirection.z
      );
      const targetRotation = BABYLON.Quaternion.RotationAxis(
        BABYLON.Vector3.Up(),
        targetAngle
      );
      this.model.rotationQuaternion = BABYLON.Quaternion.Slerp(
        this.model.rotationQuaternion || BABYLON.Quaternion.Identity(),
        targetRotation,
        0.2
      );

      const currentVelocity = this.physicsBody.getLinearVelocity();
      const targetVel = this.walkDirection.scale(this.walkVelocity);
      const newVelocity = new BABYLON.Vector3(
        currentVelocity.x + (targetVel.x - currentVelocity.x) * 0.2,
        currentVelocity.y,
        currentVelocity.z + (targetVel.z - currentVelocity.z) * 0.2
      );
      this.physicsBody.setLinearVelocity(newVelocity);
    } else {
      this.walkDirection = BABYLON.Vector3.Lerp(
        this.walkDirection,
        BABYLON.Vector3.Zero(),
        0.2
      );
      const currentVelocity = this.physicsBody.getLinearVelocity();
      const newVelocity = new BABYLON.Vector3(
        currentVelocity.x * 0.8,
        currentVelocity.y,
        currentVelocity.z * 0.8
      );
      this.physicsBody.setLinearVelocity(newVelocity);
    }
  }

  alignFeetToGround() {
    if (!this.skeleton) return;

    const footBoneNames = ["foot.l", "foot.r"];
    footBoneNames.forEach((boneName) => {
      const bone = this.skeleton.bones.find((b) => b.name === boneName);
      if (!bone) return;

      const worldMatrix = bone.getWorldMatrix();
      const bonePos = BABYLON.Vector3.TransformCoordinates(
        BABYLON.Vector3.Zero(),
        worldMatrix
      );

      const ray = new BABYLON.Ray(
        bonePos.add(new BABYLON.Vector3(0, 0.5, 0)),
        new BABYLON.Vector3(0, -1, 0),
        2
      );

      const hit = this.level.planeMeshes
        .map((mesh) => {
          const pickInfo = ray.intersectsMesh(mesh);
          return pickInfo.hit ? pickInfo : null;
        })
        .filter((p) => p !== null)
        .sort((a, b) => a.distance - b.distance)[0];

      if (!hit) return;

      const groundNormal = hit.getNormal(true);
      if (!groundNormal) return;

      const currentRotation =
        bone.getRotationQuaternion() || BABYLON.Quaternion.Identity();

      const up = new BABYLON.Vector3(0, 1, 0);
      const rotationAxis = BABYLON.Vector3.Cross(up, groundNormal);
      const angle = Math.acos(
        BABYLON.Vector3.Dot(up, groundNormal.normalize())
      );

      if (rotationAxis.length() > 0.001) {
        const alignmentRotation = BABYLON.Quaternion.RotationAxis(
          rotationAxis.normalize(),
          angle
        );

        const targetRotation = alignmentRotation.multiply(currentRotation);
        bone.setRotationQuaternion(
          BABYLON.Quaternion.Slerp(currentRotation, targetRotation, 0.3),
          BABYLON.Space.WORLD
        );
      }
    });
  }

  updateAnim(play, delta, onComplete) {
    const current = this.animationsMap.get(this.currentAction);

    if (this.currentAction !== play) {
      const toPlay = this.animationsMap.get(play);
      if (current) {
        current.stop();
      }
      if (toPlay) {
        const animSpeed = play === "walk" ? 4.0 : 1.0;
        toPlay.start(play !== "jump", animSpeed, toPlay.from, toPlay.to, false);
      }
      this.currentAction = play;
    }

    let speedMultiplier = 1;
    if (this.walkStart !== null) {
      const deltat = Date.now() - this.walkStart;
      if (deltat > 2000) {
        speedMultiplier = deltat / 2000;
        if (speedMultiplier > 2) {
          speedMultiplier = 2;
        }
      }
      this.walkVelocity = this.defaultWalkVelocity * speedMultiplier;
    }

    if (current) {
      const baseSpeed = this.currentAction === "walk" ? 2.0 : 1.0;
      current.speedRatio = baseSpeed * speedMultiplier;
    }

    if (onComplete && current) {
      current.onAnimationGroupEndObservable.addOnce(() => {
        onComplete();
      });
    }
  }

  dispose() {
    if (this.fishingRod) {
      this.fishingRod.dispose();
    }
    if (this.model) {
      this.model.dispose();
    }
    if (this.bodyMesh) {
      this.bodyMesh.dispose();
    }
  }
}
