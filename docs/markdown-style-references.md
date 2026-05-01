# Markdown Style References

[简体中文](zh-CN/markdown-style-references.md)

Reviewed on 2026-05-02.

Papyro should look familiar to Markdown users without becoming a copy of another product. This review records which open-source projects are safe references for future Markdown visual work.

## Current Stack

| Area | Current implementation |
| --- | --- |
| Markdown parsing | `pulldown-cmark` in `crates/editor/src/renderer/html.rs` |
| Preview code highlighting | `syntect` in `crates/editor/src/renderer/html.rs` |
| Editor runtime | CodeMirror 6 in `js/src/editor.js` and `js/src/editor-core.js` |
| Mermaid | `mermaid` and `codemirror-lang-mermaid` |
| Theme contract | [theme-system.md](theme-system.md) |

## Reference Candidates

| Project | Why it matters | Fit for Papyro | License / adoption |
| --- | --- | --- | --- |
| [`sindresorhus/github-markdown-css`](https://github.com/sindresorhus/github-markdown-css) | It targets the minimal CSS needed to reproduce GitHub Markdown and includes light, dark, dimmed, high-contrast, and colorblind variants. | Use as the baseline reference for Markdown spacing, tables, headings, list rhythm, blockquotes, and high-contrast coverage. Do not copy the full stylesheet blindly. | MIT, about 8.8k GitHub stars as of review. |
| [`shikijs/shiki`](https://github.com/shikijs/shiki) | TextMate grammar based highlighting with bundled themes and broad framework integrations. | Good long-term reference if Papyro wants VS Code-like code themes or a JS-side highlighter. Current Rust preview still uses `syntect`, so this is not an immediate migration. | MIT, about 13.3k GitHub stars as of review. |
| [`highlight.js`](https://github.com/highlightjs/highlight.js) | Large, established highlighting ecosystem with language auto-detection and many themes. | Useful as a theme reference and compatibility benchmark. Less attractive as a direct replacement because Papyro already controls language labels and currently highlights in Rust. | BSD-3-Clause, about 24.9k GitHub stars as of review. |
| [`catppuccin/catppuccin`](https://github.com/catppuccin/catppuccin) | Mature palette system with a style guide and many community ports. | Good optional theme inspiration, especially for a polished dark theme. Avoid making it the default because Papyro should keep a quiet, professional base. | MIT, about 19.1k GitHub stars as of review. |

## Adoption Decision

Short term:

- Keep `pulldown-cmark` and `syntect`.
- Align Preview and Hybrid Markdown spacing against GitHub Markdown conventions.
- Use Papyro semantic tokens instead of third-party variable names.
- Add high-contrast and colorblind-aware checks before shipping new theme variants.

Medium term:

- Evaluate whether `syntect` can expose better theme choices before considering a renderer migration.
- If code theme quality remains weak, compare `syntect` themes against Shiki bundled themes.
- Consider Catppuccin-style palettes only as optional themes, not as the base visual identity.

## Guardrails

- Do not import a large third-party stylesheet directly into `assets/main.css`.
- Do not mix GitHub Markdown spacing with unrelated code theme colors without going through [theme-system.md](theme-system.md).
- Do not add a new visual baseline unless Preview and Hybrid can share it.
- Document source licenses if any third-party style rules or theme data are copied rather than merely referenced.

## Useful Source Links

- [`github-markdown-css` README](https://github.com/sindresorhus/github-markdown-css)
- [`github-markdown-css` demo](https://sindresorhus.com/github-markdown-css/)
- [Shiki themes](https://shiki.matsu.io/themes)
- [`highlight.js` package license and repository metadata](https://licenses.dev/npm/highlight.js/11.11.1)
- [`catppuccin/catppuccin` README](https://github.com/catppuccin/catppuccin)

