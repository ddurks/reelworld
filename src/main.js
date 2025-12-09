import { HUD } from "./HUD.js";
import { Level } from "./Level.js";
import { Fish } from "./Fish.js";

const IS_MOBILE =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
document.body.classList.add(IS_MOBILE ? "mobile" : "desktop");

// Key mappings
export const W = "w";
export const A = "a";
export const S = "s";
export const D = "d";
export const SHIFT = "shift";
export const SPACE = " ";
export const DIRECTIONS = [W, A, S, D];

const keysPressed = {};
document.addEventListener(
  "keydown",
  (event) => {
    keysPressed[event.key.toLowerCase()] = true;
  },
  false
);
document.addEventListener(
  "keyup",
  (event) => {
    keysPressed[event.key.toLowerCase()] = false;
  },
  false
);

// Initialize Babylon.js
const canvasContainer = document.getElementById("canvas-container");
const canvas = document.getElementById("renderCanvas");

console.log("Canvas element:", canvas);
console.log("Canvas dimensions:", canvas.width, "x", canvas.height);
console.log("Is mobile:", IS_MOBILE);

// Simplified engine options for iOS compatibility
const engineOptions = {
  preserveDrawingBuffer: false,
  stencil: true,
  antialias: !IS_MOBILE, // Disable on mobile to reduce WebGL memory
  powerPreference: IS_MOBILE ? "low-power" : "high-performance"
};

let engine;
try {
  engine = new BABYLON.Engine(canvas, true, engineOptions, false);
  console.log("Engine created successfully");
  console.log("WebGL version:", engine.webGLVersion);
} catch (err) {
  console.error("Failed to create engine:", err);
  throw err;
}

// Handle WebGL context loss (common on iOS when backgrounding)
let contextLost = false;
canvas.addEventListener(
  "webglcontextlost",
  (event) => {
    console.error("WebGL context lost!");
    contextLost = true;
    event.preventDefault();
  },
  false
);

canvas.addEventListener(
  "webglcontextrestored",
  () => {
    console.log("WebGL context restored. Reloading page...");
    contextLost = false;
    window.location.reload();
  },
  false
);

const stats = new Stats();
stats.showPanel(0);
stats.dom.style.pointerEvents = "none"; // Don't block touch events on mobile
document.body.appendChild(stats.dom);

// Create scene
console.log("Creating scene...");
const scene = new BABYLON.Scene(engine);
console.log("Scene created");

// Simple light for testing
const light = new BABYLON.HemisphericLight(
  "light",
  new BABYLON.Vector3(0, 1, 0),
  scene
);
light.intensity = 0.7;
console.log("Light created");

// Environment texture (HDRI) - load asynchronously, don't block
if (!IS_MOBILE) {
  try {
    const hdrTexture = new BABYLON.HDRCubeTexture(
      "./assets/clouds.hdr",
      scene,
      512,
      false,
      true,
      false,
      true
    );
    scene.environmentTexture = hdrTexture;
    scene.createDefaultSkybox(hdrTexture, true, 10000);
  } catch (err) {
    console.warn("HDR texture failed:", err);
  }
} else {
  // Mobile: skip HDR, use simple background
  scene.clearColor = new BABYLON.Color4(0.53, 0.81, 0.92, 1.0);
  console.log("Using simple background for mobile");
}

// Camera
const camera = new BABYLON.ArcRotateCamera(
  "camera",
  Math.PI / 2,
  Math.PI / 3,
  10,
  BABYLON.Vector3.Zero(),
  scene
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 3;
camera.upperRadiusLimit = 15;
camera.lowerBetaLimit = 0.1;
camera.upperBetaLimit = Math.PI / 2 - 0.05;
camera.inertia = 0.9;
camera.angularSensibilityX = 1000;
camera.angularSensibilityY = 1000;

// Initialize physics with Havok
let physicsEngine;
let hud;
let guy;
let level;
let fish = [];

async function initPhysics() {
  const havokInstance = await HavokPhysics();
  const havokPlugin = new BABYLON.HavokPlugin(true, havokInstance);
  scene.enablePhysics(new BABYLON.Vector3(0, -100, 0), havokPlugin);
  physicsEngine = scene.getPhysicsEngine();

  // Physics debug viewer causes uniform buffer issues on iOS - disabled
  if (!IS_MOBILE) {
    const physicsViewer = new BABYLON.PhysicsViewer(scene);
    window.physicsViewer = physicsViewer;
    console.log("Physics viewer ready (desktop only)");
  } else {
    console.log("Physics initialized (debug viewer disabled on mobile)");
  }
}

// Level and lighting setup
async function setupLevel() {
  level = new Level(scene, IS_MOBILE);
  await loadScene();
}

// Load scene GLB
async function loadScene() {
  const result = await BABYLON.SceneLoader.ImportMeshAsync(
    "",
    "./assets/",
    "reelworld.glb",
    scene
  );

  // Find water and ground meshes for fish
  const waterMeshes = [];
  let groundMesh = null;

  // Add physics collision bodies to each mesh
  result.meshes.forEach((mesh, index) => {
    // Skip root/parent meshes with no geometry
    if (!mesh.getTotalVertices || mesh.getTotalVertices() === 0) {
      return;
    }

    // Check if this is a water mesh
    if (mesh.name === "water" || mesh.name === "water.001") {
      waterMeshes.push(mesh);
    }

    // Check if this is the ground mesh
    if (mesh.name.toLowerCase().includes("ground") || mesh.name === "Plane") {
      groundMesh = mesh;
    } // Create physics body based on mesh type
    const physicsAggregate = new BABYLON.PhysicsAggregate(
      mesh,
      BABYLON.PhysicsShapeType.MESH,
      {
        mass: 0,
        restitution: 0.2,
        friction: 0.5,
      },
      scene
    );

    // Adjust collision margin to reduce floating
    if (physicsAggregate.body.shape) {
      physicsAggregate.body.shape.filterMembershipMask = 2;
      physicsAggregate.body.shape.filterCollideMask = 1;
    }

    // Enable shadows
    if (mesh.material) {
      mesh.receiveShadows = true;
    }
  });

  // Spawn fish just below water surfaces within ground mesh bounds
  if (waterMeshes.length > 0 && groundMesh) {
    const numFish = 5; // Spawn 5 fish

    const groundY = groundMesh.position.y;

    // Find water planes that are BELOW ground (underwater)
    const underwaterPlanes = waterMeshes.filter((w) => w.position.y < groundY);

    if (underwaterPlanes.length === 0) {
      console.log("No underwater water planes found!");
      return;
    }

    // Get the highest underwater plane (closest to ground surface from below)
    let underwaterSurfaceY = -Infinity;
    underwaterPlanes.forEach((waterMesh) => {
      underwaterSurfaceY = Math.max(underwaterSurfaceY, waterMesh.position.y);
    });

    // Get bounding box of water meshes for XZ constraints
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    waterMeshes.forEach((waterMesh) => {
      const bounds = waterMesh.getBoundingInfo().boundingBox;
      minX = Math.min(minX, bounds.minimumWorld.x);
      maxX = Math.max(maxX, bounds.maximumWorld.x);
      minZ = Math.min(minZ, bounds.minimumWorld.z);
      maxZ = Math.max(maxZ, bounds.maximumWorld.z);
    });

    console.log("Water bounds X:", minX, "to", maxX);
    console.log("Water bounds Z:", minZ, "to", maxZ);
    console.log("Underwater surface Y:", underwaterSurfaceY);
    console.log("Fish will spawn BELOW:", underwaterSurfaceY);

    for (let i = 0; i < numFish; i++) {
      // Spawn fish randomly within water mesh XZ bounds
      const x = minX + Math.random() * (maxX - minX);
      const z = minZ + Math.random() * (maxZ - minZ);

      // Spawn BELOW the underwater surface (negative Y, going down from -1.57)
      const depth = 1 + Math.random() * 3; // 1-4 units below water surface
      const y = underwaterSurfaceY - depth;

      const position = new BABYLON.Vector3(x, y, z);
      console.log(
        `Spawning fish ${i} at: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`
      );
      const newFish = new Fish(scene, position, waterMeshes, groundMesh);
      fish.push(newFish);
    }
  }
}

// Load character
async function loadCharacter() {
  const result = await BABYLON.SceneLoader.ImportMeshAsync(
    "",
    "./assets/",
    "reelguy.glb",
    scene
  );

  guy = result.meshes[0];

  // Enable shadows
  result.meshes.forEach((mesh) => {
    if (mesh.material) {
      mesh.receiveShadows = true;
    }
  });

  // Create a simple cylinder physics body for the character
  const bodyMesh = BABYLON.MeshBuilder.CreateCylinder(
    "characterBody",
    { height: 4, diameter: 1.5 },
    scene
  );
  // Spawn character forward and to the right, away from camera
  bodyMesh.position = new BABYLON.Vector3(15, 5, 20); // 15 units right, 20 units forward
  bodyMesh.isVisible = false; // Hide the collision shape

  // Parent character to physics body and offset so feet are at bottom
  guy.parent = bodyMesh;
  guy.position = new BABYLON.Vector3(0, -2, 0); // Offset down so feet align with bottom of cylinder

  const physicsShape = new BABYLON.PhysicsShapeCapsule(
    new BABYLON.Vector3(0, -1.5, 0), // bottom point
    new BABYLON.Vector3(0, -0.5, 0), // top point
    0.5, // radius
    scene
  );

  const physicsBody = new BABYLON.PhysicsBody(
    bodyMesh,
    BABYLON.PhysicsMotionType.DYNAMIC,
    false,
    scene
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

  bodyMesh.physicsBody = physicsBody;

  // Set up animations
  const animationsMap = new Map();
  result.animationGroups.forEach((ag) => {
    animationsMap.set(ag.name, ag);
    ag.stop();
  });

  // Configure jump animation
  if (animationsMap.has("jump")) {
    animationsMap.get("jump").loopAnimation = false;
  }

  // Start idle animation
  if (animationsMap.has("idle")) {
    animationsMap.get("idle").start(true);
  }

  // Create HUD (character controls + reelspinna)
  hud = new HUD(guy, bodyMesh, animationsMap, camera, "idle", level, IS_MOBILE);

  // Update camera target
  camera.setTarget(guy.position);
}

// Main animation loop
let frameCount = 0;
let lastTime = performance.now();

function animate() {
  stats.begin();

  const currentTime = performance.now();
  const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
  lastTime = currentTime;

  if (hud && guy) {
    hud.update(deltaTime, keysPressed);
    updateShadowPosition();

    // Update camera to follow the physics body (parent of character)
    camera.setTarget(guy.parent.position);
  }

  // Update all fish
  fish.forEach((f) => f.update(deltaTime));

  scene.render();
  frameCount++;
  stats.end();
}

function updateShadowPosition() {
  if (!guy || !level.sunLight) return;

  const playerPos = guy.position;
  level.sunLight.position = new BABYLON.Vector3(
    playerPos.x - 60,
    playerPos.y + 100,
    playerPos.z - 10
  );
  level.sunLight.setDirectionToTarget(playerPos);
}

// Window resize handler
window.addEventListener("resize", () => {
  engine.resize();
});

// Initialize everything
async function init() {
  console.log("Starting initialization...");
  try {
    console.log("Initializing physics...");
    await initPhysics();
    console.log("Physics initialized");

    console.log("Setting up level...");
    await setupLevel();
    console.log("Level loaded");

    console.log("Loading character...");
    await loadCharacter();
    console.log("Character loaded");

    console.log("Starting render loop...");
    engine.runRenderLoop(animate);
    console.log("Render loop started");
  } catch (err) {
    console.error("Initialization error:", err);
    console.error("Error stack:", err.stack);
    // Try to start render loop anyway
    console.log("Attempting to start render loop despite error...");
    engine.runRenderLoop(animate);
  }
}

console.log("Calling init()...");
init();
