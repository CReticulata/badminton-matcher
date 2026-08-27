#!/usr/bin/env python3
"""比分邊際校準分析（離線、非權威）。

用途：從 App 匯出的 CSV 回答兩個問題——
  1. 完整比分相對於「只看勝負」多帶多少關於強度差的資訊？
  2. rating 差對應到每球勝率 q 的係數 beta 是多少？

本腳本不是產品程式碼，也不參與 rating 或分組。Glicko 仍是唯一正式權威。
內含的 Glicko-2 移植會先與 CSV 現值對帳，對不上就中止。

用法：
    python3 docs/research/scripts/margin-calibration.py <匯出的.csv>

只用標準函式庫，需要 Python 3.10+。
"""
from __future__ import annotations

import collections
import csv
import math
import statistics
import sys

# --- 與 src/lib/glicko2.ts 對齊的常數 ---
SCALE = 173.7178
TAU = 0.5
DEFAULT_RATING = 1500.0
DEFAULT_RD = 350.0
DEFAULT_VOL = 0.06
OVERRIDE_RD = 350.0
EPS = 1e-6

# 目前所有歷史比賽採用的賽制。CSV 尚未帶 scoringFormat 欄位時使用此值；
# 賽制快照上線後應改為逐場讀取，不得從比分反推。
ASSUMED_FORMAT = (15, 2, 21)  # target, winBy, cap


# ---------------------------------------------------------------- CSV

def load_sections(path: str) -> dict[str, list[dict[str, str]]]:
    """解析 App 的分區 CSV（[players] / [matches] / ...）。"""
    data: dict[str, list[dict[str, str]]] = collections.defaultdict(list)
    header: dict[str, list[str] | None] = {}
    section: str | None = None
    with open(path, encoding="utf-8-sig") as handle:
        for line in handle.read().splitlines():
            if line.startswith("[") and line.endswith("]"):
                section = line[1:-1]
                header[section] = None
                continue
            if not line.strip() or section is None:
                continue
            row = next(csv.reader([line]))
            if header[section] is None:
                header[section] = row
                continue
            data[section].append(dict(zip(header[section], row)))
    return data


# ------------------------------------------------------------- Glicko-2

def _g(phi: float) -> float:
    return 1 / math.sqrt(1 + 3 * phi * phi / (math.pi ** 2))


def _expect(mu: float, mu_j: float, phi_j: float) -> float:
    return 1 / (1 + math.exp(-_g(phi_j) * (mu - mu_j)))


def update_rating(state, results, tau: float = TAU):
    """單一球員的 Glicko-2 更新；對應 glicko2.ts 的 updateRating。"""
    mu = (state[0] - DEFAULT_RATING) / SCALE
    phi = state[1] / SCALE
    sigma = state[2]
    if not results:
        return state[0], math.sqrt(phi * phi + sigma * sigma) * SCALE, sigma

    v_inv = 0.0
    for rating, rd, _ in results:
        mu_j, phi_j = (rating - DEFAULT_RATING) / SCALE, rd / SCALE
        e, gj = _expect(mu, mu_j, phi_j), _g(phi_j)
        v_inv += gj * gj * e * (1 - e)
    v = 1 / v_inv

    total = 0.0
    for rating, rd, score in results:
        mu_j, phi_j = (rating - DEFAULT_RATING) / SCALE, rd / SCALE
        total += _g(phi_j) * (score - _expect(mu, mu_j, phi_j))
    delta = v * total

    a = math.log(sigma * sigma)

    def f(x: float) -> float:
        ex, phi2 = math.exp(x), phi * phi
        return ex * (delta * delta - phi2 - v - ex) / (2 * (phi2 + v + ex) ** 2) - (x - a) / (tau * tau)

    upper = a
    if delta * delta > phi * phi + v:
        lower = math.log(delta * delta - phi * phi - v)
    else:
        k = 1
        while f(a - k * tau) < 0:
            k += 1
        lower = a - k * tau
    f_upper, f_lower = f(upper), f(lower)
    while abs(lower - upper) > EPS:
        mid = upper + (upper - lower) * f_upper / (f_lower - f_upper)
        f_mid = f(mid)
        if f_mid * f_lower <= 0:
            upper, f_upper = lower, f_lower
        else:
            f_upper /= 2
        lower, f_lower = mid, f_mid
    sigma_prime = math.exp(upper / 2)

    phi_star = math.sqrt(phi * phi + sigma_prime * sigma_prime)
    phi_prime = 1 / math.sqrt(1 / (phi_star * phi_star) + 1 / v)
    return (mu + phi_prime * phi_prime * total) * SCALE + DEFAULT_RATING, phi_prime * SCALE, sigma_prime


def apply_match(states, team_a, team_b, score_a, score_b):
    """一場比賽的雙打更新；對應 glicko2.ts 的 applyMatch。"""
    a_wins = 1.0 if score_a > score_b else 0.0
    opp_b = (sum(states[i][0] for i in team_b) / len(team_b),
             sum(states[i][1] for i in team_b) / len(team_b))
    opp_a = (sum(states[i][0] for i in team_a) / len(team_a),
             sum(states[i][1] for i in team_a) / len(team_a))
    out = {}
    for i in team_a:
        out[i] = update_rating(states[i], [(opp_b[0], opp_b[1], a_wins)])
    for i in team_b:
        out[i] = update_rating(states[i], [(opp_a[0], opp_a[1], 1.0 - a_wins)])
    return out


# --------------------------------------------------------- 終局比分 DP

def legal_endpoint(a: int, b: int, fmt=ASSUMED_FORMAT) -> bool:
    """是否為該賽制下的合法終局比分。三個分支互斥。"""
    target, win_by, cap = fmt
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


def endpoint_dp(q: float, fmt=ASSUMED_FORMAT):
    """逐球 iid 假設下的終局比分分布。

    回傳 [(a, b, mass, d mass/dz), ...]，其中 q = sigmoid(z)。
    導數用於概似梯度與資訊量計算。
    """
    target, win_by, cap = fmt
    states = {(0, 0): (1.0, 0.0)}
    endpoints: dict[tuple[int, int], tuple[float, float]] = {}
    dq = q * (1 - q)
    for total in range(2 * cap + 2):
        for a in range(min(cap, total) + 1):
            b = total - a
            if b > cap or (a, b) not in states:
                continue
            mass, derivative = states[(a, b)]
            if legal_endpoint(a, b, fmt):
                endpoints[(a, b)] = (mass, derivative)
                continue
            steps = (
                ((a + 1, b), mass * q, derivative * q + mass * dq),
                ((a, b + 1), mass * (1 - q), derivative * (1 - q) - mass * dq),
            )
            for nxt, next_mass, next_derivative in steps:
                if nxt[0] > cap or nxt[1] > cap:
                    continue
                old_mass, old_derivative = states.get(nxt, (0.0, 0.0))
                states[nxt] = (old_mass + next_mass, old_derivative + next_derivative)
    rows = [(a, b, m, d) for (a, b), (m, d) in
            sorted(endpoints.items(), key=lambda r: (sum(r[0]), r[0][0]))]
    if abs(math.fsum(r[2] for r in rows) - 1.0) > 1e-10:
        raise AssertionError("終局比分分布未正規化")
    return rows


def sigmoid(z: float) -> float:
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    ex = math.exp(z)
    return ex / (1 + ex)


# ------------------------------------------------------------------ 主流程

def replay(data):
    """依時間重播 override / baseline / match，回傳每場的賽前 rating 差。

    走 walk-forward，任何一場的 Δ 只用該場之前的資訊，無 look-ahead。
    """
    players = {p["id"]: p for p in data["players"]}
    events = []
    events += [(int(m["at"]), "match", m) for m in data["matches"]]
    events += [(int(o["at"]), "override", o) for o in data["overrides"]]
    events += [(int(b["at"]), "baseline", b) for b in data["baselines"]]
    events.sort(key=lambda e: e[0])

    states = {pid: (float(p["initialRating"]), DEFAULT_RD, DEFAULT_VOL)
              for pid, p in players.items()}
    observations = []
    for _, kind, event in events:
        if kind == "override":
            if event["playerId"] in states:
                states[event["playerId"]] = (float(event["rating"]), OVERRIDE_RD, DEFAULT_VOL)
        elif kind == "baseline":
            if event["playerId"] in states:
                states[event["playerId"]] = (float(event["rating"]), float(event["rd"]), float(event["vol"]))
        else:
            team_a, team_b = event["teamA"].split("|"), event["teamB"].split("|")
            score_a, score_b = int(event["scoreA"]), int(event["scoreB"])
            mean_a = sum(states[i][0] for i in team_a) / len(team_a)
            mean_b = sum(states[i][0] for i in team_b) / len(team_b)
            observations.append((mean_a - mean_b, score_a, score_b))
            for pid, state in apply_match(states, team_a, team_b, score_a, score_b).items():
                states[pid] = state

    worst = max(abs(states[pid][0] - float(p["rating"])) for pid, p in players.items())
    return observations, worst


_DP_CACHE: dict[float, list] = {}


def cached_dp(q: float):
    key = round(q, 7)
    if key not in _DP_CACHE:
        _DP_CACHE[key] = endpoint_dp(key)
    return _DP_CACHE[key]


def log_likelihood(beta: float, observations, use_score: bool) -> float:
    """beta 的單位是「每 100 rating 點的 logit」。"""
    total = 0.0
    for delta, score_a, score_b in observations:
        rows = cached_dp(sigmoid(beta * delta / 100.0))
        if use_score:
            mass = next((r[2] for r in rows if r[0] == score_a and r[1] == score_b), 0.0)
        else:
            win = math.fsum(r[2] for r in rows if r[0] > r[1])
            mass = win if score_a > score_b else 1 - win
        if mass <= 0:
            return -1e18
        total += math.log(mass)
    return total


def fit_beta(observations, use_score: bool):
    """三分搜尋求 MLE，再用 profile likelihood 求 95% CI。"""
    lo, hi = -3.0, 3.0
    for _ in range(200):
        m1, m2 = lo + (hi - lo) / 3, hi - (hi - lo) / 3
        if log_likelihood(m1, observations, use_score) < log_likelihood(m2, observations, use_score):
            lo = m1
        else:
            hi = m2
    beta = (lo + hi) / 2
    peak = log_likelihood(beta, observations, use_score)

    def edge(direction: int) -> float:
        x, step = beta, 0.001 * direction
        while abs(x - beta) < 10:
            x += step
            if log_likelihood(x, observations, use_score) < peak - 1.920729:
                return x
            step *= 1.05
        return float("nan")

    return beta, peak, edge(-1), edge(+1)


def main(path: str) -> int:
    data = load_sections(path)
    observations, worst = replay(data)
    print(f"Glicko 移植對帳：最大 rating 誤差 {worst:.3e}", end="  ")
    if worst > 1e-6:
        print("FAIL —— 移植與產品不一致，中止")
        return 1
    print("PASS")

    n = len(observations)
    margins = [abs(a - b) for _, a, b in observations]
    print(f"\n樣本：{n} 場；賽前 |Δrating| 中位數 "
          f"{statistics.median(abs(o[0]) for o in observations):.0f}；"
          f"分差平均 {statistics.mean(margins):.2f}")

    print("\n模型：q = sigmoid(beta * Δrating / 100)，終局比分 ~ DP(q)")
    print(f"{'觀測':<16}{'beta':>9}{'95% CI':>22}{'寬度':>9}{'LRT p':>10}")
    widths = {}
    fits = {}
    for label, use_score in (("只用勝負", False), ("用完整比分", True)):
        beta, peak, lo, hi = fit_beta(observations, use_score)
        lrt = 2 * (peak - log_likelihood(0.0, observations, use_score))
        p = math.erfc(math.sqrt(max(lrt, 0) / 2)) if lrt > 0 else 1.0
        widths[label] = hi - lo
        fits[label] = beta
        print(f"{label:<16}{beta:>+9.4f}{f'[{lo:+.4f}, {hi:+.4f}]':>22}{hi - lo:>9.4f}{p:>10.4f}")

    ratio = widths["只用勝負"] / widths["用完整比分"]
    print(f"\nCI 寬度比 {ratio:.2f}× → 比分的資訊量約等於 {ratio ** 2:.1f} 倍場數"
          f"（{n} 場比分 ≈ {n * ratio ** 2:.0f} 場只看勝負）")

    beta = fits["用完整比分"]
    predicted = []
    conditional_variance = []
    for delta, _, _ in observations:
        rows = cached_dp(sigmoid(beta * delta / 100.0))
        first = math.fsum(r[2] * abs(r[0] - r[1]) for r in rows)
        second = math.fsum(r[2] * (abs(r[0] - r[1])) ** 2 for r in rows)
        predicted.append(first)
        conditional_variance.append(second - first * first)
    model_variance = statistics.mean(conditional_variance)
    if len(set(predicted)) > 1:
        model_variance += statistics.variance(predicted)
    print(f"\niid rally 檢定：觀測分差變異數 {statistics.variance(margins):.2f}"
          f" vs 模型 {model_variance:.2f}"
          f" → 過度離散比 {statistics.variance(margins) / model_variance:.2f}（1.0 = iid 成立）")

    print(f"\nΔrating → 預期比賽樣貌（beta = {beta:+.4f}）")
    print(f"{'Δrating':>9}{'每球 q':>9}{'勝率':>9}{'預期分差':>10}{'最可能比分':>12}")
    for delta in (0, 50, 100, 150, 200, 300, 400):
        rows = cached_dp(sigmoid(beta * delta / 100.0))
        win = math.fsum(r[2] for r in rows if r[0] > r[1])
        expected = math.fsum(r[2] * abs(r[0] - r[1]) for r in rows)
        top = max(rows, key=lambda r: r[2])
        print(f"{delta:>9}{sigmoid(beta * delta / 100.0):>9.3f}{win:>9.3f}"
              f"{expected:>10.2f}{f'{top[0]}:{top[1]}':>12}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
