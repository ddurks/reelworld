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
    this.swimRippleWaves = [];
  }

  getRandomBlinkDelay() {
    return 2000 + Math.random() * 4000;
  }

  async load() {
    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      "",
      "./assets/3d/",
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

    for (let i = 0; i < 3; i++) {
      const wave = BABYLON.MeshBuilder.CreateTorus(
        "swimWave",
        {
          diameter: 1.2,
          thickness: 0.08,
          tessellation: 32,
        },
        this.scene
      );
      wave.rotation.x = 0;
      wave.isVisible = false;

      const waveMat = new BABYLON.StandardMaterial("swimWaveMat", this.scene);
      waveMat.emissiveColor = new BABYLON.Color3(0.8, 0.9, 1.0);
      waveMat.alpha = 0.5;
      waveMat.disableLighting = true;
      wave.material = waveMat;

      this.swimRippleWaves.push({
        mesh: wave,
        startTime: Date.now() + i * 600,
        duration: 1200,
      });
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

  playCastAnimation(onCastCallback) {
    const castingAnim = this.animationsMap.get("casting");
    if (!castingAnim) {
      // Fallback if casting animation doesn't exist - cast immediately
      if (onCastCallback) onCastCallback();
      return;
    }

    // Stop all other animations
    for (const [name, anim] of this.animationsMap) {
      if (anim.isPlaying) {
        anim.stop();
      }
    }

    // Play casting animation once at double speed
    castingAnim.loopAnimation = false;
    castingAnim.start(false, 2.0, 0, 240); // Play at 2x speed (0 to 240 frames)

    // Cast the line at 4/5 through the animation
    const totalDuration = (240 / 60) * 1000; // Assuming 60fps, convert to ms
    const timeToFrame = ((4 / 5) * totalDuration) / 2.0; // Divide by speedRatio

    setTimeout(() => {
      if (onCastCallback) onCastCallback();
    }, timeToFrame);

    // Switch to fishing animation after casting is done
    castingAnim.onAnimationGroupEndObservable.addOnce(() => {
      const fishingAnim = this.animationsMap.get("fishing");
      if (fishingAnim) {
        fishingAnim.start(true, 1.0);
      }
    });
  }

  toggleFishingMode() {
    if (!this.fishingRod) return;

    this.isFishing = !this.isFishing;

    if (this.isFishing) {
      this.fishingRod.show(this.ponds);

      // Use the casting animation utility
      this.playCastAnimation(() => {
        if (this.fishingRod) {
          this.fishingRod.castLine(this.ponds);
        }
      });
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
    const swimRippleHeight = 0.02;
    const waveExpansion = 1.5;
    const bobSpeed = 2;
    const bobAmplitude = 0.2;
    const floatHeight = 0.99;
    const buoyancyForce = 5;
    const waterDamping = 0.85;
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
      const now = Date.now();
      this.swimRippleWaves.forEach((wave) => {
        const elapsed = now - wave.startTime;
        const progress = (elapsed % wave.duration) / wave.duration;

        if (elapsed >= 0) {
          wave.mesh.isVisible = true;
          wave.mesh.position = new BABYLON.Vector3(
            playerPos.x,
            waterSurfaceY + swimRippleHeight,
            playerPos.z
          );

          const scale = 1 + progress * waveExpansion;
          wave.mesh.scaling = new BABYLON.Vector3(scale, 1, scale);
          wave.mesh.material.alpha = 0.5 * (1 - progress);
        }
      });

      this.waterBobTime += delta * bobSpeed;
      const bobAmount = Math.sin(this.waterBobTime) * bobAmplitude;
      const targetY = waterSurfaceY + floatHeight + bobAmount;

      const yDiff = targetY - this.bodyMesh.position.y;
      const velocity = this.physicsBody.getLinearVelocity();
      velocity.y = yDiff * buoyancyForce;
      velocity.x *= waterDamping;
      velocity.z *= waterDamping;
      this.physicsBody.setLinearVelocity(velocity);
    } else {
      this.swimRippleWaves.forEach((wave) => {
        wave.mesh.isVisible = false;
      });
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
      reelRotation,
    } = input;

    if (this.fishingRod) {
      this.fishingRod.update(this.ponds, reelRotation || 0);
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
