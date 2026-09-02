# 輪替外卡驗收與發布狀態

## 目前狀態

- Implementation：完成（純 transform、store、chronology、lineage、cooldown、normalization、localStorage、CSV、preview-only audit UI）。
- Development／test acceptance：允許；用於驗證完整行為。
- Production generation：**未發布**。
- Production fairness band：`0.5` appearances/hour。
- Approval manifest：不存在；2026-09-02 representative study沒有候選同時通過effect與每-cell fairness gates。
- Release guard：無manifest時要求constant精確為`0.5`、`ROTATION_WILDCARD_GENERATION_RELEASED === false`，並驗證production bundle沒有`rotation-wildcard-generation-release-v1` marker；未來manifest的regression disclosures必須精確等於summary cells衍生的canonical清單。

## 行為驗收矩陣

| Surface | Acceptance |
|---|---|
| eligibility | canonical normal playing set只在等於同活動`completionSequence`兩場前actual playing set時有資格；不同集合、不同大小、少於兩場均不抽籤 |
| probability | 每次generate／regenerate獨立抽籤；雙打25%、單打12.5% |
| exchange | 均勻換出normal set一席、均勻換入其他eligible且非voluntary-rest一席；不得改第二席 |
| team split | 固定wildcard playing set後沿用Rating gap最佳值＋25 tolerance |
| lineage | team-side swap保留；移除exchange-in、恢復exchange-out或第三席異動立即清除 |
| cooldown | 有效completion設2；後續singles／doubles completion共用遞減；cancel／preview／regenerate不消耗 |
| degradation | fairness degraded時不抽籤且暫停倒數；repair後恢復原count；同毫秒repair以causal timestamp floor確保已完成prefix早於boundary，後續completion不早於新period events或live `startedAt`；一般操作不得以persisted future event前推trusted time，只有明確applied repair boundary可supersede corruption；不可安全遞增的timestamp在normalization fail closed |
| chronology | session-local positive unique `completionSequence`；score edit不變、delete留gap、legacy按`at + original row` migration |
| persistence | lineage、cooldown與high-water通過localStorage reload與CSV round-trip；present corruption fail closed |
| CSV restore | 完整checkpoint overwrite；確認前顯示backup activity／high-water影響並提供目前資料export；不顯示外卡cooldown |
| UI | 只有分組preview顯示`輪替外卡`與換入／換出；live、active session、history及CSV restore不顯示外卡、cooldown或fairness-degradation提示 |
| Rating | metadata與completion chronology不改Glicko、scoring snapshot、rating replay或manual-lineup sporting result |

## Production release boundary

`src/lib/rotation-wildcard-release-authority.ts`是唯一version-controlled release boolean authority。沒有一份有效manifest綁定通過門檻的candidate、report/summary digests、approver與source message時，該值必須維持`false`。`pnpm build`在Vite production build後執行：

1. production simulation import/artifact isolation verifier；
2. fairness-band／approval authority verifier；
3. production bundle wildcard-generation marker verifier。

Dev/test mode保留generation path，只為pre-release acceptance；這不授權部署、archive、commit、push或PR。

## Browser acceptance evidence

### 2026-09-02 — PASS

> 此段保留當時廣泛audit UI的headed驗收紀錄；其中live／history／cooldown／degradation可見性已被後續「僅preview顯示」決策取代，不代表目前UI。

- Driver：isolated `agent-browser` headed Chromium session（host-native Browser Use因localhost private-address policy在第一route前拒絕，依policy切換後未混用driver）。
- Server：development Vite `http://127.0.0.1:3000`；production generation仍由release flag移除。
- Viewport：913 × 927。
- Console：0 error；只有Vite connect debug訊息。
- Doubles repeat draw：6人、長／短公平期fixture形成canonical `A→B→A`；RNG=0實際產生`輪替外卡換入：球員5・換出：球員1`。
- Regeneration：相同eligible state下RNG=0.99 miss且badge消失；RNG=0再次hit且badge恢復，證明每次generate獨立抽籤。
- Manual invalidation：手動把exchange-in球員5與exchange-out球員1交換，preview保留但外卡evidence立即消失。
- Live／completion：valid wildcard preview開打後live顯示compact `輪替外卡`；完成後persisted cooldown精確為2。
- Shared cooldown／mode switch：其後完成一場singles使`2→1`，再完成一場doubles使`1→0`；zero state不顯示cooldown。
- Singles repeat draw：3人canonical `A→B→A` fixture、RNG=0實際產生`換入：單打3・換出：單打1`。
- Non-repeat／blocked draw：cooldown=2下切換singles產生正常proposal，preview沒有wildcard marker。
- Degradation／repair：結構合法但重播矛盾的duplicate-join fixture顯示total-count fallback及`外卡冷卻已暫停…剩1場`；接受`修復公平計算`後warning消失、rate UI恢復且cooldown仍為1。
- Reload／history：合法checkpoint reload後顯示cooldown 2；history只有wildcard record顯示`輪替外卡`與換入／換出，manual record無marker。
- CSV checkpoint restore：older backup modal明示完整overwrite、backup cooldown 0、next sequence 1與目前狀態會被取代；`先匯出目前資料`不覆蓋，確認後active state回到cooldown 0／sequence 1。
- Legacy CSV：舊header、同timestamp兩rows成功migration為原row order sequences 1、2，且兩場`rotationWildcard`皆為null。
- Rating non-interference：兩個opening Ratings、最終teams與21:18比分完全相同的ended sessions，只在一場加入valid wildcard metadata；history兩場均顯示`+162,+162,-162,-162`，wildcard場只增加audit marker與exchange pair。

這些是development acceptance evidence，不是production release或部署證明。

### 2026-09-02 — Preview-only UI scope

- `PreviewView`保留`輪替外卡`與實際換入／換出。
- `MatchDisplay`、`HistoryView`、`SessionView`及CSV restore dialog不再顯示外卡標籤、交換資訊、cooldown或fairness-degradation／repair提示。
- lineage、cooldown、degradation fallback、persistence與CSV資料仍完整保留；本次只縮減可見UI，不改演算法或稽核資料。

## Independent exact-tree review

### 2026-09-02 — PASS

- 最終read-only review回報零項P0–P3 findings，涵蓋stochastic boundary、canonical 29-cell release evidence、migration／CSV atomicity、causal-time safe／incrementable domain、completion chronology、history window、future-timestamp fail-closed、lineage/cooldown UI truthfulness及Glicko replay isolation。
- Exact-tree gates：37 files／403 tests；typecheck、production build/isolation、release authority、strict OpenSpec與`git diff --check`全部通過。
- Production仍為band `0.5`、wildcard generation `false`、approval manifest absent；review closure不構成release、部署、archive、commit、push或PR授權。
