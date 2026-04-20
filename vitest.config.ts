import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // jsdom optionally requires the native `canvas` module; on this sandbox
      // the prebuilt binary is missing, so stub it. We don't render to canvas
      // in any test, so this is safe.
      canvas: path.resolve(__dirname, "./src/test/canvas-stub.ts"),
    },
  },
});
