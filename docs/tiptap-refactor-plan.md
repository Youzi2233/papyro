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
| Language | JavaScript (.js/.jsx) 235 files | TypeScript (.ts/.tsx) |
| Build | esbuild (native TS support, no changes needed) | esbuild + tsconfig |
| UI Framework | React 18.3 (already satisfied) | React 18.3 (unchanged) |
| Tiptap | 3.23.1 (already aligned) | 3.23.1+ (keep same version) |
| Component Source | Many custom DOM controllers + partial React | Official UI Components source + minimal adapters |
| Styling | Custom SCSS scattered everywhere | Official component styles + unified design tokens |

Conclusion: React is already satisfied, TypeScript can be incrementally migrated (esbuild native support), no blockers.

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
- [x] Create `js/tsconfig.json` with `allowJs: true`, path alias `@` → `src/`
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
- [x] `tiptap-utils` (trim AI/collaboration utility functions)

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

---

### Phase 6: Style Unification

- [x] Establish unified design tokens (CSS variables) aligned with official component style system
- [x] Remove all custom SCSS that duplicates official components
- [ ] Keep Papyro-specific styles: Mermaid diagrams, KaTeX math formulas, source mode
- [ ] Ensure dark/light theme switches via CSS variables (official components already support this)
- [x] Audit `table-node.scss`, `table-handle-menu.scss` etc.; keep upstream official SCSS and move Papyro-only table host overrides into `tiptap-chrome-table.css`

---

### Phase 7: Papyro-Specific Feature Adaptation

These features are unique to Papyro, not in the official template, and need to be preserved and adapted to the new architecture:

- [ ] Markdown source mode (Source/Hybrid/Preview tri-mode switching)
- [ ] Rust protocol bridge (`window.papyroEditor` facade)
- [ ] Local image paste (file saving handled by Rust side)
- [ ] Mermaid diagram rendering
- [ ] KaTeX math formula rendering
- [ ] Outline/TOC generation (consumed by Rust side)
- [ ] i18n multilingual support
- [ ] Multi-tab editor instance management (editorRegistry)

---

### Phase 8: Testing and Verification

- [ ] Update `tiptap-runtime-smoke.js` for new architecture
- [ ] Update all existing test files for new module paths
- [ ] Add Markdown serialization round-trip tests for each official component
- [ ] Verify `scripts/check-editor-markdown-gate.js` passes
- [ ] End-to-end verification of all interactions in desktop WebView

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
