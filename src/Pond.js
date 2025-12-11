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
    // Get the intersection bounds of water mesh and ground mesh
    const waterBounds = this.waterMesh.getBoundingInfo().boundingBox;
    const groundBounds = this.groundMesh.getBoundingInfo().boundingBox;

    console.log(`Pond for ${this.waterMesh.name}:`);
    console.log(
      "  Water bounds:",
      waterBounds.minimumWorld,
      "to",
      waterBounds.maximumWorld
    );
    console.log(
      "  Ground bounds:",
      groundBounds.minimumWorld,
      "to",
      groundBounds.maximumWorld
    );
    console.log("  Water surface Y:", this.waterSurfaceY);

    // Calculate the union (intersection) of the two meshes
    // The pond area is where water and ground overlap
    this.bounds = {
      minX: Math.max(waterBounds.minimumWorld.x, groundBounds.minimumWorld.x),
      maxX: Math.min(waterBounds.maximumWorld.x, groundBounds.maximumWorld.x),
      minZ: Math.max(waterBounds.minimumWorld.z, groundBounds.minimumWorld.z),
      maxZ: Math.min(waterBounds.maximumWorld.z, groundBounds.maximumWorld.z),
      minY: this.waterSurfaceY - 5, // 5 units deep
      maxY: this.waterSurfaceY - 0.5, // Stay below surface
    };

    console.log("  Calculated pond bounds:", this.bounds);
  }

  getCenterPosition() {
    // Get center XZ of pond
    const centerX = (this.bounds.minX + this.bounds.maxX) / 2;
    const centerZ = (this.bounds.minZ + this.bounds.maxZ) / 2;

    // Raycast down from above water to find actual ground height at center
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

    let groundHeight = this.bounds.minY; // Fallback
    if (hit && hit.pickedPoint) {
      groundHeight = hit.pickedPoint.y;
    }

    // Spawn halfway between ground and water surface
    const y = (groundHeight + 1.0 + this.waterSurfaceY - 0.5) / 2;

    console.log(
      `  Center position: (${centerX.toFixed(2)}, ${y.toFixed(2)}, ${centerZ.toFixed(2)}), ground: ${groundHeight.toFixed(2)}, water: ${this.waterSurfaceY.toFixed(2)}`
    );

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
    // Clamp a position to stay within the pond bounds
    return new BABYLON.Vector3(
      Math.max(this.bounds.minX, Math.min(this.bounds.maxX, position.x)),
      Math.max(this.bounds.minY, Math.min(this.bounds.maxY, position.y)),
      Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, position.z))
    );
  }
}
