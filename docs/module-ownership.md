# Module Ownership

本文记录当前模块的责任归属、测试边界和拆分优先级。这里的 owner 指维护责任边界，不指具体个人。

新增模块时，至少要在本文件或模块头部注释中说明 owner、职责范围和主要验证方式。

## 当前收敛优先级

| 模块 | Owner | 当前问题 | 下一步 |
| --- | --- | --- | --- |
| `crates/app/src/dispatcher.rs` | `crates/app` action dispatcher | 仍是主要分发热点，settings、workspace、editor、export 等动作集中在同一文件 | 按 handler 领域继续下沉分发细节，保留 dispatcher 作为薄路由层 |
| `crates/app/src/workspace_flow.rs` + `workspace_flow/*` | `crates/app` use case flow | 顶层 facade 已拆出 create/open/save/rename/delete/move/reload，但 support 和跨用例 helper 仍偏重 | 继续让 `support.rs` 只保留测试与共享 fixture，把业务 helper 移到对应用例模块 |
| `crates/ui/src/context.rs` | `crates/ui` app boundary | `AppContext` 已有 `workspace_model`、`editor_model`、`editor_surface_model` 和窄 chrome memo，但仍暴露 raw signals | 逐步用 view model + action facade 替代组件直接读写 raw signal |
| `crates/ui/src/components/editor/*` | `crates/ui` editor surface | editor surface 已拆成 pane/tabbar/host/bridge/preview/outline/fallback，活跃 host 数也已 bounded | 下一步关注 preview/outline 派生任务化，以及保留 selection/scroll 的 warm host 策略 |

## 当前模块 Owner

| 模块 | Owner | 主要验证 |
| --- | --- | --- |
| `apps/desktop` | desktop shell | `cargo check -p papyro-desktop`，desktop startup tests |
| `apps/mobile` | mobile shell | `cargo check -p papyro-mobile` |
| `crates/app` | application composition and use cases | workspace flow tests，dependency check |
| `crates/core` | domain models and pure state rules | unit tests for state transitions |
| `crates/ui` | Dioxus 0.7 layouts and components | `cargo check -p papyro-ui`，future UI smoke tests |
| `crates/editor` | Markdown parsing, rendering and editor protocol | parser/renderer tests，future protocol tests |
| `crates/storage` | SQLite, filesystem and watcher adapters | storage integration tests |
| `crates/platform` | desktop/mobile platform capability adapters | adapter tests and platform smoke checks |

## 新增模块要求

新增模块必须说明：

- owner：该模块属于哪一层。
- scope：模块负责什么，不负责什么。
- validation：至少一种固定检查方式。
- dependency rule：是否符合 `scripts/check-workspace-deps.js` 中的依赖方向。

## 当前删除策略

Phase 1 仍沿用现有直接删除实现，删除操作必须由 UI 入口触发确认或显式动作。Phase 4/7 引入回收站或安全删除前，应用层不得静默批量删除，也不得绕过 `delete_selected_path` 这一用例入口。
