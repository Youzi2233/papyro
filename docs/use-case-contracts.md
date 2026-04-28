# App Use Case Contracts

本文定义 `crates/app` 当前 use case 的输入、输出、失败状态和允许更新的 state 范围。它约束 dispatcher 继续变薄，也约束 UI、desktop 启动参数和未来系统打开事件复用同一条应用层路径。

## Contract Rules

- UI 和宿主只提交 `AppAction` 或 app-level request，不直接调用 storage、platform 业务流程或 workspace flow。
- Dispatcher 只做路由、dirty flush gate、shell 文案选择和跨 handler 编排。
- Use case 的成功输出必须写入明确 state domain。失败时优先写 `status_message` 或对应 domain 的失败状态，不清空无关 state。
- 需要文件系统或 SQLite 的工作必须离开点击热路径。当前约定是 `spawn` + `tokio::task::spawn_blocking`，settings 持久化走 coalesced queue。
- 跨 workspace 或打开 workspace 前必须先 flush dirty tabs。flush 失败时停止后续 use case。

## State Domains

| Domain | Current signals | Scope |
| --- | --- | --- |
| Workspace | `file_state`, `workspace_search`, `workspace_watch_path` | workspace 列表、当前 workspace、file tree、recent files、tags、trash、search 结果和 watcher root。 |
| Document | `editor_tabs`, `tab_contents`, `pending_close_tab` | tab metadata、active tab、dirty/save status、document content、revision 和 stats。 |
| Chrome | `ui_state`, `pending_delete_path`, `pending_empty_trash`, `settings_persistence` | theme、layout/view settings、sidebar state、destructive action confirmation 和 settings save queue。 |
| Feedback | `status_message` | 用户可读的成功、失败和保护提示。 |

## Workspace Use Cases

| Use case | Input | Success output | Failure state | Allowed writes |
| --- | --- | --- | --- | --- |
| `OpenWorkspace` | Platform folder picker result. | Applies workspace bootstrap, clears editor tabs/content, resets workspace search, sets watcher path. | Picker cancel writes `status_message`. Bootstrap failures are represented by an applied error bootstrap. Dirty flush failure keeps current state. | Workspace, Document, Chrome settings, Feedback. |
| `OpenWorkspacePath` | Absolute or relative workspace path. | Same as `OpenWorkspace`, using the provided path. | Bootstrap failures are represented by an applied error bootstrap; async join errors write `status_message`. Dirty flush failure keeps current state. | Workspace, Document, Chrome settings, Feedback. |
| `RefreshWorkspace` | Current workspace path. | Reloads file tree/recent files/tags while preserving valid selection and expanded paths. | Missing workspace or reload error writes `status_message`. | Workspace, Feedback. |
| `SearchWorkspace` | Query string. | Empty query clears/starts search state. Non-empty query writes search results for the same query. | Missing workspace or search error writes `workspace_search` failure. | Workspace search only. |

## Markdown And Document Use Cases

| Use case | Input | Success output | Failure state | Allowed writes |
| --- | --- | --- | --- | --- |
| `OpenMarkdown` | `OpenMarkdownTarget { path }` from UI, startup request, Recent File, or future system open event. | Resolves workspace, bootstraps target workspace if needed, opens or activates tab, loads content/stats, updates recent files, selection, optional `ui_state`, and watcher path. | Non-Markdown path, failed workspace bootstrap, storage error, or dirty flush failure writes `status_message` and keeps existing tabs/content. | Workspace, Document, Chrome settings only when workspace changes, Feedback. |
| Startup Markdown opens | `DesktopStartupOpenRequest.markdown_paths`. | Runtime maps each path to `OpenMarkdownTarget` and runs `OpenMarkdown` sequentially. Startup bootstrap prefers known/default workspace before file parent fallback. | Same as `OpenMarkdown`. Empty request is a no-op. | Same as `OpenMarkdown`. |
| Running-instance system open | Pending platform event request. | Must submit only `OpenMarkdownTarget { path }`, not tab/window internals. | Pending. | Same as `OpenMarkdown` after implemented. |
| `ContentChanged` | `tab_id`, new content. | Updates document content/revision/stats freshness, marks tab dirty, schedules autosave. | Missing tab is a no-op. Autosave failure writes `status_message` and marks save failure. | Document, Workspace recent files on save success, Feedback. |
| `SaveActiveNote` / `SaveTab` | Active tab id or explicit tab id. | Saves current content, marks tab saved, updates title/recent files. | Missing workspace/tab/snapshot is a no-op. Storage failure writes `status_message` and marks save failure. | Document, Workspace recent files, Feedback. |
| `CloseTab` | `tab_id`. | Clean tab closes immediately. Dirty tab first records `pending_close_tab`, second close discards and closes. | Missing tab is a no-op. | Document, Chrome confirmation, Feedback. |
| `ExportHtml` | Active tab content. | Desktop build writes selected HTML file and reports success. | Mobile/non-desktop reports unavailable. Empty content reports `Nothing to export`; write failure reports `Export failed`. | Feedback only; reads Document. |

## File Tree Use Cases

| Use case | Input | Success output | Failure state | Allowed writes |
| --- | --- | --- | --- | --- |
| `CreateNote` | User-provided note name, normalized to `Untitled` fallback. | Creates file under selected directory/workspace, reloads tree, opens new tab with stats, selects new path. | Missing workspace/storage error writes `status_message`. | Workspace, Document, Feedback. |
| `CreateFolder` | User-provided folder name, normalized to `New Folder` fallback. | Creates folder, reloads tree, selects new folder. | Missing workspace/storage error writes `status_message`. | Workspace, Feedback. |
| `RenameSelected` | New name. | Renames selected note/folder, updates tree selection, open tab paths/titles/content references when needed. | Missing workspace/selection or storage error writes `status_message`. | Workspace, Document, Feedback. |
| `MoveSelectedTo` | Target directory path. | Moves selected note/folder, updates tree selection and open tab paths/content references when needed. | Missing workspace/selection, invalid target, or storage error writes `status_message`. | Workspace, Document, Feedback. |
| `DeleteSelected` | Current selection, repeated action for confirmation. | First call records `pending_delete_path`; second moves selection to trash, refreshes tree and closes affected tabs. | Missing workspace/selection or storage error writes `status_message` and clears pending confirmation when appropriate. | Workspace, Document, Chrome confirmation, Feedback. |
| `RestoreTrashedNote` | `note_id`. | Restores note, refreshes tree/trash, selects restored path. | Storage error writes `status_message`. | Workspace, Feedback. |
| `EmptyTrash` | Repeated action for confirmation. | First call records `pending_empty_trash`; second permanently deletes trashed notes and refreshes tree/trash. | Missing workspace, empty trash, or storage error writes `status_message` and clears/keeps confirmation as implemented. | Workspace, Chrome confirmation, Feedback. |
| `SetSelectedFavorite` | Boolean favorite flag. | Persists favorite flag for selected note and reports status. | Missing workspace, missing note selection, directory selection, or storage error writes `status_message`. Current implementation does not refresh tree metadata. | Feedback; storage metadata. |
| `ToggleExpandedPath` | File tree path. | Selects/toggles expanded path and persists tree state. | Missing workspace or save failure writes `status_message`. | Workspace tree state, Feedback. |
| `RevealInExplorer` | `FileTarget`. | Calls platform explorer reveal. | Platform error writes `status_message`. | Feedback only. |

## Tag Use Cases

| Use case | Input | Success output | Failure state | Allowed writes |
| --- | --- | --- | --- | --- |
| `UpsertTag` | Tag name and color. | Persists tag, reloads tag list into `file_state.tags`, reports success. | Missing workspace or storage error writes `status_message`. | Workspace tags, Feedback. |
| `RenameTag` | Existing tag id and new name. | Renames tag, rewrites references through storage, reloads tag list, reports success. | Same as `UpsertTag`. | Workspace tags, storage note metadata/content, Feedback. |
| `SetTagColor` | Tag id and color. | Updates color, reloads tag list, reports success. | Same as `UpsertTag`. | Workspace tags, Feedback. |
| `DeleteTag` | Tag id. | Deletes tag, rewrites references through storage, reloads tag list, reports success. | Same as `UpsertTag`. | Workspace tags, storage note metadata/content, Feedback. |

## Settings And Chrome Use Cases

| Use case | Input | Success output | Failure state | Allowed writes |
| --- | --- | --- | --- | --- |
| `SaveSettings` | Full `AppSettings`. | Applies global settings immediately and enqueues coalesced persistence. | Persistence failure later writes `status_message`; in-memory chrome remains applied. | Chrome, Feedback on async failure. |
| `SaveWorkspaceSettings` | `WorkspaceSettingsOverrides`. | Applies overrides immediately for current workspace and enqueues coalesced persistence. | Missing workspace writes `status_message`. Persistence failure later writes `status_message`; in-memory chrome remains applied. | Chrome, Feedback. |

## Refactor Checklist

- Adding an `AppAction` requires adding or updating a row in this document.
- A use case that writes a new signal must name its state domain here and in `docs/roadmap.md` if it changes Phase 1 scope.
- A UI component must not bypass these contracts by calling storage/platform directly.
- A desktop or platform integration must submit app-level requests, then let `crates/app` convert them to use cases.
