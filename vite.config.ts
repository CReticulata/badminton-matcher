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
export default defineConfig(({ command }) => ({
  plugins: [vue(), tailwindcss()],
  define: {
    // define 只在載入設定檔時求值一次：dev server 期間的 commit 會停在啟動當下，
    // 因此標上 dev 後綴，避免把過期的 hash 誤讀成實際建置版本
    __APP_VERSION__: JSON.stringify(
      command === "serve" ? `${buildDate} ${resolveCommit()} dev` : `${buildDate} ${resolveCommit()}`,
    ),
  },
}));
