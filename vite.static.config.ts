import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "static",
  base: "./",
  publicDir: false,
  plugins: [react()],
  build: {
    target: ["es2019", "safari14"],
    outDir: "../dist-static",
    emptyOutDir: true,
  },
});
