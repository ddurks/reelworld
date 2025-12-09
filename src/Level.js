export class Level {
  spawnedPlanes = new Set();
  currentPlayerRoomX = 0;
  currentPlayerRoomZ = 0;
  planeSize = 100;
  planeMeshes = [];

  constructor(scene, isMobile) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.light();
  }

  light() {
    // Warm sunlight (Directional Light)
    this.sunLight = new BABYLON.DirectionalLight(
      "sunLight",
      new BABYLON.Vector3(-60, -100, -100),
      this.scene
    );
    this.sunLight.intensity = 0.7;
    this.sunLight.diffuse = new BABYLON.Color3(1, 1, 1);

    // Shadows
    if (!this.isMobile) {
      this.shadowGenerator = new BABYLON.ShadowGenerator(4096, this.sunLight);
      this.shadowGenerator.useBlurExponentialShadowMap = true;
      this.shadowGenerator.blurKernel = 32;
      this.shadowGenerator.bias = 0.0001;
    }

    // Cool Ambient Light for Snow Contrast
    const ambientLight = new BABYLON.HemisphericLight(
      "ambientLight",
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    ambientLight.intensity = 0.4;
    ambientLight.diffuse = new BABYLON.Color3(0.89, 0.95, 0.99);
  }
}
