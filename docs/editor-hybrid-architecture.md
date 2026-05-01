# Hybrid Editor Architecture Review

[简体中文](zh-CN/editor-hybrid-architecture.md) | [Editor guide](editor.md)

Hybrid mode should feel like a modern Markdown editor, not a styled source editor with fragile click behavior. This review compares mainstream editor architecture patterns and sets the next engineering direction for Papyro.

## Current Position

Papyro currently uses CodeMirror 6 as the interactive editor runtime:

- Rust analyzes Markdown blocks and sends block hints to JS.
- CodeMirror owns document state, cursor, selection, IME, paste, and undo.
- Hybrid mode uses decorations and widgets to render Markdown while keeping the underlying Markdown source.
- Preview uses Rust-rendered HTML and is read-only.

This keeps Markdown portable, but it also means every rendered Hybrid surface must respect CodeMirror's document, selection, and layout rules.

## Architecture Options

| Option | Strength | Risk for Papyro |
| --- | --- | --- |
| CodeMirror decorations/widgets | Lowest migration cost; keeps current source-first model | Easy to break hit testing when widgets replace text or affect height |
| ProseMirror/Tiptap node views | Strong document model; node views can own complex UI | Requires schema conversion between Markdown and document JSON |
| Lexical decorator nodes | Good interactive node model and performance focus | Requires a new document model and serialization bridge |
| Slate inline/void elements | Flexible tree model close to the DOM | More framework work and fewer batteries included |
| Full Typora-style custom editor | Maximum control | Very high cost; easy to regress IME, selection, undo, and accessibility |

## Findings

### CodeMirror

CodeMirror's content DOM is editor-managed. The reference manual says content should be changed through transactions and styled through decorations, not direct DOM mutation. It also states that only directly provided decoration sets may affect vertical layout; decoration functions run after viewport computation and must not introduce block widgets or replacement decorations across line breaks. This matches the runtime error we already saw when block decorations were created in the wrong place.

Useful rules for Papyro:

- Store block decorations in state fields when they can affect layout.
- Use viewport-derived decorations only for non-layout inline styling.
- Use `EditorView.atomicRanges` for rendered spans that should move/delete as one unit.
- Use `requestMeasure` when widget height can change after render.
- Do not hide Markdown syntax by replacing multi-line ranges unless cursor mapping is explicitly tested.

Sources: [CodeMirror decoration example](https://codemirror.net/examples/decoration/), [CodeMirror reference](https://codemirror.net/docs/ref/#view.EditorView%5Edecorations), [CodeMirror widget reference](https://codemirror.net/docs/ref/#view.Decoration%5Ewidget).

### ProseMirror And Tiptap

ProseMirror is built around immutable document transformations and transactions. Its node views let specific document nodes render custom DOM and optionally expose a `contentDOM` for editable content. Tiptap builds on this with node views that can be editable, non-editable, or mixed, and it explicitly separates in-editor UI from serialized output.

This is a better fit for document-native tables, task items, embeds, and callouts. The tradeoff is that Papyro would need a stable Markdown-to-document mapping and a document-to-Markdown serializer that preserves source expectations.

Sources: [ProseMirror guide](https://prosemirror.net/docs/guide/), [ProseMirror NodeView reference](https://prosemirror.net/docs/ref/#view.NodeView), [Tiptap node views](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views).

### Lexical

Lexical treats nodes as both the visual editor view and the stored editor state. It has `ElementNode`, `TextNode`, and `DecoratorNode` as extension points. `DecoratorNode` can insert arbitrary UI into the editor.

This is attractive for Mermaid, math, images, and future embedded components. It is not a drop-in fix because Papyro would need to replace the current CodeMirror runtime and define serialization behavior for every Markdown feature.

Source: [Lexical nodes](https://lexical.dev/docs/concepts/nodes).

### Slate

Slate models documents as a DOM-like tree of editor, element, and text nodes. Elements can be block or inline, and void or non-void. Void elements are useful for atomic things such as images, mentions, or embeds, but require careful rendering rules for selection.

Slate is flexible, but Papyro would need to build more behavior itself than with ProseMirror/Tiptap.

Sources: [Slate nodes](https://docs.slatejs.org/concepts/02-nodes), [Slate Element API](https://docs.slatejs.org/api/nodes/element).

## Recommended Direction

Keep CodeMirror for the next Hybrid stabilization pass, but stop treating each visual defect as an isolated CSS bug.

Short-term rules:

- Use one block-decoration pipeline that decides `source`, `rendered`, `editing`, and `error` states.
- Keep inline decorations visual-only unless they are backed by explicit atomic ranges.
- Do not reveal Markdown source on ordinary clicks inside inline code, links, or list content.
- Reserve source reveal for explicit edit affordances or complex blocks such as Mermaid.
- Keep code blocks rendered in Hybrid unless the user edits the fence metadata or source explicitly.
- Make selection color a theme token shared by inline code, links, code blocks, Mermaid, and tables.
- Add repeatable smoke coverage for cursor hit testing, text selection, paste replacement, IME, and mode switching.

Medium-term rules:

- Implement table and math editing as block-level state machines before adding more Markdown syntax shortcuts.
- Treat Mermaid, math, table, and image as "interactive block islands" with stable height and explicit edit controls.
- Keep Preview and Hybrid Markdown styling under the same token system.
- Record layout-affecting widget measurements and avoid async height jumps.

Long-term decision:

- If Hybrid still cannot provide stable cursor/selection behavior after the CodeMirror stabilization pass, evaluate a ProseMirror/Tiptap prototype for document-native editing.
- Do not migrate until the prototype can round-trip Markdown, preserve undo/paste/IME behavior, and support existing Rust storage flows.

## Next Implementation Checklist

- Add a single `HybridBlockViewState` decision point in JS for block render/edit/source/error state.
- Audit all multi-line replacements and move layout-affecting decorations into state fields.
- Add tests for cursor placement around inline code, links, list markers, code fences, tables, and Mermaid.
- Add tests for selection color and selection replacement across inline and block widgets.
- Add a visual/manual smoke fixture with headings, lists, links, inline code, code blocks, tables, math, images, and Mermaid.
