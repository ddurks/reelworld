export class Fish {
  constructor(scene, position, pond, allFish = []) {
    this.scene = scene;
    this.pond = pond;
    this.allFish = allFish;
    this.mesh = null;
    this.animationGroup = null;
    this.velocity = new BABYLON.Vector3(0, 0, 0);
    this.speed = 2 + Math.random() * 2;
    this.swimDirection = new BABYLON.Vector3(
      Math.random() - 0.5,
      0,
      Math.random() - 0.5
    ).normalize();
    this.timeOffset = Math.random() * Math.PI * 2;

    this.separationDistance = 3.0;
    this.alignmentDistance = 8.0;
    this.cohesionDistance = 10.0;
    this.position = position;
  }

  // Static factory method that properly awaits loading
  static async create(scene, position, pond, allFish = []) {
    const fish = new Fish(scene, position, pond, allFish);
    await fish.loadFish(position);
    return fish;
  }

  async loadFish(position) {
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "./assets/",
        "reelfish.glb",
        this.scene
      );

      this.physicsRoot = new BABYLON.TransformNode(
        "fishPhysicsRoot",
        this.scene
      );
      this.physicsRoot.position = position.clone();

      this.mesh = result.meshes[0];

      for (let i = 1; i < result.meshes.length; i++) {
        result.meshes[i].parent = this.mesh;
      }

      const randomScale = 1 + Math.random() * 0.5;
      this.mesh.scaling = new BABYLON.Vector3(
        randomScale,
        randomScale,
        randomScale
      );

      result.meshes.forEach((mesh) => {
        mesh.isVisible = true;
      });

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

      if (result.animationGroups && result.animationGroups.length > 0) {
        this.animationGroup =
          result.animationGroups.find((ag) =>
            ag.name.toLowerCase().includes("swim")
          ) || result.animationGroups[0];

        if (this.animationGroup) {
          this.animationGroup.start(true);
          this.animationGroup.speedRatio = 0.8 + Math.random() * 0.4;
        }
      }

      this.physicsAggregate = new BABYLON.PhysicsAggregate(
        this.physicsRoot,
        BABYLON.PhysicsShapeType.SPHERE,
        { mass: 1, restitution: 0.3, friction: 0.1 },
        this.scene
      );

      if (this.physicsAggregate.body.shape) {
        this.physicsAggregate.body.shape.filterMembershipMask = 8;
        this.physicsAggregate.body.shape.filterCollideMask = 2 | 4;
      }

      this.physicsAggregate.body.setGravityFactor(0);
      this.physicsAggregate.body.setMassProperties({
        inertia: new BABYLON.Vector3(0, 0, 0),
      });
      this.physicsAggregate.body.setAngularDamping(1.0);
      this.physicsAggregate.body.disablePreStep = false;
    } catch (error) {
      console.error("Error loading fish:", error);
      return;
    }

    this.calculateWaterBounds();
  }

  calculateWaterBounds() {}

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

  avoidBoundaries() {
    let steer = new BABYLON.Vector3(0, 0, 0);
    const pos = this.physicsRoot.position;
    const lookAheadDistance = 5;

    const direction = this.swimDirection.clone().normalize();
    const angles = [0, Math.PI / 6, -Math.PI / 6];

    for (const angle of angles) {
      const rotatedDir = new BABYLON.Vector3(
        direction.x * Math.cos(angle) - direction.z * Math.sin(angle),
        direction.y,
        direction.x * Math.sin(angle) + direction.z * Math.cos(angle)
      );

      const ray = new BABYLON.Ray(pos, rotatedDir, lookAheadDistance);
      const hit = this.scene.pickWithRay(ray, (mesh) => {
        return mesh === this.pond.groundMesh;
      });

      if (hit?.hit && hit.distance < lookAheadDistance) {
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

  applyBoids() {
    if (!this.mesh) return;

    const separation = this.separation();
    const alignment = this.alignment();
    const cohesion = this.cohesion();
    const boundaries = this.avoidBoundaries();

    this.swimDirection.addInPlace(separation.scale(0.2));
    this.swimDirection.addInPlace(alignment.scale(0.005));
    this.swimDirection.addInPlace(cohesion.scale(0.005));
    this.swimDirection.addInPlace(boundaries.scale(1.0));

    this.swimDirection.normalize();
  }

  update(deltaTime) {
    if (!this.mesh || !this.physicsRoot) return;

    this.applyBoids();

    const waveMotion =
      Math.sin(performance.now() * 0.001 + this.timeOffset) * 0.3;
    this.velocity = this.swimDirection.clone().scale(this.speed);
    this.velocity.y += waveMotion;

    this.mesh.position = this.physicsRoot.position.clone();

    if (this.physicsAggregate?.body) {
      this.physicsAggregate.body.setLinearVelocity(this.velocity);
      this.physicsAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
    }

    if (this.velocity.x !== 0 || this.velocity.z !== 0) {
      const targetRot = Math.atan2(this.velocity.x, this.velocity.z);
      this.mesh.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(
        targetRot,
        0,
        0
      );
    }

    if (this.physicsRoot.position.y > this.pond.waterSurfaceY - 0.5) {
      this.physicsRoot.position.y = this.pond.waterSurfaceY - 0.5;
      if (this.swimDirection.y > 0) {
        this.swimDirection.y = -Math.abs(this.swimDirection.y);
      }
    }
  }

  changeDirection() {
    const randomTurn = (Math.random() - 0.5) * Math.PI * 0.5;
    const currentAngle = Math.atan2(this.swimDirection.x, this.swimDirection.z);
    const newAngle = currentAngle + randomTurn;

    this.swimDirection.x = Math.sin(newAngle);
    this.swimDirection.z = Math.cos(newAngle);
    this.swimDirection.y = (Math.random() - 0.5) * 0.3;

    this.swimDirection.normalize();
  }
}
