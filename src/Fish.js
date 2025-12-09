export class Fish {
  constructor(scene, position, waterMeshes, groundMesh) {
    this.scene = scene;
    this.waterMeshes = waterMeshes; // Array of water plane meshes
    this.groundMesh = groundMesh; // Ground mesh
    this.mesh = null;
    this.animationGroup = null;
    this.velocity = new BABYLON.Vector3(0, 0, 0);
    this.speed = 2 + Math.random() * 3; // Random speed between 2-5
    this.turnSpeed = 1;
    this.swimDirection = new BABYLON.Vector3(
      Math.random() - 0.5,
      0,
      Math.random() - 0.5
    ).normalize();
    this.timeOffset = Math.random() * Math.PI * 2; // For wave motion
    this.changeDirectionTimer = Math.random() * 3; // Random initial timer
    this.waterMinY = 0;
    this.waterMaxY = 0;
    this.waterBoundsMinX = -Infinity;
    this.waterBoundsMaxX = Infinity;
    this.waterBoundsMinZ = -Infinity;
    this.waterBoundsMaxZ = Infinity;
    
    this.loadFish(position);
  }

  async loadFish(position) {
    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      "",
      "./assets/",
      "reelfish.glb",
      this.scene
    );

    this.mesh = result.meshes[0];
    this.mesh.position = position.clone();
    this.mesh.scaling = new BABYLON.Vector3(0.8, 0.8, 0.8); // Slightly smaller

    // Enable shadows only on desktop - iOS can't handle the uniform buffers
    const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!IS_MOBILE) {
      result.meshes.forEach((mesh) => {
        if (mesh.material) {
          mesh.receiveShadows = true;
        }
      });
    }

    // Find and start swim animation
    if (result.animationGroups.length > 0) {
      // Try to find "swim" animation, or use first animation
      this.animationGroup = result.animationGroups.find(
        (ag) => ag.name.toLowerCase().includes("swim")
      ) || result.animationGroups[0];
      
      if (this.animationGroup) {
        this.animationGroup.start(true);
        // Randomize animation speed slightly for variety
        this.animationGroup.speedRatio = 0.8 + Math.random() * 0.4;
      }
    }

    // Calculate water bounds
    this.calculateWaterBounds();
  }

  calculateWaterBounds() {
    if (!this.waterMeshes || this.waterMeshes.length === 0) {
      this.waterMinY = -5;
      this.waterMaxY = -0.5;
      return;
    }

    const groundY = this.groundMesh ? this.groundMesh.position.y : 0;
    
    // Find water planes that are BELOW ground (underwater)
    const underwaterPlanes = this.waterMeshes.filter(w => w.position.y < groundY);
    
    if (underwaterPlanes.length === 0) {
      this.waterMinY = -5;
      this.waterMaxY = -0.5;
      return;
    }

    // Get the highest underwater plane Y position
    let underwaterSurfaceY = -Infinity;
    underwaterPlanes.forEach((waterMesh) => {
      underwaterSurfaceY = Math.max(underwaterSurfaceY, waterMesh.position.y);
    });

    // Get XZ bounding box from water meshes
    this.waterMeshes.forEach(waterMesh => {
      const bounds = waterMesh.getBoundingInfo().boundingBox;
      this.waterBoundsMinX = Math.min(this.waterBoundsMinX, bounds.minimumWorld.x);
      this.waterBoundsMaxX = Math.max(this.waterBoundsMaxX, bounds.maximumWorld.x);
      this.waterBoundsMinZ = Math.min(this.waterBoundsMinZ, bounds.minimumWorld.z);
      this.waterBoundsMaxZ = Math.max(this.waterBoundsMaxZ, bounds.maximumWorld.z);
    });

    // Fish swim BELOW underwater plane (going deeper)
    this.waterMinY = underwaterSurfaceY - 5; // Up to 5 units below water surface
    this.waterMaxY = underwaterSurfaceY - 0.5; // Stay at least 0.5 below surface
  }

  update(deltaTime) {
    if (!this.mesh) return;

    // Periodically change direction
    this.changeDirectionTimer -= deltaTime;
    if (this.changeDirectionTimer <= 0) {
      this.changeDirection();
      this.changeDirectionTimer = 3 + Math.random() * 4; // 3-7 seconds
    }

    // Move in swim direction
    this.velocity = this.swimDirection.scale(this.speed);

    // Add subtle vertical wave motion
    const waveMotion = Math.sin(performance.now() * 0.001 + this.timeOffset) * 0.5;
    this.velocity.y += waveMotion * deltaTime;

    // Update position
    this.mesh.position.addInPlace(this.velocity.scale(deltaTime));

    // Keep fish within vertical bounds (between water surface and ground)
    if (this.mesh.position.y < this.waterMinY) {
      this.mesh.position.y = this.waterMinY;
      this.swimDirection.y = Math.abs(this.swimDirection.y); // Swim up
    }
    if (this.mesh.position.y > this.waterMaxY) {
      this.mesh.position.y = this.waterMaxY;
      this.swimDirection.y = -Math.abs(this.swimDirection.y); // Swim down
    }

    // Keep within water mesh XZ bounds
    if (this.mesh.position.x < this.waterBoundsMinX || this.mesh.position.x > this.waterBoundsMaxX ||
        this.mesh.position.z < this.waterBoundsMinZ || this.mesh.position.z > this.waterBoundsMaxZ) {
      // Turn back toward center of water bounds
      const centerX = (this.waterBoundsMinX + this.waterBoundsMaxX) / 2;
      const centerZ = (this.waterBoundsMinZ + this.waterBoundsMaxZ) / 2;
      const toCenter = new BABYLON.Vector3(
        centerX - this.mesh.position.x,
        0,
        centerZ - this.mesh.position.z
      ).normalize();
      this.swimDirection.x = this.swimDirection.x * 0.7 + toCenter.x * 0.3;
      this.swimDirection.z = this.swimDirection.z * 0.7 + toCenter.z * 0.3;
      this.swimDirection.normalize();
    }

    // Rotate fish to face swim direction (smoothly)
    if (this.velocity.length() > 0.1) {
      const targetRotation = Math.atan2(this.swimDirection.x, this.swimDirection.z);
      const currentRotation = this.mesh.rotation.y;
      
      // Smooth rotation
      let rotationDiff = targetRotation - currentRotation;
      
      // Normalize angle difference to [-PI, PI]
      while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
      while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
      
      this.mesh.rotation.y += rotationDiff * this.turnSpeed * deltaTime;
    }
  }

  changeDirection() {
    // Random new direction with slight preference to stay in similar direction
    const randomTurn = (Math.random() - 0.5) * Math.PI * 0.5; // ±45 degrees
    const currentAngle = Math.atan2(this.swimDirection.x, this.swimDirection.z);
    const newAngle = currentAngle + randomTurn;

    this.swimDirection.x = Math.sin(newAngle);
    this.swimDirection.z = Math.cos(newAngle);
    
    // Random vertical component
    this.swimDirection.y = (Math.random() - 0.5) * 0.3;
    
    this.swimDirection.normalize();
  }
}
