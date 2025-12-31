export class Waterfall {
  constructor(scene, startPos, endPos, diameterTop = 4, diameterBottom = 8) {
    this.scene = scene;
    this.startPos = startPos;
    this.endPos = endPos;
    this.diameterTop = diameterTop;
    this.diameterBottom = diameterBottom;
    this.waterStream = null;
    this.foamParticles = null;

    this.create();
  }

  create() {
    const height = this.startPos.y - this.endPos.y;
    const midPoint = BABYLON.Vector3.Lerp(this.startPos, this.endPos, 0.5);

    const waterStream = BABYLON.MeshBuilder.CreateCylinder(
      "waterfallStream",
      {
        height: height,
        diameterTop: this.diameterTop,
        diameterBottom: this.diameterBottom,
        tessellation: 8,
        arc: 0.5,
      },
      this.scene
    );

    waterStream.position = midPoint;
    waterStream.rotation.y = Math.PI;

    const waterMat = new BABYLON.WaterMaterial(
      "waterfallMat",
      this.scene,
      new BABYLON.Vector2(128, 128)
    );

    waterMat.backFaceCulling = false;
    waterMat.bumpTexture = new BABYLON.Texture(
      "./assets/waterfallbump.png",
      this.scene
    );
    waterMat.windForce = -100;
    waterMat.waveHeight = 0;
    waterMat.bumpHeight = 0.5;
    waterMat.windDirection = new BABYLON.Vector2(0, -1);
    waterMat.waterColor = new BABYLON.Color3(0.7, 0.85, 0.95);
    waterMat.colorBlendFactor = 0.3;
    waterMat.waveLength = 0.5;

    waterStream.material = waterMat;
    this.waterStream = waterStream;
    this.waterMaterial = waterMat;

    this.createFoamParticles();
  }

  createFoamParticles() {
    const particleSystem = new BABYLON.ParticleSystem(
      "waterfallFoam",
      200,
      this.scene
    );

    particleSystem.particleTexture = new BABYLON.Texture(
      "https://assets.babylonjs.com/textures/flare.png",
      this.scene
    );

    particleSystem.emitter = new BABYLON.Vector3(
      this.endPos.x,
      this.endPos.y,
      this.endPos.z + 2.4
    );
    particleSystem.minEmitBox = new BABYLON.Vector3(-2, 0, -0.2);
    particleSystem.maxEmitBox = new BABYLON.Vector3(2, 0, 0.2);

    particleSystem.color1 = new BABYLON.Color4(1.0, 1.0, 1.0, 0.8);
    particleSystem.color2 = new BABYLON.Color4(0.9, 0.95, 1.0, 0.4);
    particleSystem.colorDead = new BABYLON.Color4(0.8, 0.9, 1.0, 0.0);

    particleSystem.minSize = 3;
    particleSystem.maxSize = 6;

    particleSystem.minLifeTime = 0.5;
    particleSystem.maxLifeTime = 1.5;

    particleSystem.emitRate = 20;

    particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;

    particleSystem.gravity = new BABYLON.Vector3(0, -2, 0);

    particleSystem.direction1 = new BABYLON.Vector3(-1, 0.5, -1);
    particleSystem.direction2 = new BABYLON.Vector3(1, 1.5, 1);

    particleSystem.minAngularSpeed = 0;
    particleSystem.maxAngularSpeed = Math.PI;

    particleSystem.minEmitPower = 0.5;
    particleSystem.maxEmitPower = 1;
    particleSystem.updateSpeed = 0.01;

    particleSystem.start();

    this.foamParticles = particleSystem;
  }

  updateRenderList(meshes) {
    if (!this.waterMaterial) return;
    meshes.forEach((mesh) => {
      if (mesh !== this.waterStream && mesh.name !== "waterfallStream") {
        this.waterMaterial.addToRenderList(mesh);
      }
    });
  }

  dispose() {
    if (this.waterStream) {
      this.waterStream.dispose();
    }
    if (this.foamParticles) {
      this.foamParticles.dispose();
    }
  }
}
