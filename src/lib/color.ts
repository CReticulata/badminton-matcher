/** 顏色工具：預設色盤指派、依底色亮度自動配黑/白文字 */

export const DEFAULT_PALETTE = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#a855f7", // purple
  "#14b8a6", // teal
  "#ec4899", // pink
  "#84cc16", // lime
  "#f97316", // orange
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#eab308", // yellow
] as const;

/** 指派下一個預設色：先發未用過的色盤色，用完後以黃金角在色相環上產生新色，避免重複 */
export function nextDefaultColor(usedColors: readonly string[]): string {
  const used = new Set(usedColors.map((c) => c.toLowerCase()));
  for (const c of DEFAULT_PALETTE) {
    if (!used.has(c)) return c;
  }
  const hue = Math.round((usedColors.length * 137.508) % 360);
  return hslToHex(hue, 70, 50);
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c =
      ln - sn * Math.min(ln, 1 - ln) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** 解析 #rrggbb → [r,g,b]（0-255）；解析失敗回傳灰色 */
function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** WCAG 相對亮度 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 依底色亮度回傳可讀的文字色（黑或白） */
export function textColorOn(bgHex: string): "#000000" | "#ffffff" {
  return relativeLuminance(bgHex) > 0.4 ? "#000000" : "#ffffff";
}
