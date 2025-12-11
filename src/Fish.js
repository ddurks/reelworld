export class Fish {
  constructor(scene, position, pond, allFish = []) {
    this.scene = scene;
    this.pond = pond; // Single pond object with bounds
    this.allFish = allFish; // Reference to all fish for boids behavior
    this.mesh = null;
    this.animationGroup = null;
    this.velocity = new BABYLON.Vector3(0, 0, 0);
    this.speed = 2 + Math.random() * 2; // Random speed between 2-4
    this.swimDirection = new BABYLON.Vector3(
      Math.random() - 0.5,
      0,
      Math.random() - 0.5
    ).normalize();
    this.timeOffset = Math.random() * Math.PI * 2; // For wave motion

    // Boids parameters - classic values
    this.separationDistance = 3.0;
    this.alignmentDistance = 8.0;
    this.cohesionDistance = 10.0;
    this.position = position; // Store initial position
  }

  // Static factory method that properly awaits loading
  static async create(scene, position, pond, allFish = []) {
    const fish = new Fish(scene, position, pond, allFish);
    await fish.loadFish(position);
    return fish;
  }

  async loadFish(position) {
    console.log("Loading fish at position:", position);
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "./assets/",
        "reelfish.glb",
        this.scene
      );

      console.log("Fish model import result:", result);

      // Create an invisible parent for physics
      this.physicsRoot = new BABYLON.TransformNode(
        "fishPhysicsRoot",
        this.scene
      );
      this.physicsRoot.position = position.clone();

      // Store the root mesh
      this.mesh = result.meshes[0];

      // Parent all child meshes to the root so rotation works
      for (let i = 1; i < result.meshes.length; i++) {
        result.meshes[i].parent = this.mesh;
      }

      // DON'T parent to physicsRoot - we'll sync position manually
      // This allows visual meshes to rotate independently while physics handles position

      // Random size between 1x and 2.5x
      const randomScale = 1 + Math.random() * 0.5;
      this.mesh.scaling = new BABYLON.Vector3(
        randomScale,
        randomScale,
        randomScale
      );

      // Make sure all child meshes are visible
      result.meshes.forEach((mesh, i) => {
        mesh.isVisible = true;
        console.log(
          `  Fish mesh ${i}: ${mesh.name}, visible: ${mesh.isVisible}, vertices: ${mesh.getTotalVertices()}`
        );
      });

      console.log("Fish loaded successfully at:", this.mesh.position);
      console.log("Fish root mesh visible:", this.mesh.isVisible);

      // Enable shadows only on desktop - iOS can't handle the uniform buffers
      const IS_MOBILE =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );
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
        this.animationGroup =
          result.animationGroups.find((ag) =>
            ag.name.toLowerCase().includes("swim")
          ) || result.animationGroups[0];

        if (this.animationGroup) {
          this.animationGroup.start(true);
          // Randomize animation speed slightly for variety
          this.animationGroup.speedRatio = 0.8 + Math.random() * 0.4;
        }
      }

      // Add physics collider to the physics root (not the visual mesh)
      this.physicsAggregate = new BABYLON.PhysicsAggregate(
        this.physicsRoot,
        BABYLON.PhysicsShapeType.SPHERE,
        { mass: 1, restitution: 0.3, friction: 0.1 },
        this.scene
      );

      // Set collision filters - fish collide with ground AND water boundaries
      if (this.physicsAggregate.body.shape) {
        this.physicsAggregate.body.shape.filterMembershipMask = 8;
        this.physicsAggregate.body.shape.filterCollideMask = 2 | 4; // Collide with ground (2) and water (4)
      }

      // Disable gravity - fish swim in water, not fall
      this.physicsAggregate.body.setGravityFactor(0);

      // Completely lock all rotation - we'll handle rotation manually
      this.physicsAggregate.body.setMassProperties({
        inertia: new BABYLON.Vector3(0, 0, 0), // No rotation allowed
      });

      // Maximum angular damping to prevent any spinning
      this.physicsAggregate.body.setAngularDamping(1.0);

      // Disable rotation from collisions
      this.physicsAggregate.body.disablePreStep = false;

      console.log("Fish physics added");
    } catch (error) {
      console.error("Error loading fish:", error);
      return;
    }

    // Calculate water bounds
    this.calculateWaterBounds();
  }

  calculateWaterBounds() {
    // Bounds are now managed by the Pond object - nothing to calculate here
  }

  // Boids behavior: Separation - avoid crowding neighbors
  separation() {
    const steer = new BABYLON.Vector3(0, 0, 0);
    let count = 0;

    for (const other of this.allFish) {
      if (other === this || !other.physicsRoot) continue;

      const distance = BABYLON.Vector3.Distance(
        this.physicsRoot.position,
        other.physicsRoot.position
      );

      if (distance > 0 && distance < this.separationDistance) {
        const diff = this.physicsRoot.position.subtract(
          other.physicsRoot.position
        );
        diff.normalize();
        diff.scaleInPlace(1.0 / distance);
        steer.addInPlace(diff);
        count++;
      }
    }

    if (count > 0) {
      steer.scaleInPlace(1.0 / count);
    }

    return steer;
  }

  // Boids behavior: Alignment - steer towards average heading of neighbors
  alignment() {
    const sum = new BABYLON.Vector3(0, 0, 0);
    let count = 0;

    for (const other of this.allFish) {
      if (other === this || !other.physicsRoot) continue;

      const distance = BABYLON.Vector3.Distance(
        this.physicsRoot.position,
        other.physicsRoot.position
      );

      if (distance > 0 && distance < this.alignmentDistance) {
        sum.addInPlace(other.swimDirection);
        count++;
      }
    }

    if (count > 0) {
      sum.scaleInPlace(1.0 / count);
      sum.normalize();
      return sum;
    }

    return new BABYLON.Vector3(0, 0, 0);
  }

  // Boids behavior: Cohesion - steer towards average position of neighbors
  cohesion() {
    const sum = new BABYLON.Vector3(0, 0, 0);
    let count = 0;

    for (const other of this.allFish) {
      if (other === this || !other.physicsRoot) continue;

      const distance = BABYLON.Vector3.Distance(
        this.physicsRoot.position,
        other.physicsRoot.position
      );

      if (distance > 0 && distance < this.cohesionDistance) {
        sum.addInPlace(other.physicsRoot.position);
        count++;
      }
    }

    if (count > 0) {
      sum.scaleInPlace(1.0 / count);
      const desired = sum.subtract(this.physicsRoot.position);
      desired.normalize();
      return desired;
    }

    return new BABYLON.Vector3(0, 0, 0);
  }

  // Boundary avoidance - raycast ahead to detect walls
  avoidBoundaries() {
    let steer = new BABYLON.Vector3(0, 0, 0);
    const pos = this.physicsRoot.position;
    const lookAheadDistance = 5; // How far ahead to look

    // Cast rays in 3 directions: forward, left 30°, right 30°
    const direction = this.swimDirection.clone().normalize();
    const angles = [0, Math.PI / 6, -Math.PI / 6]; // 0°, 30°, -30°

    for (const angle of angles) {
      // Rotate direction by angle around Y axis
      const rotatedDir = new BABYLON.Vector3(
        direction.x * Math.cos(angle) - direction.z * Math.sin(angle),
        direction.y,
        direction.x * Math.sin(angle) + direction.z * Math.cos(angle)
      );

      const ray = new BABYLON.Ray(pos, rotatedDir, lookAheadDistance);
      const hit = this.scene.pickWithRay(ray, (mesh) => {
        return mesh === this.pond.groundMesh;
      });

      if (hit && hit.hit && hit.distance < lookAheadDistance) {
        // Stronger avoidance the closer we are
        const strength = (lookAheadDistance - hit.distance) / lookAheadDistance;
        const avoidDirection = pos.subtract(hit.pickedPoint).normalize();
        steer.addInPlace(avoidDirection.scale(strength));
      }
    }

    if (steer.length() > 0) {
      steer.normalize();
    }

    return steer;
  }

  // Apply all boids behaviors
  applyBoids() {
    if (!this.mesh) return;

    const separation = this.separation();
    const alignment = this.alignment();
    const cohesion = this.cohesion();
    const boundaries = this.avoidBoundaries();

    // Apply steering forces - separation and boundaries dominant
    this.swimDirection.addInPlace(separation.scale(0.2)); // Strong separation
    this.swimDirection.addInPlace(alignment.scale(0.005)); // Minimal alignment
    this.swimDirection.addInPlace(cohesion.scale(0.005)); // Minimal cohesion
    this.swimDirection.addInPlace(boundaries.scale(1.0)); // Very strong boundary avoidance

    this.swimDirection.normalize();
  }

  update(deltaTime) {
    if (!this.mesh || !this.physicsRoot) return;

    // Apply boids behavior
    this.applyBoids();

    // Move in swim direction with wave motion
    const waveMotion =
      Math.sin(performance.now() * 0.001 + this.timeOffset) * 0.3;
    this.velocity = this.swimDirection.clone().scale(this.speed);
    this.velocity.y += waveMotion;

    // DEBUG: Log every 60 frames (~1 second)
    if (Math.random() < 0.016) {
      // console.log('Fish Debug:', {
      //   swimDir: `(${this.swimDirection.x.toFixed(2)}, ${this.swimDirection.z.toFixed(2)})`,
      //   velocity: `(${this.velocity.x.toFixed(2)}, ${this.velocity.z.toFixed(2)})`,
      //   speed: this.speed.toFixed(2),
      //   rotation: (this.mesh.rotation.y * 180 / Math.PI).toFixed(1) + '°',
      //   position: `(${this.mesh.position.x.toFixed(1)}, ${this.mesh.position.z.toFixed(1)})`
      // });
    }

    // Sync visual mesh position from physics root
    this.mesh.position = this.physicsRoot.position.clone();

    if (this.physicsAggregate && this.physicsAggregate.body) {
      this.physicsAggregate.body.setLinearVelocity(this.velocity);
      this.physicsAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
    }

    // Rotate root mesh to face direction of movement using quaternion
    if (this.velocity.x !== 0 || this.velocity.z !== 0) {
      const targetRot = Math.atan2(this.velocity.x, this.velocity.z);
      // Use quaternion rotation (yaw, pitch, roll)
      this.mesh.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(
        targetRot,
        0,
        0
      );
    }

    // Keep fish below water surface (check physics root position)
    if (this.physicsRoot.position.y > this.pond.waterSurfaceY - 0.5) {
      this.physicsRoot.position.y = this.pond.waterSurfaceY - 0.5;
      if (this.swimDirection.y > 0) {
        this.swimDirection.y = -Math.abs(this.swimDirection.y); // Swim down
      }
    }

    // Let physics handle boundaries naturally
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
