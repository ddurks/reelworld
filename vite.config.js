import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 8080,
    host: true,
    open: true,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      external: ["babylon", "BABYLON"],
    },
  },
});
