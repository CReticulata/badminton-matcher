## Why

現行最低值錨定的上場率公平層會在名單與出席狀態對稱時自然產生週期性分組；八人雙打尤其容易形成兩個固定四人集合交替上場。這個結果符合現行短期公平定義，卻降低實際共同上場組合的變化，因此需要在可量測的公平退讓範圍內加入通用的反重複機制，並以模擬選定新的固定公平帶。

## What Changes

- 先建立決定性 simulation-first 評估，分離比較現行公平帶／候選公平帶與有／無輪替外卡的 A/B/C/D 組合；在使用者核准模擬建議值前，不授權 production 公平帶變更。
- 將所有人數共用的固定上場率公平帶由硬編碼 `0.5` 改為經模擬與明確核准選定的產品常數；不新增設定 UI，也不加入八人特例或依人數動態調整。
- 新增「輪替外卡」：只有正常上場集合將與前兩場的上場集合完全相同、活動不在冷卻且公平資料可靠時，才進行機率抽籤。
- 雙打每次符合資格的分組產生使用 25% 機率；單打使用 12.5%。每次重新產生均為新的獨立抽籤。
- 外卡中籤時，只從正常上場者均勻換出一人，並從其他可上場且非自願休息者均勻換入一人；選定上場者後仍使用既有 Rating 平衡與 `+25` 容差分隊。
- 只有原外卡換入／換出關係保留到完成比賽時才建立外卡完成紀錄並啟動活動層級兩場冷卻；單打與雙打共用冷卻。取消、未完成、純手動調組、比分修改與歷史刪除不得捏造或回溯冷卻。
- 輪替外卡、換入／換出者與冷卻狀態在預覽、對戰、活動及歷史 UI 中明示，並通過 localStorage、App reload 與 CSV round-trip 保存。
- 公平降級期間停用輪替外卡並暫停冷卻遞減；新活動重置冷卻。舊資料不推測外卡，升級中的活動從零冷卻開始。
- 不改變 Glicko-2、Rating replay、活動開場快照、比分處理或手動調組權限。
- 輪替外卡可在現行 `0.5` 公平帶下開發與驗證，但依產品決策不得獨立發布；production release 必須等待公平帶模擬、明確核准及 machine-readable approval manifest 的 build/release guard 同時通過。

## Capabilities

### New Capabilities
- `rotation-wildcard`: 條件式單席輪替外卡、完成歸因、共用冷卻、UI 可見性、持久化、CSV 與舊資料語意。

### Modified Capabilities
- `time-normalized-rotation`: 將固定公平帶的選值納入 simulation-first 核准門檻，並定義公平降級期間外卡與冷卻的互動。
- `calibrated-team-balance`: 允許已核准的輪替外卡在正常公平名單外替換一席，但保留選定上場者後的既有 Rating 平衡與 `+25` 容差。

## Impact

- Offline evidence and tests: deterministic simulation harness、候選公平帶掃描、A/B/C/D 比較、seed 分布與可稽核報告。
- Matchmaking: `src/lib/matchmaking.ts` 的公平帶注入與輪替外卡純函式；現有 seeded RNG 契約需保留。
- Session state: `src/store.ts` 的資格判定、外卡 proposal/live/completed lineage、活動層級冷卻與公平降級暫停。
- Data model and compatibility: optional session/match metadata、localStorage normalization/migration、CSV export/import；舊紀錄不得推測外卡。
- UI: 分組預覽、對戰畫面、活動畫面與歷史頁的繁體中文外卡／冷卻狀態。
- Rating authority: Glicko-2、Rating 更新與 replay 邊界不變；同一最終實際分組仍產生與手動調組相同的 Rating 結果。
- Jira traceability: RW-51 是可見成果；RW-52 負責 simulation-first 公平帶選值，RW-53 的原始「完全隨機抽四人並隨機分隊」由條件式單席輪替外卡取代。

### Explicit non-goals

- 不加入八人專用規則、依人數動態公平帶或使用者可調機率／冷卻設定。
- 不完全隨機抽取整個上場名單，不完全隨機分隊，也不限制既有手動調組權限。
- 不用 Python 或任何離線模型取得 production matchmaking authority；模擬只提供核准證據。
- 本 change 的第一階段不自行選定或部署新的公平帶；若沒有候選值同時通過效果與公平門檻，流程停止。
