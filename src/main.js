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
  } catch (err) {
    console.error("Initialization error:", err);
    console.error("Error stack:", err.stack);
  }
}

console.log("Starting ReelWorld...");
init();
