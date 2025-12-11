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
    this.buttonPressed = false;
    this.buttonJustPressed = false;

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
    this.buttonPressed = true;
    this.buttonJustPressed = true;
    console.log("ReelSpinna button pressed:", button);

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
    this.buttonPressed = false;
    this.reelspinnaImage.src = this.images.default;
  }

  update(deltaTime) {
    // Reset buttonJustPressed after frame
    this.buttonJustPressed = false;
  }
}

export class HUD {
  constructor(isMobile, reelGuy) {
    this.isMobile = isMobile;
    this.reelGuy = reelGuy;
    this.joystick = null;
    this.aPressed = false;
    this.bPressed = false;
    this.prevJumpRequested = false;

    if (isMobile) {
      this.setupMobileControls();
    }

    this.reelSpinnaControls = new ReelSpinnaControls();
    this.keysPressed = {};
    this.setupKeyboardControls();
  }

  setupKeyboardControls() {
    document.addEventListener(
      "keydown",
      (event) => {
        this.keysPressed[event.key.toLowerCase()] = true;
      },
      false
    );

    document.addEventListener(
      "keyup",
      (event) => {
        this.keysPressed[event.key.toLowerCase()] = false;
      },
      false
    );
  }

  setupMobileControls() {
    this.joystick = new Joystick();
  }

  getInput() {
    const directionPressed = [W, A, S, D].some(
      (key) => this.keysPressed[key] === true
    );

    const joystickPressed = this.joystick
      ? JOY_DIRS.some((key) => this.joystick[key] > 0)
      : false;

    const jumpRequested = this.keysPressed[SPACE] || this.aPressed;

    // Handle ReelSpinna button press
    if (this.reelSpinnaControls && this.reelSpinnaControls.buttonJustPressed) {
      console.log("Button press detected in HUD, toggling fishing mode");
      if (this.reelGuy) {
        this.reelGuy.toggleFishingMode();
      }
    }

    // Update ReelSpinna
    if (this.reelSpinnaControls) {
      this.reelSpinnaControls.update(0);
    }

    const input = {
      directionPressed,
      joystickPressed,
      keysPressed: this.keysPressed,
      joystick: this.joystick,
      jumpRequested,
      prevJumpRequested: this.prevJumpRequested,
    };

    this.prevJumpRequested = jumpRequested;

    return input;
  }
}
