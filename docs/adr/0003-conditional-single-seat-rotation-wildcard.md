# ADR 0003: 以條件式單席輪替外卡降低兩回合分組重複

## Status

Accepted for implementation; production generation withheld — representative study無合格候選，production維持`0.5`

## Context

目前配對先以最低值錨定的上場率公平層決定輪替，再比較連續上場場數，最後才在公平等價者之間用 Rating 平衡與隨機決定人選及分隊。這項順序能保護短期公平，但名單與出席狀態對稱時，會自然產生週期性分組；八人雙打尤其容易由兩個固定四人集合交替上場。

可考慮直接放寬每小時 0.5 場的公平帶、完全隨機抽取整個上場名單、完全隨機分隊，或只為八人加入特例。單獨放寬公平帶無法保證真正打破週期，也會把公平退讓套用到每次正常配對；完全隨機會同時犧牲多席輪替公平與隊伍平衡；八人特例則無法解釋為通用產品規則。

需求討論另外確認：重新產生分組可以重新抽籤；同一人可能在獨立外卡中重複被換出；這些隨機尾端風險被明確接受，但必須以單席偏離、完成歸因、共用冷卻與模擬 guardrail 限縮並揭露。

## Decision

- 「兩回合上場集合重複」定義為本回合實際上場者 ID 集合與同一活動兩場之前已完成比賽的實際上場者 ID 集合完全相同；不比較排列、隊伍、比分或來源，也不跳過不同模式另找同模式比賽。
- 每筆 Match 增加活動內 `completionSequence`，Session 增加下一個可用 sequence high-water mark；t／t−2、連續上場與模擬皆依此排序。完成時配置並遞增，比分修改不變，刪除不回收。舊資料按 `at` 升冪、同 timestamp 沿用原持久列順序一次性配置。欄位保存於既有 localStorage 與 CSV，不新增檔案；Glicko replay 不讀取此順序。
- 正常分組仍先完整依上場率公平層、連續上場場數與 Rating 平衡產生。只有正常上場集合將構成兩回合重複時，才有資格抽「輪替外卡」。這項條件適用所有人數，不建立八人分支。
- 每次符合資格的分組產生都是獨立抽籤：雙打 25%，單打 12.5%。使用者重新產生分組時可以重新抽；機率語義是「每次產生」，不是「每場」。第一版不提供機率或冷卻設定 UI。
- 中籤後只改一席：從正常上場者中均勻隨機換出一人，從其他目前在場、可上場且未自願休息者中均勻隨機換入一人。沒有可換入者時不套用外卡。不同外卡之間保持獨立均勻抽樣，不加入換出者防重複袋。
- 上場者確定後仍使用既有 Rating 總和差與 25 分 balance-equivalence tolerance 分隊；輪替外卡不授權完全隨機或容差外分隊。
- 外卡來源保存正常上場集合、換入者與換出者。只有最終上場集合精確等於「正常集合減去換出者再加入換入者」時，才記為「輪替外卡比賽」。只交換隊伍不改變集合，因而保留來源；移除換入者、讓換出者上場或另行更換第三席都會立即取消來源。純手動調組不是外卡。
- 完成輪替外卡比賽後，活動層級共用冷卻設為 2。其後每完成一場單打或雙打便減一；強制記錄但不計 Rating 的比賽仍消耗冷卻。取消、未完成、分組預覽與重新產生不消耗。
- 冷卻是向前推進的營運狀態，不由可編輯歷史反推。比分修改或歷史刪除不得回溯重設、增加或減少目前冷卻。新活動從 0 開始。
- CSV 匯入沿用產品既有的完整 checkpoint 覆蓋還原語意，而非 merge：匯入較舊有效備份可以把 active cooldown、completion sequences 與 high-water mark 一起回到備份匯出時。確認畫面必須明示這些營運狀態會被覆蓋、顯示備份 cooldown 並提供先匯出目前資料；任何 present 欄位損毀都在替換前 fail closed。
- 公平降級期間停用輪替外卡並暫停冷卻倒數；修復後沿用原剩餘值。舊資料不推測外卡，升級中的活動冷卻初始化為 0。
- 預覽明示換入／換出，對戰畫面顯示精簡外卡標記，活動畫面顯示剩餘冷卻，歷史保留外卡與交換證據。來源、冷卻與完成 metadata 經 localStorage、reload 與 CSV round-trip 保存。
- 外卡 metadata 不參與上場率、Glicko-2、賽制快照或 Rating replay。相同最終實際分組與比分必須與手動調組產生完全相同的上場歸屬及 Rating 結果。
- 公平帶仍維持所有人數與模式共用的一個最低值錨定固定值，不依人數動態調整，也不提供 UI 設定。
- production 公平帶不得由討論直覺或模擬程式自動選定。先以 `0、0.25、0.5、0.75、1、1.5、2、3、4、6、8` 場／小時執行 paired A/B/C/D 決定性模擬；其中 A 為現行 0.5／無外卡，B 為候選帶／無外卡，C 為 0.5／有外卡，D 為候選帶／有外卡。
- 模擬涵蓋雙打 4–16 人、單打 2–10 人、出席變化、可變時長、混合模式、自願休息，以及等強、連續與極端 Rating 分布。主指標只比較已完成 actual playing set(t) 與 actual playing set(t−2)；normal proposal 與 t−2 actual 的相等只作 trigger fidelity 診斷。promotion 分母按每一個另有可換入者的回合判定，無 replacement capacity 的回合另列 no-op control。
- Simulation cell 是模式／人數／出席型態／比賽時長型態／Rating 分布的完整組合；每個 promotion cell 使用同一組至少 500 個固定 seed，且每個 `(cell, seed)` 必須恰有 A/B/C/D 四個 counterpart。效果先在 seed 內算 eligible-opportunity actual repeat rate，再取 cell 內 seed 平均，最後各 cell 等權平均；D 必須相對 A 至少降低 25%。公平 gate 在每個 cell 內分別對 paired D−A maxima 使用無插值 nearest-rank p95，累積上場短缺與最長連續非自願休息各自都不得多於一場；任何 cell 失敗即拒絕。pooled／opportunity-weighted 結果只作 sensitivity，p99 與最壞案例只作揭露。
- 只有同時通過所有門檻的候選可被推薦。即使通過，仍須建立版本控制的 machine-readable approval manifest，以報告與 summary 的精確 SHA-256 digest、核准值、human approver 與來源訊息身份綁定另一次產品所有者核准。build/release guard 必須重算 digest 並驗證 production constant；manifest 缺失或無效時只允許 `0.5`，任何不一致都 fail closed。輪替外卡可先在 `0.5` 下開發與測試，但依已定案的共同 release 邊界，不得在核准公平帶之前獨立發布。
- 2026-09-02 representative study完成29個等權cells、每cell 500 paired seeds與638,000 primary rows。沒有候選同時通過效果與每-cell公平門檻，因此`recommendedCandidateBand = null`，不建立approval manifest。production constant保留`0.5`，`ROTATION_WILDCARD_GENERATION_RELEASED`保留false；build/release guard同時驗證authority狀態與production bundle不存在generation marker。dev/test可驗收完整能力，但這不構成production發布。

## Consequences

- 正常公平仍是 baseline authority；隨機公平退讓只在已觀察到的 `A → B → A` 集合重複即將再次發生時，以一席為上限。
- 八人固定兩組是主要改善案例，但 5 人、10 人、單打或其他人數使用同一集合比較、一席交換與模式機率契約。
- 重新產生可以提高累積中籤率，使用者實際上能主動追求變化；UI 與規格必須誠實表達「每次產生」機率。
- 獨立均勻抽樣允許同一人多次成為換出者，沒有逐人硬保證；公平代價以 cooldown、paired p95 guardrail、p99／最大值揭露與 production 核准邊界管理。
- 冷卻不隨歷史刪除回溯，因此目前營運狀態可能無法只由目前可見比賽重建；這是刻意避免歷史編輯改寫已經發生的自動權限狀態。
- 「向前」只約束同一目前 checkpoint 內的操作；使用者明確執行完整 CSV restore 時，所有資料回到備份 checkpoint，包括較低冷卻。這避免在純 localStorage 產品中另造不可回滾的外部權威。
- 資料模型、CSV、migration、UI 與 store 需要新增外卡 lineage 及 cooldown，但 Glicko 與 Rating replay 不增加新權威來源。
- 同 timestamp 或 CSV 重排不再改變輪替用的 t−2；代價是 Match 與 Session 各增加一個小整數欄位及 legacy migration／blocked validation。
- 公平帶選值與外卡效果必須以 A/B/C/D 分離報告，避免把改善或傷害錯誤歸因給其中一項。
- 模擬是一次性、可重跑、決定性的離線證據，不進入 production bundle，也不取得執行或發布權。

## References

- OpenSpec change：`openspec/changes/reduce-repeating-lineups/`
- 領域詞彙：`CONTEXT.md` 的「兩回合上場集合重複」、「輪替外卡」、「輪替外卡分組」、「輪替外卡比賽」與「輪替外卡冷卻」
- 上場率事件權威：`docs/adr/0002-event-sourced-play-rate-fairness.md`
- 現行配對設計：`design.md` 的「賽程與分組」
- Jira：RW-51、RW-52、RW-53
