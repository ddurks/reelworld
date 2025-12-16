import { ReelWorld } from "./ReelWorld.js";

const IS_MOBILE =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
document.body.classList.add(IS_MOBILE ? "mobile" : "desktop");

// Key mappings (exported for use in other modules)
export const W = "w";
export const A = "a";
export const S = "s";
export const D = "d";
export const SHIFT = "shift";
export const SPACE = " ";
export const DIRECTIONS = [W, A, S, D];

// Get canvas
const canvas = document.getElementById("renderCanvas");

console.log("Canvas element:", canvas);
console.log("Canvas dimensions:", canvas.width, "x", canvas.height);
console.log("Is mobile:", IS_MOBILE);

// Stats
const stats = new Stats();
stats.showPanel(0);
stats.dom.style.pointerEvents = "none";
document.body.appendChild(stats.dom);

// Create and initialize game
const reelWorld = new ReelWorld(canvas, IS_MOBILE);

// Window resize handler
window.addEventListener("resize", reelWorld.handleResize);

// Initialize and start the game
async function init() {
  try {
    await reelWorld.init();

    // Wrap the animate function with stats
    const originalAnimate = reelWorld.animate;
    reelWorld.animate = () => {
      stats.begin();
      originalAnimate();
      stats.end();
    };

    reelWorld.start();
    
    // Make debug functions globally available
    window.showPhysicsDebug = () => reelWorld.showPhysicsDebug();
    window.hidePhysicsDebug = () => reelWorld.hidePhysicsDebug();
    window.debugLine = () => {
      if (window.fishingLines && window.fishingLines.length > 0) {
        const line = window.fishingLines[window.fishingLines.length - 1];
        console.log("Latest fishing line:", line);
        console.log("Is disposed:", line.isDisposed());
        console.log("Is enabled:", line.isEnabled());
        console.log("Position:", line.position);
        console.log("Material:", line.material);
        console.log("Visibility:", line.visibility);
        console.log("In scene:", reelWorld.scene.meshes.includes(line));
        
        // Try to make it super visible
        line.visibility = 1.0;
        line.setEnabled(true);
        line.isVisible = true;
        line.renderingGroupId = 3; // Render on top
        
        if (!line.material) {
          const mat = new BABYLON.StandardMaterial("debugLineMat", reelWorld.scene);
          mat.diffuseColor = new BABYLON.Color3(1, 0, 1); // Magenta
          mat.emissiveColor = new BABYLON.Color3(1, 0, 1);
          line.material = mat;
        }
        
        console.log("Line visibility forced. Check again!");
      } else {
        console.log("No fishing lines created yet");
      }
    };
    console.log("Debug commands available: showPhysicsDebug(), hidePhysicsDebug(), debugLine()");
  } catch (err) {
    console.error("Initialization error:", err);
    console.error("Error stack:", err.stack);
  }
}

console.log("Starting ReelWorld...");
init();
