export class FishingLine {
  constructor(scene) {
    this.scene = scene;
    this.line = null;
    this.segments = [];
    this.constraints = [];
    this.bobberBody = null;

    this.NUM_SEGMENTS = 20;
    this.SEG_HEIGHT = 0.3;
    this.SEG_DIAMETER = 0.05;
    this.SEG_SCALE = 0.01;
    // The line is lighter than the bobber it hangs from, but NOT tiny: under
    // gravity -100 the stiff 6DoF joints need real mass and rotational inertia to
    // stay stable. (A 0.05 mass with a 0.03 collision radius gave near-zero inertia
    // and the whole chain exploded.) The collision sphere is only used for inertia
    // here since segments don't collide with anything, so keep it at 0.15.
    this.SEG_MASS = 1.0;
    this.SEG_SHAPE_RADIUS = 0.15;
    this.LINEAR_DAMPING = 0.95;
    this.ANGULAR_DAMPING = 0.98;
    this.JOINT_FRICTION = 30;

    // Buoyancy: submerged segments are pushed up to the surface instead of
    // colliding with a solid water plane. Stiffness has to be strong to hold the
    // line up against gravity -100 — a submerged segment settles about
    // (gravity*dt / stiffness) below the target, so weak values just let it sag
    // straight through the water.
    this.BUOYANCY_STIFFNESS = 15;
    this.WATER_DRAG = 0.85;

    this.segCounter = 0;
    this.linePathLength = 0;

    // One material for the whole game — the old code leaked a new StandardMaterial
    // every frame because dispose() never freed the previous one.
    this.material = new BABYLON.StandardMaterial("lineMat", this.scene);
    this.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
    this.material.backFaceCulling = false;
  }

  createPhysicsRope(rodTipPos, bobberPos, bobberPhysics) {
    if (!bobberPhysics) return;

    // Guard against a stray/late cast stacking a second rope onto a live one,
    // which corrupted the segment/constraint bookkeeping.
    if (this.segments.length > 0) this.dispose();

    this.bobberBody = bobberPhysics.body;
    const zero = BABYLON.Vector3.Zero();

    for (let i = 0; i < this.NUM_SEGMENTS; i++) {
      let segment =
        i === 0
          ? BABYLON.MeshBuilder.CreateBox("seg" + i, { size: 0.1 }, this.scene)
          : BABYLON.MeshBuilder.CreateCylinder(
              "seg" + i,
              { height: this.SEG_HEIGHT, diameter: this.SEG_DIAMETER },
              this.scene
            );

      segment.scaling = new BABYLON.Vector3(
        this.SEG_SCALE,
        this.SEG_SCALE,
        this.SEG_SCALE
      );
      segment.isVisible = true;

      const t = i / (this.NUM_SEGMENTS - 1);
      segment.position = BABYLON.Vector3.Lerp(rodTipPos, bobberPos, t);

      let motionType =
        i === 0
          ? BABYLON.PhysicsMotionType.ANIMATED
          : BABYLON.PhysicsMotionType.DYNAMIC;

      let body = new BABYLON.PhysicsBody(
        segment,
        motionType,
        false,
        this.scene
      );
      body.setMassProperties({ mass: this.SEG_MASS });
      body.setAngularDamping(this.ANGULAR_DAMPING);
      body.setLinearDamping(this.LINEAR_DAMPING);
      body.shape = new BABYLON.PhysicsShapeSphere(
        zero,
        this.SEG_SHAPE_RADIUS,
        this.scene
      );
      body.shape.filterMembershipMask = 2; // Line segments are in group 2
      body.shape.filterCollideMask = 0; // No solid contacts — buoyancy + constraints only
      // Only the animated anchor is driven by writing its transform each frame;
      // the dynamic segments are owned by the solver, so don't push their meshes in.
      body.disablePreStep = i === 0 ? false : true;

      this.segments.push(segment);
    }

    for (let i = 0; i < this.NUM_SEGMENTS - 1; i++) {
      let jointYA = new BABYLON.Vector3(
        0,
        i === 0 ? -0.05 : -this.SEG_HEIGHT / 2,
        0
      );
      let jointYB = new BABYLON.Vector3(0, this.SEG_HEIGHT / 2, 0);

      let constraint = new BABYLON.Physics6DoFConstraint(
        {
          pivotA: jointYA,
          pivotB: jointYB,
          axisA: new BABYLON.Vector3(0, 0, 1),
          axisB: new BABYLON.Vector3(0, 0, 1),
          perpAxisA: new BABYLON.Vector3(1, 0, 0),
          perpAxisB: new BABYLON.Vector3(1, 0, 0),
          collision: false,
        },
        [
          {
            axis: BABYLON.PhysicsConstraintAxis.LINEAR_X,
            minLimit: 0,
            maxLimit: 0,
          },
          {
            axis: BABYLON.PhysicsConstraintAxis.LINEAR_Y,
            minLimit: 0,
            maxLimit: 0,
          },
          {
            axis: BABYLON.PhysicsConstraintAxis.LINEAR_Z,
            minLimit: 0,
            maxLimit: 0,
          },
          {
            axis: BABYLON.PhysicsConstraintAxis.ANGULAR_X,
            minLimit: -Math.PI / 12,
            maxLimit: Math.PI / 12,
          },
          {
            axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Y,
            minLimit: -Math.PI / 12,
            maxLimit: Math.PI / 12,
          },
          {
            axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Z,
            minLimit: -Math.PI / 12,
            maxLimit: Math.PI / 12,
          },
        ],
        this.scene
      );

      this.segments[i].physicsBody.addConstraint(
        this.segments[i + 1].physicsBody,
        constraint
      );

      constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_X, this.JOINT_FRICTION);
      constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, this.JOINT_FRICTION);
      constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Z, this.JOINT_FRICTION);

      this.constraints.push(constraint);
    }

    // pivotB is on the bobber, in its (upright) body frame: +Y is world-up, so a
    // small positive Y attaches the line to the TOP of the floating bobber (radius
    // 0.25) and the line comes cleanly off the top instead of being pinned under it.
    let bobberConstraint = new BABYLON.BallAndSocketConstraint(
      new BABYLON.Vector3(0, -this.SEG_HEIGHT / 2, 0),
      new BABYLON.Vector3(0, 0.3, 0),
      new BABYLON.Vector3(0, 1, 0),
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );

    this.segments[this.NUM_SEGMENTS - 1].physicsBody.addConstraint(
      this.bobberBody,
      bobberConstraint
    );
    this.constraints.push(bobberConstraint);
  }

  setAnchorPosition(position) {
    if (this.segments.length > 0) {
      this.segments[0].position = position.clone();
    }
  }

  reelIn() {
    if (!this.bobberBody || this.segments.length <= 5) return;

    if (this.segments.length > 1) {
      const segmentToRemove = this.segments[1];

      if (this.constraints.length > 0) {
        this.constraints[0].dispose();
        this.constraints.shift();
      }

      if (this.constraints.length > 0) {
        this.constraints[0].dispose();
        this.constraints.shift();
      }

      if (segmentToRemove.physicsBody) {
        segmentToRemove.physicsBody.dispose();
      }
      segmentToRemove.dispose();
      this.segments.splice(1, 1);

      if (this.segments.length > 1) {
        const jointYA = new BABYLON.Vector3(0, -0.05, 0);
        const jointYB = new BABYLON.Vector3(0, this.SEG_HEIGHT / 2, 0);

        const constraint = new BABYLON.Physics6DoFConstraint(
          {
            pivotA: jointYA,
            pivotB: jointYB,
            axisA: new BABYLON.Vector3(0, 0, 1),
            axisB: new BABYLON.Vector3(0, 0, 1),
            perpAxisA: new BABYLON.Vector3(1, 0, 0),
            perpAxisB: new BABYLON.Vector3(1, 0, 0),
            collision: false,
          },
          [
            {
              axis: BABYLON.PhysicsConstraintAxis.LINEAR_X,
              minLimit: 0,
              maxLimit: 0,
            },
            {
              axis: BABYLON.PhysicsConstraintAxis.LINEAR_Y,
              minLimit: 0,
              maxLimit: 0,
            },
            {
              axis: BABYLON.PhysicsConstraintAxis.LINEAR_Z,
              minLimit: 0,
              maxLimit: 0,
            },
            {
              axis: BABYLON.PhysicsConstraintAxis.ANGULAR_X,
              minLimit: -Math.PI / 12,
              maxLimit: Math.PI / 12,
            },
            {
              axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Y,
              minLimit: -Math.PI / 12,
              maxLimit: Math.PI / 12,
            },
            {
              axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Z,
              minLimit: -Math.PI / 12,
              maxLimit: Math.PI / 12,
            },
          ],
          this.scene
        );

        this.segments[0].physicsBody.addConstraint(
          this.segments[1].physicsBody,
          constraint
        );
        constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_X, this.JOINT_FRICTION);
        constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, this.JOINT_FRICTION);
        constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Z, this.JOINT_FRICTION);
        this.constraints.unshift(constraint);
      }
    }
  }

  reelOut() {
    if (!this.bobberBody || this.segments.length >= 50) return; // Max 50 segments

    // Need at least 2 segments (anchor + one more) to add between them
    if (this.segments.length < 2) return;

    const anchorSegment = this.segments[0];
    const nextSegment = this.segments[1];
    const newPos = BABYLON.Vector3.Lerp(
      anchorSegment.position,
      nextSegment.position,
      0.5
    );

    const segment = BABYLON.MeshBuilder.CreateCylinder(
      `seg_${this.segCounter++}`,
      { height: this.SEG_HEIGHT, diameter: this.SEG_DIAMETER },
      this.scene
    );
    segment.scaling = new BABYLON.Vector3(
      this.SEG_SCALE,
      this.SEG_SCALE,
      this.SEG_SCALE
    );
    segment.isVisible = true;
    segment.position = newPos;

    const zero = BABYLON.Vector3.Zero();
    const body = new BABYLON.PhysicsBody(
      segment,
      BABYLON.PhysicsMotionType.DYNAMIC,
      false,
      this.scene
    );
    body.setMassProperties({ mass: this.SEG_MASS });
    body.setAngularDamping(this.ANGULAR_DAMPING);
    body.setLinearDamping(this.LINEAR_DAMPING);
    body.shape = new BABYLON.PhysicsShapeSphere(
      zero,
      this.SEG_SHAPE_RADIUS,
      this.scene
    );
    body.shape.filterMembershipMask = 2;
    body.shape.filterCollideMask = 0; // No solid contacts — buoyancy + constraints only
    body.disablePreStep = true;

    this.segments.splice(1, 0, segment);

    if (this.constraints.length > 0) {
      this.constraints[0].dispose();
      this.constraints.shift();
    }

    const jointYA1 = new BABYLON.Vector3(0, -0.05, 0);
    const jointYB1 = new BABYLON.Vector3(0, this.SEG_HEIGHT / 2, 0);

    const constraint1 = new BABYLON.Physics6DoFConstraint(
      {
        pivotA: jointYA1,
        pivotB: jointYB1,
        axisA: new BABYLON.Vector3(0, 0, 1),
        axisB: new BABYLON.Vector3(0, 0, 1),
        perpAxisA: new BABYLON.Vector3(1, 0, 0),
        perpAxisB: new BABYLON.Vector3(1, 0, 0),
        collision: false,
      },
      [
        {
          axis: BABYLON.PhysicsConstraintAxis.LINEAR_X,
          minLimit: 0,
          maxLimit: 0,
        },
        {
          axis: BABYLON.PhysicsConstraintAxis.LINEAR_Y,
          minLimit: 0,
          maxLimit: 0,
        },
        {
          axis: BABYLON.PhysicsConstraintAxis.LINEAR_Z,
          minLimit: 0,
          maxLimit: 0,
        },
        {
          axis: BABYLON.PhysicsConstraintAxis.ANGULAR_X,
          minLimit: -Math.PI / 12,
          maxLimit: Math.PI / 12,
        },
        {
          axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Y,
          minLimit: -Math.PI / 12,
          maxLimit: Math.PI / 12,
        },
        {
          axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Z,
          minLimit: -Math.PI / 12,
          maxLimit: Math.PI / 12,
        },
      ],
      this.scene
    );

    anchorSegment.physicsBody.addConstraint(segment.physicsBody, constraint1);
    constraint1.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_X, this.JOINT_FRICTION);
    constraint1.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, this.JOINT_FRICTION);
    constraint1.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Z, this.JOINT_FRICTION);
    this.constraints.unshift(constraint1);

    const jointYA2 = new BABYLON.Vector3(0, -this.SEG_HEIGHT / 2, 0);
    const jointYB2 = new BABYLON.Vector3(0, this.SEG_HEIGHT / 2, 0);

    const constraint2 = new BABYLON.Physics6DoFConstraint(
      {
        pivotA: jointYA2,
        pivotB: jointYB2,
        axisA: new BABYLON.Vector3(0, 0, 1),
        axisB: new BABYLON.Vector3(0, 0, 1),
        perpAxisA: new BABYLON.Vector3(1, 0, 0),
        perpAxisB: new BABYLON.Vector3(1, 0, 0),
        collision: false,
      },
      [
        {
          axis: BABYLON.PhysicsConstraintAxis.LINEAR_X,
          minLimit: 0,
          maxLimit: 0,
        },
        {
          axis: BABYLON.PhysicsConstraintAxis.LINEAR_Y,
          minLimit: 0,
          maxLimit: 0,
        },
        {
          axis: BABYLON.PhysicsConstraintAxis.LINEAR_Z,
          minLimit: 0,
          maxLimit: 0,
        },
        {
          axis: BABYLON.PhysicsConstraintAxis.ANGULAR_X,
          minLimit: -Math.PI / 12,
          maxLimit: Math.PI / 12,
        },
        {
          axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Y,
          minLimit: -Math.PI / 12,
          maxLimit: Math.PI / 12,
        },
        {
          axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Z,
          minLimit: -Math.PI / 12,
          maxLimit: Math.PI / 12,
        },
      ],
      this.scene
    );

    segment.physicsBody.addConstraint(
      this.segments[2].physicsBody,
      constraint2
    );
    constraint2.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_X, this.JOINT_FRICTION);
    constraint2.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, this.JOINT_FRICTION);
    constraint2.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Z, this.JOINT_FRICTION);
    this.constraints.splice(1, 0, constraint2);
  }

  update(rodTipPos, bobberPos, ponds) {
    if (!rodTipPos || !bobberPos) return;

    this.setAnchorPosition(rodTipPos);

    // Buoyancy instead of solid collision: a submerged segment is eased up toward
    // the surface (spring on Y) with horizontal drag, using the actual pond it is
    // over. Segments in the air just fall under gravity and hang in a catenary.
    if (ponds) {
      for (let i = 1; i < this.segments.length; i++) {
        const body = this.segments[i].physicsBody;
        if (!body) continue;
        const p = this.segments[i].position;
        for (const pond of ponds) {
          if (
            p.x < pond.bounds.minX ||
            p.x > pond.bounds.maxX ||
            p.z < pond.bounds.minZ ||
            p.z > pond.bounds.maxZ
          ) {
            continue;
          }
          // Float the line so the tube rests just on top of the surface. Push up
          // only (never pull the segment down toward the target) so a submerged
          // segment can't be dragged under — it rises and settles at the surface.
          // The +0.15 offsets the small steady-state sag from gravity so it lands
          // right at the waterline rather than a little below it.
          const targetY = pond.waterSurfaceY + 0.15;
          if (p.y < targetY) {
            const v = body.getLinearVelocity();
            v.y = Math.max(v.y, (targetY - p.y) * this.BUOYANCY_STIFFNESS);
            v.x *= this.WATER_DRAG;
            v.z *= this.WATER_DRAG;
            body.setLinearVelocity(v);
          }
          break;
        }
      }
    }

    // Build the visible tube through every segment and the bobber.
    const path = [];
    for (const segment of this.segments) {
      path.push(segment.position.clone());
    }
    path.push(bobberPos.clone());

    if (path.length < 2) return;

    // Reuse the tube in place; only rebuild geometry when the segment count
    // changes (reel in/out). The material is created once, in the constructor.
    if (!this.line || this.linePathLength !== path.length) {
      if (this.line) this.line.dispose(false, false);
      this.line = BABYLON.MeshBuilder.CreateTube(
        "fishingLine",
        { path: path, radius: 0.05, updatable: true },
        this.scene
      );
      this.line.material = this.material;
      this.line.isVisible = true;
      this.linePathLength = path.length;
    } else {
      this.line = BABYLON.MeshBuilder.CreateTube("fishingLine", {
        path: path,
        instance: this.line,
      });
    }
  }

  dispose() {
    if (this.line) {
      // Keep the shared material — it is reused across casts and freed in destroy().
      this.line.dispose(false, false);
      this.line = null;
    }
    this.linePathLength = 0;

    this.constraints.forEach((c) => c.dispose());
    this.constraints = [];

    this.segments.forEach((segment) => {
      if (segment.physicsBody) {
        segment.physicsBody.dispose();
      }
      segment.dispose();
    });
    this.segments = [];
    this.bobberBody = null;
  }

  destroy() {
    this.dispose();
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }
}
