export class Pond {
  constructor(waterMesh, groundMesh, scene) {
    this.waterMesh = waterMesh;
    this.groundMesh = groundMesh;
    this.scene = scene;
    this.bounds = null;
    this.waterSurfaceY = waterMesh.position.y;
    this.ripples = [];

    this.calculateBounds();
    this.setupWater();
  }

  setupWater() {
    this.waterMesh.isVisible = false;

    const boundingInfo = this.waterMesh.getBoundingInfo();
    const size = boundingInfo.boundingBox.extendSize;
    const scale = this.waterMesh.scaling;
    const actualSizeX = size.x * Math.abs(scale.x);
    const actualSizeZ = size.z * Math.abs(scale.z);
    const diameter = Math.max(actualSizeX, actualSizeZ) * 2;

    const waterPlane = BABYLON.MeshBuilder.CreateDisc(
      "waterPlane_" + this.waterMesh.name,
      { radius: diameter / 2, tessellation: 64 },
      this.scene
    );

    waterPlane.rotation.x = Math.PI / 2;
    waterPlane.position = this.waterMesh.position.clone();

    const water = new BABYLON.WaterMaterial(
      "water_" + this.waterMesh.name,
      this.scene,
      new BABYLON.Vector2(512, 512)
    );

    water.backFaceCulling = false;
    water.bumpTexture = new BABYLON.Texture(
      "./assets/waterbump.png",
      this.scene
    );
    water.windForce = -5;
    water.waveHeight = 0;
    water.bumpHeight = 0.5;
    water.windDirection = new BABYLON.Vector2(0, -1);
    water.waterColor = new BABYLON.Color3(0.1, 0.3, 0.5);
    water.colorBlendFactor = 0.3;
    water.waveLength = 0.5;

    waterPlane.material = water;

    const groundMesh = this.scene.getMeshByName("ground");
    const skybox = this.scene.getMeshByName("hdrSkyBox");

    if (groundMesh) water.addToRenderList(groundMesh);
    if (skybox) water.addToRenderList(skybox);

    this.waterPlane = waterPlane;
    this.waterMaterial = water;
  }

  updateWaterRenderList() {
    if (!this.waterMaterial) return;

    const pondCenter = new BABYLON.Vector3(
      (this.bounds.minX + this.bounds.maxX) / 2,
      this.waterSurfaceY,
      (this.bounds.minZ + this.bounds.maxZ) / 2
    );
    const maxDistance = 20;

    this.scene.meshes.forEach((mesh) => {
      const meshName = mesh.name.toLowerCase();
      if (
        meshName.includes("guy") ||
        meshName.includes("hat") ||
        meshName.includes("character") ||
        meshName.includes("body") ||
        meshName.includes("face") ||
        meshName.includes("rod") ||
        meshName.includes("bobber") ||
        meshName.includes("fish")
      ) {
        this.waterMaterial.addToRenderList(mesh);
      }
    });

    this.scene.meshes.forEach((mesh) => {
      if (mesh.name.toLowerCase().includes("tree")) {
        const distance = BABYLON.Vector3.Distance(mesh.position, pondCenter);
        if (distance <= maxDistance) {
          this.waterMaterial.addToRenderList(mesh);
        }
      }
    });
  }

  calculateBounds() {
    const waterBounds = this.waterMesh.getBoundingInfo().boundingBox;
    const groundBounds = this.groundMesh.getBoundingInfo().boundingBox;

    this.bounds = {
      minX: Math.max(waterBounds.minimumWorld.x, groundBounds.minimumWorld.x),
      maxX: Math.min(waterBounds.maximumWorld.x, groundBounds.maximumWorld.x),
      minZ: Math.max(waterBounds.minimumWorld.z, groundBounds.minimumWorld.z),
      maxZ: Math.min(waterBounds.maximumWorld.z, groundBounds.maximumWorld.z),
      minY: this.waterSurfaceY - 5,
      maxY: this.waterSurfaceY - 0.5,
    };
  }

  getCenterPosition() {
    const centerX = (this.bounds.minX + this.bounds.maxX) / 2;
    const centerZ = (this.bounds.minZ + this.bounds.maxZ) / 2;

    const rayOrigin = new BABYLON.Vector3(
      centerX,
      this.waterSurfaceY + 10,
      centerZ
    );
    const rayDirection = new BABYLON.Vector3(0, -1, 0);
    const ray = new BABYLON.Ray(rayOrigin, rayDirection, 100);

    const hit = this.scene.pickWithRay(ray, (mesh) => {
      return mesh === this.groundMesh;
    });

    let groundHeight = this.bounds.minY;
    if (hit?.pickedPoint) {
      groundHeight = hit.pickedPoint.y;
    }

    const y = (groundHeight + 1.0 + this.waterSurfaceY - 0.5) / 2;

    return new BABYLON.Vector3(centerX, y, centerZ);
  }

  createRipple(position, intensity = 1.0) {
    const rippleCount = 3;
    const rippleDelay = 200;
    const rippleDuration = 2000;
    const rippleExpansion = 8;

    for (let i = 0; i < rippleCount; i++) {
      const ripple = BABYLON.MeshBuilder.CreateTorus(
        "ripple",
        { diameter: 0.5, thickness: 0.04, tessellation: 32 },
        this.scene
      );

      ripple.position = new BABYLON.Vector3(
        position.x,
        this.waterSurfaceY + 0.02,
        position.z
      );
      ripple.rotation.x = 0;

      const material = new BABYLON.StandardMaterial("rippleMat", this.scene);
      material.emissiveColor = new BABYLON.Color3(0.8, 0.9, 1.0);
      material.alpha = 0.5;
      material.disableLighting = true;
      ripple.material = material;

      this.ripples.push({
        mesh: ripple,
        startTime: Date.now() + i * rippleDelay,
        duration: rippleDuration,
        intensity: intensity,
        initialAlpha: 0.5,
      });
    }
  }

  updateRipples() {
    const now = Date.now();

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i];
      const elapsed = now - ripple.startTime;
      const progress = elapsed / ripple.duration;

      if (progress >= 1.0) {
        ripple.mesh.material?.dispose();
        ripple.mesh.dispose();
        this.ripples.splice(i, 1);
        continue;
      }

      const scale = 1 + progress * 8 * ripple.intensity;
      ripple.mesh.scaling = new BABYLON.Vector3(scale, 1, scale);
      ripple.mesh.material.alpha = ripple.initialAlpha * (1 - progress);
    }
  }

  isWithinBounds(position) {
    return (
      position.x >= this.bounds.minX &&
      position.x <= this.bounds.maxX &&
      position.z >= this.bounds.minZ &&
      position.z <= this.bounds.maxZ &&
      position.y >= this.bounds.minY &&
      position.y <= this.bounds.maxY
    );
  }

  clampPosition(position) {
    return new BABYLON.Vector3(
      Math.max(this.bounds.minX, Math.min(this.bounds.maxX, position.x)),
      Math.max(this.bounds.minY, Math.min(this.bounds.maxY, position.y)),
      Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, position.z))
    );
  }
}
