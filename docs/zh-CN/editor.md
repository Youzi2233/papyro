# Markdown 编辑器指南

[English](../editor.md) | [文档首页](README.md)

编辑器是 Papyro 的产品中心。Source 模式必须可信，Preview 模式必须好读，Hybrid 模式必须舒服到可以承担日常写作。

## 目标

- Markdown 文件保持可移植、可读。
- 标题、列表、链接、表格、代码、公式、图片和 Mermaid 等常见写作任务要现代、顺手。
- Source 模式保留精确控制能力。
- Preview 和 Hybrid 的视觉样式保持一致。
- 先保证 selection、cursor、undo、paste、IME，再叠加更多 decoration。

## 三种模式

| 模式 | 目的 | 编辑方式 |
| --- | --- | --- |
| Source | 纯 Markdown 编辑 | 完整源码 |
| Hybrid | 渲染态 Markdown block + 可编辑行为 | 主写作模式 |
| Preview | 渲染文档 | 只读 |

```mermaid
flowchart LR
    source["Source<br/>完整 Markdown"]
    hybrid["Hybrid<br/>渲染态写作"]
    preview["Preview<br/>只读渲染"]

    source <--> hybrid
    hybrid <--> preview
    source <--> preview
```

## Runtime 契约

`feat-tiptap` 分支现在已经在现有 `window.papyroEditor` facade 后面运行
Tiptap/ProseMirror。Rust 和 Dioxus 仍然只依赖稳定 facade，不直接依赖
Tiptap 内部对象。

内容同步必须经过 `MarkdownSyncController`：

- Rust/Dioxus 仍然负责保存内容、dirty 状态、tab 状态和 workspace 状态。
- JS 每个 editor entry 只保留一份 canonical Markdown 字符串。
- Rust `set_content` 先更新 controller，再用 `contentType: "markdown"` 写入 Tiptap，并抑制回声事件。
- Tiptap `update` 事件通过 `editor.getMarkdown()` 产出 Markdown，并发送 `content_changed`。
- Markdown parse 失败不能覆盖上一份安全内容。JS 要发送 `runtime_error`，并让用户至少能回到可编辑 source 内容。
- Source 模式后续也必须共用这个 controller，不能维护另一份隐藏内容副本。
- Preview 继续由 Rust 渲染 HTML，不能成为持久化内容来源。

## Rust 和 JS 职责

Rust 负责：

- Markdown 统计和文档信息
- 大纲提取
- Hybrid block hints
- Preview HTML 渲染
- `syntect` 代码高亮
- `crates/editor/src/protocol.rs` 协议结构

JS 负责：

- Tiptap editor state 和 extensions
- 输入命令、粘贴、IME
- selection、cursor、scroll
- Hybrid 富文本行为和 node views
- Mermaid、KaTeX、table、task list、image 和 code block 扩展

应用层负责：

- tab 真相
- content 真相
- dirty/save/conflict 状态
- 文件保存
- workspace context

## Hybrid 产品标准

Hybrid 不是“把 Markdown 标记藏起来”就完成了。它需要对齐 Typora、飞书文档这类现代 Markdown/文档工具。

下一轮 Hybrid 稳定化的架构评审见 [Hybrid 编辑器架构评审](editor-hybrid-architecture.md)。

期望能力：

- 标题确认后渲染，同时仍能直接编辑。
- 列表延续、缩进、反缩进、选中都可预测。
- checkbox 可以直接切换，不破坏 Markdown source。
- 链接和 inline code 普通点击不会莫名恢复源码。
- 代码块 cursor 命中和 selection 对比度稳定。
- Mermaid 可以边看图边编辑源码。
- 表格可以插入、导航、编辑，而不是手调 pipe。
- inline/display math 可以插入、预览和纠错。
- 粘贴能替换选区，并保留预期 Markdown 行为。
- IME 不被 Markdown shortcut 打断。

## Block 优先级

| Block | 必须做到 |
| --- | --- |
| Heading | 渲染样式、稳定 cursor、需要时才暴露 marker |
| List | 延续、缩进、checkbox、selection 稳定 |
| Table | 插入表格、新增/删除行列、单元格导航、对齐 |
| Code block | 代码高亮、稳定 hit testing、可见 selection |
| Inline code | 统一选中背景，不意外暴露源码 |
| Link | 可点击，也可预测地编辑 |
| Math | inline/display 插入、预览、错误反馈 |
| Mermaid | 复杂图表支持源码和渲染并行 |
| Image | 粘贴/导入本地附件、安全渲染、保留 Markdown 链接 |

## 插入入口

命令面板提供常见写作结构的插入命令：表格、围栏代码块、链接、图片、提示块、行内公式、独立数学公式、Mermaid 图和任务列表。这些命令会通过 editor runtime command queue 插入到当前 tab，因此和粘贴片段共用同一条 selection replacement 路径。片段可以携带光标落点，插入公式和 block 后可以直接继续输入。

Hybrid 表格 widget 支持直接编辑单元格、用 Tab/Shift+Tab 在单元格之间移动，并且行列操作会围绕当前聚焦的单元格执行。Markdown 源码仍然是存储格式，但常规表格编辑不应要求用户手动对齐 pipe 语法。

Hybrid 和 Preview 共用同一套文档节奏。编辑器、源码面板、fallback 编辑器和 Preview 滚动区都至少保留 24px padding；Hybrid 无序/有序列表使用与 Preview 相同的缩进和列表项间距 token。

单击表格单元格的任意非交互表面，包括已有文字，会创建 Papyro 的视觉单元格选中态并显示主题色边框，但不会把这次点击转换成 ProseMirror `CellSelection`。文本光标仍会落在鼠标位置，同一单元格内拖动仍可保持原生文本选择体验。从一个单元格拖到另一个单元格时，才会升级为矩形单元格范围选区；链接、按钮、输入框等交互型行内控件继续保留原生点击行为。

选中单个表格单元格时，应显示清晰的主题色边框。hover 表格单元格时，行/列轴向句柄会显示在表格网格外侧；句柄跨度跟随当前行高或列宽，鼠标从表格跨入 rail 时保持可达，并且只跟 hover 绑定、不被选中态影响。点击句柄后选中整行或整列，并且只有 ProseMirror 行/列选区成功后才打开对应作用域的表格菜单。

块句柄必须命中语义 block 的拥有者。表格、代码块、图片、独立公式和 Mermaid block 只暴露一个外层 block 级句柄；在表格单元格或复杂 block 内部控件上 hover 时，不能再生成子段落或子控件句柄。表格的行、列、单元格和范围控件属于表格 overlay，不属于通用块句柄。

Hybrid 选区颜色由共享的 `--mn-hybrid-selection` token 驱动。代码块、inline code、链接、表格输入框和 Mermaid 源码编辑区都应该使用与普通编辑器文本一致的选区色，避免浏览器原生蓝色和自定义编辑器选区层混在一起。

Hybrid pointer 行为必须区分文字字形和行高空隙。鼠标 hover 或点击文字本身时，使用当前行的编辑语义；hover 到文字下方的竖向空隙时，保持普通态，并且拖选应命中下一行；hover 到文字上方空隙时，应命中上一行。选中背景只应覆盖文字/字形矩形，不能把整块行高空隙都染色。

当上一行或下一行不存在时，空隙命中会回退到当前行。这样首行/末行点击不会跳到 `0` 这样的虚拟行，同时保持文档中间区域的空隙选择规则可预测。

## 渲染栈

Rust 侧：

- `pulldown-cmark` 解析 Markdown
- `syntect` 代码高亮
- `crates/editor/src/renderer/html.rs` 负责 HTML 安全和本地图片 URL

JS 侧：

- Tiptap/ProseMirror 负责 editor state 和渲染
- `@tiptap/markdown` 负责 Markdown parse/serialize round-trip
- Mermaid
- KaTeX

采用新的 Markdown 样式或渲染库前，先看 [Markdown 样式参考调研](markdown-style-references.md)。不要直接复制大段第三方样式。Papyro 需要统一的应用设计系统。

## 协议规则

- Rust -> JS command 必须体现在 `crates/editor/src/protocol.rs`。
- JS -> Rust event payload 必须稳定且有测试。
- View mode、preferences、content changes、save requests、paste image requests、runtime ready、runtime error 必须显式。
- JS 不直接写文件。
- Rust 是保存内容、tab 状态和 workspace 状态的真相来源。

## 手工 Smoke

编辑器改动后至少验证：

- Source 和 Hybrid 输入中英文。
- 标题和列表中使用中文输入法。
- 选中文本后粘贴普通文本。
- 选中文本后粘贴 URL。
- 插入标题、列表、checkbox、代码块、inline code、表格、公式、Mermaid。
- Source -> Hybrid -> Preview 来回切换。
- 三种模式点击大纲。
- 大文档策略提示可理解。
- inline code、代码块、Mermaid 编辑区选中颜色可见。
