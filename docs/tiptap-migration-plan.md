# Tiptap Migration Plan

[简体中文](zh-CN/tiptap-migration-plan.md) | [Roadmap](roadmap.md) | [Editor guide](editor.md)

The `feat-tiptap` branch is dedicated to replacing Papyro's interactive editor runtime with Tiptap. The goal is not a quick library swap. The goal is an enterprise-grade Markdown editing foundation that is reusable, resilient, and maintainable.

## Goals

- Keep local Markdown files as the only persisted content format.
- Keep Rust/Dioxus tab, dirty/save/conflict, workspace, and preview flows independent from the editor library.
- Use Tiptap/ProseMirror's document model for Hybrid editing instead of relying on fragile source decorations for cursor and selection behavior.
- Turn tables, task lists, math, Mermaid, images, and future block components into extensible node views or extensions.
- Preserve the user-facing Source, Hybrid, and Preview modes.

## Current Architecture Facts

```mermaid
flowchart TD
    dioxus["Dioxus EditorHost"]
    facade["window.papyroEditor facade"]
    cm["CodeMirror runtime"]
    rust["Rust app state"]
    editor_crate["crates/editor<br/>Markdown analysis/rendering"]
    storage["storage/workspace"]

    dioxus --> facade
    facade --> cm
    cm -->|content_changed/save/paste image/runtime events| dioxus
    dioxus --> rust
    rust --> storage
    rust --> editor_crate
    editor_crate -->|block hints / preview html| rust
    rust -->|commands| dioxus
    dioxus -->|set_view_mode/preferences/block_hints/insert_markdown| facade
```

The existing JS facade exposes:

- `ensureEditor({ tabId, containerId, instanceId, initialContent, viewMode })`
- `attachChannel(tabId, dioxus)`
- `handleRustMessage(tabId, message)`
- `attachPreviewScroll`
- `navigateOutline`
- `syncOutline`
- `scrollEditorToLine`
- `scrollPreviewToHeading`
- `renderPreviewMermaid`

The migration must preserve this facade first. Rust and Dioxus should not be rewritten just because the editor implementation changes.

## Official Capability Assessment

The current Tiptap documentation confirms three important capabilities:

- Tiptap supports Vanilla JavaScript and ES modules, so it can fit the existing `js/` esbuild pipeline through `@tiptap/core`, `@tiptap/pm`, and `@tiptap/starter-kit`.
- `@tiptap/markdown` provides Markdown to Tiptap JSON conversion and Tiptap JSON back to Markdown. It supports `editor.commands.setContent(markdown, { contentType: "markdown" })`, `editor.commands.insertContent(markdown, { contentType: "markdown" })`, and `editor.getMarkdown()`.
- JavaScript node views can separate in-editor UI from serialized output and can use editable `contentDOM` or non-editable islands.

References:

- [Tiptap Vanilla JavaScript install](https://tiptap.dev/docs/editor/getting-started/install/cdn)
- [Tiptap Markdown basic usage](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage)
- [Tiptap Markdown introduction](https://tiptap.dev/docs/editor/markdown)
- [Tiptap JavaScript node views](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/javascript)
- [Tiptap Notion-like editor template](https://tiptap.dev/docs/ui-components/templates/notion-like-editor)

## Notion-Like Interaction Reference

The official Tiptap Notion-like template is a strong product reference for Papyro's future Hybrid editor. It demonstrates a block-based writing surface with slash commands, context-aware floating formatting, block drag and drop, responsive toolbars, dark/light theming, rich block insertion, link management, and undo/redo.

Papyro should borrow the interaction model, not the full product dependency stack. The template requires a Start plan for production, is delivered as a React UI Components template, and includes cloud-oriented collaboration, AI, JWT, and upload service assumptions. Papyro remains a local-first Markdown app, so the migration should rebuild the relevant interaction patterns with vanilla Tiptap modules, local Markdown persistence, existing Dioxus chrome, and Papyro design tokens.

Product targets inspired by the template:

- **Slash command menu**: quick insert for headings, lists, tasks, tables, code, math, Mermaid, images, and callouts.
- **Floating toolbar**: compact contextual formatting for selected text, using Papyro primitives instead of browser-native controls.
- **Block handle affordance**: optional block move/duplicate/delete controls after Markdown round-trip is stable.
- **Responsive editor chrome**: adaptive toolbars that keep narrow windows usable without hiding core writing actions.
- **Token-based styling**: `.mn-tiptap-*` classes should map to the existing theme system instead of importing template CSS wholesale.

Implementation rules for this reference:

- Start with headless command controllers before drawing menus. The same command model must power slash search, toolbar buttons, keyboard shortcuts, and tests.
- Use simple Markdown insertion only as a fallback for blocks that are not yet native Tiptap nodes. Upgrade each block later through a tested extension.
- Keep all Notion-like UI pieces optional and local. Collaboration, AI, comments, uploads, and JWT flows are out of scope for the migration branch unless a separate product decision adds them.
- Keep command labels and groups stable enough for i18n and future Dioxus chrome integration.

## Engineering Standards

- **Stable facade**: Rust depends only on `window.papyroEditor`, not on Tiptap internals.
- **Adapter isolation**: `CodeMirrorAdapter` and `TiptapAdapter` can coexist during migration, but product code calls one runtime adapter contract.
- **Markdown round-trip first**: every extension must define Markdown input, editor JSON, and Markdown output behavior.
- **Graceful failure**: parse failures, missing handlers, and node view errors must fall back to editable Source content.
- **Tests before feature migration**: each block migration gets fixtures or JS unit tests before it is considered complete.
- **Generated assets stay synchronized**: `assets/editor.js` and desktop/mobile copies must be committed with source changes.
- **Budgets stay enforced**: bundle generation, file line budget, primitive usage, a11y, contrast, token audit, and Rust checks remain mandatory.
- **Reusable extension system**: tables, math, Mermaid, images, and callouts should live in focused extension/adapter modules.
- **IME and undo cannot regress**: IME, paste, undo/redo, selection, and keyboard navigation are acceptance criteria.
- **Enterprise code quality**: generated implementation code must be reusable, iterative, robust, tested at the contract level, and safe to evolve without creating a second monolithic editor runtime.

## Target Architecture

```mermaid
flowchart TD
    host["Dioxus EditorHost"]
    facade["runtime facade<br/>window.papyroEditor"]
    registry["RuntimeRegistry"]
    adapter["TiptapRuntimeAdapter"]
    tiptap["Tiptap Editor"]
    markdown["MarkdownSyncController"]
    source["SourcePaneController"]
    extensions["Papyro Tiptap extensions"]
    rust["Rust app state"]

    host --> facade
    facade --> registry
    registry --> adapter
    adapter --> tiptap
    adapter --> markdown
    adapter --> source
    tiptap --> extensions
    markdown -->|content_changed| host
    source -->|content_changed| host
    host --> rust
```

## Phased Work

### 0. Branch And Plan

- [x] Create the `feat-tiptap` branch.
- [x] Document migration goals, risks, and acceptance criteria.
- [x] Commit and push the planning update.

### 1. Runtime Boundary

- [x] Extract the first runtime adapter facade contract and tests.
- [x] Add a runtime registry module for tab entry lifecycle management.
- [x] Wrap the current CodeMirror runtime in an injectable runtime factory.
- [x] Split the current `js/src/editor.js` facade into smaller runtime modules.
  - `editor-runtime-bootstrap` now owns runtime selection, facade creation, and host installation so the large entry file only assembles concrete adapters.
- [x] Define an `EditorRuntimeAdapter` contract: `mount`, `attachChannel`, `handleMessage`, `setViewMode`, `destroy`, and `getMarkdown`.
- [x] Switch the migration branch default runtime to Tiptap while keeping an explicit CodeMirror fallback selector.
- [x] Add adapter contract tests.
  - The contract now bridges the legacy host facade to stable migration methods and keeps preview, outline, and Mermaid helpers explicit for Rust/Dioxus compatibility.

### 2. Tiptap Foundation

- [x] Install `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, and `@tiptap/markdown`.
- [x] Add `TiptapRuntimeAdapter` for paragraphs, headings, lists, blockquotes, code blocks, links, bold, italic, inline code, and strike.
- [x] Enable the adapter behind a feature flag or runtime selector.
- [x] Add Markdown parse/serialize fixtures for English, Chinese, headings, lists, links, and code.

### 3. Source, Hybrid, And Preview

- [x] Hybrid uses Tiptap rich-text editing by default on the migration branch.
- [x] Hybrid interaction design references the official Notion-like template while staying local-first, Markdown-first, and Papyro-token based.
- [x] Add a Tiptap mode controller that normalizes Source, Hybrid, and Preview and keeps non-Hybrid modes non-editable in the rich-text editor.
- [x] Add a reusable Tiptap slash command controller for headings, lists, quotes, code, dividers, tables, math, and Mermaid.
- [x] Add a Papyro slash command menu controller with keyboard navigation and token-based styling for common Markdown block insertion.
- [x] Add a Papyro floating formatting toolbar controller for selected text and common inline marks.
- [x] Add a Papyro block handle controller as the hover entry point for future block actions.
- [x] Add the first Papyro block action menu controller for basic insert, transform, and delete actions.
- [x] Add reusable UI primitives for Tiptap popover placement, menu active-descendant state, toolbar roots, and shared visibility handling.
- [x] Add advanced block action menus and responsive editor toolbar behavior on top of the shared Tiptap UI primitives.
  - The block action menu now uses a reusable command model with grouped Insert/Text/Lists/Blocks/Advanced/Danger sections, rich Tiptap commands where available, Markdown fallbacks, keyboard navigation, and token-based desktop/mobile styling.
  - The block handle now keeps callbacks stable across repeated hover refreshes and triggers `+` insertion on pointer interaction so WebView click ordering does not leave the control inert.
  - The block handle hover bridge now survives the gutter gap between text and floating controls, so `+` insertion and action handles remain reachable during pointer movement.
  - The block action menu now moves closer to the official Notion-like template's Drag Context Menu with transform, text color, highlight, reset-formatting, copy-as-Markdown, duplicate-block, delete actions, and the advertised Ctrl/Cmd+C, Ctrl/Cmd+D, and Delete/Backspace shortcuts. Pure block insertion is intentionally owned by the `+`/slash flow so the handle menu stays focused on the current block.
  - The block action handle now separates click and drag into a clear state machine: pointerdown selects the current block and records the click anchor, release opens the menu beside the pointer only if movement stayed below the drag threshold, and actual movement starts block dragging. Right-click suppresses the native WebView context menu, the active block remains highlighted while the menu is open, and the floating menu stays alive when the pointer moves from gutter controls into the menu surface.
  - The block handle now has WebView-tolerant fallbacks: action clicks can open through pointerup or click, `+` can open through pointerdown or click without inserting duplicate slash paragraphs, and right-click/auxclick paths continue to suppress native browser menus.
  - The block action handle now opens the current-block menu immediately on pointerdown while preserving drag takeover after the movement threshold, reducing the "long press" feel in desktop WebView.
  - The `+` handle now inserts a slash trigger on the next line and opens the insertion menu at that caret position, keeping block actions and content insertion as separate, predictable affordances.
  - The handle menu has been narrowed to current-block actions: copy, duplicate, reset, delete, text color, highlight, and callout kind changes. Structural transforms and rich block creation stay in `+`/slash commands and the Markdown toolbar so the two entry points keep clear product semantics.
  - Slash/`+` table insertion now refreshes table chrome immediately after a successful rich table command, so quick row/column add controls, the cell menu trigger, and selection state do not depend solely on later selection/update events.
  - The floating format toolbar now exposes a density state, switches to compact controls in narrow viewports or constrained selection positions, and runs commands from pointerdown to avoid WebView focus races.
  - The slash/`+` insertion menu, block action menu, floating format toolbar, and table toolbar now share a dismiss lifecycle: outside clicks, scrolling, and window changes close overlays, while interactions inside the current block or table keep context alive.
  - Table chrome now uses the same WebView-tolerant activation contract as block chrome: contextual triggers, command buttons, quick row/column add controls, and row/column/table handles run from pointerdown with click fallback and duplicate-activation protection. Multi-cell context actions now anchor to the head cell, while row/column/table actions remain anchored to the selected axis or table. Cell right-clicks open Papyro's table context menu instead of the WebView native menu.
  - Slash and block action menus now share active-descendant scrolling so keyboard navigation keeps the selected command visible in long menus.
- [x] Source uses a source editor pane synchronized through `MarkdownSyncController`.
- [x] Add `MarkdownSyncController` as the canonical Markdown state boundary for Tiptap runtime updates.
- [x] Source pane input now skips unchanged Markdown so source editing does not emit redundant dirty/content events.
- [x] Preview remains Rust-rendered HTML.
- [x] Mode switching preserves selection, dirty state, and scroll snapshots.
  - `TiptapModeSnapshotController` captures Hybrid ProseMirror selections and Source textarea selections before view-mode changes, then restores the target mode after `set_view_mode`.
  - Runtime tests cover Source/Hybrid selection restoration, skip stale snapshots when the Markdown revision changes, and verify mode switching does not emit `content_changed`; scroll restoration continues through the shared per-mode scroll snapshot hook.
- [x] Outline clicks work in Source and Hybrid.

### 4. Rust/JS Protocol Compatibility

- [x] Preserve `content_changed` emission after Tiptap Markdown mutations covered by runtime tests.
- [x] Preserve `insert_markdown` and `set_view_mode` messages with explicit runtime tests.
- [x] Preserve `save_requested` from Tiptap keyboard shortcuts.
- [x] Preserve undo/redo through a dedicated Tiptap history command controller and stable `undo`/`redo` Rust messages.
- [x] Preserve `paste_image_requested` for Tiptap paste and drop image transfers through a shared clipboard helper.
- [x] Preserve `runtime_error` for parse failures and failed runtime command dispatch.
- [x] Keep `runtime_ready` host-owned: Dioxus emits it after `ensureEditor` and `attachChannel`, so the Tiptap adapter must not duplicate it.
- [x] Preserve `destroy` semantics, including stale host instance protection.
- [x] Preserve `set_preferences` state updates through a Tiptap preferences controller.
- [x] Preserve app language changes through `set_preferences` so Tiptap chrome can localize slash commands, block actions, handle labels, and table toolbar commands without remounting the editor.
- [x] Treat `set_block_hints` as a compatibility message through a Tiptap block hints controller.
- [x] Preserve `auto_link_paste` for selected-text URL paste through a Tiptap paste controller.
- [x] Slash and block action menus now yield keyboard handling during IME composition so Chinese input confirmation is not consumed as menu navigation or command execution.

### 5. Markdown Block Migration

- [x] Task list round-trips `- [ ]` and `- [x]`.
- [x] Pipe tables become editable tables with slash/`+` table-size insertion, whole-table/row/column edge selection handles, pointer-first toolbar actions, keyboard-accessible toolbar navigation, row/column operations, table-edge quick add controls, a lighter current-cell context menu for merge/alignment/color operations, native-menu-suppressing cell right-click actions, context commands scoped by cell/row/column/table selection semantics, click-to-open row/column/table handle menus, selected-cell and selected-axis overlays, active row/column/table handles, head-cell anchored multi-cell action placement, grouped Notion-like command menus, header toggles, normalized left/center/right cell alignment states, disabled states from `editor.can()`, cell merge/split, cell navigation, repair commands, and table deletion.
- [x] Inline and display math support edit, preview, and error states.
- [x] Mermaid supports source editing and rendered preview.
- [x] Images preserve local image URLs, paste image requests, and Markdown image syntax.
- [x] Code blocks preserve language metadata and highlighting strategy.
- [x] Callouts/admonitions parse and serialize `> [!NOTE]` style Markdown, expose a reusable Tiptap node, and are available from slash/`+` insertion and block actions.
- [x] A release-smoke Markdown fixture now runs through automated round-trip coverage for headings, Chinese text, lists, tasks, callouts, code, aligned tables, math, Mermaid, and images.
- [x] The release-smoke fixture checker is part of the full local check scripts, so fixture coverage cannot silently drift before manual QA.

### 6. Remove CodeMirror

- [x] Replace CodeMirror runtime entry points and tests.
  - The generated bundle now builds from `editor-tiptap-entry`, installs only the Tiptap adapter, and keeps shared host scroll/outline/Mermaid behavior in `editor-host-runtime`.
- [x] Remove CodeMirror npm dependencies and `codemirror-lang-mermaid`.
  - `js/package.json` now depends only on Tiptap, KaTeX, Mermaid, and esbuild for the editor runtime. Legacy CodeMirror runtime files and tests have been removed.
- [x] Clean `.cm-*` CSS in favor of `.mn-editor-*` and `.mn-tiptap-*` semantic classes.
  - The Dioxus host container now uses `mn-editor-runtime-host`, and the desktop Markdown styles no longer contain CodeMirror host or `.cm-*` selectors.
- [x] Confirm generated bundles and file line budgets pass.

### 7. Acceptance

- [x] `npm --prefix js run build`
- [x] `npm --prefix js test`
- [x] `cargo fmt --check`
- [x] `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- [x] `cargo test --workspace`
- [x] `node scripts/check-ui-primitives.js`
- [x] `node scripts/check-ui-a11y.js`
- [x] `node scripts/check-ui-contrast.js`
- [x] `node scripts/check-markdown-style-smoke.js`
- [x] `node scripts/check-markdown-style-smoke.js --self-test`
- [x] `node scripts/check-perf-smoke.js --self-test`
- [x] `node scripts/report-ui-tokens.js`
- [x] `node scripts/report-file-lines.js`
- [x] `git diff --check`
- [x] Block drag-and-drop reorders blocks through the Papyro handle and keeps the transaction mover covered by JS tests.
- [x] Document the focused [Tiptap Release Smoke Checklist](tiptap-release-smoke.md).
- [ ] Execute manual smoke before release: Source/Hybrid/Preview, Chinese IME, paste, undo, tables, math, Mermaid, images, outline, failed saves, and OS-opened Markdown files.

## Risks

| Risk | Mitigation |
| --- | --- |
| `@tiptap/markdown` is still beta and may have Markdown edge cases | Lock Papyro fixtures, add custom handlers for complex syntax, and fall back to Source on failures |
| Source mode may not preserve every formatting detail | Prefer semantic Markdown stability; document known limitations; keep source-block strategies where exact text matters |
| Extension sprawl increases bundle size | Use focused modules and keep bundle/file budgets active |
| Node views drift away from Papyro tokens | Use `mn-tiptap-*` classes and existing Markdown tokens |
| Rust block hints duplicate Tiptap's document model | Keep protocol compatibility during migration; eventually let Tiptap own interactive block state |
| Multi-window tab lifecycle leaks editor instances | Add registry destroy/recycle tests and release DOM listeners on close |

## Definition Of Done

- `js/package.json` no longer depends on CodeMirror.
- `window.papyroEditor` still serves the existing Rust/Dioxus protocol.
- Source, Hybrid, and Preview support everyday Markdown writing.
- Markdown round-trip tests cover headings, paragraphs, lists, tasks, links, inline code, code blocks, tables, math, Mermaid, images, and callouts.
- Tables, math, Mermaid, images, and callouts are testable extensions or adapter modules, not one-off DOM hacks.
- Generated bundles, desktop/mobile assets, Rust checks, JS tests, and UI checks all pass.
