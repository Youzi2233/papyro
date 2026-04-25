# Module Ownership

本文记录当前模块的责任归属、测试边界和拆分优先级。这里的 owner 指维护责任边界，不指具体个人。

新增模块时，至少要在本文件或模块头部注释中说明 owner、职责范围和主要验证方式。

## 最高拆分优先级

| 模块 | Owner | 当前问题 | 下一步 |
| --- | --- | --- | --- |
| `crates/app/src/workspace_flow.rs` | `crates/app` use case flow | 文件过长，集中承载 workspace、文件、tab 状态编排 | 拆为 `workspace/create.rs`、`workspace/open.rs`、`workspace/save.rs`、`workspace/rename.rs`、`workspace/delete.rs` |
| `crates/app/src/runtime.rs` | `crates/app` composition root | 同时承担 state 初始化、command 装配、watcher、export、settings | 迁出 `state.rs`、`actions.rs`、`dispatcher.rs`、`effects.rs`、`export.rs` |
| `crates/ui/src/components/editor/mod.rs` | `crates/ui` editor surface | 同时承担 tabbar、toolbar、preview、host、bridge、autosave、fallback | 拆为 `pane.rs`、`tabbar.rs`、`toolbar.rs`、`preview.rs`、`host.rs`、`bridge.rs`、`autosave.rs`、`fallback.rs` |

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
