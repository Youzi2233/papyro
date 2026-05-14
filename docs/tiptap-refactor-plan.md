# Tiptap Editor Refactoring Plan

[简体中文](zh-CN/tiptap-refactor-plan.md)

This document is the complete execution plan for refactoring Papyro's editor from its current messy custom implementation to a Notion-like editor based on official Tiptap UI Components.

## Goals

- Closely align with the official Tiptap Notion-like Editor template in experience and architecture
- Maximize use of official UI Components (Pro license available)
- Migrate to React + TypeScript stack
- Remove all redundant custom code, improve maintainability and readability
- Keep Markdown as the persisted source format

## Tech Stack Assessment

| Dimension | Current State | Target State |
|-----------|--------------|--------------|
| Language | TypeScript-only source under `js/src/`: no tracked `.js` or `.jsx` files as of the 2026-05-13 code block migration | TypeScript (.ts/.tsx) |
| Build | esbuild (native TS support, no changes needed) | esbuild + tsconfig |
| UI Framework | React 18.3 (already satisfied) | React 18.3 (unchanged) |
| Tiptap | 3.23.1 (already aligned) | 3.23.1+ (keep same version) |
| Component Source | Many custom DOM controllers + partial React | Official UI Components source + minimal adapters |
| Styling | Custom SCSS scattered everywhere | Official component styles + unified design tokens |

Conclusion: React is already satisfied, TypeScript can be incrementally migrated (esbuild native support), no blockers.

## Current Expert Audit (2026-05-13)

The editor has moved in the right direction, but it is not yet at the official Notion-like template quality bar.

- Table architecture: `PapyroOfficialTableNodeLayer` now mounts the official `TableHandle`, `TableSelectionOverlay`, `TableCellHandleMenu`, and `TableExtendRowColumnButtons` outside `EditorContent`, matching the official table-node integration contract. The latest table pass restored the official table wrapper operation rails (`--tt-table-pad-*`) so row/column handles and extend buttons have the same breathing room as the Notion-like template; Papyro CSS no longer restyles official handles, extend buttons, or cell action dots, and table-scoped menu CSS is limited to viewport bounds and text clipping while nested color/alignment submenus use the official menu surface and stacking level.
- Table UX target: keep the official table-node SCSS as the component owner, and limit Papyro CSS to host layout, viewport safety, theme token bridging, and Markdown persistence constraints. Row/column handles should feel like subtle Notion-like affordances, not persistent developer toolbar controls.
- JavaScript inventory: `js/src/` now contains 0 tracked `.js` files and 0 tracked `.jsx` files after the code block migration. Generated bundles remain JavaScript artifacts, but editor source is TS/TSX-only.
- TypeScript posture: the latest table-node pass typed the official table-handle extension, plugin, helper, hook, and action-button modules while keeping Papyro's caret-restoration behavior after `CellSelection`. The official `image-node` dependency is now explicit through `@tiptap/extension-image@3.23.1`, so the previous image/table-node typecheck blockers are no longer the next gate risk.
- Template inventory: unused official AI/Improve, emoji, mention, TOC, textarea-autosize, collaboration helpers, and full Notion demo shell sources have been removed from `js/src`. Papyro keeps only the active Papyro-adapted Notion-like toolbar (`PapyroToolbarFloating`) and the mounted editor surfaces.
- Formatting entry points: the top shell toolbar must stay app-level only. Rich-text formatting belongs to official Tiptap React surfaces: `PapyroToolbarFloating`, slash menu, drag context menu, link popover, and table-node menus. The active `PapyroToolbarFloating` still diverges from the official Notion-like toolbar by keeping text alignment, undo/redo, and highlight controls permanently visible; it should become an official-template composition with only Papyro-specific omissions such as AI/Cloud controls.
- Verification bar: for every UI convergence step, run source tests, build, and the editor Markdown gate; for visual changes, prefer desktop WebView/manual smoke or a screenshot-backed check when the app target is available.

## Long-Term Editor UI/UX Spec (2026-05-15)

Integrating official components only proves that the source path is correct. It does not prove the editor experience matches the official Notion-like template. Future AI work must judge official source integration, Papyro host adaptation, and real desktop UX acceptance separately.

### Experience Target

The Papyro editor surface should feel like a quiet, precise desktop writing surface that supports long-form work. The visual direction follows the **disciplined utility** brief in `docs/ui-visual-brief.md`, while interaction patterns and component composition should stay anchored to the official Notion-like template in `.reference/notion-like-editor`.

- Keep the document canvas restrained, readable, and stable. Do not use marketing-page heroes, stacked cards, or decorative gradients inside the editor.
- Rich-text actions appear only in context: floating selection toolbar, slash menu, drag context menu, link/color popovers, and table-node menus.
- The top app shell must not host Markdown formatting commands. It only owns tabs, view mode, outline, settings, theme, and window-level controls.
- Official component DOM, state machines, ARIA behavior, keyboard navigation, and SCSS are the baseline. Papyro should only adapt Markdown persistence, i18n, theme tokens, local resources, and the Rust protocol.

### Surface Ownership

| Surface | Visual/Interaction Owner | Allowed Papyro Adaptation | Disallowed |
|---------|--------------------------|---------------------------|------------|
| Document canvas | Official Notion-like layout + Papyro Markdown typography tokens | Content width, CJK typography, Source/Hybrid/Preview consistency, Mermaid/KaTeX/error states | Global CSS that breaks official block spacing, selection, placeholder, or node-view hit areas |
| Floating toolbar | Official `Toolbar`, `FloatingElement`, button/popover primitives | Localization, remove unimplemented AI/Cloud items, preserve selection, prevent WebView focus loss | Recreating the old top formatting toolbar or showing persistent controls that crowd the writing surface |
| Slash menu | Official `slash-dropdown-menu` + `suggestion-menu` | Papyro block commands, recent items, Markdown fallback | Global menu CSS overriding official active/focus/disabled states |
| Drag context menu | Official `drag-context-menu` | Papyro block move, copy, delete, reset formatting, color/highlight commands | Restoring old block handle/controller visuals or old DOM injection |
| Link/Color/Image popovers | Official popover/menu/input primitives | Local images, link Markdown serialization, localized labels, focus return | Transparent, borderless, clipped layers, or clicks that lose the editor selection |
| Table chrome | Official `table-node`, `TableHandle`, `TableSelectionOverlay`, `TableCellHandleMenu`, `TableExtendRowColumnButtons` | Table host wrapper, viewport safety, theme tokens, GFM Markdown serialization | Redrawing official handles/menus, injecting layout-changing placeholders into cells, or resize handles that create extra blank lines |

### Interaction Acceptance

For every editor UI change, verify at least these scenarios. If they cannot be automated, record the manual result in the task notes.

- Hover: table row/column handles, cell handles, and drag handles appear as subtle affordances without shifting layout, changing cell height, or blocking text cursor hits.
- Click: after a handle/menu trigger opens, the layer anchors correctly, has an opaque surface, border/shadow, consistent item density, and does not unexpectedly lose the editor selection.
- Resize: table column resizing uses overlay/handle hit areas and never creates extra paragraphs, blank lines, or abnormal padding inside cells.
- Keyboard: slash menu, drag menu, table menu, and link/color popovers support arrow keys, Enter, and Escape; focus is visible, and closing returns focus to the trigger or editor where possible.
- State: default, hover, active, selected/current, disabled, focus-visible, destructive, dark, and high-contrast states are distinguishable.
- Layout: 1440x920, 900x640, dark theme, high-contrast theme, CJK labels, long table content, and long filenames do not overlap or clip key actions.
- Persistence: all UI actions preserve Markdown round trips. Visual fixes must not introduce DOM-only state that cannot serialize.

### Visual QA Record

For editor UI tasks, prefer recording these views before completion. Screenshots do not need to be committed, but the task report or PR should say what was checked.

- Normal text selection + floating toolbar.
- Slash menu triggered with `/`, including search, active item, and empty result.
- Block drag handle + drag context menu.
- Link edit popover, color popover, and image floating controls.
- Table hover, column resizing, row/column handles, cell handle, cell menu, and nested color/alignment menus.
- The same Markdown document in Source, Hybrid, and Preview modes.

### Non-Ship Criteria

Do not mark the task complete if any of these remain:

- Menus are transparent, backgroundless, stacked incorrectly, overlapping, or clipped by the editor container.
- Table hover/resize adds blank space inside cells, changes row height unexpectedly, or breaks cursor hit testing.
- Papyro global CSS heavily overrides official component appearance without documenting the official-reference difference.
- Rich-text formatting buttons return to the top app shell.
- Only fake DOM / unit tests pass, with no note about real desktop WebView or screenshot-oriented checks.
- Dark or high-contrast themes make selected, focus, hover, or destructive states indistinguishable.

## Architecture Alignment: Official Notion-like Template Structure

Post-refactoring directory structure should align with the official CLI installation layout:

```
js/src/
├── components/
│   ├── tiptap-templates/
│   │   └── notion/              # Main editor template entry
│   ├── tiptap-ui/               # Official UI components (feature-level)
│   │   ├── slash-dropdown-menu/
│   │   ├── drag-context-menu/
│   │   ├── link-popover/
│   │   ├── heading-dropdown-menu/
│   │   ├── list-dropdown-menu/
│   │   ├── mark-button/
│   │   ├── color-highlight-popover/
│   │   ├── text-align-button/
│   │   ├── undo-redo-button/
│   │   ├── turn-into-dropdown/
│   │   ├── blockquote-button/
│   │   ├── code-block-button/
│   │   └── image-upload-button/
│   ├── tiptap-ui-primitive/     # Official UI primitives (low-level building blocks)
│   │   ├── button/
│   │   ├── dropdown-menu/
│   │   ├── popover/
│   │   ├── toolbar/
│   │   ├── separator/
│   │   ├── spacer/
│   │   └── tooltip/
│   ├── tiptap-node/             # Official Node components (rendered inside editor)
│   │   ├── paragraph-node/
│   │   ├── heading-node/
│   │   ├── code-block-node/
│   │   ├── list-node/
│   │   ├── blockquote-node/
│   │   ├── horizontal-rule-node/
│   │   ├── image-node/
│   │   └── table-node/
│   ├── tiptap-extension/        # Custom/adapted extensions
│   │   ├── selection-extension/
│   │   ├── link-extension/
│   │   ├── trailing-node-extension/
│   │   └── mathematics-extension/
│   └── tiptap-icons/            # Icon components
├── hooks/                       # Shared hooks
│   ├── use-mobile.ts
│   ├── use-window-size.ts
│   └── use-ui-editor-state.ts
├── lib/                         # Utility libraries
│   └── tiptap-utils.ts
├── styles/                      # Global styles / design tokens
├── editor-entry.ts              # Bundle entry point
└── editor-runtime.ts            # Runtime core
```

---

## Phases

### Phase 0: Generate Baseline Template via Official CLI

Official recommended path: use the Tiptap CLI to install the complete Notion-like Editor template, obtain the official standard source code, then trim unneeded parts and adapt to Papyro's architecture.

> The CLI targets Vite/Next.js projects. Papyro uses custom esbuild, so the strategy is:
> Use the CLI to generate a complete Vite reference project under `.reference/` as the authoritative source baseline.

#### 0.1 Generate Official Template Reference Project
- [x] Login to Tiptap Pro account: `npx @tiptap/cli@latest login`
- [x] Initialize complete template under `.reference/`:
  ```bash
  cd .reference
  npx @tiptap/cli@latest init notion-like-editor --framework vite
  ```
- [x] Add generated project directory to `.gitignore`
- [x] Review generated file structure, confirm all components, extensions, hooks, and styles are present

#### 0.2 TypeScript Base Configuration
- [x] Add `typescript`, `@types/react`, `@types/react-dom` to `js/package.json` devDependencies
- [x] Create `js/tsconfig.json` with `allowJs: true`, `allowImportingTsExtensions: true`, path alias `@` → `src/`
- [x] Update `js/build.js` entry to `.ts` extension, add `.ts`/`.tsx` loader mappings
- [x] Verify esbuild can bundle mixed JS/TS files correctly

#### 0.3 Restructure Directories per Official Template
- [x] Create corresponding directories under `js/src/` matching the generated template structure
- [x] Copy official template component source (TSX) directly into the project
- [x] Trim unneeded components (AI, collaboration, Emoji, Mention related)
- [x] Keep existing `tiptap-node/table-node/` (already aligned with official)
- [x] Import necessary global styles and CSS variables per official style configuration

---

### Phase 1: Integrate Official UI Components

Copy official component source from the CLI-generated template into the project, integrate and verify one by one. Each component gets its own commit.

#### 1.1 Style Infrastructure
- [x] Copy official style configuration from template (CSS variables, design tokens)
- [x] Establish Papyro's global style foundation per template's `styles/` directory
- [x] Ensure dark/light theme CSS variables are in place

#### 1.2 UI Primitives Layer
Copy the following primitive components from the template (they are dependencies of all higher-level components):
- [x] `button` + `button-group`
- [x] `dropdown-menu`
- [x] `popover`
- [x] `toolbar` (including `ToolbarGroup`, `ToolbarSeparator`)
- [x] `separator`
- [x] `spacer`
- [x] `tooltip`

#### 1.3 Hooks and Utility Libraries
- [x] `use-mobile`
- [x] `use-window-size`
- [x] `use-ui-editor-state`
- [x] `tiptap-utils` / `tiptap-ui-utils` (trim AI/collaboration utility functions and keep only local UI helpers)

#### 1.4 Slash Command Menu (Highest Priority)
- [x] Copy official `slash-dropdown-menu` component
- [x] Copy dependent `suggestion-menu` utility component
- [x] Configure Papyro-supported block types (heading, list, code, blockquote, hr, image, table, math, mermaid)
- [x] Connect to Rust-side `run_slash_command` protocol
- [x] Verify `/` trigger, search filtering, keyboard navigation work correctly

#### 1.5 Drag Handle + Block Action Menu
- [x] Copy official `drag-context-menu` component
- [x] Copy dependent `floating-element` utility component
- [x] Configure context menu items: transform block type, color/highlight, copy/delete, reset formatting
- [x] Ensure `withSlashCommandTrigger` links with 1.4's slash menu
- [x] Verify drag reordering serializes correctly to Markdown

#### 1.6 Floating Format Toolbar (Bubble Menu)
- [x] Use official `<Tiptap.BubbleMenu>` as container
- [x] Copy and integrate the following official toolbar components:
  - `mark-button` (bold, italic, underline, strike, code)
  - `heading-dropdown-menu`
  - `list-dropdown-menu`
  - `color-highlight-popover`
  - `text-align-button`
  - `link-popover`
  - `turn-into-dropdown`
  - `undo-redo-button`
- [x] Use official `toolbar` primitive for layout

#### 1.7 Link Editing
- [x] Copy official `link-popover` component
- [x] Copy official `link-extension` extension
- [x] Ensure links serialize correctly in Markdown

#### 1.8 Node Components
- [x] Copy official `paragraph-node`
- [x] Copy official `heading-node`
- [x] Copy official `code-block-node` (keep lowlight integration)
- [x] Copy official `list-node`
- [x] Copy official `blockquote-node`
- [x] Copy official `horizontal-rule-node`
- [x] Copy official `image-node` (adapt for local image paste protocol)

#### 1.9 Extension Layer
- [x] Copy official `selection-extension`
- [x] Copy official `trailing-node-extension`
- [x] Copy official `mathematics-extension` (connect to existing KaTeX)
- [x] Copy official `unique-id-extension`

---

### Phase 2: Remove Old Custom Code

After Phase 1's official components are confirmed working, progressively remove corresponding old implementations:

#### 2.1 Remove Old DOM Controllers
The current `tiptap-runtime.js` creates many controllers via dependency injection, now replaced by official React components:

- [x] Remove `block-handle-controller` (replaced by: official `drag-context-menu`)
- [x] Remove `block-action-menu-controller` (replaced by: built into official `drag-context-menu`)
- [x] Remove `format-toolbar-controller` (replaced by: official `BubbleMenu` + toolbar components)
- [x] Remove `slash-menu-controller` (replaced by: official `slash-dropdown-menu`)
- [x] Remove `link-editor-controller` (replaced by: official `link-popover`)
- [x] Remove `table-toolbar-controller` (replaced by: official `table-node` built-in menus)

#### 2.2 Remove Custom React Views (Replaced by Official Components)
- [x] Remove `tiptap-react/slash-menu-view.jsx`
- [x] Remove `tiptap-react/block-action-menu-view.jsx`
- [x] Remove `tiptap-react/block-handle-view.jsx`
- [x] Remove `tiptap-react/format-toolbar-view.jsx`
- [x] Remove `tiptap-react/link-editor-view.jsx`
- [x] Remove `tiptap-react/components/block-action-menu.jsx`
- [x] Remove `tiptap-react/components/block-handle.jsx`
- [x] Remove `tiptap-react/components/format-toolbar.jsx`
- [x] Remove `tiptap-react/components/link-editor.jsx`
- [x] Remove `tiptap-react/commands/block-action-menu-model.js` (functionality merged into drag-context-menu)

#### 2.3 Remove Custom Style Files
- [x] Audit all `.scss` files, remove styles that duplicate official components
- [x] Keep only Papyro-specific styles (Mermaid, KaTeX, etc.)

#### 2.4 Remove Outdated Documentation
- [x] Remove `docs/tiptap-enterprise-editor-todo.md` (replaced by this document)
- [x] Remove `docs/zh-CN/tiptap-enterprise-editor-todo.md`
- [x] Review other docs files, remove content that no longer applies

---

### Phase 3: Core Runtime Refactoring

#### 3.1 Simplify editor-runtime
- [x] Rewrite `tiptap-runtime.js` as `editor-runtime.ts`
- [x] Remove all controller factory injection, let React components manage their own state
- [x] Keep core responsibilities: Editor instance creation, Rust protocol bridge, Markdown sync
- [x] Runtime only does: create Editor → mount React tree → forward Rust commands/events

#### 3.2 Simplify editor-entry
- [x] Rewrite `editor-tiptap-entry.js` as `editor-entry.ts`
- [x] Remove all view factory registrations (DI injection of React views no longer needed)
- [x] Entry only does: create runtime → install on `window.papyroEditor`

#### 3.3 React Island Refactoring
- [x] Keep `island.jsx` → migrate to `island.tsx`
- [x] Keep slot architecture (BeforeContent / EditorContent / AfterContent / OverlayLayer)
- [x] Keep `runtime-context` → migrate to TS, simplify interface
- [x] Keep `mount-controller` → migrate to TS
- [x] Remove unused slot definitions from `slots.tsx`

---

### Phase 4: Table Component Completion

The table-node is partially integrated, needs completion:

- [x] Confirm all official table-node interactions are correctly mounted:
  - Row/column handles (show on hover)
  - Cell selection overlay
  - Row/column extend buttons
  - Context menu (insert/delete rows/columns, merge/split cells)
  - Column width resize
- [x] Remove redundant bridging logic in `tiptap-table-command-controller.js`
- [x] Remove code in `tiptap-table.js` replaced by official components
- [x] Ensure table Markdown serialization is correct (GFM table format)
- [x] 2026-05-13 follow-up: remove legacy Papyro table chrome from `markdown.css` and `tiptap-chrome-base.css`; keep table host styling in `tiptap-chrome-table.css` so official handle/menu SCSS owns the component look
- [x] 2026-05-13 follow-up: migrate `tiptap-react/official-table-node-layer.jsx` to `official-table-node-layer.tsx`
- [x] 2026-05-13 follow-up: scope table dropdown sizing, z-index, and menu-item rhythm to the official table-node menus via `tiptap-table-menu-content`, avoiding global overrides of slash/link/drag menus
- [x] 2026-05-13 audit follow-up: soften Papyro's table host overrides so official table-node handles, extend rails, and cell action dots match the Notion-like reference more closely
- [x] 2026-05-13 audit follow-up: keep nested table menus (`ColorMenu`, `TableAlignMenu`) on the scoped table menu surface without changing slash/link/drag menu styling
- [x] 2026-05-13 audit follow-up: remove Papyro-specific handle, extend button, and cell-dot visual overrides so the official table-node SCSS owns the Notion-like table chrome
- [x] 2026-05-13 audit follow-up: stop applying the table-scoped menu class to nested color/alignment submenus, and reduce Papyro table menu CSS to z-index, viewport bounds, and text clipping so official menu/combobox styles own the Notion-like surface
- [x] 2026-05-13 audit follow-up: restore the official table wrapper operation rail padding and remove the host wrapper margin reset, fixing cramped row/column handles, extend controls, and nested table menu stacking against the Notion-like reference
- [x] 2026-05-13 type follow-up: align the official table-handle extension/plugin/helper, table-handle state hook, table utility helpers, and table action-button modules with typed TS/TSX source while preserving Papyro's post-`CellSelection` caret restoration and scoped table menu surface
- [x] 2026-05-13 type follow-up: expose `TableKit` through the Papyro table boundary and add the aligned official `@tiptap/extension-image@3.23.1` dependency required by `image-node`

---

### Phase 5: Incremental TypeScript Migration

Migrate by module priority, one module at a time:

#### 5.1 Core Modules (Priority)
- [x] `tiptap-runtime.js` → `editor-runtime.ts`
- [x] `editor-runtime.js` → `editor-runtime-contract.ts`
- [x] `editor-tiptap-entry.js` → `editor-entry.ts`
- [x] `tiptap-react/runtime-context.jsx` → `.tsx`
- [x] `tiptap-react/runtime-model.js` → `.ts`
- [x] `tiptap-react/island.jsx` → `.tsx`
- [x] `tiptap-react/mount-controller.jsx` → `.tsx`

#### 5.2 Component Modules
- [x] All components under `tiptap-ui/` (official source is already TSX)
- [x] All primitives under `tiptap-ui-primitive/`
- [x] All node components under `tiptap-node/`
- [x] All hooks under `hooks/`

#### 5.3 Utilities and Tests
- [x] Utility functions under `lib/`
- [x] Test file migration (keep `node --test` runner)

#### 5.4 Current TypeScript Debt Audit (2026-05-13)
- [x] Audit the remaining tracked JS/JSX inventory: 44 `.js` files and 4 `.jsx` files under `js/src/`
- [x] Delete stale JS/JSX files already replaced by TS/TSX or no longer referenced: `components/input-group.js`, `components/tiptap-extension/node-alignment-extension.js`, `components/tiptap-extension/node-background-extension.js`, and `tiptap-react-island.jsx`
- [x] Convert `editor-registry.js`, `editor-runtime-bootstrap.js`, and `editor-runtime-selector.js` to typed `.ts` modules
- [x] Convert `markdown-sync-controller.js` to a typed `.ts` module
- [x] Convert `editor-host-runtime.js` to a typed `.ts` module
- [x] Convert `editor-core.js` to a `.ts` source module while preserving the current tested behavior surface
- [x] Convert `editor-clipboard.js` to a typed `.ts` module
- [x] Convert `tiptap-ui-primitives.js` to a typed `.ts` module
- [x] Migrate the remaining tracked `.js` file under `js/src/` to `.ts` and keep `js/src/` free of tracked `.js`/`.jsx` source files
- [x] Split the remaining JS/JSX migration into tracks: core runtime (`editor-*`, `markdown-sync-controller`), Papyro feature adapters (`tiptap-math`, `tiptap-mermaid`, `tiptap-image`, `tiptap-callout`, etc.), and leftover React support (`tiptap-react/*`); the core runtime and React support tracks are now closed
- [x] Convert `tiptap-table-command-controller.js` to `tiptap-table-command-controller.ts` after table command behavior was covered by source and runtime tests
- [x] Convert `tiptap-table.js` to `tiptap-table.ts` after table command behavior was covered by source and runtime tests
- [x] Convert `tiptap-table-commands.js` to `tiptap-table-commands.ts` so table command metadata and menu models expose typed boundaries
- [x] Convert `editor-core.js`
- [x] Convert React support helper modules to typed boundaries: `code-block-command-model.ts`, `use-pointer-activation.ts`, `use-hover-intent-activation.ts`, and `floating.ts`
- [x] Convert remaining React support files under `js/src/tiptap-react/`, including code-block node view, primitive wrappers, command icons, the code-block node-view extension, and the package index
- [x] Convert `tiptap-format-snapshot.js` to `tiptap-format-snapshot.ts` so floating toolbar state reads from a typed snapshot model
- [x] Convert `tiptap-history-commands.js` to `tiptap-history-commands.ts` so undo/redo command routing has a typed controller boundary
- [x] Convert `tiptap-mode-controller.js` and `tiptap-mode-snapshots.js` to typed mode-boundary modules for Source/Hybrid/Preview state and selection restoration
- [x] Convert `tiptap-turn-into-commands.js` to `tiptap-turn-into-commands.ts` so floating toolbar and drag menu block conversion share a typed command boundary
- [x] Convert `tiptap-preferences-controller.js` to `tiptap-preferences-controller.ts` so Rust preference payloads and runtime entry preference state share a typed boundary
- [x] Convert `tiptap-block-hints-controller.js` to `tiptap-block-hints-controller.ts` so Rust block hint payloads and runtime entry hint state share a typed boundary
- [x] Convert `tiptap-paste-controller.js` to `tiptap-paste-controller.ts` so auto-link paste behavior and runtime paste handling share a typed boundary
- [x] Convert `tiptap-block-move.js` to `tiptap-block-move.ts` so drag-context block movement and block action movement share a typed ProseMirror transaction boundary
- [x] Convert `tiptap-format-commands.js` to `tiptap-format-commands.ts` so the floating format toolbar command model exposes a typed boundary
- [x] Convert `tiptap-text-style.js` to `tiptap-text-style.ts` so text color, highlight, and block-level mark helpers expose typed extension boundaries
- [x] Convert `tiptap-task-list.js` to `tiptap-task-list.ts` so official task list extension configuration and checkbox accessibility labels expose typed boundaries
- [x] Convert `tiptap-markdown-snippets.js` to `tiptap-markdown-snippets.ts` so slash, drag, turn-into, and callout Markdown fallbacks share typed snippet helpers
- [x] Convert `tiptap-official-drag-handle.js` to `tiptap-official-drag-handle.ts` so the official drag-context menu configuration and nested handle rules expose typed boundaries
- [x] Convert `tiptap-navigation.js` to `tiptap-navigation.ts` so Source/Hybrid line navigation, outline sync, and editor scroll targeting expose typed runtime boundaries
- [x] Convert `tiptap-source-pane.js` to `tiptap-source-pane.ts` so Source mode textarea sync, save shortcuts, and Markdown parse failure reporting expose typed runtime boundaries
- [x] Convert `tiptap-i18n.js` to `tiptap-i18n.ts` so editor chrome labels, slash commands, table menus, and Papyro-specific labels share a typed localization boundary
- [x] Convert `tiptap-callout.js` to `tiptap-callout.ts` so Markdown admonition parsing, rendering, and callout commands expose typed Papyro feature boundaries
- [x] Convert `tiptap-math.js` to `tiptap-math.ts` so inline/display math tokenization, KaTeX rendering, NodeView editing, and `setInlineMath`/`setMathBlock` command routing expose typed Papyro feature boundaries
- [x] Convert `tiptap-mermaid.js` to `tiptap-mermaid.ts` so fenced diagram tokenization, rendering, NodeView editing, and `setMermaidBlock` command routing expose typed Papyro feature boundaries
- [x] Convert `tiptap-image.js` to `tiptap-image.ts` so Markdown image tokenization, source sanitization, NodeView previews, and `setImage` command routing expose typed Papyro feature boundaries
- [x] Convert `mermaid-renderer.js` to `mermaid-renderer.ts` so strict Mermaid rendering, timeout handling, stale render protection, and preview re-rendering expose typed runtime boundaries
- [x] Convert `tiptap-runtime-smoke.js` to `tiptap-runtime-smoke.ts` so the mounted Tiptap gate helper has typed fake-DOM, facade, and Markdown round-trip boundaries
- [x] Convert `tiptap-slash-commands.js` to `tiptap-slash-commands.ts` so the official slash menu's Papyro command adapter exposes typed command, query, recent-item, and fallback Markdown boundaries
- [x] Convert `tiptap-block-actions.js` to `tiptap-block-actions.ts` so the official drag context menu's Papyro adapter exposes typed block target, editor facade, submenu, and command result boundaries
- [x] Convert `tiptap-markdown.js` to `tiptap-markdown.ts` so the Markdown manager, extension chain, persistence normalization, and parse/serialize/round-trip helpers expose typed boundaries
- [x] Convert `tiptap-code-block.js` to `tiptap-code-block.ts` so lowlight, DOM fallback NodeView chrome, React code-block NodeView injection, language menu state, copy/wrap actions, and `setCodeBlockLanguage` expose typed boundaries
- [x] Resolve the previous image/table-node typecheck blockers: `@tiptap/extension-image` is installed at the aligned Tiptap version, and the official table-handle helper/extension/action modules now have typed TS/TSX boundaries
- [x] Remove unused official template leftovers from `js/src`: AI/Improve, emoji, mention, TOC, textarea-autosize, collaboration token helpers, full Notion demo shell files, and AI-only icons; rename the remaining generic helper boundary to `tiptap-ui-utils`
- [x] Clear focused TS blockers in `turn-into-dropdown` and `editor-clipboard.ts`: export a shared typed block option boundary for the localized official dropdown, avoid `String.prototype.at` in the ES2020 target, and accept both DOM `FileReader` and test reader constructors
- [x] Clear `tiptap-ui-primitives.ts` from the current typecheck blocker set: type DOM/fake-DOM listener boundaries, floating dismiss configuration, hidden-state options, floating placement options, and command-menu active descendant helpers
- [x] Clear `tiptap-react/utils/floating.ts` from the current typecheck blocker set: type React floating options, normalize editor anchor rects before positioning, and cover floating positioning plus side-panel flip decisions with source tests
- [x] Clear the React mount/slot boundary from the current typecheck blocker set: type `tiptap-react/mount-controller.tsx` and `tiptap-react/slots.tsx`, preserve official drag/table/menu slot composition, and teach the source-test loader the same alias, style, and directory resolution used by the editor bundle
- [ ] Add a passing `npm --prefix js run typecheck` gate once current TS template debt is typed or intentionally isolated
- [ ] Resolve the remaining typecheck blockers before enabling the gate: global runtime/model debt in `editor-core.ts`, `editor-runtime.ts`, `editor-runtime-contract.ts`, `tiptap-react/runtime-model.ts`, `editor-runtime-protocol.ts`, `tiptap-react/runtime-context.tsx`, `editor-host-runtime.ts`, and `tiptap-block-move.ts`; runtime context/island boundaries; and the Papyro custom table action/Markdown layer in `tiptap-table.ts`

---

### Phase 6: Style Unification

- [x] Establish unified design tokens (CSS variables) aligned with official component style system
- [x] Remove all custom SCSS that duplicates official components
- [x] Keep Papyro-specific styles: Mermaid diagrams, KaTeX math formulas, source mode
- [x] Ensure dark/light theme switches via CSS variables (official components already support this)
- [x] Audit `table-node.scss`, `table-handle-menu.scss` etc.; keep upstream official SCSS and move Papyro-only table host overrides into `tiptap-chrome-table.css`

---

### Phase 7: Papyro-Specific Feature Adaptation

These features are unique to Papyro, not in the official template, and need to be preserved and adapted to the new architecture:

- [x] Markdown source mode (Source/Hybrid/Preview tri-mode switching)
- [x] Rust protocol bridge (`window.papyroEditor` facade)
- [x] Local image paste (file saving handled by Rust side)
- [x] Mermaid diagram rendering
- [x] KaTeX math formula rendering
- [x] Outline/TOC generation (consumed by Rust side)
- [x] i18n multilingual support
- [x] Multi-tab editor instance management (editorRegistry)
- [x] Harden desktop/macOS runtime assets: keep the lightweight external `/assets/editor.js` script path for normal desktop startup, use the inline generated editor runtime as the macOS packaged fallback, expose the brand logo as an embedded PNG data URL, and still mirror editor runtime, logo, favicon, and CSS bytes into Dioxus-native asset roots including macOS `.app/Contents/Resources/assets`

---

### Phase 8: Testing and Verification

- [x] Update `tiptap-runtime-smoke.ts` for new architecture
- [x] Update all existing test files for new module paths
- [x] Add Markdown serialization round-trip tests for each official component
- [x] Verify `scripts/check-editor-markdown-gate.js` passes
- [x] End-to-end verification of all interactions in desktop WebView

---

### Phase 9: Editor Chrome and UX Convergence

The editor surface must behave like the official Notion-like template first, with Papyro shell controls kept outside the rich-text formatting workflow.

#### 9.1 Formatting Entry Point Convergence

- [x] Remove the legacy Rust/Dioxus Markdown insertion toolbar from the top chrome
- [x] Keep app-level controls in the titlebar: tabs, sidebar toggle, theme switch, settings, window controls, and outline toggle
- [x] Use official Tiptap floating toolbar, slash menu, drag context menu, and table menus as the formatting entry points
- [x] Remove or quarantine old `mn-tiptap-format-toolbar`, legacy block handle, and legacy block action menu CSS after confirming no mounted React component still depends on it
- [x] Compare `PapyroToolbarFloating` against the official Notion-like toolbar composition and remove any remaining Papyro-only command model that duplicates official toolbar components
- [x] Replace the active floating toolbar composition with the official Notion-like pattern: turn-into, marks, image floating controls, link/text color, and a More popover for superscript/subscript, alignment, and indentation; exclude AI/Improve until a real local/Pro-backed AI workflow is implemented

#### 9.2 Document Canvas and Typography Convergence

- [ ] Audit Papyro's editor canvas width, side operation rails, bottom breathing room, and narrow-window behavior against the official `.notion-like-editor-layout`, ensuring Source/Hybrid/Preview do not jump between layouts
- [ ] Unify Markdown typography tokens so headings, paragraphs, lists, blockquotes, inline code, code blocks, tables, Mermaid, and KaTeX share the same reading rhythm in Hybrid and Preview
- [ ] Audit CJK mixed text, long URLs, long code lines, wide tables, and image nodes for overflow behavior; key actions must never be clipped into unreachable areas
- [ ] Keep the app shell aligned with disciplined utility; do not wrap the editor canvas in a large card or marketing-style section

#### 9.3 Floating Layer and Menu Convergence

- [ ] Compare slash menu, drag context menu, link popover, color popover, and table menu against the official `menu`, `popover`, `dropdown-menu`, and `combobox` SCSS for background, border, shadow, radius, item density, and active/focus states
- [ ] Fix all transparent layers, stacking mistakes, clipping, drifting anchors, and focus loss after close
- [ ] Define menu stacking rules: editor contextual layers sit above document content and below app modals; nested table color/alignment menus must not override or pollute slash/link/drag menus
- [ ] Add source tests or smoke notes for menu keyboard paths: open, arrow navigation, Enter, Escape, and focus return

#### 9.4 Table Experience Convergence

- [ ] Re-audit the full table path against the official table-node template: hover, row/column handles, cell handle, extend buttons, selection overlay, resize handle, cell menu, and nested menus
- [ ] Fix hover/resize behavior that adds blank lines, extra paragraphs, or inflated row height inside cells; inspect ProseMirror table-cell default content, CSS `min-height`, resize handle DOM, and wrapper padding together
- [ ] Fix the cell handle menu background, stacking, layout, and item density so it uses the official menu surface instead of a transparent or broken host layer
- [ ] Limit Papyro table CSS to host wrapper, overflow, theme tokens, and Markdown table baseline; do not redraw official handles, buttons, menu items, or overlays
- [ ] Verify table interactions still serialize to stable GFM tables; complex table features that cannot be represented by GFM need an explicit degradation policy

#### 9.5 Official Component Difference Audit

- [ ] Create an official-template difference list for `PapyroToolbarFloating`, `SlashDropdownMenu`, `DragContextMenu`, `TableHandleMenu`, `TableCellHandleMenu`, and `ImageNodeFloating`, documenting source differences from `.reference/notion-like-editor` and why each exists
- [ ] After every official component migration or adjustment, audit the remaining top-level editor layout, component states, and CSS overrides against the official Notion-like template
- [ ] Document or comment every retained Papyro adaptation as Markdown persistence, Rust protocol, i18n, local resource handling, or WebView focus protection; remove adaptations that cannot be explained

#### 9.6 Visual Regression and Release Acceptance

- [ ] Extend `docs/tiptap-release-smoke.md` editor UI scenarios to cover table handles, cell menu, floating toolbar, slash menu, drag handle, link/color popovers, and image controls
- [ ] Add visual regression coverage for table handles, cell menu, floating toolbar, slash menu, and drag handle once the desktop WebView smoke can run reliably in CI
- [ ] UI task reports must include checked views, keyboard paths, dark/high-contrast result, narrow-window result, automated checks, and known follow-ups
- [ ] Before release, run `node scripts/check-editor-markdown-gate.js` and add `node scripts/check-tiptap-theme-bridge.js`, `node scripts/check-ui-contrast.js`, and `node scripts/check-ui-a11y.js` according to the changed surface

---

## Complete List of Official UI Components to Integrate

### UI Components (Feature-level)

| Component | Purpose | License | Priority |
|-----------|---------|---------|----------|
| `slash-dropdown-menu` | `/` command palette | Start | P0 |
| `drag-context-menu` | Drag handle + block action menu | Start | P0 |
| `link-popover` | Link create/edit popover | MIT | P0 |
| `mark-button` | Inline format buttons | MIT | P0 |
| `heading-dropdown-menu` | Heading level dropdown | MIT | P1 |
| `list-dropdown-menu` | List type dropdown | MIT | P1 |
| `color-highlight-popover` | Highlight color picker | MIT | P1 |
| `text-align-button` | Text alignment | MIT | P1 |
| `turn-into-dropdown` | Block type conversion | Start | P1 |
| `undo-redo-button` | Undo/Redo | MIT | P1 |
| `blockquote-button` | Blockquote button | MIT | P2 |
| `code-block-button` | Code block button | MIT | P2 |
| `image-upload-button` | Image upload button | MIT | P2 |
| `color-text-popover` | Text color picker | MIT | P2 |
| `copy-to-clipboard-button` | Copy to clipboard | MIT | P3 |
| `delete-node-button` | Delete node | MIT | P3 |
| `duplicate-button` | Duplicate node | MIT | P3 |
| `move-node-button` | Move node | MIT | P3 |
| `reset-all-formatting-button` | Reset formatting | MIT | P3 |

### Node Components (Rendered Inside Editor)

| Component | Purpose | License | Priority |
|-----------|---------|---------|----------|
| `paragraph-node` | Paragraph styling | MIT | P0 |
| `heading-node` | Heading styling | MIT | P0 |
| `code-block-node` | Code block (with language selector) | MIT | P0 |
| `list-node` | List styling | MIT | P1 |
| `blockquote-node` | Blockquote styling | MIT | P1 |
| `horizontal-rule-node` | Horizontal rule styling | MIT | P1 |
| `image-node` | Image display | MIT | P1 |
| `table-node` | Table (already integrated) | Start | P1 |

### UI Primitives (Low-level Building Blocks)

| Component | Purpose | License |
|-----------|---------|---------|
| `button` | Generic button | MIT |
| `dropdown-menu` | Dropdown menu | MIT |
| `popover` | Popover layer | MIT |
| `toolbar` | Toolbar container | MIT |
| `separator` | Separator | MIT |
| `spacer` | Spacer | MIT |
| `tooltip` | Tooltip | MIT |

### Utility Components

| Component | Purpose | License |
|-----------|---------|---------|
| `floating-element` | Floating positioning | MIT |
| `suggestion-menu` | Suggestion menu base | MIT |

---

## Excluded Components (Explicitly Not Integrating)

| Component | Reason |
|-----------|--------|
| `ai-menu` / `ai-ask-button` | Requires online AI service, not applicable for local editor |
| `improve-dropdown` | AI feature, same as above |
| `emoji-dropdown-menu` | Not needed for local Markdown editor |
| `mention-dropdown-menu` | Requires user system, not applicable for local editor |
| `toc-node` | Papyro consumes outline/TOC from the Rust side, so the editor should not keep the unmounted official TOC node UI |
| `textarea-autosize` | Only depended on removed AI/Improve flows |
| `collaboration` / `collab-context` | Requires Tiptap Cloud, not applicable for local editor |
| `image-node-pro` | To be evaluated later, basic `image-node` may suffice |

---

## Execution Principles

1. **CLI-first**: Use the template generated by `npx @tiptap/cli@latest init notion-like-editor` as the authoritative reference source. All component implementations follow official generated code, no inventing.
2. **Direct copy + trim**: Copy official TSX source from the generated template directly into the project, only make necessary adaptations (remove AI/collaboration dependencies, connect Papyro Rust protocol, local image handling).
3. **One commit per official component**, containing: source import, adaptation changes, old code removal, test verification.
4. **Build before delete**: Integrate official components and confirm they work before deleting corresponding old custom implementations, avoiding functionality gaps.
5. **Markdown serialization first**: For each component integrated, verify its content survives Markdown round-trip without loss.
6. **Incremental TS migration**: Official components are already TSX, keep as-is; old code converts gradually during refactoring.
7. **No online dependencies**: Exclude all components requiring Tiptap Cloud / AI services.

## Estimated Effort

| Phase | Estimate | Notes |
|-------|----------|-------|
| Phase 0 | 1-2 days | CLI template generation + TS config + directory restructure |
| Phase 1 | 5-7 days | Copy official components from template and adapt (largest effort) |
| Phase 2 | 2-3 days | Remove old custom code (verify each removal doesn't break functionality) |
| Phase 3 | 2-3 days | Runtime refactoring |
| Phase 4 | 1-2 days | Table completion |
| Phase 5 | 3-4 days | TS migration of remaining files |
| Phase 6 | 1-2 days | Style unification |
| Phase 7 | 2-3 days | Papyro-specific feature adaptation |
| Phase 8 | 1-2 days | Testing and verification |

Total approximately **18-28 working days**.
