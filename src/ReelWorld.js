import { HUD } from "./HUD.js";
import { Level } from "./environment/Level.js";
import { Fish } from "./entities/Fish.js";
import { ReelGuy } from "./player/ReelGuy.js";
import { Pond } from "./environment/Pond.js";
import { Waterfall } from "./environment/Waterfall.js";

export class ReelWorld {
  constructor(canvas, isMobile) {
    this.canvas = canvas;
    this.isMobile = isMobile;
    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.level = null;
    this.reelGuy = null;
    this.hud = null;
    this.fish = [];
    this.ponds = []; // Array of Pond objects
    this.physicsEngine = null;
    this.frameCount = 0;
    this.lastTime = performance.now();
  }

  async init() {
    const engineOptions = {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: !this.isMobile,
      powerPreference: this.isMobile ? "low-power" : "high-performance",
      adaptToDeviceRatio: true,
      disableWebGL2Support: false,
    };

    try {
      this.engine = new BABYLON.Engine(this.canvas, true, engineOptions, true);
      this.engine.enableOfflineSupport = false;
      this.engine.doNotHandleContextLost = true;
    } catch (err) {
      console.error("Failed to create engine:", err);
      throw err;
    }

    this.canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        console.error("WebGL context lost!");
        event.preventDefault();
      },
      false
    );

    this.canvas.addEventListener(
      "webglcontextrestored",
      () => window.location.reload(),
      false
    );

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.autoClear = false;
    this.scene.autoClearDepthAndStencil = false;
    this.scene.blockMaterialDirtyMechanism = true;

    // Use adaptive scaling based on device
    const scalingLevel = this.isMobile
      ? 1 / window.devicePixelRatio
      : Math.min(1 / window.devicePixelRatio, 1);
    this.engine.setHardwareScalingLevel(scalingLevel);

    if (this.isMobile) {
      this.scene.skipPointerMovePicking = true;
      this.scene.constantlyUpdateMeshUnderPointer = false;
    }

    const light = new BABYLON.HemisphericLight(
      "light",
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    light.intensity = 0.7;

    try {
      const hdrTexture = new BABYLON.HDRCubeTexture(
        "./assets/3d/clouds.hdr",
        this.scene,
        this.isMobile ? 256 : 512,
        false,
        true,
        false,
        true
      );
      this.scene.environmentTexture = hdrTexture;
      this.scene.createDefaultSkybox(hdrTexture, true, 10000);
    } catch (err) {
      console.warn("HDR texture failed:", err);
      this.scene.clearColor = new BABYLON.Color4(0.53, 0.81, 0.92, 1.0);
    }

    this.camera = new BABYLON.ArcRotateCamera(
      "camera",
      Math.PI,
      Math.PI / 3,
      10,
      BABYLON.Vector3.Zero(),
      this.scene
    );
    this.camera.attachControl(this.canvas, true);
    this.camera.lowerRadiusLimit = 3;
    this.camera.upperRadiusLimit = 15;
    this.camera.lowerBetaLimit = 0.1;
    this.camera.upperBetaLimit = Math.PI / 2 - 0.05;
    this.camera.inertia = 0.9;
    this.camera.angularSensibilityX = 1000;
    this.camera.angularSensibilityY = 1000;

    await this.initPhysics();
    await this.setupLevel();
    await this.loadCharacter();
  }

  async initPhysics() {
    const havokInstance = await HavokPhysics();
    const havokPlugin = new BABYLON.HavokPlugin(true, havokInstance);
    this.scene.enablePhysics(new BABYLON.Vector3(0, -100, 0), havokPlugin);
    this.physicsEngine = this.scene.getPhysicsEngine();

    this.physicsViewer = new BABYLON.PhysicsViewer(this.scene);
    window.physicsViewer = this.physicsViewer;
  }

  showPhysicsDebug() {
    if (!this.physicsViewer) return;

    if (this.reelGuy?.physicsBody) {
      this.physicsViewer.showBody(this.reelGuy.physicsBody);
    }

    if (this.reelGuy?.fishingRod?.bobberPhysics) {
      this.physicsViewer.showBody(this.reelGuy.fishingRod.bobberPhysics.body);
    }

    this.fish.forEach((fish) => {
      if (fish.physicsAggregate) {
        this.physicsViewer.showBody(fish.physicsAggregate.body);
      }
    });

    if (this.level?.planeMeshes) {
      this.level.planeMeshes.forEach((mesh) => {
        if (mesh.physicsBody) {
          this.physicsViewer.showBody(mesh.physicsBody);
        }
      });
    }

    if (this.level?.waterMeshes) {
      this.level.waterMeshes.forEach((mesh) => {
        if (mesh.physicsBody) {
          this.physicsViewer.showBody(mesh.physicsBody);
        }
      });
    }

    if (this.reelGuy?.fishingRod?.handAnchorPhysics) {
      this.physicsViewer.showBody(this.reelGuy.fishingRod.handAnchorPhysics);
    }
  }

  hidePhysicsDebug() {
    if (!this.physicsViewer) return;

    this.physicsViewer.dispose();
    this.physicsViewer = new BABYLON.PhysicsViewer(this.scene);
    window.physicsViewer = this.physicsViewer;
  }

  async setupLevel() {
    this.level = new Level(this.scene, this.isMobile);
    await this.loadScene();
  }

  async loadScene() {
    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      "",
      "./assets/3d/",
      "reelworld.glb",
      this.scene
    );

    const waterMeshes = [];
    let groundMesh = null;

    result.meshes.forEach((mesh) => {
      if (!mesh.getTotalVertices || mesh.getTotalVertices() === 0) {
        return;
      }

      if (mesh.name === "water" || mesh.name === "water.001") {
        waterMeshes.push(mesh);

        const waterPhysics = new BABYLON.PhysicsAggregate(
          mesh,
          BABYLON.PhysicsShapeType.MESH,
          { mass: 0, restitution: 0.2, friction: 0.5 },
          this.scene
        );

        mesh.physicsBody = waterPhysics.body;

        if (waterPhysics.body.shape) {
          waterPhysics.body.shape.filterMembershipMask = 4;
          waterPhysics.body.shape.filterCollideMask = 8 | 16;
        }

        if (mesh.material) {
          mesh.receiveShadows = true;
        }
        return;
      }

      if (mesh.name.toLowerCase().includes("ground") || mesh.name === "Plane") {
        groundMesh = mesh;

        if (mesh.material) {
          const bumpTexture = new BABYLON.Texture(
            "./assets/3d/texture/grassbump.png",
            this.scene
          );
          bumpTexture.level = 10.0;
          bumpTexture.uScale = 50;
          bumpTexture.vScale = 50;
          mesh.material.bumpTexture = bumpTexture;
        }
      }

      const physicsAggregate = new BABYLON.PhysicsAggregate(
        mesh,
        BABYLON.PhysicsShapeType.MESH,
        { mass: 0, restitution: 0.2, friction: 0.5 },
        this.scene
      );

      if (physicsAggregate.body.shape) {
        physicsAggregate.body.shape.filterMembershipMask = 2;
        physicsAggregate.body.shape.filterCollideMask = 1 | 8 | 16;
      }

      if (mesh.material) {
        mesh.receiveShadows = true;
      }

      if (
        mesh.name !== "ground" &&
        !mesh.name.toLowerCase().includes("water")
      ) {
        mesh.freezeWorldMatrix();
      }
    });

    if (waterMeshes.length > 0 && groundMesh) {
      for (const waterMesh of waterMeshes) {
        const pond = new Pond(waterMesh, groundMesh, this.scene);
        this.ponds.push(pond);
      }

      const numFishPerPond = 7;

      for (const pond of this.ponds) {
        const centerPos = pond.getCenterPosition();

        for (let i = 0; i < numFishPerPond; i++) {
          const offset = new BABYLON.Vector3(
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 1,
            (Math.random() - 0.5) * 3
          );
          const spawnPos = centerPos.add(offset);

          const newFish = await Fish.create(
            this.scene,
            spawnPos,
            pond,
            this.fish
          );
          this.fish.push(newFish);
        }
      }

      this.createWaterfall();
      this.createMountainWaterfall();
    }
  }

  createWaterfall() {
    if (this.ponds.length < 2) return;

    if (this.waterfall) {
      this.waterfall.dispose();
    }

    const sortedPonds = this.ponds.sort(
      (a, b) => b.waterSurfaceY - a.waterSurfaceY
    );
    const upperPond = sortedPonds[0];
    const lowerPond = sortedPonds[1];

    const startPos = new BABYLON.Vector3(0, upperPond.waterSurfaceY, -5);
    const endPos = new BABYLON.Vector3(0, lowerPond.waterSurfaceY, -1);

    this.waterfall = new Waterfall(this.scene, startPos, endPos);

    const groundMesh = this.scene.getMeshByName("ground");
    const skybox = this.scene.getMeshByName("hdrSkyBox");

    if (groundMesh) this.waterfall.waterMaterial.addToRenderList(groundMesh);
    if (skybox) this.waterfall.waterMaterial.addToRenderList(skybox);
  }

  createMountainWaterfall() {
    if (this.ponds.length < 2) return;

    if (this.mountainWaterfall) {
      this.mountainWaterfall.dispose();
    }

    const sortedPonds = this.ponds.sort(
      (a, b) => b.waterSurfaceY - a.waterSurfaceY
    );
    const upperPond = sortedPonds[0];
    const lowerPond = sortedPonds[1];

    const mainWaterfallHeight =
      upperPond.waterSurfaceY - lowerPond.waterSurfaceY;
    const mountainHeight = mainWaterfallHeight;

    const startHeight = upperPond.waterSurfaceY + mountainHeight;
    const startPos = new BABYLON.Vector3(0, startHeight, -30);
    const endPos = new BABYLON.Vector3(0, upperPond.waterSurfaceY, -28);

    this.mountainWaterfall = new Waterfall(this.scene, startPos, endPos, 3, 5);

    const groundMesh = this.scene.getMeshByName("ground");
    const skybox = this.scene.getMeshByName("hdrSkyBox");

    if (groundMesh) {
      this.mountainWaterfall.waterMaterial.addToRenderList(groundMesh);
    }
    if (skybox) {
      this.mountainWaterfall.waterMaterial.addToRenderList(skybox);
    }
  }

  async loadCharacter() {
    const spawnPosition = new BABYLON.Vector3(15, 7, 20); // Increased spawn height from 5 to 10
    this.reelGuy = new ReelGuy(
      this.scene,
      spawnPosition,
      this.isMobile,
      this.camera,
      this.level,
      this.ponds
    );
    await this.reelGuy.load();

    this.hud = new HUD(this.isMobile, this.reelGuy);

    this.ponds.forEach((pond) => pond.updateWaterRenderList());

    this.camera.setTarget(this.reelGuy.getPosition());
    this.camera.setPosition(
      new BABYLON.Vector3(
        spawnPosition.x,
        spawnPosition.y - 2,
        spawnPosition.z + 10
      )
    );

    this.setupFishingControls();
  }

  setupFishingControls() {
    if (!this.reelGuy) return;

    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
        if (!this.reelGuy?.isFishing) return;

        const pickResult = pointerInfo.pickInfo;
        if (pickResult.hit && pickResult.pickedMesh) {
          const meshName = pickResult.pickedMesh.name.toLowerCase();

          const isFishingRodMesh =
            meshName.includes("rod") || meshName.includes("fishing");
          const isBobberMesh = meshName.includes("bobber");

          if (isFishingRodMesh || isBobberMesh) {
            // Reset bobber and cast again with animation
            this.reelGuy.fishingRod.reelIn();
            this.reelGuy.playCastAnimation(() => {
              if (this.reelGuy?.fishingRod) {
                this.reelGuy.fishingRod.castLine(this.reelGuy.ponds);
              }
            });
            return;
          }

          const isPlayerMesh =
            meshName.includes("reelguy") ||
            meshName.includes("body") ||
            meshName.includes("character") ||
            meshName.includes("guy") ||
            meshName.includes("face") ||
            meshName.includes("hat");

          if (isPlayerMesh) {
            this.reelGuy.toggleFishingMode();
          }
        }
      }
    });
  }

  animate = () => {
    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    if (this.hud && this.reelGuy) {
      const input = this.hud.getInput();
      this.reelGuy.update(deltaTime, input);
      this.updateShadowPosition();
      this.camera.setTarget(this.reelGuy.getPosition());
    }

    this.fish.forEach((f) => f.update(deltaTime));

    if (this.frameCount % 2 === 0) {
      this.ponds.forEach((pond) => pond.updateRipples());
    }

    this.scene.render();
    this.frameCount++;
  };

  updateShadowPosition() {
    if (!this.reelGuy || !this.level.sunLight) return;

    const playerPos = this.reelGuy.getModelPosition();
    this.level.sunLight.position = new BABYLON.Vector3(
      playerPos.x - 60,
      playerPos.y + 100,
      playerPos.z - 10
    );
    this.level.sunLight.setDirectionToTarget(playerPos);
  }

  start() {
    this.engine.runRenderLoop(this.animate);
  }

  handleResize = () => {
    this.engine.resize();
  };
}
