import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works both on GitHub Pages
// (https://<user>.github.io/Escalation/) AND on a custom subdomain
// (https://escalation.example.com/) without needing to rebuild.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
