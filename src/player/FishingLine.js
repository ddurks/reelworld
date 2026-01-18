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
    this.SEG_MASS = 10;
    this.SEG_SCALE = 0.01;
  }

  createPhysicsRope(rodTipPos, bobberPos, bobberPhysics) {
    if (!bobberPhysics) return;

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
          ? BABYLON.PhysicsMotionType.KINEMATIC
          : BABYLON.PhysicsMotionType.DYNAMIC;
      let shapeRadius = i === 0 ? 0.05 : this.SEG_HEIGHT / 2;

      let body = new BABYLON.PhysicsBody(
        segment,
        motionType,
        false,
        this.scene
      );
      body.setMassProperties({ mass: this.SEG_MASS });
      body.setAngularDamping(0.99);
      body.setLinearDamping(0.99);
      body.shape = new BABYLON.PhysicsShapeSphere(
        zero,
        shapeRadius,
        this.scene
      );
      body.shape.filterMembershipMask = 2; // Line segments are in group 2
      body.shape.filterCollideMask = 2 | 4 | 16; // Collide with line segments, water, and bobber
      body.disablePreStep = false;

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

      constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_X, 50);
      constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, 50);
      constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Z, 50);

      this.constraints.push(constraint);
    }

    let bobberConstraint = new BABYLON.BallAndSocketConstraint(
      new BABYLON.Vector3(0, -this.SEG_HEIGHT / 2, 0),
      new BABYLON.Vector3(0, 0.5, 0),
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
        constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_X, 50);
        constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, 50);
        constraint.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Z, 50);
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
      `seg${Date.now()}`,
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
    body.setAngularDamping(0.99);
    body.setLinearDamping(0.99);
    body.shape = new BABYLON.PhysicsShapeSphere(
      zero,
      this.SEG_HEIGHT / 2,
      this.scene
    );
    body.shape.filterMembershipMask = 2;
    body.shape.filterCollideMask = 2 | 4 | 16; // Collide with line segments, water, and bobber
    body.disablePreStep = false;

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
    constraint1.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_X, 50);
    constraint1.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, 50);
    constraint1.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Z, 50);
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
    constraint2.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_X, 50);
    constraint2.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, 50);
    constraint2.setAxisFriction(BABYLON.PhysicsConstraintAxis.ANGULAR_Z, 50);
    this.constraints.splice(1, 0, constraint2);
  }

  update(rodTipPos, bobberPos) {
    if (!rodTipPos || !bobberPos) return;

    this.setAnchorPosition(rodTipPos);

    // Keep segments above water surface (manual correction)
    const waterY =
      this.scene.getMeshByName("waterPlane_water")?.position.y || 0;
    for (let i = 1; i < this.segments.length; i++) {
      const segment = this.segments[i];
      if (segment.position.y < waterY) {
        segment.position.y = waterY + 0.01; // Push slightly above water
        // Reset all velocity to zero to prevent jumping
        if (segment.physicsBody) {
          segment.physicsBody.setLinearVelocity(BABYLON.Vector3.Zero());
          segment.physicsBody.setAngularVelocity(BABYLON.Vector3.Zero());
        }
      }
    }

    // Dispose old line
    if (this.line) {
      this.line.dispose();
    }

    // Build path through all segments
    const path = [];
    for (const segment of this.segments) {
      path.push(segment.position.clone());
    }
    path.push(bobberPos.clone());

    if (path.length >= 2) {
      this.line = BABYLON.MeshBuilder.CreateTube(
        "fishingLine",
        {
          path: path,
          radius: 0.05,
          updatable: false,
        },
        this.scene
      );

      const mat = new BABYLON.StandardMaterial("lineMat", this.scene);
      mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
      mat.backFaceCulling = false;
      this.line.material = mat;
      this.line.isVisible = true;
      this.line.visibility = 1.0;
      this.line.renderingGroupId = 0;
    }
  }

  dispose() {
    if (this.line) {
      this.line.dispose();
      this.line = null;
    }

    this.constraints.forEach((c) => c.dispose());
    this.constraints = [];

    this.segments.forEach((segment) => {
      if (segment.physicsBody) {
        segment.physicsBody.dispose();
      }
      segment.dispose();
    });
    this.segments = [];
  }
}
