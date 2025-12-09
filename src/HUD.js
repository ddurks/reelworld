import { W, A, S, D, SPACE } from "./main.js";

export const fwd = "forward";
export const back = "back";
export const lft = "left";
export const rt = "right";
export const JOY_DIRS = [fwd, back, lft, rt];

export class Joystick {
  backward = 0;
  forward = 0;
  right = 0;
  left = 0;

  constructor() {
    const options = {
      zone: document.getElementById("joystickWrapper1"),
      size: 100,
      multitouch: true,
      maxNumberOfNipples: 2,
      mode: "static",
      color: "transparent",
      restJoystick: true,
      shape: "circle",
      position: { left: "auto", right: "0px", bottom: "0px" },
      dynamicPage: true,
    };

    this.joyManager = nipplejs.create(options);

    this.joyManager["0"].on("move", (evt, data) => {
      this.forward = -data.vector.y;
      this.right = data.vector.x > 0 ? Math.abs(data.vector.x) : 0;
      this.left = data.vector.x < 0 ? Math.abs(data.vector.x) : 0;
    });

    this.joyManager["0"].on("end", (evt) => {
      this.forward = 0;
      this.backward = 0;
      this.left = 0;
      this.right = 0;
    });
  }
}

export class ReelSpinnaControls {
  constructor() {
    this.container = document.getElementById("reelspinna-container");
    this.reelspinnaImage = document.getElementById("reelspinna-image");

    if (!this.container || !this.reelspinnaImage) {
      console.error("ReelSpinna elements not found!", {
        container: this.container,
        image: this.reelspinnaImage,
      });
      return;
    }

    this.rotation = 0;
    this.isDragging = false;
    this.currentButton = null;
    this.lastAngle = 0;

    this.images = {
      default: "assets/hud/reelspinna.png",
      red: "assets/hud/reelspinnared.png",
      blue: "assets/hud/reelspinnablue.png",
    };

    this.setupControls();
  }

  setupControls() {
    this.container.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const button = this.getButtonFromClick(e.clientX, e.clientY);
      this.onStart(e, button);
    });
    this.container.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("mousemove", (e) => this.onMove(e));
    document.addEventListener("mouseup", () => this.onEnd());

    this.container.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const button = this.getButtonFromClick(
        e.touches[0].clientX,
        e.touches[0].clientY
      );
      this.onStart(e.touches[0], button);
    });
    document.addEventListener(
      "touchmove",
      (e) => {
        if (this.isDragging) {
          e.preventDefault();
          this.onMove(e.touches[0]);
        }
      },
      { passive: false }
    );
    document.addEventListener("touchend", () => this.onEnd());
    document.addEventListener("touchcancel", () => this.onEnd());
  }

  getButtonFromClick(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    let clickAngle = Math.atan2(dy, dx) * (180 / Math.PI);

    while (clickAngle < 0) clickAngle += 360;

    let relativeAngle = clickAngle - this.rotation;

    while (relativeAngle < 0) relativeAngle += 360;
    relativeAngle = relativeAngle % 360;

    if (relativeAngle >= 135 && relativeAngle < 315) {
      return "blue";
    } else {
      return "red";
    }
  }

  onStart(event, button) {
    this.isDragging = true;
    this.currentButton = button;

    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    this.lastAngle = Math.atan2(dy, dx) * (180 / Math.PI);

    if (button === "red") {
      this.reelspinnaImage.src = this.images.red;
    } else if (button === "blue") {
      this.reelspinnaImage.src = this.images.blue;
    }
  }

  onMove(event) {
    if (!this.isDragging) return;

    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);

    let deltaAngle = currentAngle - this.lastAngle;

    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;

    this.rotation += deltaAngle;
    this.lastAngle = currentAngle;

    this.reelspinnaImage.style.transform = `rotate(${this.rotation}deg)`;
  }

  onEnd() {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.currentButton = null;
    this.reelspinnaImage.src = this.images.default;
  }

  update(deltaTime) {
    // No per-frame updates needed
  }
}

const footBoneNames = ["foot.l", "foot.r"];

export class HUD {
  walkDirection = BABYLON.Vector3.Zero();
  rotateAngle = new BABYLON.Vector3(0, 1, 0);
  cameraTarget = BABYLON.Vector3.Zero();
  defaultWalkVelocity = 10;
  walkVelocity = 10;
  fadeDuration = 0.2;
  oldPosition = null;
  walkStart = null;
  level = null;
  joystick = null;
  jumpRequested = false;
  prevJumpRequested = false;
  isJumping = false;
  isStartingJump = false;

  constructor(
    model,
    physicsBody,
    animationsMap,
    camera,
    currentAction,
    level,
    isMobile
  ) {
    this.model = model;
    this.physicsBody = physicsBody;
    this.animationsMap = animationsMap;
    this.currentAction = currentAction;
    this.camera = camera;
    this.level = level;
    this.isMobile = isMobile;

    if (isMobile) {
      this.setupMobileControls();
    }

    // Find skeleton
    this.skeleton = null;
    model.getChildMeshes().forEach((mesh) => {
      if (mesh.skeleton) {
        this.skeleton = mesh.skeleton;
      }
    });

    // Store center offset for physics sync (7th parameter)
    this.centerOffset = arguments[6] || new BABYLON.Vector3(0, 0, 0);

    // Initialize ReelSpinna controls
    this.reelSpinnaControls = new ReelSpinnaControls();
  }

  update(delta, keysPressed) {
    const directionPressed = [W, A, S, D].some(
      (key) => keysPressed[key] === true
    );
    const joystickPressed = this.joystick
      ? JOY_DIRS.some((key) => this.joystick[key] > 0)
      : false;

    const jumpRequested = keysPressed[SPACE] || this.aPressed;

    if (jumpRequested && !this.prevJumpRequested && !this.isJumping) {
      this.isStartingJump = true;
    }

    let play = this.currentAction;
    if (this.isStartingJump) {
      play = "jump";
    } else if (directionPressed || joystickPressed) {
      if (this.isJumping) {
        play = "float";
      } else {
        play = "walk";
      }
      this.applyMovement(directionPressed, joystickPressed, keysPressed);
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
            this.physicsBody.physicsBody.applyImpulse(
              impulse,
              this.model.position
            );
            this.isStartingJump = false;
            this.isJumping = true;
          }
        : undefined
    );

    if (this.level.planeMeshes) {
      this.alignFeetToGround();
    }

    // Keep physics body upright (only allow Y-axis rotation from character)
    if (this.model.rotationQuaternion) {
      // Extract only Y rotation from character
      const euler = this.model.rotationQuaternion.toEulerAngles();
      this.physicsBody.rotationQuaternion = BABYLON.Quaternion.RotationAxis(
        BABYLON.Vector3.Up(),
        euler.y
      );
    }

    // Update ReelSpinna
    if (this.reelSpinnaControls) {
      this.reelSpinnaControls.update(delta);
    }

    this.prevJumpRequested = jumpRequested;
  }

  applyMovement(directionPressed, joystickPressed, keysPressed) {
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
    if (this.isMobile && this.joystick) {
      const forward = -this.joystick.forward;
      const right = -(this.joystick.right - this.joystick.left);

      inputVec = cameraDirection.scale(forward).add(cameraRight.scale(right));
    } else {
      let forward = 0,
        right = 0;
      if (keysPressed[W]) forward += 1;
      if (keysPressed[S]) forward -= 1;
      if (keysPressed[D]) right -= 1;
      if (keysPressed[A]) right += 1;

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

      const currentVelocity = this.physicsBody.physicsBody.getLinearVelocity();
      const targetVel = this.walkDirection.scale(this.walkVelocity);
      const newVelocity = new BABYLON.Vector3(
        currentVelocity.x + (targetVel.x - currentVelocity.x) * 0.2,
        currentVelocity.y,
        currentVelocity.z + (targetVel.z - currentVelocity.z) * 0.2
      );
      this.physicsBody.physicsBody.setLinearVelocity(newVelocity);
    } else {
      this.walkDirection = BABYLON.Vector3.Lerp(
        this.walkDirection,
        BABYLON.Vector3.Zero(),
        0.2
      );
      const currentVelocity = this.physicsBody.physicsBody.getLinearVelocity();
      const newVelocity = new BABYLON.Vector3(
        currentVelocity.x * 0.8,
        currentVelocity.y,
        currentVelocity.z * 0.8
      );
      this.physicsBody.physicsBody.setLinearVelocity(newVelocity);
    }
  }

  alignFeetToGround() {
    if (!this.skeleton) return;

    footBoneNames.forEach((boneName) => {
      const bone = this.skeleton.bones.find((b) => b.name === boneName);
      if (!bone) return;

      // Get bone world position
      const worldMatrix = bone.getWorldMatrix();
      const bonePos = BABYLON.Vector3.TransformCoordinates(
        BABYLON.Vector3.Zero(),
        worldMatrix
      );

      // Raycast down from foot to find ground
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

      // Get ground normal
      const groundNormal = hit.getNormal(true);
      if (!groundNormal) return;

      // Calculate rotation to align foot with ground normal
      // Start with the bone's current rotation
      const currentRotation =
        bone.getRotationQuaternion() || BABYLON.Quaternion.Identity();

      // Calculate the target rotation based on ground normal
      // We want the foot's "up" to point along the ground normal
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

        // Smoothly interpolate to the target rotation
        const targetRotation = alignmentRotation.multiply(currentRotation);
        bone.setRotationQuaternion(
          BABYLON.Quaternion.Slerp(currentRotation, targetRotation, 0.3),
          BABYLON.Space.WORLD
        );
      }
    });
  }

  adjustHeightFromTerrain() {
    // Terrain adjustment disabled - using physics-based collision instead
    return;
  }

  stickFeetToTerrain() {
    // Old full IK system - replaced with simpler foot rotation alignment
    return;
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
      const observer = current.onAnimationGroupEndObservable.addOnce(() => {
        onComplete();
      });
    }
  }

  setupMobileControls() {
    this.joystick = new Joystick();

    this.aPressed = false;
    this.bPressed = false;
  }
}
