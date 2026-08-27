#!/usr/bin/env python3
"""DUPR 式「表現分數」的換算與對照表（離線、非權威）。

產生 docs/research/pickleball-rating-systems.md 裡的兩張表：
  1. 本專案的 beta 換算成「每 100 Glicko 點等於幾分預期分差」，與 DUPR 公開的
     「0.1 DUPR ≈ 1.2 分（11 分制）」對照。
  2. 候選 C 的表現分數 s = P(win | q̂)，其中 q̂ = a / (a + b)。

不依賴產品程式碼，只用標準函式庫。需要 Python 3.10+。

用法：
    python3 docs/research/scripts/performance-score.py
"""
from __future__ import annotations

import math

# 來源：docs/research/score-aware-margin-calibration.md
# 29 場實際紀錄擬合，95% CI [0.0955, 0.4239]，LRT p = 0.0015。
BETA = 0.2552

FORMATS = {
    "15/2/21（本專案）": (15, 2, 21),
    "11/2/15（匹克球近似）": (11, 2, 15),
}


def sigmoid(z: float) -> float:
    return 1 / (1 + math.exp(-z)) if z >= 0 else math.exp(z) / (1 + math.exp(z))


def legal(a: int, b: int, target: int, win_by: int, cap: int) -> bool:
    if a == b or a < 0 or b < 0:
        return False
    winner, loser = max(a, b), min(a, b)
    if winner == target:
        return loser <= target - win_by
    if target < winner < cap:
        return winner - loser == win_by
    if cap > target and winner == cap:
        return cap - win_by <= loser < cap
    return False


def endpoints(q: float, fmt: tuple[int, int, int]) -> list[tuple[int, int, float]]:
    """逐球 iid 假設下的終局比分分布。"""
    target, win_by, cap = fmt
    states = {(0, 0): 1.0}
    out: dict[tuple[int, int], float] = {}
    for total in range(2 * cap + 2):
        for a in range(max(0, total - cap), min(cap, total) + 1):
            b = total - a
            mass = states.get((a, b), 0.0)
            if mass == 0.0:
                continue
            if legal(a, b, target, win_by, cap):
                out[(a, b)] = mass
                continue
            if a + 1 <= cap:
                states[(a + 1, b)] = states.get((a + 1, b), 0.0) + mass * q
            if b + 1 <= cap:
                states[(a, b + 1)] = states.get((a, b + 1), 0.0) + mass * (1 - q)
    if abs(math.fsum(out.values()) - 1.0) > 1e-9:
        raise AssertionError("終局分布未正規化——賽制規則可能無法保證比賽結束")
    return [(a, b, m) for (a, b), m in sorted(out.items())]


def win_probability(q: float, fmt: tuple[int, int, int]) -> float:
    if q >= 1.0:
        return 1.0
    if q <= 0.0:
        return 0.0
    return math.fsum(m for a, b, m in endpoints(q, fmt) if a > b)


def signed_margin(q: float, fmt: tuple[int, int, int]) -> float:
    return math.fsum(m * (a - b) for a, b, m in endpoints(q, fmt))


def main() -> int:
    print("=== 每單位評分差對應幾分預期分差 ===")
    for name, fmt in FORMATS.items():
        per_100 = signed_margin(sigmoid(BETA * 100 / 100), fmt) - signed_margin(sigmoid(0.0), fmt)
        print(f"  {name}: 每 100 Glicko 點 ≈ {per_100:.2f} 分 → 1 分分差 ≈ {100 / per_100:.0f} Glicko 點")
    print("  DUPR 公開值: 0.1 DUPR ≈ 1.2 分（11 分制）→ 1 分分差 ≈ 0.083 DUPR")

    fmt = FORMATS["15/2/21（本專案）"]
    print("\n=== 候選 C：s = P(win | q̂)，q̂ = a / (a + b) ===")
    print(f"{'比分':>8}{'q̂':>9}{'s':>9}{'現行 s':>9}")
    for a, b in [(15, 0), (15, 5), (15, 9), (15, 12), (15, 13), (17, 15), (21, 19),
                 (13, 15), (12, 15), (9, 15), (0, 15)]:
        q_hat = a / (a + b)
        print(f"{f'{a}:{b}':>8}{q_hat:>9.3f}{win_probability(q_hat, fmt):>9.3f}"
              f"{1.0 if a > b else 0.0:>9.1f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
