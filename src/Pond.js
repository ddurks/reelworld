export class Pond {
  constructor(waterMesh, groundMesh, scene) {
    this.waterMesh = waterMesh;
    this.groundMesh = groundMesh;
    this.scene = scene;
    this.bounds = null;
    this.waterSurfaceY = waterMesh.position.y;

    this.calculateBounds();
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
