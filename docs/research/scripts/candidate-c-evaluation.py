#!/usr/bin/env python3
"""候選 C 實測：把 Glicko 的 s 由 1/0 換成 P(win | q̂)。

方法、結果與結論見 docs/research/pickleball-rating-systems.md。

兩臂唯一的差別是 scoreOf。Glicko-2 的 tau、初始 rating、RD、volatility 完全相同，
沒有可調的學習率，因此不會重蹈 score-aware-margin-calibration.md 記錄的學習率混淆；
即便如此仍加了步長控制（k）與尺度校正，因為候選 C 的殘差天生較小。

離線、非權威。不讀寫產品狀態，只用標準函式庫。需要 Python 3.10+。

用法：
    python3 docs/research/scripts/candidate-c-evaluation.py [匯出的.csv]

省略 CSV 時只跑模擬。
"""
from __future__ import annotations
import csv, collections, math, random, statistics, sys

SCALE=173.7178; TAU=0.5; DEF_R=1500.0; DEF_RD=350.0; DEF_V=0.06; EPS=1e-6
BETA=0.2552          # docs/research/score-aware-margin-calibration.md
FMT=(15,2,21)

# ---------------- Glicko-2（移植自 src/lib/glicko2.ts）----------------
def _g(phi): return 1/math.sqrt(1+3*phi*phi/(math.pi**2))
def _E(mu,muJ,phiJ): return 1/(1+math.exp(-_g(phiJ)*(mu-muJ)))

def update_rating(st,results,tau=TAU):
    mu=(st[0]-DEF_R)/SCALE; phi=st[1]/SCALE; sigma=st[2]
    if not results: return (st[0], math.sqrt(phi*phi+sigma*sigma)*SCALE, sigma)
    vinv=0.0
    for r,rd,s in results:
        muJ=(r-DEF_R)/SCALE; phiJ=rd/SCALE; e=_E(mu,muJ,phiJ); gj=_g(phiJ)
        vinv+=gj*gj*e*(1-e)
    v=1/vinv
    ssum=math.fsum(_g(rd/SCALE)*(s-_E(mu,(r-DEF_R)/SCALE,rd/SCALE)) for r,rd,s in results)
    delta=v*ssum
    a=math.log(sigma*sigma)
    def f(x):
        ex=math.exp(x); p2=phi*phi
        return ex*(delta*delta-p2-v-ex)/(2*(p2+v+ex)**2)-(x-a)/(tau*tau)
    A=a
    if delta*delta>phi*phi+v: B=math.log(delta*delta-phi*phi-v)
    else:
        k=1
        while f(a-k*tau)<0: k+=1
        B=a-k*tau
    fA,fB=f(A),f(B)
    while abs(B-A)>EPS:
        C=A+(A-B)*fA/(fB-fA); fC=f(C)
        if fC*fB<=0: A,fA=B,fB
        else: fA=fA/2
        B,fB=C,fC
    sp=math.exp(A/2)
    phistar=math.sqrt(phi*phi+sp*sp); phip=1/math.sqrt(1/(phistar*phistar)+1/v)
    return (mu+phip*phip*ssum)*SCALE+DEF_R, phip*SCALE, sp

def sig(z): return 1/(1+math.exp(-z)) if z>=0 else math.exp(z)/(1+math.exp(z))

# ---------------- 終局分布 DP ----------------
def legal(a,b,fmt=FMT):
    t,w,c=fmt
    if a==b or a<0 or b<0: return False
    W,L=max(a,b),min(a,b)
    if W==t: return L<=t-w
    if t<W<c: return W-L==w
    if c>t and W==c: return c-w<=L<c
    return False

_dp_cache={}
def endpoints(q,fmt=FMT):
    key=(round(q,6),fmt)
    if key in _dp_cache: return _dp_cache[key]
    t,w,c=fmt; states={(0,0):1.0}; out={}
    for tot in range(2*c+2):
        for a in range(max(0,tot-c),min(c,tot)+1):
            b=tot-a; m=states.get((a,b),0.0)
            if m==0.0: continue
            if legal(a,b,fmt): out[(a,b)]=m; continue
            if a+1<=c: states[(a+1,b)]=states.get((a+1,b),0.0)+m*q
            if b+1<=c: states[(a,b+1)]=states.get((a,b+1),0.0)+m*(1-q)
    rows=[(a,b,m) for (a,b),m in out.items()]
    _dp_cache[key]=rows
    return rows

def win_prob(q,fmt=FMT):
    if q>=1: return 1.0
    if q<=0: return 0.0
    return math.fsum(m for a,b,m in endpoints(q,fmt) if a>b)

# ---------------- 兩種 scoreOf ----------------
def s_binary(a,b,fmt=FMT): return 1.0 if a>b else 0.0
def s_performance(a,b,fmt=FMT):
    """候選 C：q̂ = a/(a+b) 反解，再求 P(win | q̂)"""
    if a+b==0: return 0.5
    return win_prob(a/(a+b),fmt)

# ---------------- 一場比賽的更新 ----------------
def apply_match(states,tA,tB,sa,sb,score_fn,k=1.0):
    """k 為步長倍率：s' = E + k(s − E)，用於控制有效學習率的混淆。"""
    oppB=(sum(states[i][0] for i in tB)/len(tB), sum(states[i][1] for i in tB)/len(tB))
    oppA=(sum(states[i][0] for i in tA)/len(tA), sum(states[i][1] for i in tA)/len(tA))
    sA=score_fn(sa,sb); sB=score_fn(sb,sa)
    out={}
    for ids,opp,s_raw in ((tA,oppB,sA),(tB,oppA,sB)):
        for i in ids:
            if k!=1.0:
                mu=(states[i][0]-DEF_R)/SCALE
                e=_E(mu,(opp[0]-DEF_R)/SCALE,opp[1]/SCALE)
                s=min(max(e+k*(s_raw-e),0.0),1.0)
            else:
                s=s_raw
            out[i]=update_rating(states[i],[(opp[0],opp[1],s)])
    return out

def forecast(states,tA,tB):
    mA=sum(states[i][0] for i in tA)/len(tA)
    mB=sum(states[i][0] for i in tB)/len(tB); rB=sum(states[i][1] for i in tB)/len(tB)
    return _E((mA-DEF_R)/SCALE,(mB-DEF_R)/SCALE,rB/SCALE)

brier=lambda y,p:(p-y)**2
def logloss(y,p):
    p=min(max(p,1e-12),1-1e-12); return -(y*math.log(p)+(1-y)*math.log(1-p))

# ============================ 模擬 ============================

TRUE_SKILLS = [1741, 1405, 1395, 1304, 1273, 1257, 1203, 1170, 1142, 1076]
"""真實實力，取自實際名單的分布（見 score-aware-margin-calibration.md）。"""


def play(rng, mean_a, mean_b, perf_sigma):
    """逐球模擬一場。perf_sigma 為單場狀態起伏，是模型錯置的來源。"""
    ea = mean_a + rng.gauss(0, perf_sigma)
    eb = mean_b + rng.gauss(0, perf_sigma)
    q = sig(BETA * (ea - eb) / 100.0)
    a = b = 0
    while not legal(a, b):
        if rng.random() < q:
            a += 1
        else:
            b += 1
    return (a, b)


def simulate_sequence(seed, n_matches, perf_sigma):
    """產生固定的比賽序列與比分；兩臂共用同一組，構成配對比較。"""
    rng = random.Random(seed)
    ids = list(range(len(TRUE_SKILLS)))
    seq = []
    for _ in range(n_matches):
        four = rng.sample(ids, 4)
        team_a, team_b = four[:2], four[2:]
        mean_a = sum(TRUE_SKILLS[i] for i in team_a) / 2
        mean_b = sum(TRUE_SKILLS[i] for i in team_b) / 2
        seq.append((team_a, team_b, play(rng, mean_a, mean_b, perf_sigma)))
    return seq


def train(seq, score_fn, k=1.0):
    states = {i: (1500.0, DEF_RD, DEF_V) for i in range(len(TRUE_SKILLS))}
    for team_a, team_b, (score_a, score_b) in seq:
        for i, s in apply_match(states, team_a, team_b, score_a, score_b, score_fn, k).items():
            states[i] = s
    return {i: v[0] for i, v in states.items()}


def pearson(x, y):
    mx, my = statistics.mean(x), statistics.mean(y)
    num = math.fsum((a - mx) * (b - my) for a, b in zip(x, y))
    den = math.sqrt(math.fsum((a - mx) ** 2 for a in x) * math.fsum((b - my) ** 2 for b in y))
    return num / den if den else 0.0


def matchmaking_quality(ratings, rng, rounds=200):
    """用學到的評分挑最平衡的分隊，回報依【真實實力】的隊伍總和差（越小越好）。"""
    ids = list(range(len(TRUE_SKILLS)))
    gaps = []
    for _ in range(rounds):
        four = rng.sample(ids, 4)
        best = None
        for split in (((0, 1), (2, 3)), ((0, 2), (1, 3)), ((0, 3), (1, 2))):
            team_a = [four[i] for i in split[0]]
            team_b = [four[i] for i in split[1]]
            estimated = abs(sum(ratings[i] for i in team_a) - sum(ratings[i] for i in team_b))
            if best is None or estimated < best[0]:
                best = (estimated, team_a, team_b)
        _, team_a, team_b = best
        gaps.append(abs(sum(TRUE_SKILLS[i] for i in team_a) - sum(TRUE_SKILLS[i] for i in team_b)))
    return statistics.mean(gaps)


def expected_margin(team_sum_gap):
    """隊伍 rating 總和差 → 預期【絕對】分差 E|a−b|。

    平衡在意的是「這場會不會一面倒」，因此用絕對分差而非帶符號分差。
    兩者差很多：實力相同時絕對分差已是 4.48 分（總得有人贏），
    每 100 平均 rating 點才增加約 0.58 分，即 1 分 ≈ 174 平均 rating 點。
    帶符號分差在 0 起算且成長快得多——誤用它會把效果誇大約 5.5 倍。
    """
    rows = endpoints(sig(BETA * (team_sum_gap / 2) / 100.0))
    return math.fsum(m * abs(a - b) for a, b, m in rows)


def paired_t(values):
    if len(values) < 2:
        return 0.0
    return statistics.mean(values) / (statistics.stdev(values) / math.sqrt(len(values)))


ARMS = (("現行（二元 1/0）", s_binary), ("候選 C（P(win|q̂)）", s_performance))


# ============================ 實驗 ============================

def experiment_real(path):
    """實驗 1：真實歷史 walk-forward。"""
    sections = collections.defaultdict(list)
    header = {}
    section = None
    for line in open(path, encoding="utf-8-sig").read().splitlines():
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
        sections[section].append(dict(zip(header[section], row)))

    players = {p["id"]: p for p in sections["players"]}
    events = [(int(m["at"]), "match", m) for m in sections["matches"]]
    events += [(int(o["at"]), "override", o) for o in sections["overrides"]]
    events += [(int(b["at"]), "baseline", b) for b in sections["baselines"]]
    events.sort(key=lambda e: e[0])

    def run(score_fn, k=1.0):
        states = {i: (float(p["initialRating"]), DEF_RD, DEF_V) for i, p in players.items()}
        rows = []
        for _, kind, event in events:
            if kind == "override":
                if event["playerId"] in states:
                    states[event["playerId"]] = (float(event["rating"]), 350.0, DEF_V)
            elif kind == "baseline":
                if event["playerId"] in states:
                    states[event["playerId"]] = (
                        float(event["rating"]), float(event["rd"]), float(event["vol"]))
            else:
                team_a = event["teamA"].split("|")
                team_b = event["teamB"].split("|")
                score_a, score_b = int(event["scoreA"]), int(event["scoreB"])
                rows.append((1.0 if score_a > score_b else 0.0, forecast(states, team_a, team_b)))
                for i, s in apply_match(states, team_a, team_b, score_a, score_b, score_fn, k).items():
                    states[i] = s
        return rows

    print(f"=== 實驗 1：真實 {len(sections['matches'])} 場（walk-forward、forecast-before-reveal）===\n")
    print(f"{'臂':<22}{'Brier':>9}{'LogLoss':>10}")
    results = {}
    for name, fn in ARMS:
        rows = run(fn)
        results[name] = rows
        print(f"{name:<22}{statistics.mean(brier(y, p) for y, p in rows):>9.4f}"
              f"{statistics.mean(logloss(y, p) for y, p in rows):>10.4f}")

    a, c = results[ARMS[0][0]], results[ARMS[1][0]]
    diffs = [brier(y, pc) - brier(y, pb) for (y, pb), (_, pc) in zip(a, c)]
    md, sd = statistics.mean(diffs), statistics.stdev(diffs)
    se = sd / math.sqrt(len(diffs))
    print(f"\n配對差（C − 現行）= {md:+.5f}   t = {md / se:+.2f}   "
          f"95% CI = [{md - 1.96 * se:+.5f}, {md + 1.96 * se:+.5f}]")
    need = (1.96 + 0.84) ** 2 * sd * sd / (0.01 ** 2)
    print(f"檢定力：要偵測 Brier 改善 0.01 需 n ≈ {need:.0f} 場（目前 {len(diffs)}）")


def experiment_simulation(reps=30):
    """實驗 2–4：模擬。"""
    checkpoints = (20, 50, 100, 200, 400)

    print("\n=== 實驗 2：排序回復（模型正確，隨機配對）===\n")
    print(f"{'場數':>6}{'現行 corr':>12}{'候選C corr':>12}{'差':>9}")
    for n in checkpoints:
        corr = {"bin": [], "perf": []}
        for rep in range(reps):
            seq = simulate_sequence(1000 + rep, n, 0)
            for tag, fn in (("bin", s_binary), ("perf", s_performance)):
                ratings = train(seq, fn)
                corr[tag].append(pearson([ratings[i] for i in range(len(TRUE_SKILLS))], TRUE_SKILLS))
        b, p = statistics.mean(corr["bin"]), statistics.mean(corr["perf"])
        print(f"{n:>6}{b:>12.4f}{p:>12.4f}{p - b:>+9.4f}")

    print("\n=== 實驗 3：產品指標——依學到的評分分隊後的【真實】隊伍差 ===\n")
    print(f"{'訓練場數':>8}{'現行':>10}{'候選C':>10}{'差':>9}{'配對 t':>9}{'≈ 分差':>10}")
    for n in checkpoints:
        gaps = {"bin": [], "perf": []}
        for rep in range(reps):
            seq = simulate_sequence(3000 + rep, n, 0)
            for tag, fn in (("bin", s_binary), ("perf", s_performance)):
                gaps[tag].append(matchmaking_quality(train(seq, fn), random.Random(7777 + rep)))
        diffs = [p - b for b, p in zip(gaps["bin"], gaps["perf"])]
        margin = expected_margin(statistics.mean(gaps["perf"])) - expected_margin(
            statistics.mean(gaps["bin"]))
        print(f"{n:>8}{statistics.mean(gaps['bin']):>10.1f}{statistics.mean(gaps['perf']):>10.1f}"
              f"{statistics.mean(diffs):>+9.1f}{paired_t(diffs):>9.2f}{margin:>+9.3f}")

    print("\n=== 實驗 4：模型錯置——加入單場狀態起伏 ===")
    print("（實測真實資料的過度離散比為 1.15）\n")
    print(f"{'perf_sigma':>11}{'現行 corr':>12}{'候選C corr':>12}{'差':>9}"
          f"{'現行分組':>10}{'候選C分組':>11}")
    for sigma in (0, 50, 100, 150, 250):
        corr = {"bin": [], "perf": []}
        gaps = {"bin": [], "perf": []}
        for rep in range(max(reps // 2, 10)):
            seq = simulate_sequence(4000 + rep, 400, sigma)
            for tag, fn in (("bin", s_binary), ("perf", s_performance)):
                ratings = train(seq, fn)
                corr[tag].append(pearson([ratings[i] for i in range(len(TRUE_SKILLS))], TRUE_SKILLS))
                gaps[tag].append(matchmaking_quality(ratings, random.Random(555 + rep)))
        print(f"{sigma:>11}{statistics.mean(corr['bin']):>12.4f}{statistics.mean(corr['perf']):>12.4f}"
              f"{statistics.mean(corr['perf']) - statistics.mean(corr['bin']):>+9.4f}"
              f"{statistics.mean(gaps['bin']):>10.1f}{statistics.mean(gaps['perf']):>11.1f}")


def experiment_conditional(reps=40, n_matches=400, rounds=200):
    """效果集中度：兩臂選出不同分隊的比例，以及那些回合的實際好壞。

    「更好」的定義：以【真實實力】衡量，該分隊的兩隊實力總和差較小，
    亦即比賽更接近。只有模擬能這樣比——真實資料沒有真值，
    用任一臂自己的評分當尺都會構成循環論證。
    """
    print("\n=== 實驗 6：效果是集中的還是均勻的 ===\n")
    print(f"{'訓練場數':>8}{'選擇不同':>10}{'全部平均':>11}{'僅不同時':>11}{'變好時':>10}{'變壞時':>10}")
    for n in (50, n_matches):
        every, cond, better, worse = [], [], [], []
        for rep in range(reps):
            seq = simulate_sequence(6000 + rep, n, 0)
            ratings = {tag: train(seq, fn) for tag, fn in (("bin", s_binary), ("perf", s_performance))}
            rng = random.Random(31 + rep)
            for _ in range(rounds):
                four = rng.sample(range(len(TRUE_SKILLS)), 4)
                chosen = {}
                for tag in ("bin", "perf"):
                    best = None
                    for split in (((0, 1), (2, 3)), ((0, 2), (1, 3)), ((0, 3), (1, 2))):
                        team_a = [four[i] for i in split[0]]
                        team_b = [four[i] for i in split[1]]
                        estimated = abs(sum(ratings[tag][i] for i in team_a)
                                        - sum(ratings[tag][i] for i in team_b))
                        if best is None or estimated < best[0]:
                            best = (estimated, team_a, team_b)
                    chosen[tag] = (best[1], best[2])
                true_gap = {t: abs(sum(TRUE_SKILLS[i] for i in a) - sum(TRUE_SKILLS[i] for i in b))
                            for t, (a, b) in chosen.items()}
                delta = expected_margin(true_gap["perf"]) - expected_margin(true_gap["bin"])
                every.append(delta)
                if set(chosen["bin"][0]) not in (set(chosen["perf"][0]), set(chosen["perf"][1])):
                    cond.append(delta)
                    (better if delta < 0 else worse).append(delta)
        print(f"{n:>8}{len(cond) / len(every):>9.1%}{statistics.mean(every):>+11.3f}"
              f"{statistics.mean(cond):>+11.3f}{statistics.mean(better):>+10.3f}"
              f"{statistics.mean(worse):>+10.3f}")
    print("\n單位：分（預期絕對分差；負值＝兩隊更接近）")


def experiment_recovery(reps=60):
    """實驗 7：每位球員實力估計的準確度與樣本效率。

    候選 C 會壓縮評分，直接比 |學到 − 真值| 對它不公平。先以最小平方
    擬合 true = a + b * learned 吸收尺度差異，再看殘差——那才是
    「相對位置抓得準不準」，也正是使用者比較彼此分數時在意的東西。
    """
    checkpoints = (20, 40, 80, 160, 320, 640)

    def residuals(learned):
        mean_learned = statistics.mean(learned)
        mean_true = statistics.mean(TRUE_SKILLS)
        slope = (math.fsum((x - mean_learned) * (t - mean_true)
                           for x, t in zip(learned, TRUE_SKILLS))
                 / math.fsum((x - mean_learned) ** 2 for x in learned))
        return [t - (mean_true + slope * (x - mean_learned))
                for x, t in zip(learned, TRUE_SKILLS)]

    rmse = {(tag, c): [] for tag in ("bin", "perf") for c in checkpoints}
    per_player = {(tag, c): [[] for _ in TRUE_SKILLS]
                  for tag in ("bin", "perf") for c in checkpoints}
    for rep in range(reps):
        seq = simulate_sequence(8000 + rep, max(checkpoints), 0)
        for tag, fn in (("bin", s_binary), ("perf", s_performance)):
            states = {i: (1500.0, DEF_RD, DEF_V) for i in range(len(TRUE_SKILLS))}
            for idx, (team_a, team_b, (score_a, score_b)) in enumerate(seq):
                for i, s in apply_match(states, team_a, team_b, score_a, score_b, fn).items():
                    states[i] = s
                if idx + 1 in checkpoints:
                    res = residuals([states[i][0] for i in range(len(TRUE_SKILLS))])
                    rmse[(tag, idx + 1)].append(math.sqrt(statistics.mean(x * x for x in res)))
                    for i, x in enumerate(res):
                        per_player[(tag, idx + 1)][i].append(abs(x))

    print("\n=== 實驗 7：每位球員實力估計的殘差 RMSE（線性擬合後）===\n")
    binary = [statistics.mean(rmse[("bin", c)]) for c in checkpoints]
    perf = [statistics.mean(rmse[("perf", c)]) for c in checkpoints]
    print(f"{'場數':>6}{'現行':>10}{'候選C':>10}{'改善':>9}{'相當於場數倍率':>16}")
    for i, c in enumerate(checkpoints):
        need = None
        for j in range(len(checkpoints) - 1):
            if binary[j] >= perf[i] >= binary[j + 1]:
                frac = (binary[j] - perf[i]) / (binary[j] - binary[j + 1])
                need = checkpoints[j] + frac * (checkpoints[j + 1] - checkpoints[j])
                break
        ratio = f"{need / c:.2f}×" if need else (f"＞{max(checkpoints)} 場"
                                                if perf[i] < binary[-1] else "—")
        print(f"{c:>6}{binary[i]:>10.1f}{perf[i]:>10.1f}{binary[i] - perf[i]:>+9.1f}{ratio:>16}")

    print(f"\n分人看（訓練 160 場的平均絕對殘差）：")
    print(f"{'真實實力':>9}{'現行':>9}{'候選C':>9}{'改善':>8}")
    for i in range(len(TRUE_SKILLS)):
        b = statistics.mean(per_player[("bin", 160)][i])
        p = statistics.mean(per_player[("perf", 160)][i])
        print(f"{TRUE_SKILLS[i]:>9}{b:>9.1f}{p:>9.1f}{b - p:>+8.1f}")


def experiment_calibration(reps=25):
    """實驗 5：訓練後凍結評分，於全新比賽評估；掃描尺度校正倍率。"""
    print("\n=== 實驗 5：預測校準（訓練 400 場後凍結，於 300 場全新比賽評估）===\n")

    def evaluate(ratings, heldout, scale):
        scaled = {i: (1500.0 + (v - 1500.0) * scale, 50.0, DEF_V) for i, v in ratings.items()}
        return statistics.mean(
            brier(1.0 if sa > sb else 0.0, forecast(scaled, ta, tb))
            for ta, tb, (sa, sb) in heldout)

    scales = (1.0, 1.5, 2.0, 2.5, 3.0)
    acc = {(tag, s): [] for tag in ("bin", "perf") for s in scales}
    spread = {"bin": [], "perf": []}
    for rep in range(reps):
        seq = simulate_sequence(2000 + rep, 400, 0)
        heldout = simulate_sequence(9000 + rep, 300, 0)
        for tag, fn in (("bin", s_binary), ("perf", s_performance)):
            ratings = train(seq, fn)
            spread[tag].append(statistics.pstdev(list(ratings.values())))
            for s in scales:
                acc[(tag, s)].append(evaluate(ratings, heldout, s))

    print(f"{'放大倍率':>9}{'現行 Brier':>13}{'候選C Brier':>14}")
    for s in scales:
        print(f"{s:>9.1f}{statistics.mean(acc[('bin', s)]):>13.4f}"
              f"{statistics.mean(acc[('perf', s)]):>14.4f}")
    best_bin = min((statistics.mean(acc[("bin", s)]), s) for s in scales)
    best_perf = min((statistics.mean(acc[("perf", s)]), s) for s in scales)
    print(f"\n各自最佳： 現行 {best_bin[0]:.4f} @ ×{best_bin[1]}   "
          f"候選C {best_perf[0]:.4f} @ ×{best_perf[1]}")
    diffs = [p - b for b, p in zip(acc[("bin", best_bin[1])], acc[("perf", best_perf[1])])]
    print(f"各自最佳尺度下配對差（C − 現行）= {statistics.mean(diffs):+.5f}   t = {paired_t(diffs):+.2f}")
    print(f"學到的評分 sd： 現行 {statistics.mean(spread['bin']):.1f}   "
          f"候選C {statistics.mean(spread['perf']):.1f}   真實 {statistics.pstdev(TRUE_SKILLS):.1f}")


def main(argv):
    if len(argv) > 1:
        experiment_real(argv[1])
    else:
        print("（未提供 CSV，略過實驗 1）")
    experiment_simulation()
    experiment_conditional()
    experiment_recovery()
    experiment_calibration()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
