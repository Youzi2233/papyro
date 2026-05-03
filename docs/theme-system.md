# Theme System

[简体中文](zh-CN/theme-system.md)

Papyro themes are built from semantic CSS tokens. A component should describe what it needs, not which hex value looks right today.

```mermaid
flowchart TD
    palette["Palette tokens<br/>bg, surface, ink, accent, state"]
    semantic["Semantic contracts<br/>chrome, editor, markdown, code, selection, focus, status"]
    components["Rust UI and CSS components"]
    editor["CodeMirror runtime"]
    preview["Markdown preview"]

    palette --> semantic
    semantic --> components
    semantic --> editor
    semantic --> preview
```

## Token Layers

| Layer | Examples | Who should use it |
| --- | --- | --- |
| Palette | `--mn-bg`, `--mn-surface`, `--mn-ink`, `--mn-accent` | Theme authors and low-level CSS only |
| Chrome | `--mn-chrome-bg`, `--mn-chrome-surface`, `--mn-chrome-ink-muted` | Sidebar, header, modal, command palette, status bar |
| Editor canvas | `--mn-editor-canvas-bg`, `--mn-editor-canvas-ink`, `--mn-editor-active-line-bg` | CodeMirror host and source editing UI |
| Markdown | `--mn-markdown-ink`, `--mn-markdown-muted-ink`, `--mn-markdown-link` | Preview and Hybrid rendered Markdown |
| Code | `--mn-code-surface`, `--mn-code-block-surface`, `--mn-code-ink`, `--mn-code-border` | Inline code, fenced code, Mermaid source panes |
| Selection and focus | `--mn-selection-bg`, `--mn-selection-ink`, `--mn-focus-ring` | Selection backgrounds, focused controls, editor cursor states |
| Status | `--mn-status-danger`, `--mn-status-warning`, `--mn-status-success` | Save states, destructive actions, warnings, success indicators |

## Source Files

- `assets/main.css` is the shared design source used by packaged assets.
- `apps/desktop/assets/main.css` mirrors the desktop runtime copy.
- `assets/styles/modal.css` and `apps/desktop/assets/styles/modal.css` hold modal-specific styles.
- `assets/styles/markdown.css` and `apps/desktop/assets/styles/markdown.css` hold the document surface, outline, Preview, and rendered Markdown rhythm.
- `js/src/editor-theme.js` consumes the same tokens inside CodeMirror.

When changing a token that is mirrored in an app asset, update both copies in the same commit.

## Authoring Rules

- Prefer semantic tokens in component CSS. Use `--mn-chrome-surface` instead of `--mn-surface` when styling app chrome.
- Keep Preview and Hybrid Markdown on the same `--mn-markdown-*` and `--mn-code-*` tokens.
- Add a semantic token before adding another one-off color to a component.
- Do not encode behavior in a color name. Use `--mn-status-warning`, not `--mn-yellow`.
- Do not introduce a new theme until the token contract covers app chrome, editor canvas, Markdown, code blocks, selection, focus rings, and status colors.

## Component Primitives

Shared UI surfaces live in `crates/ui/src/components/primitives.rs`. Use these before creating one-off controls.

See [UI Architecture And Component Inventory](ui-architecture.md) for the current primitive inventory, target component set, migration order, and one-off CSS rules.

Behavior and accessibility should use mature open-source systems as references. Radix Primitives is the reference for keyboard and ARIA behavior, while shadcn/ui is the reference for copy-and-own composition and restrained visual hierarchy. Papyro does not depend on either React library directly.

## Current Themes

Papyro currently ships System, Light, Dark, GitHub Light, GitHub Dark, High Contrast, and Warm Reading. Curated themes should override palette tokens first, then only override semantic tokens when the theme needs a deliberate behavior difference.
