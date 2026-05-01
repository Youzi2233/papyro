# Papyro Architecture Onboarding

[简体中文](zh-CN/architecture.md) | [Documentation](README.md)

This guide is meant to teach the project, not just list folders. After reading it, a new contributor should understand:

- what kind of app Papyro is
- why the project uses Rust, Dioxus, and JavaScript together
- how clicks, typing, saving, previewing, and editor events move through the system
- what each crate owns
- how Rust and the CodeMirror JavaScript runtime communicate
- where future work such as file association, multi-window mode, theming, and Hybrid editing belongs

If this is your first time in the repository, read this guide in order. Then use [development standards](development-standards.md), [roadmap](roadmap.md), [editor guide](editor.md), and [performance budget](performance-budget.md) for task-specific work.

## 1. One Sentence

Papyro is a local-first Markdown workspace app.

More concretely:

- user notes are real `.md` files in real folders
- SQLite stores metadata such as workspaces, recent files, tags, settings, and recovery drafts
- Rust owns application state, file operations, storage, safety, and user flows
- Dioxus 0.7 lets us write UI components in Rust and render them into a desktop WebView
- CodeMirror owns complex browser editing behavior such as input, selection, IME, undo, highlighting, and decorations
- JavaScript owns the editor runtime because CodeMirror, Mermaid, KaTeX, and DOM editing APIs live in the browser ecosystem

```mermaid
flowchart TD
    product["Product experience<br/>local Markdown notes"]
    rust["Rust application core<br/>state, flows, storage, safety"]
    webview["WebView layer<br/>Dioxus UI + CodeMirror JS runtime"]

    product --> rust --> webview
    webview --> rust --> product
```

## 2. Vocabulary

| Term | Meaning |
| --- | --- |
| Workspace | A folder selected by the user. File tree, search, and watcher state center on it. |
| Note | A Markdown file, usually `.md` or `.markdown`. |
| Tab | An open document in the current window. It tracks path, dirty state, and save state. |
| Content | The current text for a tab. It may not be saved to disk yet. |
| Dirty | The tab has unsaved changes. Failed writes must keep the tab dirty. |
| Shell | A platform entry point such as `apps/desktop` or `apps/mobile`. |
| Runtime | The shared signals, commands, effects, and context created by `crates/app`. |
| View model | A UI-friendly projection of state from `crates/ui/src/view_model.rs`. |
| Editor runtime | The CodeMirror runtime built from `js/src/editor.js`. |
| Protocol | The command/event structs passed between Rust and JavaScript. |

## 3. Startup Flow

Desktop startup:

```mermaid
sequenceDiagram
    participant User
    participant Desktop as apps/desktop
    participant App as crates/app
    participant Storage as crates/storage
    participant UI as crates/ui
    participant JS as js/editor bundle

    User->>Desktop: cargo run -p papyro-desktop
    Desktop->>Desktop: configure window, icon, menu, assets
    Desktop->>Desktop: inject /assets/editor.js
    Desktop->>App: launch DesktopApp
    App->>Storage: bootstrap workspace/settings/recovery
    Storage-->>App: WorkspaceBootstrap
    App->>UI: provide AppContext
    UI->>JS: create EditorHost when a tab is visible
    JS-->>UI: runtime_ready
```

Desktop workspace selection is explicit:

- a startup Markdown file wins, and Papyro picks the deepest known workspace that contains it
- `PAPYRO_WORKSPACE` is the only environment-provided default workspace
- without a startup file or environment default, Papyro resumes the most recent workspace
- on a true first run, Papyro starts with no workspace and shows the onboarding empty state

The desktop app intentionally does not scan the process current directory as an implicit workspace.
This keeps `cargo run` and packaged launches from accidentally indexing a large project folder.

Key files:

| Step | File |
| --- | --- |
| Desktop launch | `apps/desktop/src/main.rs` |
| Desktop app entry | `crates/app/src/desktop.rs` |
| Runtime and context | `crates/app/src/runtime.rs` |
| Initial state | `crates/app/src/state.rs` |
| Desktop layout | `crates/ui/src/layouts/desktop_layout.rs` |
| Editor pane | `crates/ui/src/components/editor/pane.rs` |
| Editor host bridge | `crates/ui/src/components/editor/host.rs` |

Mobile also uses `crates/app` and `crates/ui`, but today it is a shared-runtime development entry, not a production mobile product.

## 4. Why Rust + Dioxus + JavaScript?

This is the most important architectural choice in Papyro. It is not accidental mixing. It is a boundary decision.

### Rust owns trusted application behavior

Rust owns:

- filesystem reads and writes
- SQLite metadata
- workspace scanning
- save, rename, move, delete flows
- recovery drafts
- dirty/save/conflict state
- testable Markdown-derived logic
- safe wrappers around platform APIs

These areas need reliability, strong tests, and clear ownership.

### Dioxus owns Rust-authored UI

Dioxus lets the project write UI in Rust while rendering into a WebView.

Papyro uses Dioxus 0.7:

- components are Rust functions returning `Element`
- local state uses `Signal<T>`
- derived state uses `use_memo`
- side effects use `use_effect`
- UI talks to the app layer through `AppContext` and `AppCommands`

This keeps the UI close to Rust state without turning the whole app into a JavaScript frontend.

### JavaScript owns browser editor mechanics

Complex text editing is a browser ecosystem strength.

CodeMirror already solves hard problems:

- cursor and selection behavior
- IME composition
- undo/redo history
- syntax parsing and highlighting
- layout and scroll behavior
- decorations and widgets
- search UI
- paste and keyboard handling

Mermaid, KaTeX, and many Markdown editor integrations also live naturally in JS/DOM.

Writing all of this from scratch in Rust would be expensive and unlikely to match mature editor behavior. Papyro therefore uses:

- Rust for application truth and data safety
- JavaScript for browser editor interaction
- a typed JSON protocol between them

## 5. Repository Map

```text
.
├─ apps/
│  ├─ desktop/             # desktop shell: window, launch args, assets, system events
│  └─ mobile/              # mobile shell: mobile assets and shared runtime mount
├─ crates/
│  ├─ app/                 # runtime, dispatcher, handlers, effects, use cases
│  ├─ core/                # models, state structs, traits, pure rules
│  ├─ ui/                  # Dioxus components, layouts, view models, i18n
│  ├─ storage/             # SQLite, filesystem, watcher, workspace scan
│  ├─ platform/            # dialogs, app data, reveal, external links
│  └─ editor/              # Markdown summary, HTML render, protocol structs
├─ js/                     # CodeMirror runtime source, tests, build script
├─ assets/                 # shared generated/static assets
├─ scripts/                # CI and local validation scripts
├─ skills/                 # project-local AI skills
└─ docs/                   # current documentation
```

## 6. Dependency Direction

```mermaid
flowchart TD
    desktop["apps/desktop"]
    mobile["apps/mobile"]
    app["crates/app"]
    ui["crates/ui"]
    core["crates/core"]
    storage["crates/storage"]
    platform["crates/platform"]
    editor["crates/editor"]
    js["js"]

    desktop --> app
    mobile --> app
    app --> ui
    app --> core
    app --> storage
    app --> platform
    app --> editor
    ui --> core
    ui --> editor
    storage --> core
    platform --> core
    editor --> core
    js -. build output .-> assets
```

Rules:

- `core` must not depend on Dioxus, storage, platform, or JS.
- `ui` must not write files directly.
- `storage` must not know UI layout.
- `platform` must not mutate app state directly.
- `js` must not save files directly.
- After dependency direction changes, run `node scripts/check-workspace-deps.js`.

## 7. Layer Responsibilities

### `apps/desktop`

The desktop shell owns:

- logging setup
- native window title, size, icon, and menu configuration
- runtime asset sync
- `/assets/editor.js` injection
- startup Markdown path collection
- system opened-file event handling
- mounting `papyro_app::desktop::DesktopApp`

It must not own shared workspace flow, save logic, file tree state, or tab content state.

### `apps/mobile`

The mobile shell owns:

- mobile CSS and asset injection
- brand asset context
- mounting `papyro_app::mobile::MobileApp`

It should not fork desktop business logic.

### `crates/app`

The application layer is the orchestration center.

| File | Role |
| --- | --- |
| `runtime.rs` | creates runtime signals, memos, context, and effects |
| `state.rs` | defines runtime signal groups |
| `actions.rs` | defines app-level actions |
| `dispatcher.rs` | routes actions to handlers and effects |
| `handlers/*` | connects actions, state, storage, and platform |
| `workspace_flow/*` | owns file/workspace/tab use cases |
| `effects.rs` | owns autosave, watcher, flush-on-close, runtime side effects |
| `settings_persistence.rs` | batches settings writes |
| `open_requests.rs` | normalizes external Markdown open requests |

The app layer keeps UI away from storage and keeps storage away from UI.

### `crates/core`

The core layer owns stable data and pure rules:

- `Workspace`
- `NoteMeta`
- `FileNode`
- `EditorTab`
- `AppSettings`
- `FileState`
- `EditorTabs`
- `TabContentsMap`
- `UiState`
- `NoteStorage`
- `ProcessRuntimeSession`

If logic can be tested without Dioxus, filesystem APIs, or platform APIs, it may belong in `core`.

### `crates/ui`

The UI layer owns Dioxus rendering:

- layouts
- header, sidebar, editor, settings, search, command palette, recovery, trash
- theme classes and primitives
- `AppContext`
- `AppCommands`
- view models
- i18n text

Good UI code reads view models, renders components, and sends commands.

### `crates/storage`

Storage owns persistence:

- SQLite schema and migrations
- workspace metadata
- note metadata
- recent files
- tags
- settings
- recovery drafts
- Markdown file reads and writes
- workspace scanning
- watcher event mapping
- search helpers

Data safety rule: failed writes must not clear dirty state.

### `crates/platform`

Platform owns system integration:

- app data directory
- folder and file dialogs
- reveal in explorer
- external URL opening
- desktop opened URL extraction

These APIs are wrapped so app flows can be tested.

### `crates/editor`

Editor owns Rust-side Markdown capability:

- document statistics
- outline extraction
- Hybrid block analysis
- Preview HTML rendering
- code highlighting theme decisions
- Rust/JS protocol structs

`crates/editor` is not the CodeMirror runtime. The CodeMirror runtime lives in `js/`.

### `js/`

The JS directory owns browser editor runtime code.

| File | Role |
| --- | --- |
| `js/src/editor.js` | runtime entry, registers `window.papyroEditor` |
| `js/src/editor-core.js` | testable editor core functions |
| `js/src/editor-media.js` | Mermaid, KaTeX, image, and table widgets |
| `js/src/editor-theme.js` | CodeMirror theme and highlight style |
| `js/test/editor-core.test.js` | JS unit tests |
| `js/build.js` | builds and syncs generated editor assets |

Only edit `js/src/*` by hand. Do not edit generated `assets/editor.js` directly.

## 8. Runtime State

`crates/app/src/state.rs` defines `RuntimeState` as a group of Dioxus signals:

```text
RuntimeState
├─ file_state              # workspace, tree, selection, recent files
├─ process_runtime         # process session and open mode
├─ editor_tabs             # open tabs and active tab
├─ tab_contents            # tab content and revision
├─ ui_state                # theme, settings, view mode, chrome state
├─ workspace_search        # workspace search
├─ recovery_drafts         # recovery draft list
├─ status_message          # visible status text
├─ workspace_watch_path    # current watcher path
├─ pending_close_tab       # close confirmation
├─ pending_delete_path     # delete confirmation
├─ editor_runtime_commands # Rust-to-JS editor command queue
└─ settings_persistence    # background settings save queue
```

The state is split so unrelated UI areas do not invalidate each other:

- file tree changes should not rebuild CodeMirror
- typing should not rerender the whole sidebar
- theme changes should not recompute Markdown preview
- tab switching should not rescan the whole workspace

## 9. UI-To-App Data Flow

```mermaid
flowchart LR
    component["Dioxus component"]
    command["AppCommands"]
    action["AppAction"]
    dispatcher["AppDispatcher"]
    handler["handler"]
    flow["workspace_flow"]
    storage["storage/platform"]
    state["RuntimeState"]
    viewmodel["view model memo"]
    rerender["UI rerender"]

    component --> command --> action --> dispatcher --> handler --> flow
    flow --> storage
    flow --> state
    state --> viewmodel --> rerender
```

Example: create a new note.

1. UI calls `commands.create_note.call(name)`.
2. `AppCommands` reaches `AppDispatcher`.
3. Dispatcher routes `AppAction::CreateNote`.
4. Handler calls `file_ops::create_note`.
5. Workspace flow asks storage to create the file.
6. Success updates `FileState`, `EditorTabs`, and `TabContentsMap`.
7. View models recompute.
8. UI shows the new tab and file tree entry.

## 10. Save Flow

```mermaid
sequenceDiagram
    participant JS as CodeMirror JS
    participant Host as EditorHost
    participant Commands as AppCommands
    participant App as AppDispatcher
    participant Flow as workspace_flow/save
    participant Storage as crates/storage
    participant State as RuntimeState

    JS->>Host: content_changed
    Host->>Commands: content_changed.call(...)
    Commands->>App: AppAction::ContentChanged
    App->>State: update tab content and dirty state
    App->>Flow: autosave or manual save
    Flow->>Storage: write_note(...)
    alt success
        Storage-->>Flow: SavedNote
        Flow->>State: mark saved, refresh metadata
    else conflict or failure
        Storage-->>Flow: error/conflict
        Flow->>State: keep dirty, mark conflict/failed
    end
```

The important boundary:

- JS reports content changes.
- Rust decides when to save.
- storage writes to disk.
- failed saves keep dirty state.

## 11. Why The Editor Protocol Exists

Rust and JavaScript should not know each other's internal objects. They communicate through explicit message types in `crates/editor/src/protocol.rs`:

- `EditorCommand`: Rust sends this to JS.
- `EditorEvent`: JS sends this to Rust.

Benefits:

- JSON structure is testable.
- Fields stay stable.
- new capabilities have a clear change point.
- JS does not know Rust state internals.
- Rust does not know CodeMirror object internals.

## 12. How Rust Starts The JS Editor

The key file is `crates/ui/src/components/editor/host.rs`.

Each editable tab gets an `EditorHost`. It:

1. creates a DOM container id such as `mn-editor-{tab_id}`
2. runs a bridge script with `document::eval`
3. waits for `window.papyroEditor`
4. calls `window.papyroEditor.ensureEditor(...)`
5. calls `window.papyroEditor.attachChannel(tabId, dioxus)`
6. receives `runtime_ready`
7. listens for JS events
8. sends commands with `eval.send(EditorCommand::...)`

```mermaid
sequenceDiagram
    participant Rust as EditorHost Rust
    participant Eval as Dioxus document::eval
    participant JS as window.papyroEditor
    participant CM as CodeMirror EditorView

    Rust->>Eval: inject bridge script
    Eval->>JS: ensureEditor(tabId, containerId, content, mode)
    JS->>CM: create or reuse EditorView
    Eval->>JS: attachChannel(tabId, dioxus)
    JS-->>Rust: dioxus.send(runtime_ready)
    Rust->>JS: eval.send(set_view_mode)
    JS-->>Rust: dioxus.send(content_changed)
```

The `dioxus` object is provided by Dioxus eval:

- JS calls `dioxus.send(value)`, Rust receives with `eval.recv::<EditorEvent>().await`.
- Rust calls `eval.send(command)`, JS receives with `await dioxus.recv()`.

## 13. How JS Registers The Runtime

`js/src/editor.js` registers:

```javascript
window.papyroEditor = {
  ensureEditor,
  handleRustMessage(tabId, message) { ... },
  attachChannel(tabId, dioxus) { ... },
  attachPreviewScroll,
  navigateOutline,
  syncOutline,
  scrollEditorToLine,
  scrollPreviewToHeading,
  renderPreviewMermaid,
};
```

| Function | Purpose |
| --- | --- |
| `ensureEditor` | create or reuse a CodeMirror `EditorView` |
| `attachChannel` | store the Dioxus communication object |
| `handleRustMessage` | handle Rust commands |
| `syncOutline` | sync active heading state |
| `navigateOutline` | jump to an outline heading |
| `renderPreviewMermaid` | render Mermaid in Preview |

## 14. Rust-To-JS Commands

`EditorCommand` includes:

| Command | Purpose |
| --- | --- |
| `SetContent` | replace editor content from Rust |
| `SetViewMode` | update Source / Hybrid / Preview runtime mode |
| `SetBlockHints` | send Rust-derived Markdown block hints |
| `SetPreferences` | update editor preferences |
| `InsertMarkdown` | insert Markdown at the current selection |
| `ApplyFormat` | apply bold, italic, link, heading, etc. |
| `Focus` | focus the editor |
| `Destroy` | destroy or recycle the editor host |

Commands are usually sent from:

- `crates/ui/src/components/editor/host.rs`
- `crates/ui/src/commands.rs`
- `crates/app/src/dispatcher.rs`

## 15. JS-To-Rust Events

`EditorEvent` includes:

| Event | Trigger |
| --- | --- |
| `RuntimeReady` | CodeMirror runtime is ready |
| `RuntimeError` | JS runtime failed |
| `ContentChanged` | user input changed document text |
| `SaveRequested` | JS captured a save shortcut |
| `PasteImageRequested` | user pasted or dropped an image |

Most input follows this path:

```mermaid
sequenceDiagram
    participant CM as CodeMirror updateListener
    participant JS as editor.js
    participant Rust as EditorHost
    participant App as AppCommands

    CM->>JS: docChanged
    JS->>Rust: dioxus.send(content_changed)
    Rust->>App: commands.content_changed.call(...)
    App->>App: mark dirty + update content
```

## 16. Why Hybrid Needs Rust Block Hints

Hybrid mode is not just CSS.

It needs to know the source ranges for:

- heading
- list
- task list
- blockquote
- code fence
- table
- math
- Mermaid

Rust analyzes these in `crates/editor/src/parser/blocks.rs` and produces `MarkdownBlockHintSet`.

Flow:

```text
active document snapshot
-> analyze_markdown_block_snapshot_with_options
-> MarkdownBlockHintSet
-> EditorHost
-> EditorCommand::SetBlockHints
-> JS decorations/widgets
```

Why not all JS?

- Rust already needs Markdown stats, Preview, Outline, and large-document policy.
- block hints can align with Rust document revisions.
- large-document fallback is easier to centralize.

Why not all Rust?

- CodeMirror decorations, selection, widgets, DOM hit testing, and scroll live in JS.
- Browser editor behavior would be awkward to drive directly from Rust.

Hybrid is therefore Rust analysis plus JS presentation.

## 17. Preview Versus Hybrid

| Capability | Preview | Hybrid |
| --- | --- | --- |
| Editable | no | yes |
| Primary rendering | Rust HTML | CodeMirror decorations/widgets |
| Mermaid | JS-assisted render | JS widget/edit state |
| Truth source | Rust tab content | Rust tab content plus JS input events |

Preview uses `pulldown-cmark` and `syntect` on the Rust side, then JS helps with Mermaid and scroll/outline behavior.

Hybrid keeps CodeMirror as the editor and uses Rust block hints to make Markdown feel more document-like.

## 18. Why Editor Hosts Are Reused

Creating a CodeMirror `EditorView` is expensive. It builds DOM, syntax state, plugins, listeners, and layout caches.

Papyro therefore keeps a host lifecycle and spare pool:

- opening a tab tries to reuse an existing editor view
- hidden tabs keep their host
- closed tabs are destroyed or recycled after a delay
- sidebar, theme, and status changes should not rebuild the editor

Relevant files:

- `crates/ui/src/components/editor/pane.rs`
- `crates/ui/src/components/editor/host.rs`
- `js/src/editor.js`
- `js/src/editor-core.js`

## 19. Workspace, Tabs, And File Association

Current model:

- `FileState` stores current workspace, file tree, selected path.
- `EditorTabs` stores open tabs and active tab.
- `TabContentsMap` stores tab contents.
- `workspace_watch_path` stores the current watcher path.

OS Markdown open flow:

1. desktop receives opened-file event
2. event becomes `MarkdownOpenRequest`
3. app determines the target workspace
4. app bootstraps or reloads that workspace if needed
5. app opens or activates the tab
6. sidebar file tree follows the tab's workspace
7. switching tabs also switches visible workspace context
8. watcher subscriptions follow the active workspace path

```mermaid
flowchart TD
    os["OS opens file.md"]
    desktop["apps/desktop event"]
    request["MarkdownOpenRequest"]
    dispatcher["AppDispatcher"]
    flow["open_markdown_target flow"]
    file_state["FileState workspace/tree"]
    tabs["EditorTabs active tab"]
    watcher["workspace watcher"]

    os --> desktop --> request --> dispatcher --> flow
    flow --> file_state
    flow --> tabs
    flow --> watcher
```

This matters for multi-workspace tabs and future multi-window behavior.
Opening a file in another workspace must preserve existing tabs; the active
tab path is the source of truth for the sidebar tree and watcher context.

## 20. Why Settings Should Become A Window

Today settings still live in the main UI chrome.

The target design:

- main window focuses on writing and workspace navigation
- Settings becomes an independent tool window
- settings update a process-level `ProcessRuntime`
- the main window reacts live without remounting the editor
- settings sections keep a stable window size

This reduces editor distraction and prepares the app for multi-window mode.

## 21. Where To Start For Common Tasks

| Task | Start here | Also check |
| --- | --- | --- |
| UI layout/style | `crates/ui/src/components` | `assets/main.css`, `apps/*/assets/main.css` |
| Theme tokens or Markdown visual style | [theme-system.md](theme-system.md) | `assets/main.css`, `js/src/editor-theme.js` |
| New UI command | `crates/ui/src/commands.rs` | `crates/app/src/actions.rs` |
| New app behavior | `crates/app/src/dispatcher.rs` | `handlers/*`, `workspace_flow/*` |
| File operation | `crates/app/src/workspace_flow` | `crates/storage/src/fs` |
| Save behavior | `workspace_flow/save.rs` | `crates/storage/src/lib.rs` |
| File tree behavior | `crates/ui/src/components/sidebar` | `crates/core/src/file_state.rs` |
| Markdown Preview | `crates/editor/src/renderer/html.rs` | `crates/ui/src/components/editor/preview.rs` |
| Hybrid editing | `crates/editor/src/parser/blocks.rs` | `js/src/editor.js`, `js/src/editor-core.js` |
| Paste/selection/IME | `js/src/editor-core.js` | `js/test/editor-core.test.js` |
| Settings field | `crates/core/src/models.rs` | settings UI and storage settings |
| OS file open | `apps/desktop/src/main.rs` | `crates/app/src/open_requests.rs`, `dispatcher.rs` |

## 22. Standard Feature Path

Example: adding a callout block.

1. Define the product behavior in roadmap or an issue.
2. Pick the UI entry, such as toolbar, command palette, or shortcut.
3. Extend `AppCommands` if Rust must route the action.
4. Extend `AppAction` and dispatcher if this is app behavior.
5. Use `EditorRuntimeCommandQueue` if Rust needs JS to insert Markdown.
6. Handle the command in JS.
7. Add JS core tests when behavior changes.
8. Update [editor guide](editor.md).
9. Run relevant validation.

Do not make UI components write files directly.

## 23. Standard Protocol Change Path

When Rust and JS need a new message:

1. update `crates/editor/src/protocol.rs`
2. add serde JSON tests
3. update Rust sender or receiver in `EditorHost`
4. handle the message in `js/src/editor-core.js` or `js/src/editor.js`
5. send JS events with `dioxus.send(...)`
6. handle events in the Rust `EditorHost` match
7. add Rust or JS tests
8. update this guide and [editor.md](editor.md)

Protocol messages should use stable data. Do not pass CodeMirror internal objects.

## 24. Performance Boundaries

High-risk paths:

- typing
- paste
- tab switch
- Source/Hybrid/Preview switch
- Preview render
- outline extraction
- file tree refresh
- workspace search
- sidebar resize

Before changing these paths, read [performance budget](performance-budget.md).

Ask:

- will this rebuild CodeMirror?
- will this clone large document text?
- will this do IO in a render path?
- will this make sidebar and editor subscribe to each other?
- will this parse the whole document on every keystroke?

## 25. Project Health

Papyro tries to keep these habits:

- docs describe current facts
- README is visitor-facing
- roadmap describes priority, not diary entries
- skills help AI load focused context
- each commit does one minimal task

Full check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1
```

Docs-only minimum:

```bash
node scripts/check-perf-docs.js
node scripts/report-file-lines.js
```

## 26. Summary

Papyro's core boundary is: Rust owns application truth, Dioxus owns UI composition, CodeMirror JavaScript owns complex editor interaction, and both sides communicate through an explicit protocol.

If you preserve that boundary, features, UI work, Hybrid improvements, file association, and future multi-window work all have clear homes.
