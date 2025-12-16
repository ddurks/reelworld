export class FishingRod {
  constructor(scene, skeleton, handBone, skinnedMesh, reelGuy) {
    this.scene = scene;
    this.skeleton = skeleton;
    this.handBone = handBone;
    this.skinnedMesh = skinnedMesh;
    this.reelGuy = reelGuy; // Reference to parent ReelGuy
    this.meshes = null;
    this.rootMesh = null;
    this.isVisible = false;
    this.bobber = null;
    this.line = null;
    this.rodTipPosition = null;

    this.loadModel();
  }

  async loadModel() {
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "./assets/",
        "reelrod.glb",
        this.scene
      );

      this.rootMesh = result.meshes[0];
      this.meshes = result.meshes;

      console.log("Fishing rod meshes loaded:", result.meshes.length);
      result.meshes.forEach((mesh, i) => {
        console.log(
          `  Mesh ${i}: ${mesh.name}, vertices: ${mesh.getTotalVertices()}`
        );
      });

      if (this.handBone && this.skinnedMesh) {
        // Attach fishing rod to hand bone
        this.rootMesh.attachToBone(this.handBone, this.skinnedMesh);
        console.log("Fishing rod attached to hand.r bone");

        // Apply rotation and flip - mirror the model to make it right-handed
        this.rootMesh.rotation = new BABYLON.Vector3(Math.PI / 4, 0, 0);
        this.rootMesh.position = new BABYLON.Vector3(-0.15, 0, -0.1); // Offset slightly left

        // Find the rod tip position (we'll update this each frame)
        this.rodTipPosition = new BABYLON.Vector3(0, 0, 2); // 2 units forward from root
      }

      // Load bobber model
      await this.loadBobber();

      // Initially hide all fishing rod meshes
      this.hide();
      console.log("Fishing rod loaded successfully");
    } catch (err) {
      console.error("Failed to load fishing rod:", err);
    }
  }

  async loadBobber() {
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "./assets/",
        "bobber.glb",
        this.scene
      );

      this.bobber = result.meshes[0];
      // Fix upside-down bobber by rotating 180 degrees around X axis
      this.bobber.rotation = new BABYLON.Vector3(Math.PI, 0, 0);
      this.bobber.setEnabled(false);

      // Add physics to bobber - smaller sphere
      this.bobberPhysics = new BABYLON.PhysicsAggregate(
        this.bobber,
        BABYLON.PhysicsShapeType.SPHERE,
        { mass: 0.1, restitution: 0.3, friction: 0.5, radius: 0.25 },
        this.scene
      );

      // Keep normal gravity for bobber
      this.bobberPhysics.body.setGravityFactor(1);

      // Lock rotation to keep bobber upright
      this.bobberPhysics.body.setMassProperties({
        inertia: new BABYLON.Vector3(0, 0, 0), // No rotation allowed
      });
      this.bobberPhysics.body.setAngularDamping(1.0);

      // Set collision - bobber collides with EVERYTHING
      if (this.bobberPhysics.body.shape) {
        this.bobberPhysics.body.shape.filterMembershipMask = 16; // Bobber mask
        this.bobberPhysics.body.shape.filterCollideMask = 0xffffffff; // Collide with everything
      }

      console.log(
        "Bobber loaded with collision mask:",
        this.bobberPhysics.body.shape.filterCollideMask
      );
      console.log(
        "Bobber membership mask:",
        this.bobberPhysics.body.shape.filterMembershipMask
      );

      console.log("Bobber loaded");
    } catch (err) {
      console.error("Failed to load bobber:", err);
    }
  }

  castLine(ponds) {
    if (!this.bobber || !this.rootMesh || !this.reelGuy) return;

    // Get character position
    const charPos = this.reelGuy.bodyMesh.position;

    // Get camera forward direction (more predictable than character rotation)
    const cameraForward = this.reelGuy.camera.getForwardRay().direction;
    const castDirection = new BABYLON.Vector3(
      cameraForward.x,
      0,
      cameraForward.z
    );
    castDirection.normalize();

    // Start bobber in front of character, at hand height
    const startPos = charPos.clone();
    startPos.y += 1.5; // Hand height
    startPos.addInPlace(castDirection.scale(2)); // 2 units forward to clear player

    console.log("Casting from:", startPos);
    console.log("Character pos:", charPos);
    console.log("Cast direction:", castDirection);

    // Enable and position bobber
    this.bobber.setEnabled(true);
    this.bobber.position = startPos.clone();

    // CRITICAL: Sync physics body with mesh position
    this.bobberPhysics.body.disablePreStep = false;
    this.bobberPhysics.transformNode.position = startPos.clone();

    // Cast forward and up with more horizontal energy
    const castVelocity = castDirection.scale(18);
    castVelocity.y = 4; // Arc upward

    console.log("Cast velocity:", castVelocity);
    console.log("Bobber mesh pos after set:", this.bobber.position);
    console.log(
      "Bobber physics pos:",
      this.bobberPhysics.transformNode.position
    );

    this.bobberPhysics.body.setLinearVelocity(castVelocity);

    // Verify velocity was set
    const actualVel = this.bobberPhysics.body.getLinearVelocity();
    console.log("Actual bobber velocity after set:", actualVel);

    // Create fishing line and physics constraint
    console.log("[CAST] About to create fishing line...");
    this.createLine();
    
    // Wait a frame for bobber to start moving, then create physics constraint
    console.log("[CAST] Setting timeout for physics constraint...");
    setTimeout(() => {
      console.log("[CAST] Timeout triggered, creating physics line...");
      this.createPhysicsLine();
    }, 100);
    
    console.log("[CAST] createLine() completed. Hand anchor:", this.handAnchor);

    console.log("Fishing line cast!");
  }

  createLine() {
    console.log("[CREATE_LINE] Starting createLine...");
    if (this.line) {
      console.log("[CREATE_LINE] Disposing existing line:", this.line);
      this.line.dispose();
    }
    
    if (this.lineConstraint) {
      this.lineConstraint.dispose();
      this.lineConstraint = null;
    }

    // Create anchor point at hand position for physics constraint
    if (!this.handAnchor) {
      this.handAnchor = BABYLON.MeshBuilder.CreateSphere(
        "handAnchor",
        { diameter: 0.3 },
        this.scene
      );
      this.handAnchor.isVisible = true; // Visible for debugging
      
      // Create material for visibility
      const anchorMat = new BABYLON.StandardMaterial("handAnchorMat", this.scene);
      anchorMat.diffuseColor = new BABYLON.Color3(0, 1, 0); // Green
      anchorMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
      this.handAnchor.material = anchorMat;
      
      // Create physics body for hand anchor
      this.handAnchorPhysics = new BABYLON.PhysicsBody(
        this.handAnchor,
        BABYLON.PhysicsMotionType.ANIMATED, // Animated so we can move it
        false,
        this.scene
      );
      
      const anchorShape = new BABYLON.PhysicsShapeBox(
        new BABYLON.Vector3(0, 0, 0),
        new BABYLON.Quaternion(0, 0, 0, 1),
        new BABYLON.Vector3(0.1, 0.1, 0.1),
        this.scene
      );
      this.handAnchorPhysics.shape = anchorShape;
      this.handAnchorPhysics.setMassProperties({ mass: 0 }); // Infinite mass
    }

    // Position hand anchor at character's hand
    const handPos = this.reelGuy.bodyMesh.position.clone();
    handPos.y += 1.5;
    this.handAnchor.position = handPos;

    console.log("[CREATE_LINE] Hand anchor created at:", handPos);
  }

  createPhysicsLine() {
    // Create a segmented rope with physics
    if (!this.bobber || !this.handAnchor || !this.bobberPhysics || !this.handAnchorPhysics) {
      console.log("[CREATE_PHYSICS_LINE] Missing required objects:", {
        bobber: !!this.bobber,
        handAnchor: !!this.handAnchor,
        bobberPhysics: !!this.bobberPhysics,
        handAnchorPhysics: !!this.handAnchorPhysics
      });
      return;
    }

    const handPos = this.handAnchor.position.clone();
    const bobberPos = this.bobber.position.clone();
    const distance = BABYLON.Vector3.Distance(handPos, bobberPos);
    
    console.log("[CREATE_PHYSICS_LINE] Creating segmented rope:");
    console.log("  Total distance:", distance);
    
    // Create rope segments
    const numSegments = 10;
    const segmentLength = distance / numSegments;
    
    this.ropeSegments = [];
    this.ropeConstraints = [];
    
    for (let i = 0; i < numSegments; i++) {
      const t = (i + 1) / (numSegments + 1); // Skip first (hand) and last (bobber)
      const pos = BABYLON.Vector3.Lerp(handPos, bobberPos, t);
      
      // Create small sphere for rope segment
      const segment = BABYLON.MeshBuilder.CreateSphere(
        `ropeSegment${i}`,
        { diameter: 0.1 },
        this.scene
      );
      segment.position = pos;
      segment.isVisible = true; // Visible for debugging
      
      // Add physics
      const segmentPhysics = new BABYLON.PhysicsAggregate(
        segment,
        BABYLON.PhysicsShapeType.SPHERE,
        { mass: 0.05, restitution: 0, friction: 0.5 },
        this.scene
      );
      
      segmentPhysics.body.setLinearDamping(0.9); // High damping for stability
      
      // Store physics body on mesh for debug viewer
      segment.physicsBody = segmentPhysics.body;
      
      // Set initial position on physics body to prevent origin issue
      segmentPhysics.body.disablePreStep = false;
      
      this.ropeSegments.push({ mesh: segment, physics: segmentPhysics });
    }
    
    // Connect segments with constraints
    // Connect hand to first segment
    if (this.ropeSegments.length > 0) {
      const constraint = new BABYLON.Physics6DoFConstraint(
        {
          pivotA: new BABYLON.Vector3(0, 0, 0),
          pivotB: new BABYLON.Vector3(0, 0, 0),
          perpAxisA: new BABYLON.Vector3(0, 1, 0),
          perpAxisB: new BABYLON.Vector3(0, 1, 0),
        },
        [
          {
            axis: BABYLON.PhysicsConstraintAxis.LINEAR_DISTANCE,
            minLimit: 0,
            maxLimit: segmentLength,
          },
        ],
        this.scene
      );
      
      this.handAnchorPhysics.addConstraint(this.ropeSegments[0].physics.body, constraint);
      this.ropeConstraints.push(constraint);
    }
    
    // Connect segments to each other
    for (let i = 0; i < this.ropeSegments.length - 1; i++) {
      const constraint = new BABYLON.Physics6DoFConstraint(
        {
          pivotA: new BABYLON.Vector3(0, 0, 0),
          pivotB: new BABYLON.Vector3(0, 0, 0),
          perpAxisA: new BABYLON.Vector3(0, 1, 0),
          perpAxisB: new BABYLON.Vector3(0, 1, 0),
        },
        [
          {
            axis: BABYLON.PhysicsConstraintAxis.LINEAR_DISTANCE,
            minLimit: 0,
            maxLimit: segmentLength,
          },
        ],
        this.scene
      );
      
      this.ropeSegments[i].physics.body.addConstraint(
        this.ropeSegments[i + 1].physics.body,
        constraint
      );
      this.ropeConstraints.push(constraint);
    }
    
    // Connect last segment to bobber
    if (this.ropeSegments.length > 0) {
      const lastSegment = this.ropeSegments[this.ropeSegments.length - 1];
      const constraint = new BABYLON.Physics6DoFConstraint(
        {
          pivotA: new BABYLON.Vector3(0, 0, 0),
          pivotB: new BABYLON.Vector3(0, 0, 0),
          perpAxisA: new BABYLON.Vector3(0, 1, 0),
          perpAxisB: new BABYLON.Vector3(0, 1, 0),
        },
        [
          {
            axis: BABYLON.PhysicsConstraintAxis.LINEAR_DISTANCE,
            minLimit: 0,
            maxLimit: segmentLength,
          },
        ],
        this.scene
      );
      
      lastSegment.physics.body.addConstraint(this.bobberPhysics.body, constraint);
      this.ropeConstraints.push(constraint);
    }
    
    console.log("[CREATE_PHYSICS_LINE] Created", this.ropeSegments.length, "rope segments");
  }

  updateLine() {
    if (!this.bobber || !this.bobber.isEnabled() || !this.reelGuy || !this.handAnchor) {
      return;
    }

    // Update hand anchor position to follow character's hand
    const handPos = this.reelGuy.bodyMesh.position.clone();
    handPos.y += 1.5; // Hand height
    this.handAnchor.position = handPos;
    
    // For ANIMATED physics bodies, we need to enable pre-step to update position
    if (this.handAnchorPhysics) {
      this.handAnchorPhysics.disablePreStep = false;
    }

    // Dispose old line
    if (this.line) {
      this.line.dispose();
    }
    
    // Build path from hand -> rope segments -> bobber
    const path = [handPos];
    
    if (this.ropeSegments) {
      for (const segment of this.ropeSegments) {
        path.push(segment.mesh.position.clone());
      }
    }
    
    path.push(this.bobber.position.clone());
    
    // Create ribbon along the path with multiple segments for smooth curve
    const ribbonPaths = [];
    const width = 0.05;
    
    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      // Create perpendicular offset for ribbon width
      const offset = new BABYLON.Vector3(width, 0, 0);
      ribbonPaths.push(point.clone().add(offset));
    }
    
    const ribbonPaths2 = [];
    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      const offset = new BABYLON.Vector3(-width, 0, 0);
      ribbonPaths2.push(point.clone().add(offset));
    }
    
    this.line = BABYLON.MeshBuilder.CreateRibbon(
      "fishingLine",
      {
        pathArray: [ribbonPaths, ribbonPaths2],
        sideOrientation: BABYLON.Mesh.DOUBLESIDE,
      },
      this.scene
    );
    
    // Create bright material
    if (!this.lineMaterial) {
      this.lineMaterial = new BABYLON.StandardMaterial("lineMat", this.scene);
      this.lineMaterial.diffuseColor = new BABYLON.Color3(1, 1, 0); // Yellow
      this.lineMaterial.emissiveColor = new BABYLON.Color3(1, 1, 0); // Emissive yellow
      this.lineMaterial.backFaceCulling = false;
    }
    
    this.line.material = this.lineMaterial;
    this.line.position = BABYLON.Vector3.Zero();
    this.line.isVisible = true;
    this.line.setEnabled(true);
    
    console.log("[LINE] Ribbon created:", this.line, "vertices:", this.line.getTotalVertices());
  }

  reelIn() {
    if (this.bobber) {
      this.bobber.setEnabled(false);
    }
    if (this.line) {
      this.line.dispose();
      this.line = null;
    }
    if (this.lineConstraint) {
      this.lineConstraint.dispose();
      this.lineConstraint = null;
    }
    if (this.ropeSegments) {
      this.ropeSegments.forEach(segment => {
        segment.mesh.dispose();
        segment.physics.dispose();
      });
      this.ropeSegments = null;
    }
    if (this.ropeConstraints) {
      this.ropeConstraints.forEach(c => c.dispose());
      this.ropeConstraints = null;
    }
  }

  update(ponds) {
    // Update line position if cast
    this.updateLine();

    // Make bobber float on water and log position
    if (this.bobber && this.bobber.isEnabled() && ponds && ponds.length > 0) {
      const bobberPos = this.bobber.position;
      const bobberVel = this.bobberPhysics.body.getLinearVelocity();

      // Log occasionally
      if (Math.random() < 0.05) {
        console.log("Bobber state:", {
          pos: bobberPos,
          vel: bobberVel,
          speed: bobberVel.length().toFixed(2),
        });
      }

      // Check if bobber is in water
      for (const pond of ponds) {
        // Apply buoyancy when below water surface
        if (bobberPos.y < pond.waterSurfaceY) {
          const depthBelowSurface = pond.waterSurfaceY - bobberPos.y;
          // Gentle buoyancy force - just enough to counteract gravity
          const buoyancy = new BABYLON.Vector3(0, 3 + depthBelowSurface * 5, 0);
          this.bobberPhysics.body.applyForce(buoyancy, bobberPos);

          // Dampen movement in water
          const vel = this.bobberPhysics.body.getLinearVelocity();
          vel.x *= 0.9;
          vel.z *= 0.9;
          vel.y *= 0.95; // Also dampen vertical movement
          this.bobberPhysics.body.setLinearVelocity(vel);
        }
      }
    }
  }

  show() {
    if (this.meshes) {
      this.meshes.forEach((mesh) => mesh.setEnabled(true));
      this.isVisible = true;
      console.log("Fishing rod enabled and attached to hand");
    }
  }

  hide() {
    if (this.meshes) {
      this.meshes.forEach((mesh) => mesh.setEnabled(false));
      this.isVisible = false;
    }
  }

  dispose() {
    if (this.meshes) {
      this.meshes.forEach((mesh) => mesh.dispose());
    }
  }
}

export class ReelGuy {
  constructor(scene, position, isMobile, camera, level, ponds = []) {
    this.scene = scene;
    this.position = position;
    this.isMobile = isMobile;
    this.camera = camera;
    this.level = level;
    this.ponds = ponds;
    this.model = null;
    this.physicsBody = null;
    this.bodyMesh = null;
    this.skeleton = null;
    this.animationsMap = new Map();
    this.fishingRod = null;
    this.isFishing = false;
    this.currentAction = "idle";
    this.waterBobTime = 0; // For sin wave bobbing in water
    this.isInWater = false; // Track if currently in water

    // Movement state
    this.walkDirection = BABYLON.Vector3.Zero();
    this.defaultWalkVelocity = 10;
    this.walkVelocity = 10;
    this.walkStart = null;

    // Jump state
    this.isJumping = false;
    this.isStartingJump = false;
  }

  async load() {
    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      "",
      "./assets/",
      "reelguy.glb",
      this.scene
    );

    this.model = result.meshes[0];

    // Enable shadows
    result.meshes.forEach((mesh) => {
      if (mesh.material) {
        mesh.receiveShadows = true;
      }
    });

    // Create a simple cylinder physics body for the character
    this.bodyMesh = BABYLON.MeshBuilder.CreateCylinder(
      "characterBody",
      { height: 4, diameter: 1.5 },
      this.scene
    );

    this.bodyMesh.position = this.position;
    this.bodyMesh.isVisible = false; // Hide the collision shape

    // Parent character to physics body and offset so feet are at bottom
    this.model.parent = this.bodyMesh;
    this.model.position = new BABYLON.Vector3(0, -2, 0); // Offset down so feet align with bottom of cylinder

    const physicsShape = new BABYLON.PhysicsShapeCapsule(
      new BABYLON.Vector3(0, -1.5, 0), // bottom point
      new BABYLON.Vector3(0, -0.5, 0), // top point
      0.5, // radius
      this.scene
    );

    const physicsBody = new BABYLON.PhysicsBody(
      this.bodyMesh,
      BABYLON.PhysicsMotionType.DYNAMIC,
      false,
      this.scene
    );

    physicsBody.setMassProperties({
      mass: 1,
      centerOfMass: new BABYLON.Vector3(0, -1.5, 0),
      inertia: new BABYLON.Vector3(0, 0, 0), // Lock all rotation via inertia
    });

    physicsShape.filterMembershipMask = 1;
    physicsShape.filterCollideMask = 2;
    physicsBody.shape = physicsShape;
    physicsBody.setLinearDamping(0.999);
    physicsBody.setAngularDamping(1.0);

    this.bodyMesh.physicsBody = physicsBody;
    this.physicsBody = physicsBody;

    // Set up animations
    result.animationGroups.forEach((ag) => {
      this.animationsMap.set(ag.name, ag);
      ag.stop();
    });

    // Configure jump animation
    if (this.animationsMap.has("jump")) {
      this.animationsMap.get("jump").loopAnimation = false;
    }

    // Start idle animation
    if (this.animationsMap.has("idle")) {
      this.animationsMap.get("idle").start(true);
    }

    // Find skeleton
    this.model.getChildMeshes().forEach((mesh) => {
      if (mesh.skeleton) {
        this.skeleton = mesh.skeleton;
      }
    });

    // Load fishing rod
    if (this.skeleton) {
      const handBone = this.skeleton.bones.find((b) => b.name === "hand.r");
      const skinnedMesh = this.model
        .getChildMeshes()
        .find((m) => m.skeleton === this.skeleton);

      if (handBone && skinnedMesh) {
        this.fishingRod = new FishingRod(
          this.scene,
          this.skeleton,
          handBone,
          skinnedMesh,
          this // Pass ReelGuy reference
        );
      }
    }

    console.log("ReelGuy loaded successfully");
    return this;
  }

  toggleFishingMode() {
    if (!this.fishingRod) return;

    this.isFishing = !this.isFishing;

    if (this.isFishing) {
      console.log("Entering fishing mode");
      this.fishingRod.show();

      // Cast fishing line after a short delay
      setTimeout(() => {
        if (this.fishingRod) {
          this.fishingRod.castLine(this.ponds);
        }
      }, 500);

      // Play fishing animation
      const fishingAnim = this.animationsMap.get("fishing");
      if (fishingAnim) {
        // Stop current animation
        for (const [name, anim] of this.animationsMap) {
          if (anim.isPlaying) {
            anim.stop();
          }
        }
        fishingAnim.start(true, 1.0);
      } else {
        console.warn("Fishing animation not found!");
      }
    } else {
      console.log("Exiting fishing mode");
      this.fishingRod.hide();
      this.fishingRod.reelIn();

      // Return to idle animation
      const fishingAnim = this.animationsMap.get("fishing");
      if (fishingAnim) {
        fishingAnim.stop();
      }
      const idleAnim = this.animationsMap.get("idle");
      if (idleAnim) {
        idleAnim.start(true, 1.0);
      }
    }
  }

  getPosition() {
    return this.bodyMesh.position;
  }

  getModelPosition() {
    return this.model.position;
  }

  applyWaterPhysics(delta) {
    if (!this.physicsBody || !this.ponds || this.ponds.length === 0) return;

    const playerPos = this.bodyMesh.position;
    let inWater = false;
    let waterSurfaceY = 0;

    // Check if player is in any pond
    for (const pond of this.ponds) {
      const inXZBounds =
        playerPos.x >= pond.bounds.minX &&
        playerPos.x <= pond.bounds.maxX &&
        playerPos.z >= pond.bounds.minZ &&
        playerPos.z <= pond.bounds.maxZ;

      if (!inXZBounds) continue;

      const depthInWater = pond.waterSurfaceY - playerPos.y;
      if (depthInWater > -1 && depthInWater < 4) {
        inWater = true;
        waterSurfaceY = pond.waterSurfaceY;
        break;
      }
    }

    this.isInWater = inWater;

    if (inWater) {
      // Cartoony sin wave bobbing
      this.waterBobTime += delta * 2; // Bob frequency
      const bobAmount = Math.sin(this.waterBobTime) * 0.2; // Bob amplitude

      // Set Y position to bob on water surface
      const targetY = waterSurfaceY + 0.99 + bobAmount; // Float higher - waist at surface

      // Smoothly move toward target Y
      const currentY = this.bodyMesh.position.y;
      const yDiff = targetY - currentY;
      const moveSpeed = 5; // How fast to reach target

      // Set velocity to move toward target
      const velocity = this.physicsBody.getLinearVelocity();
      velocity.y = yDiff * moveSpeed;
      this.physicsBody.setLinearVelocity(velocity);

      // Add water drag on horizontal movement
      velocity.x *= 0.85;
      velocity.z *= 0.85;
      this.physicsBody.setLinearVelocity(velocity);
    }
  }

  update(delta, input) {
    const {
      directionPressed,
      joystickPressed,
      keysPressed,
      joystick,
      jumpRequested,
      prevJumpRequested,
    } = input;

    // Update fishing rod (line, bobber, etc.)
    if (this.fishingRod) {
      this.fishingRod.update(this.ponds);
    }

    // Apply water buoyancy if in water
    this.applyWaterPhysics(delta);

    // Handle jump
    if (jumpRequested && !prevJumpRequested && !this.isJumping) {
      this.isStartingJump = true;
    }

    let play = this.currentAction;

    // If fishing, keep fishing animation and don't allow movement
    if (this.isFishing) {
      play = "fishing";
    } else if (this.isInWater) {
      play = "swim"; // Always swim animation when in water
      // Allow movement in water
      if (directionPressed || joystickPressed) {
        this.applyMovement(
          directionPressed,
          joystickPressed,
          keysPressed,
          joystick
        );
      }
    } else if (this.isStartingJump) {
      play = "jump";
    } else if (directionPressed || joystickPressed) {
      if (this.isJumping) {
        play = "float";
      } else {
        play = "walk";
      }
      this.applyMovement(
        directionPressed,
        joystickPressed,
        keysPressed,
        joystick
      );
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
            this.physicsBody.applyImpulse(impulse, this.model.position);
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
      const euler = this.model.rotationQuaternion.toEulerAngles();
      this.bodyMesh.rotationQuaternion = BABYLON.Quaternion.RotationAxis(
        BABYLON.Vector3.Up(),
        euler.y
      );
    }
  }

  applyMovement(directionPressed, joystickPressed, keysPressed, joystick) {
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
    if (this.isMobile && joystick) {
      const forward = -joystick.forward;
      const right = -(joystick.right - joystick.left);
      inputVec = cameraDirection.scale(forward).add(cameraRight.scale(right));
    } else {
      let forward = 0,
        right = 0;
      if (keysPressed.w) forward += 1;
      if (keysPressed.s) forward -= 1;
      if (keysPressed.d) right -= 1;
      if (keysPressed.a) right += 1;
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

      const currentVelocity = this.physicsBody.getLinearVelocity();
      const targetVel = this.walkDirection.scale(this.walkVelocity);
      const newVelocity = new BABYLON.Vector3(
        currentVelocity.x + (targetVel.x - currentVelocity.x) * 0.2,
        currentVelocity.y,
        currentVelocity.z + (targetVel.z - currentVelocity.z) * 0.2
      );
      this.physicsBody.setLinearVelocity(newVelocity);
    } else {
      this.walkDirection = BABYLON.Vector3.Lerp(
        this.walkDirection,
        BABYLON.Vector3.Zero(),
        0.2
      );
      const currentVelocity = this.physicsBody.getLinearVelocity();
      const newVelocity = new BABYLON.Vector3(
        currentVelocity.x * 0.8,
        currentVelocity.y,
        currentVelocity.z * 0.8
      );
      this.physicsBody.setLinearVelocity(newVelocity);
    }
  }

  alignFeetToGround() {
    if (!this.skeleton) return;

    const footBoneNames = ["foot.l", "foot.r"];
    footBoneNames.forEach((boneName) => {
      const bone = this.skeleton.bones.find((b) => b.name === boneName);
      if (!bone) return;

      const worldMatrix = bone.getWorldMatrix();
      const bonePos = BABYLON.Vector3.TransformCoordinates(
        BABYLON.Vector3.Zero(),
        worldMatrix
      );

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

      const groundNormal = hit.getNormal(true);
      if (!groundNormal) return;

      const currentRotation =
        bone.getRotationQuaternion() || BABYLON.Quaternion.Identity();

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

        const targetRotation = alignmentRotation.multiply(currentRotation);
        bone.setRotationQuaternion(
          BABYLON.Quaternion.Slerp(currentRotation, targetRotation, 0.3),
          BABYLON.Space.WORLD
        );
      }
    });
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
      current.onAnimationGroupEndObservable.addOnce(() => {
        onComplete();
      });
    }
  }

  dispose() {
    if (this.fishingRod) {
      this.fishingRod.dispose();
    }
    if (this.model) {
      this.model.dispose();
    }
    if (this.bodyMesh) {
      this.bodyMesh.dispose();
    }
  }
}
