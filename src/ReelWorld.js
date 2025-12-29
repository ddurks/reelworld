import { HUD } from "./HUD.js";
import { Level } from "./Level.js";
import { Fish } from "./Fish.js";
import { ReelGuy } from "./ReelGuy.js";
import { Pond } from "./Pond.js";

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
    };

    try {
      this.engine = new BABYLON.Engine(this.canvas, true, engineOptions, false);
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

    const light = new BABYLON.HemisphericLight(
      "light",
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    light.intensity = 0.7;

    if (!this.isMobile) {
      try {
        const hdrTexture = new BABYLON.HDRCubeTexture(
          "./assets/clouds.hdr",
          this.scene,
          512,
          false,
          true,
          false,
          true
        );
        this.scene.environmentTexture = hdrTexture;
        this.scene.createDefaultSkybox(hdrTexture, true, 10000);
      } catch (err) {
        console.warn("HDR texture failed:", err);
      }
    } else {
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
      "./assets/",
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
    });

    if (waterMeshes.length > 0 && groundMesh) {
      for (const waterMesh of waterMeshes) {
        const pond = new Pond(waterMesh, groundMesh, this.scene);
        this.ponds.push(pond);
      }

      const numFishPerPond = 10;

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

        // Update water render list to include newly spawned fish
        pond.updateWaterRenderList();
      }
    }
  }

  async loadCharacter() {
    const spawnPosition = new BABYLON.Vector3(15, 5, 20);
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

    // Update water render lists to include player, bobber, and fishing rod meshes
    this.ponds.forEach((pond) => pond.updateWaterRenderList());

    this.camera.setTarget(this.reelGuy.getPosition());
    this.camera.setPosition(
      new BABYLON.Vector3(
        spawnPosition.x,
        spawnPosition.y - 2,
        spawnPosition.z + 10
      )
    );
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
