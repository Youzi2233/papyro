# Session Model

本文定义 Papyro 的进程、窗口、workspace、document 和 editor runtime 边界。它是 Phase 1 的架构门控文档，用来约束后续 `OpenMarkdown`、系统文件打开、Tabs 语义和未来 MultiWindow 行为。

当前实现仍是单主窗口 Tabs 语义。本文描述的是目标边界和当前映射，不表示 Phase 1 已经实现多窗口。

## 目标

- 让 storage、settings、recent metadata 等进程共享资源与窗口内编辑状态分离。
- 让 tab、document content、chrome state 和 editor host 明确属于一个窗口。
- 让系统双击 Markdown、文件树、Quick Open、Search 和 Recent File 未来都进入同一条 path-based open use case。
- 为 MultiWindow 保留身份边界，但不在 Phase 1 启用多窗口行为。

## 概念

### `ProcessRuntime`

`ProcessRuntime` 是一个 Papyro 进程内共享的应用级运行环境。

它可以拥有：

- storage handle 和 repository adapter。
- platform adapter。
- app settings cache。
- settings persistence queue。
- recent files 和 recent workspaces metadata。
- effective note open mode。
- 已运行实例的外部打开事件入口。
- window registry，用于未来 MultiWindow 路由。

它不拥有：

- 未保存 document content。
- active tab。
- editor tabs。
- tab contents。
- window chrome state。
- pending close/delete state。
- CodeMirror host instance。

### `WindowSession`

`WindowSession` 是一个窗口内的交互和编辑会话。

它可以拥有：

- `window_id`。
- shell mode，例如 desktop 或 mobile。
- active workspace。
- editor tabs。
- tab contents。
- active tab id。
- chrome state，例如 sidebar、modal、theme effect 输入。
- pending close/delete state。
- workspace search UI state。
- editor runtime host registry。

它可以引用：

- `ProcessRuntime` 提供的 storage、platform 和 settings metadata。

它不应该共享：

- `tab_contents`。
- dirty document content。
- active tab。
- CodeMirror host map。

### `WorkspaceSession`

`WorkspaceSession` 表示一个窗口正在浏览和编辑的 workspace。

它可以拥有：

- workspace path 和 metadata。
- file tree。
- selected path。
- expanded paths。
- trash、tags、favorites 等 workspace view state。
- watcher subscription。
- workspace search index state。

当前实现里，这些状态主要分布在 `FileState`、`WorkspaceSearchState` 和 watcher effect 中。未来可以把它们收敛为明确的 workspace domain。

### `DocumentSession`

`DocumentSession` 表示一个 tab 内的文档会话。

它可以拥有：

- tab id。
- note id。
- path。
- title。
- content snapshot。
- revision。
- dirty/save/conflict state。
- stats cache。
- selection、scroll、undo restoration metadata。

当前实现里，`EditorTabs` 保存 tab metadata，`TabContentsMap` 保存 content、revision 和 stats。未来的 path-based open use case 应输出或更新一个 `DocumentSession`。
非活动 tab 的 selection、scroll 和 undo 保存边界见 [editor-runtime-cache-policy.md](editor-runtime-cache-policy.md)。

### `EditorRuntimeSession`

`EditorRuntimeSession` 表示一个浏览器编辑器 host 实例。

它可以拥有：

- host instance id。
- tab id。
- runtime ready/error state。
- visible state。
- view mode。
- layout size。
- command dedupe cache。
- selection/scroll bridge metadata。

它不拥有：

- 文档保存状态。
- workspace 状态。
- 文件写入能力。
- document content 的业务真相。

JavaScript runtime 只能处理浏览器编辑能力，例如 input、selection、IME、scroll、decoration、format command。Rust 仍是 document content、save state、tab state 和 workspace state 的真相来源。
当 host 退出 warm pool 时，未来只能把轻量 viewport metadata 回传给 Rust，不能把 document content 或保存状态转移给 JS runtime。

## 共享与独立状态

| 状态 | 归属 | 当前映射 | 规则 |
| --- | --- | --- | --- |
| storage handle | `ProcessRuntime` | `Arc<dyn NoteStorage>` | 进程共享，可以被多个窗口引用。 |
| platform adapter | `ProcessRuntime` | `Arc<dyn PlatformApi>` | 进程共享，平台行为通过 app use case 调用。 |
| app settings metadata | `ProcessRuntime` | `UiState.global_settings` + persistence queue | 设置可共享，当前窗口先使用内存态，后台持久化。 |
| recent files/workspaces | `ProcessRuntime` | `FileState.recent_*` | metadata 可共享，但打开行为必须进入目标窗口 use case。 |
| effective note open mode | `ProcessRuntime` | 尚未实现 | Phase 5 后读取，当前运行窗口不迁移。 |
| active workspace | `WindowSession` | `FileState.current_workspace` | 每个窗口独立。 |
| file tree | `WorkspaceSession` | `FileState.tree` | 属于当前窗口的 workspace view。 |
| editor tabs | `WindowSession` | `EditorTabs` | 每个窗口独立。 |
| tab contents | `WindowSession` / `DocumentSession` | `TabContentsMap` | 不跨窗口共享，不能放进进程级状态。 |
| active tab | `WindowSession` | `EditorTabs.active_tab_id` | 每个窗口独立。 |
| chrome state | `WindowSession` | `UiState` + narrow memos | 每个窗口独立，持久化只保存可恢复偏好。 |
| pending close/delete | `WindowSession` | `pending_close_tab` / `pending_delete_path` | 每个窗口独立。 |
| editor host registry | `EditorRuntimeSession` | editor bridge map / host items | 每个窗口独立，host instance id 不能跨窗口复用。 |

## 当前 `RuntimeState` 映射

当前 `crates/app/src/state.rs` 的 `RuntimeState` 是临时的单窗口 runtime 聚合。它目前同时承担 `WindowSession` 和部分 `ProcessRuntime` 输入的职责。

| `RuntimeState` 字段 | 当前职责 | 目标归属 |
| --- | --- | --- |
| `file_state` | workspace metadata、file tree、recent metadata | `WorkspaceSession`，其中 recent metadata 未来应靠近 `ProcessRuntime` |
| `editor_tabs` | tabs、active tab、save status | `WindowSession` |
| `tab_contents` | content、revision、stats | `WindowSession` / `DocumentSession` |
| `ui_state` | settings、workspace overrides、chrome/editor preferences | 拆为 `WindowSession` chrome/editor preferences + `ProcessRuntime` settings metadata |
| `workspace_search` | 当前 workspace 搜索 UI 和结果 | `WorkspaceSession` |
| `status_message` | 当前窗口 status message | `WindowSession` |
| `pending_close_tab` | 当前窗口 tab close confirmation | `WindowSession` |
| `pending_delete_path` | 当前窗口 file delete confirmation | `WindowSession` |
| `pending_empty_trash` | 当前窗口 trash confirmation | `WindowSession` |
| `settings_persistence` | settings 后台保存队列 | `ProcessRuntime`，当前仍挂在单窗口 `RuntimeState` 上 |

迁移原则：

- 先把语义写清楚，再移动代码。
- Phase 1 只要求当前单窗口实现遵守边界，不启用 MultiWindow。
- `RuntimeState` 可以继续存在，但新增字段必须先说明目标 domain。
- 任何未保存内容都不能迁到进程级共享状态。

## 身份规则

### `window_id`

未来每个 `WindowSession` 必须有稳定 `window_id`。当前单窗口可以使用固定值，例如 `main`，但代码不应假设 tab id 等同 window id。

规则：

- `window_id` 标识窗口。
- `tab_id` 标识窗口内 tab。
- `note_id` 标识 workspace 中的笔记。
- `workspace path` 标识 workspace 根目录。
- `host instance id` 标识一个 CodeMirror host 实例。

### `window registry`

`WindowSessionRegistry` 是 `ProcessRuntime` 里的窗口路由表。当前实现位于 `crates/core/src/session.rs`，只承担身份和路由元数据，不启用 MultiWindow 行为。

它可以记录：

- 已注册的 `WindowSessionId`。
- 当前获得焦点的窗口。
- 某个文档窗口对应的 `document_path`。
- 某个窗口关联的 `workspace_path`。

它不拥有：

- `EditorTabs`。
- `TabContentsMap`。
- dirty document content。
- pending close/delete state。
- chrome state。
- CodeMirror host instance。

当前单窗口映射使用固定 `main` 窗口。Tabs 模式下，Markdown 打开请求始终路由到当前 focused window。未来 MultiWindow 模式下，重复打开同一 `document_path` 时应先聚焦已有文档窗口；没有已有窗口时，再创建新的文档窗口。

这条边界的目的不是提前实现多窗口，而是防止后续把 dirty 内容或 editor host 放进进程级共享状态。注册表只能回答“哪个窗口应该接收这个打开请求”，不能直接修改窗口内编辑状态。

### `tab_id`

`tab_id` 只能在所属窗口内唯一。它不能用于：

- 定位其他窗口。
- 表示进程级 document identity。
- 作为外部打开事件的目标。

如果未来 MultiWindow 中两个窗口打开同一个 note，它们必须有不同 `tab_id` 和独立 `tab_contents`。

### `note_id` 和 path

`note_id` 是 workspace 内的笔记身份。path-based open use case 需要先解析 path，再决定：

- 是否属于当前 workspace。
- 是否是 Markdown 文件。
- 是否对应已有 note。
- 是否激活已有 tab 或创建新 tab。

系统双击和外部打开只能提交路径，不应该指定 tab 或 window 内部状态。

## 打开请求路由

所有 Markdown 打开入口最终都应该进入同一个 app use case：

```text
OpenMarkdownTarget { path }
-> crates/app use case
-> resolve workspace / note / file type
-> update current WindowSession tabs
-> update recent metadata through ProcessRuntime storage
```

入口包括：

- 文件树打开笔记。
- Quick Open。
- Workspace Search。
- Recent File。
- 系统双击 `.md` / `.markdown`。
- 启动参数中的 Markdown 路径。
- 已运行实例收到的系统打开事件或后续单实例转发请求。

当前阶段规则：

- 总是落到当前主窗口 Tabs 语义。
- 同一窗口重复打开同一 note，激活已有 tab。
- 打开失败不清空已有 tab。
- 非 Markdown 文件给出明确错误。
- 另一个 workspace 的文件打开需要先完成 dirty flush 或保护提示。

## `note_open_mode` 门控

`note_open_mode` 是进程级 effective mode，不属于 Phase 1 实现范围。

当前 `AppSettings.note_open_mode` 已保留持久化字段，默认值是 `Tabs`。它是软件级全局设置，不属于 `WorkspaceSettingsOverrides`，workspace scope 不能覆盖它。`ProcessRuntimeSession` 会记录 configured mode 和 effective mode；在多窗口窗口体可用前，当前 runtime 会把 effective mode 明确钉在 `Tabs`，继续按单主窗口 Tabs 语义执行。

启用 MultiWindow 前必须完成：

- `WindowSession` 代码边界。
- window registry。
- 外部打开事件路由。
- dirty tab flush 和保存冲突策略。
- 同一 note 多窗口编辑的 mtime/hash 冲突检测。
- platform 层文件打开事件抽象。

设置页未来可以修改持久化配置，但当前运行窗口不迁移。新的 effective mode 只在下次启动或新 process runtime 初始化时生效。

## 当前阶段不变量

- 当前只支持单主窗口 Tabs 语义。
- `apps/desktop` 只解析启动参数和系统文件打开事件，不直接调用 UI command。
- 已运行实例外部打开事件先进入 app-level request channel，再由 runtime 复用 `OpenMarkdown`。
- `apps/desktop` 必须把打开请求交给 `crates/app`。
- `crates/app` 负责把路径请求转成 use case。
- `crates/ui` 只发 command，不拥有 storage 或 platform 业务真相。
- `crates/editor` 和 JS runtime 不写文件。
- Chrome lane 更新不能触发 document 派生任务。
- Document 派生任务不能阻塞当前可编辑 surface。

## 后续实现顺序

1. 在 `crates/app/src/actions.rs` 增加 `OpenMarkdown(OpenMarkdownTarget)`。
2. 在 `workspace_flow/open.rs` 增加 path-based open use case。
3. 将 `OpenNote(FileNode)` 兼容入口转成 path-based open。
4. 让文件树、Quick Open、Search 和 Recent File 共用 `OpenMarkdownTarget`。
5. 让 `apps/desktop` 解析启动参数，并提交 app-level open request。
6. 让已运行实例外部打开事件通过 request channel 注入 runtime，并复用 `OpenMarkdownTarget`。
7. 在完成保存冲突和 window registry 后，再引入 MultiWindow 行为。
