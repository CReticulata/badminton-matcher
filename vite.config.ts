import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// 版本號：優先用 git short hash；Cloudflare Pages 建置環境沒有 git 時退回 CF 提供的 commit SHA
function resolveCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ?? "unknown";
  }
}

const buildDate = new Date().toISOString().slice(0, 10);

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(`${buildDate} ${resolveCommit()}`),
  },
});
