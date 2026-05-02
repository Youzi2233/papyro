# UI Token Audit

[简体中文](zh-CN/ui-token-audit.md) | [Documentation](README.md)

This audit records the current CSS token debt before the Phase 3.5 redesign changes visual surfaces.

Run it with:

```bash
node scripts/report-ui-tokens.js
node scripts/report-ui-tokens.js --self-test
```

The script is intentionally report-only by default. Use `--strict` locally when a surface is clean enough to fail on new risks.

## Current Result

Audit date: May 2, 2026.

```text
Scanned files: 37
Raw color values: 570
  allowed: 488
  component: 47
  fallback: 32
  data: 3
Literal spacing values: 664
  component: 587
  allowed: 77
UI token audit found 669 migration risks.
```

## What The Categories Mean

| Category | Meaning | Action |
| --- | --- | --- |
| `allowed` | Theme palette, semantic token, or harmless reset value. | Keep unless the token model changes. |
| `component` | Raw color or literal spacing inside component/surface CSS. | Migrate to semantic/component tokens during surface redesign. |
| `fallback` | JS editor fallback inside a `var(...)` chain. | Keep until CodeMirror tokens are guaranteed for all modes. |
| `data` | User-facing data value such as tag colors. | Keep as data, but do not use as component styling. |

## Main Findings

- Desktop shared CSS and desktop runtime CSS are mostly synchronized, but both contain component-level spacing literals.
- Mobile CSS still has many standalone rgba/hex values and should be tokenized before serious mobile UI work.
- `js/src/editor-theme.js` has fallback colors in CodeMirror styles. These are acceptable short term but should shrink as semantic tokens stabilize.
- Rust UI still contains a few raw color data defaults for tags and language/view metadata. These should remain data values unless they become visual chrome.
- Repeated selectors show where primitives are needed most: Preview/Markdown, tool icons, buttons, view mode controls, tooltips, tree rows, and empty states.

## Migration Targets

| Risk | Target |
| --- | --- |
| `component` raw colors in desktop CSS | Replace with `--mn-chrome-*`, `--mn-control-*`, `--mn-selection-*`, or `--mn-status-*`. |
| `component` raw colors in mobile CSS | Align mobile with shared semantic tokens before adding mobile-only themes. |
| literal control sizes | Promote to component tokens such as button height, icon button size, tree row height, menu padding. |
| repeated row styles | Extract `ResultRow`, `TreeRow`, `SidebarItem`, and `SettingsRow` patterns. |
| repeated Markdown selectors | Keep in Markdown token layer, then reduce duplication between Preview and Hybrid. |

## Rules Going Forward

- Run `node scripts/report-ui-tokens.js` before broad UI redesign work.
- Do not add new component raw colors unless the value is a documented token fallback.
- If a spacing value appears across surfaces, promote it to a component token.
- New primitives must document their token contract in [UI Architecture And Component Inventory](ui-architecture.md).
- When a surface is cleaned up, update this audit with the new risk count.
