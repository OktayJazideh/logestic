import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function gitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_BUILD_SHA": JSON.stringify(gitShortSha()),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

