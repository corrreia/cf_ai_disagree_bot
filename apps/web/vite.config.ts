import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  optimizeDeps: {
    // Exclude agents from dependency optimization since it's Workers-only
    // Dynamic imports in the code will load it at runtime
    exclude: ["agents"],
  },
});
