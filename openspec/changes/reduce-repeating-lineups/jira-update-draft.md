# Jira 更新草案（尚未寫入）

本檔僅保存討論後的 Jira 更新草案。未取得另一次明確批准前，不修改 RW-51、RW-52、RW-53 的描述、留言、關聯或狀態。

## RW-51 建議留言

已完成需求 grilling，並建立 repo-local OpenSpec change：`openspec/changes/reduce-repeating-lineups/`。

### 定案方向

- 主要問題指標：「兩回合上場集合重複」；八人雙打是重點案例，但不建立八人特例。
- 每筆 Match 在既有 localStorage／CSV 內增加 session-local `completionSequence`，Session 增加下一個序號 high-water mark；t／t−2 與連續上場依此排序。同 timestamp 舊資料按時間與原 row order 一次性 migration；不新增檔案，也不改 Glicko replay。
- 先依現行公平序位產生正常名單；只有正常上場集合將與兩場之前的實際上場集合完全相同時，才有資格抽「輪替外卡」。
- 每次符合資格的分組產生獨立抽籤：雙打 25%、單打 12.5%；重新產生可以重抽。
- 中籤後只均勻隨機換出正常名單一人、換入其他可上場且未自願休息者一人；其後仍使用既有 Rating 平衡與 +25 容差分隊。
- 只有最終上場集合精確等於「正常集合減去換出者再加入換入者」才算外卡比賽；另換第三席會取消外卡來源，純手動調組不算。
- 完成外卡比賽後，單打與雙打共用活動層級冷卻 2 場。冷卻向前持久保存，比分修改或歷史刪除不回溯；新活動重置。
- CSV 匯入維持完整 checkpoint 覆蓋還原：有效舊備份可把 cooldown 與 completion sequence 回到備份匯出時。確認畫面明示並顯示備份 cooldown、提供先匯出目前資料；損毀資料在替換前 fail closed。
- 公平降級期間停用外卡並暫停冷卻。
- 預覽、對戰、活動與歷史都明示外卡／冷卻；metadata 經 localStorage、reload 與 CSV round-trip 保存；舊資料不推測。
- Glicko-2、Rating replay、賽制快照、活動開場邊界與 unrestricted manual lineup authority 不變。

### 驗收與執行邊界

- 輪替外卡可在 production 0.5 場／小時下開發與驗證；但依共同 release 決策，不得獨立發布。先完成 RW-52 的 A/B/C/D 決定性模擬；沒有使用者對固定公平帶選值的另一次明確核准與有效 machine-readable approval manifest，production 必須維持 0.5，且 wildcard release gate 不得通過。
- 模擬與完整 implementation checklist 見 OpenSpec `proposal.md`、`design.md`、三份 delta specs 與 `tasks.md`。
- 架構決策見 `docs/adr/0003-conditional-single-seat-rotation-wildcard.md`；領域詞彙見 `CONTEXT.md`。

建議 RW-51 目前維持原狀態；可以開始 simulation-first 與 wildcard 的非發布實作，但 production transition 必須等待模擬報告、公平帶核准及 build/release guard 一起通過。

## RW-52 建議留言／描述替換草案

### 目標

以決定性、paired simulation 選擇一個所有人數與單／雙打共用的固定上場率公平帶；不依人數動態調整，也不提供設定 UI。

### 候選值

`0、0.25、0.5、0.75、1、1.5、2、3、4、6、8 場／小時`

### 方法

對每個候選分開比較：

- A：現行 0.5，無輪替外卡
- B：候選公平帶，無輪替外卡
- C：現行 0.5，有輪替外卡
- D：候選公平帶，有輪替外卡

場景至少涵蓋：雙打 4–16 人、單打 2–10 人；固定出席、遲到、離場／重返、自願休息、可變時長、混合模式；等強、連續與極端 Rating 分布。

### Promotion gates

- 主效果只比較完成後 actual lineup(t) 與 actual lineup(t−2)；normal proposal 與 t−2 actual 的相等只作 trigger fidelity 診斷。
- promotion 分母按每回合是否另有可換入者判定；無 replacement capacity 的回合另列 no-op control。
- Cell 是模式／人數／出席型態／時長型態／Rating 分布的完整組合；每個 cell 使用同一組至少 500 seeds，且每個 `(cell, seed)` 恰有 A/B/C/D，否則 fail closed。
- 效果先取每個 cell 的 seed 平均，再讓所有 cell 等權；D 相對 A 的平均兩回合 actual 上場集合重複率至少降低 25%。
- 每個 cell 分別用無插值 nearest-rank p95；最倒楣參賽者累積上場短缺與最長連續非自願休息都最多比 A 多 1 場，任何 cell 失敗即拒絕。
- pooled／opportunity-weighted 結果只作 sensitivity，不能推翻 cell gate。
- p99、最壞案例及所有人數／出席切片必須揭露。
- 沒有候選同時通過就停止，不選「最不差」的值。
- 即使通過，仍需產品所有者以精確 report／summary SHA-256 digest、核准值、human approver 與來源訊息身份建立 machine-readable approval manifest。build/release guard 必須重算 digest 並驗證 constant；manifest 無效或缺失時只允許 production 0.5，模擬不得自行選值。

完整 evidence contract 與 tasks：`openspec/changes/reduce-repeating-lineups/`。

## RW-53 建議描述替換草案

### 輪替外卡

1. 先產生完整正常分組。
2. 只有正常上場集合將與兩場之前已完成比賽的實際上場集合完全相同、公平資料可靠、冷卻為 0 且另有可換入者時才抽籤。
3. 每次產生分組獨立抽籤：雙打 25%、單打 12.5%；重新產生可重抽。
4. 中籤後從正常上場者均勻換出 1 人，從其他目前在場、可上場且未自願休息者均勻換入 1 人；不得替換第二席。
5. 換完後仍使用既有 Rating 平衡與 +25 容差分隊；不完全隨機抽整組、不完全隨機分隊。
6. 預覽保存正常集合、換入者、換出者；只有目前集合精確等於「正常集合減去換出者再加入換入者」才保留來源。只交換隊伍不影響；把換入者移出、讓換出者上場或另換第三席都取消來源。
7. 只有保留交換關係並完成的比賽才記為輪替外卡比賽，並啟動活動層級、單／雙打共用的 2 場冷卻。
8. 強制記錄但不計 Rating 的完成比賽會消耗冷卻；取消、未完成、預覽、重新產生與純手動調組不消耗或啟動冷卻。
9. 比分修改、歷史刪除不回溯冷卻；新活動重置；公平降級期間外卡與冷卻暫停。
10. 預覽、對戰、活動、歷史、localStorage、reload、CSV 與 legacy migration 行為依 OpenSpec `rotation-wildcard` delta spec 驗收。

此草案取代原先「25% 完全隨機抽四人並隨機分隊、冷卻三場」的方案。
