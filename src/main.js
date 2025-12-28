import { ReelWorld } from "./ReelWorld.js";

const IS_MOBILE =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
document.body.classList.add(IS_MOBILE ? "mobile" : "desktop");

export const W = "w";
export const A = "a";
export const S = "s";
export const D = "d";
export const SHIFT = "shift";
export const SPACE = " ";
export const DIRECTIONS = [W, A, S, D];

const canvas = document.getElementById("renderCanvas");

const stats = new Stats();
stats.showPanel(0);
stats.dom.style.pointerEvents = "none";
document.body.appendChild(stats.dom);

const reelWorld = new ReelWorld(canvas, IS_MOBILE);

window.addEventListener("resize", reelWorld.handleResize);

async function init() {
  try {
    await reelWorld.init();

    const originalAnimate = reelWorld.animate;
    reelWorld.animate = () => {
      stats.begin();
      originalAnimate();
      stats.end();
    };

    reelWorld.start();

    window.showPhysicsDebug = () => reelWorld.showPhysicsDebug();
    window.hidePhysicsDebug = () => reelWorld.hidePhysicsDebug();
    window.debugLine = () => {
      if (window.fishingLines?.length > 0) {
        const line = window.fishingLines[window.fishingLines.length - 1];
        console.log("Latest fishing line:", line);

        line.visibility = 1.0;
        line.setEnabled(true);
        line.isVisible = true;
        line.renderingGroupId = 3;

        if (!line.material) {
          const mat = new BABYLON.StandardMaterial(
            "debugLineMat",
            reelWorld.scene
          );
          mat.diffuseColor = new BABYLON.Color3(1, 0, 1);
          mat.emissiveColor = new BABYLON.Color3(1, 0, 1);
          line.material = mat;
        }
      }
    };
  } catch (err) {
    console.error("Initialization error:", err);
  }
}

init();
