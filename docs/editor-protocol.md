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
| `SetBlockHints` | `set_block_hints` | `hints: MarkdownBlockHintSet` | Send revisioned Markdown block ranges and fallback state for Hybrid rendering. |
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
| `ContentChanged` | `content_changed` | `tab_id: string`, `content: string`, optional Hybrid trace fields | Rust updates tab content, records input trace context, and schedules autosave. |
| `SaveRequested` | `save_requested` | `tab_id: string` | Rust saves the requested tab. |
| `PasteImageRequested` | `paste_image_requested` | `tab_id: string`, `mime_type: string`, `data: string` | Rust stores pasted image data and sends `InsertMarkdown` for the generated asset link. |

Hybrid trace fields are optional for compatibility with older runtime messages,
but the current runtime sends them on every content change:

| Field | Meaning |
| --- | --- |
| `hybrid_block_kind` | Current Markdown block kind, for example `heading`, `table`, `image`, `mermaid`, or `source_fallback`. |
| `hybrid_block_state` | `editing`, `rendered`, `error`, `source_fallback`, or the non-Hybrid mode name. |
| `hybrid_block_tier` | Decoration tier for the cursor block: `current`, `near`, `remote`, or `source_fallback`. |
| `hybrid_fallback_reason` | `none`, `document_too_large`, `too_many_blocks`, `missing_hints`, or `invalid_cursor`. |

Example:

```json
{
  "type": "content_changed",
  "tab_id": "tab-a",
  "content": "# Draft",
  "hybrid_block_kind": "heading",
  "hybrid_block_state": "editing",
  "hybrid_block_tier": "current",
  "hybrid_fallback_reason": "none"
}
```

## Contract Rules

- `set_content` must not emit `content_changed`.
- `set_view_mode` and `set_preferences` are idempotent in Rust and JavaScript.
  Duplicate runtime commands may return `"mode_unchanged"` or `"preferences_unchanged"`
  and must not trigger layout refresh or preference writes.
- `set_block_hints` is revisioned. JavaScript may return `"block_hints_unchanged"`
  when the revision and payload are already active.
- Commands for a missing tab may return `"missing"` in JavaScript and should not throw.
- `destroy` must include the host `instance_id`; JavaScript ignores stale destroy messages so delayed cleanup cannot detach a newer host for the same tab id.
- `content_changed` is the only event that updates Rust document content.
- `save_requested` asks Rust to save; JavaScript never writes files directly.
- `runtime_error` moves the Rust host into fallback UI instead of leaving the editor surface blank.
- CodeMirror layout measurement is local to the JavaScript runtime. ResizeObserver should call the JS layout helper directly instead of round-tripping through Rust commands or events.
