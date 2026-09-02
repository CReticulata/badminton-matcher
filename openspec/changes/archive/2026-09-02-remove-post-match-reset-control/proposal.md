## Why

Live-match overlay目前顯示「賽後重置」選單，讓正在進行的對戰畫面承擔非必要的公平期管理操作，增加誤觸與操作負擔。RW-55要求移除此入口，讓對戰畫面只保留取消與結束比賽的核心操作。

## What Changes

- 移除live-match overlay底部的「賽後重置」選單及其參賽者重置按鈕。
- 移除只服務該入口的component callback與computed state。
- 保留active SessionView「更多 → 重置上場率」入口、確認流程、queued reset資料模型及既有公平期語義。
- 不修改已完成比賽、Rating、上場率計算、persistence、CSV或replay。

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `time-normalized-rotation`: 公平期重置仍是active-session的per-participant secondary action，但live-match overlay不再顯示賽後重置控制項。

## Impact

- UI：`src/components/MatchDisplay.vue`。
- Tests：live overlay SSR／mounted contracts；active SessionView reset入口須保留coverage。
- 無API、資料模型、migration、persistence、Rating或matchmaking影響。
