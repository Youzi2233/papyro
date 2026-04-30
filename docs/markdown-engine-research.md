# Markdown 引擎调研备忘

本文记录 Markdown 渲染、高亮、Mermaid、解析器和未来独立开源方向的技术判断。它不是当前迭代的执行清单，而是后续改造 Markdown 编辑体验时的决策入口。

## 结论

- 代码块高亮、Mermaid、数学渲染和完整 Markdown 解析都不应该手搓。
- 当前 Preview 渲染已经是 Rust 原生：`pulldown-cmark` 负责 Markdown event stream，`syntect` 负责代码高亮。
- 当前 Hybrid 编辑体验是混合架构：Rust 生成轻量 block hints，JS/CodeMirror 负责实时输入、selection、IME 和 decorations。
- 短期应继续保留 CodeMirror 作为输入引擎，不要迁移到自研 `contenteditable`。
- 中期可以把 Markdown 语义模型升级为 Rust crate，并评估 `comrak` 或 `tree-sitter-markdown`。
- 长期如果语义模型稳定，可以抽成独立 `papyro-markdown-engine`，供 desktop、mobile、web 和外部项目复用。

## 当前实现

Papyro 现在不是“Markdown 全靠 JS 解析”，而是三层协作：

- Preview 渲染：`crates/editor/src/renderer/html.rs` 使用 `pulldown-cmark` 和 `syntect`。
- 交互 block hints：`crates/editor/src/parser/blocks.rs` 手写轻量块分析，服务 Hybrid mode。
- 编辑器 runtime：`js/src/editor.js` 使用 CodeMirror Markdown/Lezer 生态处理实时语法、输入和装饰。

这套拆分的好处是输入稳定，渲染安全，性能边界清楚。主要问题是 Rust block hints 目前过轻，无法表达 Typora-like 编辑所需的 marker/content/source/cell 范围。

## 第三方库选择

### 代码块高亮

当前选择：`syntect`。

建议继续使用 `syntect` 做 Preview 代码高亮。它成熟、Rust 原生、语言覆盖广，也适合服务端或本地离线渲染。

后续优化重点不是替换库，而是：

- 建立亮暗主题映射，不再长期固定 `InspiredGitHub`。
- 对高亮结果做缓存，避免 Preview 反复全量高亮。
- 大文档继续走 size gate，必要时关闭高亮或降级。
- 让 Hybrid rendered code block 复用 Preview 的视觉 token。

### Mermaid

推荐选择：官方 `mermaid` npm 包。

Mermaid 的语法解析、布局和 SVG 渲染都应该交给官方 JS 库。Papyro 只负责识别 fenced code block、管理编辑/渲染状态、处理 timeout、错误态和安全边界。

推荐边界：

- Rust 识别 ```` ```mermaid ```` block，并输出 source range 与 language metadata。
- JS runtime 在 WebView 内调用 Mermaid 渲染 SVG。
- 点击 Mermaid 图进入源码编辑态。
- 失焦或确认后重新渲染。
- 渲染失败只显示错误态，不改写或丢失源码。

### 数学渲染

当前选择：`katex`。

建议继续使用 KaTeX。它适合本地 WebView，渲染速度快，也比手写 math parser 稳定得多。数学块可以复用 Mermaid 的 block state machine。

### Markdown 解析器

候选库对比：

| 库 | 适合场景 | 优点 | 风险 |
| --- | --- | --- | --- |
| `pulldown-cmark` | Preview 渲染、事件流、安全 HTML 管线 | 快、轻、当前已使用、支持 source-map 思路 | 不提供完整编辑型 AST |
| `comrak` | GFM AST、source position、可编辑语义模型 | CommonMark + GFM 兼容度高，有 AST 和 sourcepos | 比 `pulldown-cmark` 重，需要评估性能 |
| `tree-sitter-markdown` | 增量解析、编辑器实时语义 | 适合局部更新和大文档编辑 | Markdown 语法复杂，语法树准确性需要实测 |
| `markdown-rs` | mdast 生态、AST 输出 | mdast 语义清晰，适合跨生态数据结构 | 项目成熟度和维护节奏需要评估 |

建议路线：

- Preview 继续使用 `pulldown-cmark`，除非出现明显兼容性瓶颈。
- M2 前做一个 parser spike，对比 `comrak` 和 `tree-sitter-markdown`。
- 如果目标是稳定、完整的 block metadata，优先评估 `comrak`。
- 如果目标是超大文档局部更新，优先评估 `tree-sitter-markdown`。

## 纯 Rust 化的判断

“纯 Rust Markdown 引擎”可以实现，但要避免把范围扩大成“纯 Rust 编辑器”。

适合 Rust 化的部分：

- Markdown block/inline semantic model。
- source/content/marker range mapping。
- table cell model。
- Mermaid/math/image/code block detection。
- Preview HTML rendering。
- 安全 URL 和资源策略。
- 可序列化协议 DTO。

不建议 Rust 化的部分：

- CodeMirror 输入引擎。
- selection、composition、undo history 等浏览器编辑细节。
- Hybrid 当前块 rendered/edit/source_fallback/error 状态切换。
- Mermaid 和 KaTeX 的具体渲染布局。

最优边界是 Rust 负责“可靠语义”，JS 负责“实时编辑现场”。

## 开发成本

粗略成本按模块估算：

| 工作 | 预估成本 | 说明 |
| --- | --- | --- |
| Parser spike | 2-4 天 | 对比 `comrak`、`tree-sitter-markdown` 在 fixtures 上的输出质量和耗时 |
| 替换/升级 block hints | 1-2 周 | 输出 marker/content/source ranges，并保持协议兼容 |
| 表格语义模型 | 1 周 | cells、alignments、separator、异常降级 |
| 独立 crate 初版 | 2-4 周 | API、features、serde、测试夹具、文档、CI |
| 完整 Typora-like Hybrid | 6-10 周 | 主要成本在编辑状态机和 UX，不在 parser 本身 |

换 parser 本身不会自动带来 Typora-like 体验。真正的大头是 selection、IME、undo、局部源码暴露、表格回写和 widget 状态机。

## 性能预期

Rust semantic engine 可以提升解析稳定性和大文档可控性，但不是端到端卡顿的银弹。

可能收益：

- Parser 层耗时可能降低或更可预测，取决于库和缓存策略。
- `tree-sitter` 增量解析可以减少小编辑后的全量重算。
- Rust 统一语义模型可以减少 JS 端重复扫描和手写正则。

需要继续控制的瓶颈：

- WebView DOM 和 CodeMirror decorations 数量。
- Rust -> JS 序列化 payload 大小。
- Preview 全量 HTML 生成和代码高亮。
- Mermaid/KaTeX block 渲染成本。
- 大文档下的滚动同步和 widget 创建。

性能目标不应写成“换 Rust 后自然变快”，而应写成：

- 小文档保持实时完整语义。
- 中等文档限制解析和 decoration 范围。
- 大文档明确降级，不阻塞输入。

## 独立开源方向

如果未来要单独开源，建议抽成 `papyro-markdown-engine`。

包边界：

- 不依赖 Dioxus。
- 不依赖 Papyro workspace、tab、storage、settings。
- 不直接写文件。
- 默认只输出纯数据结构。
- HTML、syntect、serde、wasm、tree-sitter 做 optional features。

核心 API 可以类似：

```rust
pub struct MarkdownEngineOptions {
    pub max_bytes: usize,
    pub enable_gfm: bool,
    pub enable_math: bool,
    pub enable_mermaid: bool,
}

pub struct MarkdownSemanticSnapshot {
    pub revision: u64,
    pub fallback: Option<MarkdownFallback>,
    pub blocks: Vec<MarkdownBlock>,
}

pub fn analyze_markdown(
    markdown: &str,
    revision: u64,
    options: MarkdownEngineOptions,
) -> MarkdownSemanticSnapshot;
```

第一版只承诺稳定输出语义范围，不承诺实现编辑器 UI。这样它能同时服务 Papyro 和其它端。

## 后续触发条件

满足任一条件时，可以启动 Rust Markdown 引擎改造：

- Hybrid 需要可靠的 marker/content/source ranges，现有手写 block hints 明显不够。
- 表格、Mermaid、数学块进入可编辑阶段，需要统一 block metadata。
- 大文档 Hybrid 因 JS 重复扫描或 decoration payload 卡顿。
- 计划把 Markdown 能力开放给 mobile/web，避免每端重复实现。
- 有明确开源目标，希望沉淀成跨端 crate。

## 推荐决策

当前阶段推荐：

- 不手搓代码高亮，继续用 `syntect`。
- 不手搓 Mermaid，接入官方 `mermaid` npm 包。
- 不急着把 CodeMirror 解析完全替换掉。
- 在 M2 前做 `comrak` 和 `tree-sitter-markdown` spike。
- 如果 spike 结果稳定，再把 `crates/editor/src/parser/blocks.rs` 演进为独立 Markdown semantic engine。

## 参考资料

- `pulldown-cmark`: https://github.com/pulldown-cmark/pulldown-cmark
- `syntect`: https://github.com/trishume/syntect
- `mermaid`: https://mermaid.js.org/
- `comrak`: https://github.com/kivikakk/comrak
- `tree-sitter-markdown`: https://github.com/tree-sitter-grammars/tree-sitter-markdown
- `markdown-rs`: https://github.com/wooorm/markdown-rs
- CodeMirror Markdown: https://codemirror.net/docs/ref/#lang-markdown
- KaTeX: https://katex.org/
