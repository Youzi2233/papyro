# Hybrid 编辑器架构评审

[English](../editor-hybrid-architecture.md) | [编辑器指南](editor.md)

Hybrid 模式应该像现代 Markdown 编辑器，而不是一个容易被点击、光标和选区打破的“美化源码编辑器”。这份评审对比主流编辑器架构，并明确 Papyro 下一阶段的工程方向。

## 当前状态

Papyro 现在使用 CodeMirror 6 作为交互式编辑器运行时：

- Rust 分析 Markdown block，并把 block hints 发送给 JS。
- CodeMirror 负责文档状态、光标、选区、IME、粘贴和 undo。
- Hybrid 模式通过 decorations 和 widgets 渲染 Markdown，同时保留底层 Markdown 源码。
- Preview 使用 Rust 渲染 HTML，是只读模式。

这种方案能保持 Markdown 文件可移植，但也意味着 Hybrid 的每个渲染界面都必须遵守 CodeMirror 的文档、选区和布局规则。

## 决策记录

决策：下一轮 Hybrid 稳定化继续基于 CodeMirror decorations 和 widgets。

暂时不迁移到 ProseMirror、Tiptap、Lexical、Slate，也不自研 Typora 式编辑器。当前优先级是把现有 source-first 架构打磨到足够可靠：统一 selection、cursor mapping、widget measurement，并补齐回归覆盖。

只有当 CodeMirror 稳定化后仍有明确证据表明以下风险不可接受时，才重新评估：

- 普通文本点击仍然会把光标映射到错误源码行。
- 选区仍然会泄漏到无关空白或渲染 widget。
- IME、粘贴、undo 或键盘导航无法做到可预测。
- 文档原生表格、数学公式、Mermaid 或图片在 decorations 之上需要过多定制行为。

如果触发重新评估，下一候选方案应优先做 ProseMirror/Tiptap 原型，因为它在文档模型和 node view 上最适合 Markdown 式结构化内容。

## 架构选项

| 方案 | 优势 | 对 Papyro 的风险 |
| --- | --- | --- |
| CodeMirror decorations/widgets | 迁移成本最低；保留当前 source-first 模型 | widget 替换文本或影响高度时，容易破坏 hit testing |
| ProseMirror/Tiptap node views | 文档模型强；node view 能承载复杂 UI | 需要 Markdown 和文档 JSON 之间的稳定转换 |
| Lexical decorator nodes | 交互式 node 模型和性能方向清晰 | 需要替换当前 CodeMirror runtime，并定义完整序列化策略 |
| Slate inline/void elements | 树模型灵活，接近 DOM 思维 | 需要自己补更多编辑器能力 |
| 完全自研 Typora 式编辑器 | 控制力最高 | 成本极高，容易在 IME、selection、undo 和可访问性上回归 |

## 评审结论

### CodeMirror

CodeMirror 的 content DOM 由编辑器管理。官方文档强调内容变更应通过 transaction 完成，样式应通过 decoration 完成，而不是直接改 DOM。文档还说明，只有直接提供的 decoration set 可以影响垂直布局；基于 viewport 计算的 decoration function 在 viewport 计算后运行，不能引入 block widget，也不能跨行做 replacement decoration。这正好解释了我们曾经遇到的 block decoration 放错位置导致的运行时错误。

对 Papyro 有用的规则：

- 只要 decoration 可能影响布局，就放进 state field。
- 基于 viewport 的 decoration 只做不影响布局的 inline 样式。
- 对需要整体移动或删除的渲染片段使用 `EditorView.atomicRanges`。
- widget 渲染后高度可能变化时，使用 `requestMeasure`。
- 除非 cursor mapping 已被测试覆盖，否则不要用 replacement 隐藏跨多行 Markdown 源码。

参考：[CodeMirror decoration example](https://codemirror.net/examples/decoration/)、[CodeMirror reference](https://codemirror.net/docs/ref/#view.EditorView%5Edecorations)、[CodeMirror widget reference](https://codemirror.net/docs/ref/#view.Decoration%5Ewidget)。

### ProseMirror 和 Tiptap

ProseMirror 基于不可变文档转换和 transaction。它的 node view 可以让特定文档节点渲染自定义 DOM，也可以暴露 `contentDOM` 让节点内部保持可编辑。Tiptap 在这之上提供更直接的 node view 封装，可以把编辑器内 UI 和序列化结果分开。

这更适合文档原生的表格、任务项、嵌入内容和 callout。代价是 Papyro 需要稳定的 Markdown-to-document mapping，以及能保留用户源码预期的 document-to-Markdown serializer。

参考：[ProseMirror guide](https://prosemirror.net/docs/guide/)、[ProseMirror NodeView reference](https://prosemirror.net/docs/ref/#view.NodeView)、[Tiptap node views](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views)。

### Lexical

Lexical 把 node 同时视为编辑器视觉界面和存储状态。它提供 `ElementNode`、`TextNode` 和 `DecoratorNode` 等扩展点，`DecoratorNode` 可以把任意 UI 插入编辑器。

这对 Mermaid、数学公式、图片和未来的嵌入组件很有吸引力。但它不是直接修复方案，因为 Papyro 需要替换当前 CodeMirror runtime，并为每个 Markdown 特性定义序列化行为。

参考：[Lexical nodes](https://lexical.dev/docs/concepts/nodes)。

### Slate

Slate 把文档建模成接近 DOM 的树：editor、element 和 text node。Element 可以是 block 或 inline，也可以是 void 或 non-void。Void element 适合图片、mention、embed 这类原子内容，但 selection 渲染规则需要格外谨慎。

Slate 很灵活，但相比 ProseMirror/Tiptap，Papyro 需要自己实现更多编辑器行为。

参考：[Slate nodes](https://docs.slatejs.org/concepts/02-nodes)、[Slate Element API](https://docs.slatejs.org/api/nodes/element)。

## 推荐方向

下一轮 Hybrid 稳定化仍然保留 CodeMirror，但不要再把每个视觉问题当成孤立 CSS bug。

稳定 selection 和 hit testing 策略：

- CodeMirror 仍然负责文档位置、光标、选区、IME、粘贴和 undo。
- Hybrid decoration 可以改善阅读观感，但普通文本点击必须解析回 CodeMirror 文本位置。
- 单击命中在“原始目标行顶部”保留一小段上一行滞后区，因为渲染 widget 会让上一行视觉下半部分错误映射到下一行源码。
- 拖拽选区一旦开始移动，就使用 CodeMirror 原始坐标，避免滞后区扭曲范围选择。
- Mermaid 编辑器和表格 widget 这类交互式岛屿自己处理内部 pointer 行为，并排除 relaxed pointer correction。
- inline 语法标记只在 collapsed cursor 直接落到 marker 范围时暴露；选中文本不能让无关源码恢复显示。

短期规则：

- 建立一个统一的 `HybridBlockViewState` 决策点，负责 `source`、`rendered`、`editing` 和 `error` 状态。
- inline decoration 默认只做视觉样式；需要原子行为时必须有明确 atomic ranges。
- 普通点击 inline code、link 或列表内容时，不要恢复 Markdown 源码。
- 只把源码暴露留给明确的编辑入口，或 Mermaid 这类复杂 block。
- 代码块在 Hybrid 下默认保持渲染态，除非用户明确编辑 fence metadata 或源码。
- selection 颜色必须成为主题 token，统一覆盖 inline code、link、代码块、Mermaid 和表格。
- 增加可重复 smoke 覆盖：cursor hit testing、文本选区、粘贴替换、IME 和模式切换。

中期规则：

- 表格和数学公式先做成 block-level state machine，再继续增加更多 Markdown shortcut。
- Mermaid、math、table 和 image 应被视为“交互式 block island”，高度稳定，并有明确编辑入口。
- Preview 和 Hybrid 的 Markdown 样式使用同一套 token。
- 记录会影响布局的 widget measurement，避免异步高度跳动。

长期判断：

- 如果完成 CodeMirror 稳定化后，Hybrid 仍无法提供稳定的 cursor/selection 行为，再评估 ProseMirror/Tiptap 原型。
- 迁移前，原型必须能 round-trip Markdown，保留 undo、paste、IME 行为，并接入现有 Rust storage flow。

## 下一步实现清单

- 在 JS 中增加统一的 `HybridBlockViewState` 决策点。
- 审计所有 multi-line replacement，并把影响布局的 decoration 移到 state field。
- 增加 cursor placement 测试：inline code、link、list marker、code fence、table 和 Mermaid。
- 增加 selection color 和 selection replacement 测试：覆盖 inline widget 和 block widget。
- 增加一个手工/可视 smoke fixture，包含标题、列表、链接、inline code、代码块、表格、公式、图片和 Mermaid。

当前可重复覆盖位于 `js/test/editor-core.test.js`，主 Markdown fixture 是 `js/test/fixtures/hybrid-editing-baseline.md`。
