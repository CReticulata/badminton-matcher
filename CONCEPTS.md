# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## 活動與實力歷史

### 活動（Session）

一次有明確開始、參賽者集合與可選結束時間的羽球聚會；比賽、出席狀態及實力變動都歸屬於一個活動。

活動是實力歷史的固定邊界：活動內的歷史可重播，但已確立的下一活動開場不會被較早活動的修正改寫。

### 活動開場狀態（Session Opening State）

活動開始時固定保存的完整球員實力狀態，作為該活動所有實力變動與歷史重播的共同起點。

它不同於球員建立時的初始強度；前者屬於某次活動，後者只描述球員第一次進入系統時的起點。

### 活動參賽者（Session Participant）

曾加入某次活動的人，不因離場或重新加入而失去參賽者身分；首次加入順序用於整日摘要同分時的穩定排序。

舊資料若只能推測參賽者集合而不能可靠還原首次加入順序，仍可保留可靠的單場實力變動，但不宣稱整日摘要順序可信。

### 固化基準（Rating Baseline）

把某一時點的完整實力狀態保存為後續重播起點的事件，讓更早歷史可保留或清除而不再改變該基準之後的實力結果。
