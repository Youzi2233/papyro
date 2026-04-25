# Editor Protocol

The editor protocol is the JSON contract between Rust and the browser editor runtime.

Rust owns the schema in `crates/editor/src/protocol.rs`. The Dioxus UI bridge serializes `EditorCommand` values to JavaScript and deserializes `EditorEvent` values from JavaScript.

## Commands

Rust sends commands to `window.papyroEditor.handleRustMessage(tabId, message)`.

| Command | JSON `type` | Payload | Behavior |
| --- | --- | --- | --- |
| `SetContent` | `set_content` | `content: string` | Replace the editor document without echoing `content_changed`. |
| `ApplyFormat` | `apply_format` | `kind: EditorFormat` | Apply Markdown formatting to the current selection. |
| `Focus` | `focus` | none | Focus the active editor. |
| `RefreshLayout` | `refresh_layout` | none | Request CodeMirror layout measurement. |
| `Destroy` | `destroy` | none | Detach the editor from the active tab registry. |

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

## Events

JavaScript sends events through the Dioxus channel.

| Event | JSON `type` | Payload | Behavior |
| --- | --- | --- | --- |
| `RuntimeReady` | `runtime_ready` | `tab_id: string` | Rust marks the host ready and sends the latest content. |
| `RuntimeError` | `runtime_error` | `tab_id: string`, `message: string` | Rust shows fallback UI and logs the error. |
| `ContentChanged` | `content_changed` | `tab_id: string`, `content: string` | Rust updates tab content and schedules autosave. |
| `SaveRequested` | `save_requested` | `tab_id: string` | Rust saves the requested tab. |

Example:

```json
{ "type": "content_changed", "tab_id": "tab-a", "content": "# Draft" }
```

## Contract Rules

- `set_content` must not emit `content_changed`.
- Commands for a missing tab may return `"missing"` in JavaScript and should not throw.
- `destroy` must detach the tab id so recycled editors cannot send events to the old tab.
- `content_changed` is the only event that updates Rust document content.
- `save_requested` asks Rust to save; JavaScript never writes files directly.
