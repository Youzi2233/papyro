# Runtime State Domains

本文把当前 `crates/app/src/state.rs` 的单窗口 `RuntimeState` 映射到后续要拆出的状态域。它补充 [session-model.md](session-model.md) 的进程/窗口边界，也为 [use-case-contracts.md](use-case-contracts.md) 的 allowed writes 提供更细的归属。

当前阶段仍保留一个聚合 `RuntimeState`。本文不是要求立刻改代码，而是定义新增字段、移动字段和 UI 订阅收敛时必须遵守的目标结构。

## Target Domains

| Domain | Owns | Does not own | Current fields |
| --- | --- | --- | --- |
| `WorkspaceState` | 当前 workspace、file tree、expanded/selected path、recent files/workspaces view、trash、tags、workspace search、watcher root。 | 文档正文、tab dirty 状态、theme/sidebar chrome、CodeMirror host 实例。 | `file_state`, `workspace_search`, `workspace_watch_path` |
| `DocumentState` | 当前窗口 tabs、active tab、tab content、revision、stats、save status、close confirmation。 | file tree 展开状态、settings persistence、editor iframe/webview runtime readiness。 | `editor_tabs`, `tab_contents`, `pending_close_tab` |
| `ChromeState` | 当前窗口 theme/view/sidebar/layout preferences、destructive action confirmation、status feedback、settings persistence queue。 | Markdown content、workspace scan results、editor host registry。 | `ui_state`, `pending_delete_path`, `pending_empty_trash`, `status_message`, `settings_persistence` |
| `EditorRuntimeState` | Editor host lifecycle、bridge map、runtime ready/error/loading state、command cache、warm/hidden host policy。 | Document truth, save status, workspace metadata, persisted settings. | UI-local `EditorBridgeMap`, `EditorRuntimeState`, host items and command cache under `crates/ui/src/components/editor/*` |

## Current Aggregation

`RuntimeState` 当前是临时的单窗口聚合：

```text
RuntimeState
├─ WorkspaceState candidates: file_state, workspace_search, workspace_watch_path
├─ DocumentState candidates: editor_tabs, tab_contents, pending_close_tab
├─ ChromeState candidates: ui_state, pending_delete_path, pending_empty_trash,
│  status_message, settings_persistence
└─ EditorRuntimeState candidates: not stored in crates/app yet; currently UI-local
```

Phase 1 仍是单窗口语义，因此当前聚合结构可以保留。新增代码描述 ownership 时仍应使用上面的目标 domain 名称。

## Domain Rules

- `WorkspaceState` may select files and refresh metadata, but it must not mutate document content directly. Opening a note goes through the `OpenMarkdown` use case because it crosses workspace and document domains.
- `DocumentState` is the source of truth for unsaved text. It must remain window-local and must not move into process-wide shared state.
- `ChromeState` may change layout and preferences immediately, then persist recoverable settings asynchronously. It must not trigger document derivation work by itself.
- `EditorRuntimeState` is disposable runtime machinery. It may recreate hosts and replay commands from document truth, but it must not become the source of truth for Markdown content.
- `status_message` is currently part of `ChromeState` because it is current-window feedback. Future multi-window work must keep it window-local.
- `settings_persistence` is currently stored in `RuntimeState` for convenience. Long term it belongs near `ProcessRuntime` storage coordination, but UI writes still enter through `SaveSettings` / `SaveWorkspaceSettings`.

## UI Subscription Rules

- Layout components should consume view models or narrow memos before raw signals.
- Workspace UI should prefer `WorkspaceViewModel` and workspace commands.
- Editor chrome should prefer `EditorViewModel` / `EditorSurfaceViewModel`.
- Header, sidebar, status bar and settings entry points should read only the chrome/document/workspace slices they render.
- A component that needs signals from multiple domains should be treated as an orchestration component and kept shallow.

## Migration Order

1. Keep `RuntimeState` as the internal aggregate while use case contracts stabilize.
2. Move UI reads to view models and narrow memos before moving fields.
3. Extract code-level domain structs only when call sites already align with this document.
4. Move `EditorRuntimeState` contracts into app/runtime only after host lifecycle and warm host policy are observable.
5. Move settings persistence toward process runtime after single-instance/system-open routing exists.

## Checklist For New State

- Name the target domain before adding a field.
- State whether the field is process-local, window-local, workspace-local or document-local.
- Add or update a use case contract if an action writes the field.
- Prefer derived view models for UI reads.
- Avoid sharing unsaved document content across windows or process-level services.
