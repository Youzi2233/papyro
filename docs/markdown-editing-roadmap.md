# Markdown 编辑体验优化 Roadmap

本文定义下一轮 Markdown 编辑专项优化路线。目标不是继续给当前 Hybrid mode 叠更多零散装饰，而是把编辑区推进到接近 Typora 的单栏写作体验：实时编辑、实时预览、低干扰显示 Markdown 语义，并让 Hybrid 与 Preview 使用同一套视觉语言。

## Todo 更新规则

- `[ ]` 表示未完成；`[x]` 表示已经完成并有验证证据。
- 每完成一个标准任务，同步勾选对应任务和验收项。
- 提交仍按最小任务执行；勾选不代表已经提交或推送。
- 如果实现时发现任务需要拆分、合并或调整顺序，先更新本文，再继续推进。
- 只勾选有明确验证证据的事项；验证命令和风险记录写在对应提交或阶段说明里。

## 总体进度

- [x] M0：基线和验收夹具
- [ ] M1：Markdown 样式与 Preview 质量
- [ ] M2：可编辑语义 Block Model
- [ ] M3：Heading 和 Inline Typora-like 编辑
- [ ] M4：列表、任务、引用和代码块
- [ ] M5：表格基础编辑
- [ ] M6：Mermaid、数学和媒体块
- [ ] M7：性能、质量门禁和文档收敛

## 当前架构判断

Papyro 当前编辑链路已经具备继续演进的基础：

- `crates/app` 仍是文档内容、tab、保存状态和 workspace use case 的事实源。
- `crates/ui/src/components/editor/pane.rs` 负责装配 `EditorHost`、`PreviewPane`、`OutlinePane`，并只在 Hybrid mode 为当前文档派生 block hints。
- `crates/ui/src/components/editor/host.rs` 通过 editor protocol 把 view mode、preferences、block hints 发送给 WebView 内的 JS runtime。
- `js/src/editor.js` 使用 CodeMirror 6 负责输入、selection、IME、scroll、format command 和 Hybrid decorations。
- `crates/editor/src/parser/blocks.rs` 已有轻量 Markdown block hints，但目前主要是行级 block 类型和范围。
- `crates/editor/src/renderer/html.rs` 使用 `pulldown-cmark` 和 `syntect` 渲染 Preview，并做 HTML / URL 安全处理。
- `assets/main.css` 与 `apps/desktop/assets/main.css` 已把 editor、Hybrid decoration 和 Preview 排版收敛到同一组 document / markdown token。

关键缺口也很明确：

- 当前 Hybrid 本质还是 CodeMirror decoration overlay，不是真正的可编辑语义块。
- Preview renderer 与 Hybrid renderer 没有共享 block/component 级渲染契约，只是共享部分 CSS token。
- `MarkdownBlockHintSet` 还缺少可编辑所需的 marker/content/cell/source 子范围。
- 表格、Mermaid、复杂代码块等还没有“渲染态点击进入源码态，失焦回到渲染态”的块级状态机。
- Preview 当前也不会把 Mermaid fenced code block 渲染为图形；Mermaid 图形渲染属于 M6 范围。
- 代码高亮、表格、列表、引用等在 Hybrid 与 Preview 中的视觉一致性还不够稳定。

## 目标体验

Hybrid mode 的目标体验：

- 输入 `# 标题` 后，回车或光标离开该块时展示为真正标题；再次点击标题文字时直接编辑标题文字，而不是整行源码。
- 粗体、斜体、链接、行内代码默认以排版态展示；用户选中或编辑相关文字时才显示必要 Markdown 边界。
- 列表、任务列表、引用块保持自然输入体验，回车、缩进、退格符合写作软件预期。
- 表格提供可直接编辑单元格的基础 UI，并能稳定回写 Markdown table。
- 普通代码块保留源码编辑体验，但视觉、语言标签、代码高亮要和 Preview 对齐。
- Mermaid、数学块、复杂图形块默认渲染为结果；点击块进入源码编辑，失焦后重新渲染。
- Hybrid、Preview、Source 切换时阅读宽度、字体、代码高亮、表格节奏和滚动位置保持一致。

## 非目标

第一轮不做这些事：

- 不迁移到 ProseMirror 或自研 contenteditable 引擎。CodeMirror 继续承担输入、selection 和 IME 稳定性。
- 不让 JS runtime 写文件、改 workspace metadata 或拥有 tab/save 真相。
- 不支持原始 HTML 渲染。Preview 当前的 HTML sanitization 继续保留。
- 不实现完整电子表格能力。表格只做 Markdown table 的基础单元格编辑。
- 不在大文档中强制全量实时渲染。超过预算时必须降级为 Source-like 编辑。

## 技术策略

### 1. 统一 Markdown 语义模型

在 `crates/editor` 中把现有 block hints 升级为可编辑语义模型。模型应描述：

- block kind：heading、paragraph、list item、task item、quote、fenced code、table、image、math、mermaid、front matter。
- source range：完整 Markdown 源码范围。
- content range：用户可直接编辑的文字范围。
- marker range：`# `、`- `、`> `、fence、table separator 等可隐藏或弱化的语法范围。
- block metadata：heading level、list depth、task checked、code language、table alignments、Mermaid language tag。
- degradation reason：超大文档、解析失败、未支持语法时回到 source editing。

Rust 模型用于跨语言协议、缓存和大文档降级；JS 可以继续使用 CodeMirror syntax tree 做可见区实时补充，但不能私有扩展业务语义。

### 2. Hybrid 块级状态机

JS runtime 需要从“按行 decoration”升级为“块级 render/edit 状态”：

- `rendered`：非聚焦块隐藏 Markdown 边界，展示接近 Preview 的排版。
- `editing`：当前块保留必要源码或局部源码，保证输入、IME、撤销稳定。
- `source_fallback`：不支持或超预算的块显示源码。
- `error`：Mermaid/math 等渲染失败时显示错误态，但不破坏源码。

状态切换必须由 selection、focus、pointer down、composition 和 document change 驱动，不经过 Rust 往返。

### 3. Preview 与 Hybrid 视觉契约

Preview CSS 和 Hybrid decoration/widget 应共享语义 class 或 token：

- heading、paragraph、blockquote、code、table、task、image、hr、math、mermaid 都要有对应视觉 contract。
- `syntect` 代码高亮输出需要适配当前亮暗主题，而不是长期固定 `InspiredGitHub`。
- Mermaid/math/code widget 的边距、背景、圆角、字号要与 Preview 对齐。
- CSS 仍需要同步 `assets/main.css` 和 `apps/desktop/assets/main.css`，并遵守单文件行数预算。

### 4. 协议边界

新增 JS -> Rust 或 Rust -> JS 行为必须先更新 `crates/editor/src/protocol.rs` 和 `docs/editor-protocol.md`。

优先保持这些行为在 JS runtime 内部完成：

- 当前 block render/edit 状态。
- 光标附近 decoration tier。
- 表格单元格输入到 Markdown text 的局部转换。
- Mermaid/math 点击进入源码态和失焦渲染态。

需要 Rust 知道的只有文档内容变更、保存请求、图片粘贴、runtime error 和未来可能的安全外部资源请求。

## 分阶段路线

### M0：基线和验收夹具

目标：先把“体验像 Typora”变成可测试场景。

任务：

- [x] 新增 Hybrid fixture Markdown，覆盖 heading、inline marks、list、task、quote、code、table、image、math、Mermaid。
- [x] 在 `js/test/editor-core.test.js` 增加 block state、range mapping、table rewrite、Mermaid edit/render toggle 的纯函数测试；这只是状态基线，不代表 Mermaid 渲染已实现。
- [x] 在 `docs/ui-smoke-checklist.md` 增加手动 Hybrid smoke：中文输入法、标题回车、表格编辑、Mermaid 点击编辑、Source/Hybrid/Preview 切换。
- [x] 补充性能验收：100KB 文档 Hybrid 输入仍在 16ms 交互预算内，1MB/5MB 走降级策略。

验收清单：

- [x] 测试夹具和 smoke checklist 能描述当前缺口。
- [x] 后续每个 Hybrid 改动都有对应 fixture 或测试覆盖。

### M1：Markdown 样式与 Preview 质量

目标：先让 Preview 和现有 Hybrid 看起来专业一致。

任务：

- [ ] 调整 Preview heading、paragraph、list、blockquote、table、code block 的 spacing 和字号层级。
- [ ] 将 Hybrid heading/list/table/code decoration 的视觉参数对齐 Preview token。
- [ ] 为代码高亮建立亮暗主题映射，替换单一 `InspiredGitHub` 依赖。
- [ ] 为 Mermaid/math/code/image 增加统一 block chrome：语言标签、错误态、点击态、focus ring。

验收清单：

- [ ] Hybrid 与 Preview 对同一 Markdown 的标题、列表、引用、表格、代码块视觉节奏一致。
- [ ] `node scripts/check-ui-contrast.js` 和 `node scripts/report-file-lines.js` 通过。

### M2：可编辑语义 Block Model

目标：让 runtime 拿到足够精确的 Markdown 范围信息。

任务：

- [ ] 扩展 `MarkdownBlockKind` 和 `MarkdownBlock`，增加 marker/content/source 子范围。
- [ ] 为 heading、list item、task、quote、fenced code、table、math、Mermaid 补 parser tests。
- [ ] 把 block hints protocol 测试从“有类型和行号”升级到“有可编辑范围和元数据”。
- [ ] 保留 `SourceOnly` fallback，超大文档或解析失败时不进入重 decoration。

验收清单：

- [ ] Rust parser 能稳定输出 block edit ranges。
- [ ] JS runtime 可以只靠 hints 定位当前 block 的 render/edit 边界。

### M3：Heading 和 Inline Typora-like 编辑

目标：先打磨最常见写作路径。

任务：

- [ ] Heading rendered state 隐藏 `# `，文字区直接可编辑。
- [ ] 光标进入 heading 文字时不强制显示整行源码；只有修改 heading level 时才暴露或更新 marker。
- [ ] 粗体、斜体、删除线、行内代码、链接在非编辑态隐藏 Markdown 边界。
- [ ] 当前 selection 覆盖 inline 边界时自动回到源码可见，避免用户无法理解选区。
- [ ] 保持 IME composition 期间不切 decoration。

验收清单：

- [ ] `# 标题` 回车后显示为标题。
- [ ] 点击标题文字可以直接修改文字，撤销/重做稳定。
- [ ] 中文输入法不丢字、不重复、不跳光标。

### M4：列表、任务、引用和代码块

目标：覆盖日常笔记最常用块。

任务：

- [ ] 无序/有序列表 marker rendered state 显示为排版 marker，编辑时保持自然 continuation。
- [ ] 任务 checkbox 可点击切换，并回写 `[ ]` / `[x]`。
- [ ] 引用块隐藏 `>` marker，但保留可理解的编辑入口。
- [ ] 代码块非当前块显示 Preview-like code panel；当前代码块显示源码编辑。
- [ ] 代码块语言标签可点击编辑语言信息。

验收清单：

- [ ] 列表回车、退格、Tab/Shift-Tab 不破坏 Markdown。
- [ ] 任务 checkbox 点击只修改对应 list item。
- [ ] 代码块输入不触发错误 decoration 或滚动跳动。

### M5：表格基础编辑

目标：让 Markdown table 不再只是源码加背景。

任务：

- [ ] 为 table block 增加 cells、alignments 和 separator metadata。
- [ ] 在 rendered state 使用 block widget 展示表格。
- [ ] 点击单元格进入 cell edit，失焦后回写 Markdown table。
- [ ] 支持新增/删除行列的最小命令入口，优先放到块内轻量按钮或命令面板。
- [ ] 表格解析失败或复杂内容直接回到 source_fallback。

验收清单：

- [ ] 修改单元格不会破坏 separator 和列数。
- [ ] Source/Hybrid/Preview 对同一表格保持一致。
- [ ] 大表格或异常表格可降级，不阻塞输入。

### M6：Mermaid、数学和媒体块

目标：复杂块默认渲染，点击后编辑源码。

任务：

- [ ] Mermaid fenced code block rendered state 调用安全渲染路径，带 timeout 和错误态。
- [ ] 点击 Mermaid 图进入源码编辑；失焦或按确认后重新渲染。
- [ ] 数学块复用同样状态机，避免当前 widget 和源码切换逻辑分裂。
- [ ] 图片 block 支持 rendered preview、alt/title/source 编辑入口。
- [ ] 远程资源或不安全 URL 沿用 Preview sanitization 原则。

验收清单：

- [ ] Mermaid 源码修改后能重新渲染。
- [ ] 渲染失败显示错误态，不丢失源码。
- [ ] 点击块外能回到 rendered state。

### M7：性能、质量门禁和文档收敛

目标：把新体验固定成质量门禁。

任务：

- [ ] 扩展 `perf editor input change` / `perf editor view mode change` 覆盖 Hybrid block render/edit 切换。
- [ ] 更新 `docs/editor-protocol.md`、`docs/editor-runtime-cache-policy.md` 和 `docs/performance-budget.md`。
- [ ] `npm --prefix js test` 覆盖 Hybrid pure logic。
- [ ] `npm --prefix js run build` 后同步 `assets/editor.js`、`apps/desktop/assets/editor.js`、`apps/mobile/assets/editor.js`。
- [ ] 大文档 smoke 覆盖 100KB、1MB、5MB。

验收清单：

- [ ] 100KB 文档 Hybrid 输入稳定。
- [ ] 1MB 文档不因全量渲染卡顿。
- [ ] 5MB 文档明确降级，不让编辑区假死。
- [ ] 新文档说明清楚哪些块是 Typora-like，哪些仍是 fallback。

## 建议提交顺序

每个标准任务单独提交：

- [ ] `docs: add markdown editing roadmap`
- [ ] `test: add hybrid markdown fixtures`
- [ ] `style: align markdown preview typography`
- [ ] `refactor: extend markdown block hints`
- [ ] `feat: render editable hybrid headings`
- [ ] `feat: improve hybrid list editing`
- [ ] `feat: render hybrid code blocks`
- [ ] `feat: edit markdown tables in hybrid mode`
- [ ] `feat: render mermaid blocks in hybrid mode`
- [ ] `perf: gate hybrid block rendering by document size`

提交正文只写本次 diff 对应的代码意图，不堆砌验证命令。
