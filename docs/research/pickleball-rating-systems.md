# 匹克球評分系統調查與第三種候選

- **狀態**：外部調查與設計草案，2026-08-28。非權威，**未實作、未驗證**，不授權任何 rating 變更。
- **起因**：評估「把比分納入積分計算」時，除了既有的兩個候選之外是否還有別的做法。
- **重跑**：`python3 docs/research/scripts/performance-score.py`

## 為什麼看匹克球

匹克球與本專案的處境高度相似：以雙打為主（DUPR 有 90% 的資料來自雙打）、參與者混合搭檔、休閒與競技資料並存，而且**近年主流系統明確地把比分納入計算**。羽球圈少見公開的同類系統。

## 匹克球目前在用什麼

| 系統 | 演算法 | 是否用比分 | 備註 |
|---|---|---|---|
| **DUPR** | 改良版 Elo | **是**（2025-07 起） | 主流；雙打為主 |
| UTR-P | point-by-point | 是 | USA Pickleball 於 2024 取代 UTPR 後採用 |
| **WPR、VAIR** | **Glicko-2** | 否 | 與本專案相同的演算法族 |
| UTPR | — | — | 2024 廢止 |

值得記下的一點：**WPR 與 VAIR 用的就是 Glicko-2**。「用 Glicko 做雙打評分」在這個運動裡是主流做法之一，不是偏門選擇。

## DUPR 的形狀

2025 年 7 月改版後的核心機制是**比對實際得分與預期得分**，而不是勝負：

> DUPR ratings can now go up with a loss if you outperform expectations, or down with a win if you underperform.

公開的內容：

- 賽前以雙方隊伍**平均評分**算出預期得分；賽後比對實際得分決定升降。
- 唯一公開的常數：**0.1 DUPR ≈ 1.2 分（11 分制）**。
- 權重因素：賽事類型（自行登錄 < 俱樂部 < 錦標賽）、近期性、對手評分是否可靠、三局制權重高於單局。
- **Reliability Score**：60% 以上視為可靠；受場次數、近期性、對手多樣性、對手可靠度影響；閒置約半年可從 100% 掉到 60%；可靠度越高，單場移動越小。

**未公開**：確切公式、常數、單場移動上限、雙打隊伍平均的細節、新球員冷啟動方式。以下的推導是本文自行接續的，不是 DUPR 的實際演算法。

### Reliability Score 就是 RD 的重新發明

DUPR 的 Reliability Score 描述的行為——場次越多越穩定、閒置會衰退、對手可靠度會影響、越可靠則單場移動越小——**正是 Glicko 的 RD（rating deviation）**，而且 Glicko 的版本有理論依據並附帶 volatility。

本專案已經有 RD 與 volatility。這代表若要採用 DUPR 式的做法，**不需要換掉 rating 系統**，只需要換掉餵進去的觀測值。

## 換算到本專案的尺度

以 `docs/research/score-aware-margin-calibration.md` 擬合的 `beta = 0.2552`：

| | 1 分預期分差 ≈ |
|---|---|
| 本專案 15/2/21 | **31 Glicko 點** |
| 11 分制（匹克球近似） | 43 Glicko 點 |
| DUPR 公開值 | 0.083 DUPR |

局數越短，同樣的分差對應越大的評分差——符合直覺：11 分制裡贏 2 分比 15 分制裡贏 2 分更能說明問題。

## 候選 C：把觀測比分反解成「表現隱含的勝率」

Glicko-2 的更新量正比於 `s − E`，其中 `E` 是模型預期的勝率、`s` 是實際結果。目前 `s` 只有 1 或 0（`src/lib/glicko2.ts` 的 `scoreOf`）。

DUPR 的行為可以**在 Glicko-2 內部**取得，方法是把 `s` 換成「這場表現隱含的勝率」：

1. 由終局比分反解每球勝率的最大概似估計：`q̂ = a / (a + b)`
2. 用同一個終局分布動態規劃求 `s = P(win | q̂)`

該動態規劃已經以 TypeScript 實作於 `src/lib/expected-margin.ts`。

| 比分 | q̂ | s = P(win \| q̂) | 現行 s |
|---:|---:|---:|---:|
| 15:0 | 1.000 | 1.000 | 1.0 |
| 15:5 | 0.750 | 0.999 | 1.0 |
| 15:9 | 0.625 | 0.923 | 1.0 |
| 15:12 | 0.556 | 0.734 | 1.0 |
| 15:13 | 0.536 | 0.656 | 1.0 |
| 17:15 | 0.531 | 0.637 | 1.0 |
| 21:19 | 0.525 | 0.611 | 1.0 |
| 13:15 | 0.464 | 0.344 | 0.0 |
| 12:15 | 0.444 | 0.266 | 0.0 |
| 9:15 | 0.375 | 0.077 | 0.0 |

15:13 只給 0.656 而非 1.0；13:15 給 0.344 而非 0.0。**輸掉一場勢均力敵的球，評分仍可能上升**——正是 DUPR 的行為，但沒有換掉 rating 系統。

### 為什麼這比先前的候選 B 好

候選 B 是「隨手訂一個分差映射到 [0, 1] 的公式」。那會讓 `s` 與 `E` 不在同一個尺度上，Glicko 的殘差失去機率詮釋，變成啟發式。

候選 C 的 `s` 是**同一個機率量的變異數縮減估計量**：`E` 是「賽前預期的勝率」，`s` 是「由逐球表現反推的勝率」，兩者定義相同。這也正好對應校準文件量到的「完整比分約值 1.7 倍場數」——那 1.7 倍就是用 `q̂` 取代二元結果換來的。

### 實作範圍

`src/lib/glicko2.ts` 的 `scoreOf` 一個函式。RD、volatility、重播、活動邊界、歷史、CSV 全部不動。需要該場的賽制快照（PR #6 提供）；賽制未知時退回 1/0。

## 三個候選的比較

| | A：endpoint-gradient | B：隨手映射的軟分數 | **C：q̂ 反解** |
|---|---|---|---|
| 來源 | `feat/initial-skill-levels` 已實作 | 自行構想 | 本文，取自 DUPR 的形狀 |
| 是否換掉 Glicko | **是**（另一套系統） | 否 | 否 |
| 保留 RD／volatility | **否** | 是 | 是 |
| `s` 與 `E` 同尺度 | 不適用 | **否** | 是 |
| 需重新定義冷啟動 | **是** | 否 | 否 |
| 改動範圍 | 整個 rating 層 | 一個函式 | 一個函式 |
| 可逆 | 難 | 易 | 易 |

## 兩個尚未解決的問題

**1.「贏了卻掉分」對這個場合可能是負面的。** 調查來源直接記錄了社群反彈：休閒玩家不喜歡贏球後掉分，而高分玩家開始迴避較弱的對手以保護評分。DUPR 是競技排名系統，承受得起這個代價；本專案是球友打球順便記分，「你贏了但分數掉了」需要當場解釋，而且**若導致大家不想跟較弱的人打，就直接破壞了這個 App 的目的**。

這是產品決策，不是技術決策，應該先問過實際使用的球友。

**2. 沒有證據說它更準。** DUPR 不公開公式，上述推導是本文自行接續的。而校準文件的結論仍然成立：完整比分約值 1.7 倍場數，要證明預測有改善需要幾百場，目前只有 29 場。

## 決策順序

1. 先讓賽制快照上線並累積乾淨資料（PR #6）。
2. **累積至 200 場以上**後，在離線腳本裡以實際歷史跑 A/B：現行 1/0 版 vs 候選 C 的 `q̂` 版，比較 Brier 與 log-loss。兩邊各自調參後才比較，否則會重蹈校準文件記錄的學習率假象。
3. 在 A/B 顯示實質改善**之前**不要動 `scoreOf`。
4. 動之前先確認球友能接受「贏了可能掉分」。
5. 候選 A（換掉 Glicko）只有在候選 C 被證明不足時才考慮——它要求重新定義不確定性、冷啟動、閒置衰退與手動覆寫，成本高一個量級。

## 來源

- [How the DUPR Rating Algorithm Works — Pickleheads](https://www.pickleheads.com/guides/how-dupr-works)
- [New DUPR Pickleball Explained: July 2025 Algorithm Update — 11 Pickles](https://www.11pickles.com/post/new-dupr-pickleball-explained)
- [Cracking the DUPR Code — DUPR Blog](https://www.dupr.com/post/cracking-the-dupr-code-how-pickleballs-rating-system-shapes-the-game)
- [DUPR Reliability Score — DUPR Blog](https://www.dupr.com/post/introducing-the-dupr-reliability-score)
- [Pickleball Rating Systems — 11 Pickles](https://www.11pickles.com/post/pickleball-rating-system)
- [Pickleball Ratings: UTR-P vs DUPR — UTR Sports](https://www.utrsports.net/blogs/news/pickleball-rating-systems-utr-dupr-verification)

## 相關文件

- 校準結論與 beta 的來源：`docs/research/score-aware-margin-calibration.md`
- 終局分布動態規劃（TypeScript）：`src/lib/expected-margin.ts`
- 目前的 winner-only 更新：`src/lib/glicko2.ts` 的 `applyMatch` / `scoreOf`
