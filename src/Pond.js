export class Pond {
  constructor(waterMesh, groundMesh, scene) {
    this.waterMesh = waterMesh;
    this.groundMesh = groundMesh;
    this.scene = scene;
    this.bounds = null;
    this.waterSurfaceY = waterMesh.position.y;

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
    water.bumpHeight = 0.1;
    water.windDirection = new BABYLON.Vector2(1, 1);
    water.waterColor = new BABYLON.Color3(0.1, 0.3, 0.5);
    water.colorBlendFactor = 0.3;
    water.waveLength = 0.1;

    waterPlane.material = water;

    this.scene.meshes.forEach((mesh) => {
      if (mesh !== waterPlane && mesh !== this.waterMesh) {
        water.addToRenderList(mesh);
      }
    });

    this.waterPlane = waterPlane;
    this.waterMaterial = water;
  }

  updateWaterRenderList() {
    if (!this.waterMaterial) return;

    this.waterMaterial.getRenderList().length = 0;

    const allMeshes = this.scene
      .getNodes()
      .filter(
        (node) =>
          node instanceof BABYLON.Mesh || node instanceof BABYLON.AbstractMesh
      );

    allMeshes.forEach((mesh) => {
      if (mesh !== this.waterPlane && mesh !== this.waterMesh) {
        this.waterMaterial.addToRenderList(mesh);
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

  isInBounds(position) {
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
