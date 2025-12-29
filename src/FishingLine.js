export class FishingLine {
  constructor(scene) {
    this.scene = scene;
    this.line = null;
    this.lineMaterial = null;
    this.rodTipAnchor = null;
    this.rodTipAnchorPhysics = null;
    this.ropeSegments = null;
    this.ropeConstraints = null;
  }

  createAnchor() {
    if (this.rodTipAnchor) return;

    this.rodTipAnchor = BABYLON.MeshBuilder.CreateSphere(
      "rodTipAnchor",
      { diameter: 0.1 },
      this.scene
    );
    this.rodTipAnchor.isVisible = false;

    this.rodTipAnchorPhysics = new BABYLON.PhysicsBody(
      this.rodTipAnchor,
      BABYLON.PhysicsMotionType.ANIMATED,
      false,
      this.scene
    );

    const anchorShape = new BABYLON.PhysicsShapeBox(
      new BABYLON.Vector3(0, 0, 0),
      new BABYLON.Quaternion(0, 0, 0, 1),
      new BABYLON.Vector3(0.1, 0.1, 0.1),
      this.scene
    );
    this.rodTipAnchorPhysics.shape = anchorShape;
    this.rodTipAnchorPhysics.setMassProperties({ mass: 0 });
  }

  setAnchorPosition(position) {
    if (!this.rodTipAnchor) return;
    this.rodTipAnchor.position = position;
  }

  createPhysicsRope(rodTipPos, bobberPos, bobberPhysics) {
    if (!this.rodTipAnchor || !this.rodTipAnchorPhysics || !bobberPhysics)
      return;

    const distance = BABYLON.Vector3.Distance(rodTipPos, bobberPos);
    const numSegments = 10;
    const segmentLength = distance / numSegments;

    this.ropeSegments = [];
    this.ropeConstraints = [];

    for (let i = 0; i < numSegments; i++) {
      const t = (i + 1) / (numSegments + 1);
      const pos = BABYLON.Vector3.Lerp(rodTipPos, bobberPos, t);

      const segment = BABYLON.MeshBuilder.CreateSphere(
        `ropeSegment${i}`,
        { diameter: 0.03 },
        this.scene
      );
      segment.position = pos;
      segment.isVisible = true;

      const segmentPhysics = new BABYLON.PhysicsAggregate(
        segment,
        BABYLON.PhysicsShapeType.SPHERE,
        { mass: 0.05, restitution: 0, friction: 0.5 },
        this.scene
      );

      segmentPhysics.body.setLinearDamping(0.9);
      segment.physicsBody = segmentPhysics.body;
      segmentPhysics.body.disablePreStep = false;

      this.ropeSegments.push({ mesh: segment, physics: segmentPhysics });
    }

    this._connectSegments(segmentLength, bobberPhysics);
  }

  _createDistanceConstraint(segmentLength) {
    return new BABYLON.Physics6DoFConstraint(
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
  }

  _connectSegments(segmentLength, bobberPhysics) {
    if (this.ropeSegments.length === 0) return;

    const constraint = this._createDistanceConstraint(segmentLength);
    this.rodTipAnchorPhysics.addConstraint(
      this.ropeSegments[0].physics.body,
      constraint
    );
    this.ropeConstraints.push(constraint);

    for (let i = 0; i < this.ropeSegments.length - 1; i++) {
      const constraint = this._createDistanceConstraint(segmentLength);
      this.ropeSegments[i].physics.body.addConstraint(
        this.ropeSegments[i + 1].physics.body,
        constraint
      );
      this.ropeConstraints.push(constraint);
    }

    const lastConstraint = this._createDistanceConstraint(segmentLength);
    const lastSegment = this.ropeSegments[this.ropeSegments.length - 1];
    lastSegment.physics.body.addConstraint(bobberPhysics.body, lastConstraint);
    this.ropeConstraints.push(lastConstraint);
  }

  update(rodTipPos, bobberPos) {
    if (!rodTipPos || !bobberPos) return;

    this.setAnchorPosition(rodTipPos);

    if (this.rodTipAnchorPhysics) {
      this.rodTipAnchorPhysics.disablePreStep = false;
    }

    if (this.line) {
      this.line.dispose();
    }

    const path = [rodTipPos];
    if (this.ropeSegments) {
      for (const segment of this.ropeSegments) {
        path.push(segment.mesh.position.clone());
      }
    }
    path.push(bobberPos.clone());

    this.line = BABYLON.MeshBuilder.CreateTube(
      "fishingLine",
      {
        path: path,
        radius: 0.05,
        tessellation: 8,
        cap: BABYLON.Mesh.CAP_ALL,
        updatable: false,
      },
      this.scene
    );

    if (!this.lineMaterial) {
      this.lineMaterial = new BABYLON.StandardMaterial("lineMat", this.scene);
      this.lineMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
      this.lineMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
      this.lineMaterial.backFaceCulling = false;
    }

    this.line.material = this.lineMaterial;
    this.line.isVisible = true;
  }

  dispose() {
    if (this.line) {
      this.line.dispose();
      this.line = null;
    }
    if (this.ropeSegments) {
      this.ropeSegments.forEach((segment) => {
        segment.mesh.dispose();
        segment.physics.dispose();
      });
      this.ropeSegments = null;
    }
    if (this.ropeConstraints) {
      this.ropeConstraints.forEach((c) => c.dispose());
      this.ropeConstraints = null;
    }
    if (this.rodTipAnchor) {
      this.rodTipAnchor.dispose();
      this.rodTipAnchor = null;
    }
    if (this.rodTipAnchorPhysics) {
      this.rodTipAnchorPhysics.dispose();
      this.rodTipAnchorPhysics = null;
    }
    if (this.lineMaterial) {
      this.lineMaterial.dispose();
      this.lineMaterial = null;
    }
  }
}
