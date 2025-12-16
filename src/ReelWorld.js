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
    console.log("Starting ReelWorld initialization...");

    // Create engine
    const engineOptions = {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: !this.isMobile,
      powerPreference: this.isMobile ? "low-power" : "high-performance",
    };

    try {
      this.engine = new BABYLON.Engine(this.canvas, true, engineOptions, false);
      console.log("Engine created successfully");
      console.log("WebGL version:", this.engine.webGLVersion);
    } catch (err) {
      console.error("Failed to create engine:", err);
      throw err;
    }

    // Handle WebGL context loss
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
      () => {
        console.log("WebGL context restored. Reloading page...");
        window.location.reload();
      },
      false
    );

    // Create scene
    console.log("Creating scene...");
    this.scene = new BABYLON.Scene(this.engine);
    console.log("Scene created");

    // Simple light for testing
    const light = new BABYLON.HemisphericLight(
      "light",
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    light.intensity = 0.7;

    // Environment texture (HDRI)
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
      console.log("Using simple background for mobile");
    }

    // Camera - positioned to look at character from the front
    this.camera = new BABYLON.ArcRotateCamera(
      "camera",
      Math.PI, // Alpha: 180 degrees (looking from the front)
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

    // Initialize physics
    console.log("Initializing physics...");
    await this.initPhysics();
    console.log("Physics initialized");

    // Setup level
    console.log("Setting up level...");
    await this.setupLevel();
    console.log("Level loaded");

    // Load character
    console.log("Loading character...");
    await this.loadCharacter();
    console.log("Character loaded");

    console.log("ReelWorld initialization complete!");
  }

  async initPhysics() {
    const havokInstance = await HavokPhysics();
    const havokPlugin = new BABYLON.HavokPlugin(true, havokInstance);
    this.scene.enablePhysics(new BABYLON.Vector3(0, -100, 0), havokPlugin);
    this.physicsEngine = this.scene.getPhysicsEngine();

    if (!this.isMobile) {
      const physicsViewer = new BABYLON.PhysicsViewer(this.scene);
      window.physicsViewer = physicsViewer;
      console.log("Physics viewer ready (desktop only)");
    } else {
      console.log("Physics initialized (debug viewer disabled on mobile)");
    }
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
        console.log(
          "Found water mesh:",
          mesh.name,
          "at position:",
          mesh.position
        );
        waterMeshes.push(mesh);

        // Add physics to water but with special collision filters
        const waterPhysics = new BABYLON.PhysicsAggregate(
          mesh,
          BABYLON.PhysicsShapeType.MESH,
          { mass: 0, restitution: 0.2, friction: 0.5 },
          this.scene
        );

        if (waterPhysics.body.shape) {
          // Water collides with fish (mask 8) but NOT character (mask 1)
          waterPhysics.body.shape.filterMembershipMask = 4;
          waterPhysics.body.shape.filterCollideMask = 8;
        }

        if (mesh.material) {
          mesh.receiveShadows = true;
        }
        return;
      }

      if (mesh.name.toLowerCase().includes("ground") || mesh.name === "Plane") {
        console.log(
          "Found ground mesh:",
          mesh.name,
          "at position:",
          mesh.position
        );
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
        physicsAggregate.body.shape.filterCollideMask = 1 | 8 | 16; // Collide with character (1), fish (8), and bobber (16)
      }

      if (mesh.material) {
        mesh.receiveShadows = true;
      }
    });

    // Create ponds from water meshes and spawn fish in each pond
    console.log("Water meshes found:", waterMeshes.length);
    console.log("Ground mesh:", groundMesh ? groundMesh.name : "NOT FOUND");

    if (waterMeshes.length > 0 && groundMesh) {
      // Don't filter by Y position - all water meshes are potential ponds
      // The Pond class will handle calculating the intersection with ground
      console.log(
        "Creating ponds for all water meshes:",
        waterMeshes.map((w) => w.name)
      );

      // Create a pond for each water mesh (regardless of Y position)
      for (const waterMesh of waterMeshes) {
        console.log(`Creating pond for ${waterMesh.name}...`);
        const pond = new Pond(waterMesh, groundMesh, this.scene);
        this.ponds.push(pond);
      }

      // Spawn fish in all ponds after ponds are created
      const numFishPerPond = 10; // Increased for better flocking behavior

      for (const pond of this.ponds) {
        console.log(`Spawning ${numFishPerPond} fish in pond...`);

        // Get center position for spawning
        const centerPos = pond.getCenterPosition();

        for (let i = 0; i < numFishPerPond; i++) {
          // Scatter fish around center position
          const offset = new BABYLON.Vector3(
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 1,
            (Math.random() - 0.5) * 3
          );
          const spawnPos = centerPos.add(offset);

          console.log(`  Fish ${i + 1} spawn position:`, spawnPos);
          const newFish = await Fish.create(
            this.scene,
            spawnPos,
            pond,
            this.fish
          );
          this.fish.push(newFish);
        }
      }

      console.log(
        `Created ${this.ponds.length} ponds with ${this.fish.length} total fish`
      );
    } else {
      console.log("Missing water meshes or ground mesh - cannot create ponds");
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

    // Create HUD
    this.hud = new HUD(this.isMobile, this.reelGuy);

    // Update camera target and position to face character from front
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

    // Log fish count once
    if (this.frameCount === 60) {
      console.log(`Fish in scene: ${this.fish.length}`);
      this.fish.forEach((fish, i) => {
        if (fish.mesh) {
          console.log(
            `  Fish ${i}: pos=${fish.mesh.position}, visible=${fish.mesh.isVisible}`
          );
        }
      });
    }

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
    console.log("Starting render loop...");
    this.engine.runRenderLoop(this.animate);
    console.log("Render loop started");
  }

  handleResize = () => {
    this.engine.resize();
  };
}
