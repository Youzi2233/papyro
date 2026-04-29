# Editor Protocol

The editor protocol is the JSON contract between Rust and the browser editor runtime.

Rust owns the schema in `crates/editor/src/protocol.rs`. The Dioxus UI bridge serializes `EditorCommand` values to JavaScript and deserializes `EditorEvent` values from JavaScript.

## Runtime Responsibility Boundary

The JavaScript runtime owns browser editing mechanics only:

- CodeMirror view creation, focus, selection, IME composition, paste handling, scroll/layout measurement, decorations, and formatting commands.
- Local, idempotent handling for `set_view_mode`, `set_preferences`, `focus`, and layout refresh.
- Emitting protocol events when the user changes content, requests save, or pastes image data.

Rust remains the source of truth for application state:

- Document content snapshots, revisions, dirty/save status, tabs, workspace metadata, settings, storage, and file-system effects.
- Opening, saving, closing, moving, renaming, deleting, searching, and asset persistence.
- Deciding whether runtime events are accepted, ignored, saved, or surfaced as user feedback.

JavaScript must not write files, mutate workspace metadata, own tab truth, or introduce private business events. New JS-to-Rust behavior must first be added to `crates/editor/src/protocol.rs` and covered by protocol tests.

## Commands

Rust sends commands to `window.papyroEditor.handleRustMessage(tabId, message)`.

| Command | JSON `type` | Payload | Behavior |
| --- | --- | --- | --- |
| `SetContent` | `set_content` | `content: string` | Replace the editor document without echoing `content_changed`. |
| `SetViewMode` | `set_view_mode` | `mode: ViewMode` | Switch the browser editor between source, hybrid, and preview-aware runtime behavior. |
| `SetPreferences` | `set_preferences` | `auto_link_paste: bool` | Update editor-only preferences without resending document content. |
| `InsertMarkdown` | `insert_markdown` | `markdown: string` | Insert generated Markdown at the current editor selection. |
| `ApplyFormat` | `apply_format` | `kind: EditorFormat` | Apply Markdown formatting to the current selection. |
| `Focus` | `focus` | none | Focus the active editor. |
| `Destroy` | `destroy` | `instance_id: string` | Detach the editor from the active tab registry only when the host instance still matches. |

`EditorFormat` values are serialized as:

```json
"bold"
"italic"
"link"
"image"
"code_block"
"heading1"
"heading2"
"heading3"
"quote"
"ul"
"ol"
```

Example:

```json
{ "type": "apply_format", "kind": "code_block" }
```

`ViewMode` values are serialized as:

```json
"Source"
"Hybrid"
"Preview"
```

## Events

JavaScript sends events through the Dioxus channel.

| Event | JSON `type` | Payload | Behavior |
| --- | --- | --- | --- |
| `RuntimeReady` | `runtime_ready` | `tab_id: string` | Rust marks the host ready and sends the latest content. |
| `RuntimeError` | `runtime_error` | `tab_id: string`, `message: string` | Rust shows fallback UI and logs the error. |
| `ContentChanged` | `content_changed` | `tab_id: string`, `content: string` | Rust updates tab content and schedules autosave. |
| `SaveRequested` | `save_requested` | `tab_id: string` | Rust saves the requested tab. |
| `PasteImageRequested` | `paste_image_requested` | `tab_id: string`, `mime_type: string`, `data: string` | Rust stores pasted image data and sends `InsertMarkdown` for the generated asset link. |

Example:

```json
{ "type": "content_changed", "tab_id": "tab-a", "content": "# Draft" }
```

## Contract Rules

- `set_content` must not emit `content_changed`.
- Commands for a missing tab may return `"missing"` in JavaScript and should not throw.
- `destroy` must include the host `instance_id`; JavaScript ignores stale destroy messages so delayed cleanup cannot detach a newer host for the same tab id.
- `content_changed` is the only event that updates Rust document content.
- `save_requested` asks Rust to save; JavaScript never writes files directly.
- CodeMirror layout measurement is local to the JavaScript runtime. ResizeObserver should call the JS layout helper directly instead of round-tripping through Rust commands or events.
