# Markdown 样式参考调研

[English](../markdown-style-references.md)

调研日期：2026-05-02。

Papyro 应该让 Markdown 用户觉得熟悉，但不能变成另一个产品的复制品。这份文档记录后续 Markdown 视觉改造可以参考哪些成熟开源项目。

## 当前技术栈

| 领域 | 当前实现 |
| --- | --- |
| Markdown 解析 | `crates/editor/src/renderer/html.rs` 中的 `pulldown-cmark` |
| Preview 代码高亮 | `crates/editor/src/renderer/html.rs` 中的 `syntect` |
| 编辑器 runtime | `js/src/editor.js` 和 `js/src/editor-core.js` 中的 CodeMirror 6 |
| Mermaid | `mermaid` 和 `codemirror-lang-mermaid` |
| 主题契约 | [theme-system.md](theme-system.md) |

## 候选参考

| 项目 | 为什么值得看 | 对 Papyro 的适配方式 | License / 社区认可 |
| --- | --- | --- | --- |
| [`sindresorhus/github-markdown-css`](https://github.com/sindresorhus/github-markdown-css) | 它目标是用尽量少的 CSS 复刻 GitHub Markdown，并提供 light、dark、dimmed、高对比度、色盲友好等变体。 | 适合作为 Markdown 间距、表格、标题、列表、引用和高对比度覆盖的基准。不要直接整份复制。 | MIT，调研时约 8.8k GitHub stars。 |
| [`shikijs/shiki`](https://github.com/shikijs/shiki) | 基于 TextMate grammar 的高亮方案，有大量主题和框架集成。 | 如果未来想做接近 VS Code 质量的代码主题，可以重点评估。当前 Rust Preview 仍使用 `syntect`，不作为立即迁移目标。 | MIT，调研时约 13.3k GitHub stars。 |
| [`highlight.js`](https://github.com/highlightjs/highlight.js) | 成熟的代码高亮生态，支持语言自动识别和大量主题。 | 可作为主题参考和兼容性基准。Papyro 当前由 Rust 控制语言标签和高亮链路，直接替换收益不一定高。 | BSD-3-Clause，调研时约 24.9k GitHub stars。 |
| [`catppuccin/catppuccin`](https://github.com/catppuccin/catppuccin) | 成熟的调色体系，有 style guide 和大量社区移植。 | 适合作为可选主题灵感，尤其是高质量暗色主题。不建议作为默认视觉，因为 Papyro 默认应保持安静、专业。 | MIT，调研时约 19.1k GitHub stars。 |

## 采用结论

短期：

- 保持 `pulldown-cmark` 和 `syntect`。
- 按 GitHub Markdown 的惯例校准 Preview 和 Hybrid 的 Markdown 间距。
- 使用 Papyro 自己的语义 token，不直接沿用第三方变量名。
- 新增主题变体前，先补高对比度和色盲友好检查。

中期：

- 先评估 `syntect` 是否能提供更好的主题选择，再考虑迁移渲染器。
- 如果代码主题质量仍不够，再比较 `syntect` 与 Shiki bundled themes。
- Catppuccin 这类调色体系只作为可选主题灵感，不作为默认品牌视觉。

## 约束

- 不要把大段第三方 CSS 直接导入 `assets/main.css`。
- 不要绕开 [theme-system.md](theme-system.md) 混用 GitHub Markdown 间距和其它代码主题颜色。
- 新视觉基线必须同时覆盖 Preview 和 Hybrid。
- 如果不是“参考”，而是复制第三方样式规则或主题数据，必须在文档中记录来源和 license。

## 参考链接

- [`github-markdown-css` README](https://github.com/sindresorhus/github-markdown-css)
- [`github-markdown-css` demo](https://sindresorhus.com/github-markdown-css/)
- [Shiki themes](https://shiki.matsu.io/themes)
- [`highlight.js` package license and repository metadata](https://licenses.dev/npm/highlight.js/11.11.1)
- [`catppuccin/catppuccin` README](https://github.com/catppuccin/catppuccin)

