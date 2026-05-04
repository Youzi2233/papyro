# Tiptap 迁移计划

[English](../tiptap-migration-plan.md) | [路线图](roadmap.md) | [编辑器指南](editor.md)

这个分支 `feat-tiptap` 专门用于把 Papyro 的交互式编辑器运行时从 CodeMirror 迁移到 Tiptap。目标不是“换一个库能跑”，而是把编辑器升级成可持续迭代的企业级 Markdown 写作内核。

## 迁移目标

- 保留本地 Markdown 文件作为唯一持久化格式。
- 保持 Rust/Dioxus 应用层的 tab、dirty/save/conflict、workspace 和 preview 流程不被编辑器库绑死。
- 用 Tiptap/ProseMirror 文档模型承载 Hybrid 写作体验，减少手写 decorations 对光标、选区和 hit testing 的影响。
- 让表格、任务列表、公式、Mermaid、图片和未来 block 组件变成可扩展的 extension/node view，而不是零散 DOM hack。
- 迁移后仍支持 Source、Hybrid、Preview 三种用户心智。

## 当前架构事实

```mermaid
flowchart TD
    dioxus["Dioxus EditorHost"]
    facade["window.papyroEditor facade"]
    cm["CodeMirror runtime"]
    rust["Rust app state"]
    editor_crate["crates/editor<br/>Markdown analysis/rendering"]
    storage["storage/workspace"]

    dioxus --> facade
    facade --> cm
    cm -->|content_changed/save/paste image/runtime events| dioxus
    dioxus --> rust
    rust --> storage
    rust --> editor_crate
    editor_crate -->|block hints / preview html| rust
    rust -->|commands| dioxus
    dioxus -->|set_view_mode/preferences/block_hints/insert_markdown| facade
```

现有 JS facade 暴露：

- `ensureEditor({ tabId, containerId, instanceId, initialContent, viewMode })`
- `attachChannel(tabId, dioxus)`
- `handleRustMessage(tabId, message)`
- `attachPreviewScroll`
- `navigateOutline`
- `syncOutline`
- `scrollEditorToLine`
- `scrollPreviewToHeading`
- `renderPreviewMermaid`

迁移早期必须保留这个 facade，让 Rust/Dioxus 侧不跟着重写。真正替换的是 facade 后面的 runtime adapter。

## 官方能力评估

Tiptap 官方文档确认三件事适合 Papyro：

- Tiptap 支持 Vanilla JavaScript 和 ES module 构建，可在当前 `js/` esbuild 管线中使用 `@tiptap/core`、`@tiptap/pm`、`@tiptap/starter-kit`。
- `@tiptap/markdown` 提供 Markdown 和 Tiptap JSON 的双向转换，支持 `editor.commands.setContent(markdown, { contentType: "markdown" })`、`editor.commands.insertContent(markdown, { contentType: "markdown" })` 和 `editor.getMarkdown()`。
- Node views 可以用纯 JavaScript 实现，并且可以把编辑器内部 UI 与序列化输出分开；复杂 block 可以暴露 `contentDOM` 或设置 `contenteditable="false"`。

参考：

- [Tiptap Vanilla JavaScript install](https://tiptap.dev/docs/editor/getting-started/install/cdn)
- [Tiptap Markdown basic usage](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage)
- [Tiptap Markdown introduction](https://tiptap.dev/docs/editor/markdown)
- [Tiptap JavaScript node views](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/javascript)
- [Tiptap Notion-like editor template](https://tiptap.dev/docs/ui-components/templates/notion-like-editor)

## Notion-like 交互参考

Tiptap 官方的 Notion-like template 是 Papyro 后续 Hybrid 编辑器非常值得参考的产品范式。它展示了块级写作界面、slash command、上下文浮动格式栏、块拖拽、响应式工具栏、暗亮主题、富 block 插入、链接管理和撤销重做等能力。

Papyro 应该借鉴它的交互模型，而不是直接引入整套产品依赖。该模板生产使用需要 Start plan，本身是 React UI Components 模板，并且默认带有协作、AI、JWT 和上传服务等 Cloud 场景假设。Papyro 仍然是 local-first Markdown 应用，因此迁移时要用 vanilla Tiptap 模块、本地 Markdown 持久化、现有 Dioxus chrome 和 Papyro design tokens 重建适合自身的交互。

受该模板启发的产品目标：

- **Slash command 菜单**：快速插入标题、列表、任务、表格、代码、公式、Mermaid、图片和未来 callout。
- **浮动格式栏**：选中文字时展示紧凑的上下文格式操作，使用 Papyro primitives，不使用浏览器原生控件。
- **块级操作柄**：Markdown round-trip 稳定后，再支持移动、复制、删除等块级操作。
- **响应式编辑器 chrome**：窄窗口下仍然保留核心写作动作，不让工具栏挤压正文。
- **Token 化样式**：`.mn-tiptap-*` 语义类必须映射到现有主题系统，不整包照搬模板 CSS。

这条参考的实现规则：

- 先做 headless command controller，再画菜单。同一套命令模型必须服务 slash search、工具栏按钮、键盘快捷键和测试。
- 对还没有原生 Tiptap node 的块，例如表格、公式和 Mermaid，先使用 Markdown 插入保持可用；后续再逐个升级成有测试的 extension。
- Notion-like UI 必须保持可选且本地化。协作、AI、评论、上传和 JWT 流程不属于本迁移分支，除非后续有单独产品决策。
- 命令 label 和 group 要足够稳定，便于后续接入 i18n 和 Dioxus chrome。

## 企业级工程准则

- **稳定 facade**：Rust 侧只依赖 `window.papyroEditor` 协议，不直接知道 Tiptap。
- **Adapter 隔离**：`CodeMirrorAdapter` 和 `TiptapAdapter` 不能混在一个大文件里。迁移期间可以并存，但业务入口只调统一 runtime adapter。
- **Markdown round-trip 优先**：每个扩展必须说明 Markdown 输入、编辑态 JSON、Markdown 输出怎么对应。
- **失败可降级**：Markdown 解析失败、extension handler 缺失、node view 渲染失败时，用户至少能回到 Source 模式修正文档。
- **测试先行**：迁移每个 block 前先补 fixture 或 JS 单测；不能只靠手测通过。
- **生成物同步**：`assets/editor.js`、桌面端和移动端副本必须和源码同提交。
- **预算受控**：继续满足 bundle 生成、单文件行数、UI primitive、a11y、contrast、token audit 和 Rust checks。
- **可迭代 extension 体系**：表格、公式、Mermaid、图片、callout 都应是独立 extension/adapter 模块，而不是写进一个巨型 runtime 文件。
- **输入法和撤销不可回归**：IME、paste、undo/redo、selection、keyboard navigation 是验收项，不是后续优化项。
- **企业级代码质量**：生成实现代码必须高可复用、可迭代、健壮，有契约测试，并且不能制造第二个巨型编辑器 runtime。

## 目标架构

```mermaid
flowchart TD
    host["Dioxus EditorHost"]
    facade["runtime facade<br/>window.papyroEditor"]
    registry["RuntimeRegistry"]
    adapter["TiptapRuntimeAdapter"]
    tiptap["Tiptap Editor"]
    markdown["MarkdownSyncController"]
    source["SourcePaneController"]
    extensions["Papyro Tiptap extensions"]
    rust["Rust app state"]

    host --> facade
    facade --> registry
    registry --> adapter
    adapter --> tiptap
    adapter --> markdown
    adapter --> source
    tiptap --> extensions
    markdown -->|content_changed| host
    source -->|content_changed| host
    host --> rust
```

### 模块边界

| 模块 | 责任 |
| --- | --- |
| `runtime-facade` | 保持现有 `window.papyroEditor` API，分发 Rust 消息 |
| `runtime-registry` | 管理 tab -> runtime entry，处理 attach/recycle/destroy |
| `tiptap-adapter` | 创建 Tiptap、切换 view mode、同步内容、发事件 |
| `markdown-sync` | 维护 canonical Markdown，处理 set/insert/get/parse 错误 |
| `source-pane` | Source 模式源码编辑，不依赖 CodeMirror |
| `extensions/*` | 表格、任务、数学、Mermaid、图片等 Tiptap 扩展 |
| `scroll-outline` | 编辑器滚动、大纲联动、预览滚动保持独立 |

## 分阶段任务

### 0. 分支和计划

- [x] 创建 `feat-tiptap` 分支。
- [x] 写清迁移计划、风险、验收标准并更新 roadmap。
- [x] 提交并推送计划文档。

### 1. 建立运行时边界

- [x] 抽出第一版 runtime adapter facade 契约和测试。
- [x] 增加 runtime registry 模块，管理 tab entry 生命周期。
- [x] 把当前 CodeMirror runtime 包装成可注入的 runtime 工厂。
- [ ] 把当前 `js/src/editor.js` facade 入口拆成小模块。
- [ ] 定义 `EditorRuntimeAdapter` 契约：`mount`、`attachChannel`、`handleMessage`、`setViewMode`、`destroy`、`getMarkdown`。
- [ ] 保持 CodeMirror adapter 默认启用，确保无行为变化。
- [ ] 增加 adapter contract 单测。

### 2. 引入 Tiptap 基础运行时

- [x] 安装 `@tiptap/core`、`@tiptap/pm`、`@tiptap/starter-kit`、`@tiptap/markdown`。
- [x] 新建 `TiptapRuntimeAdapter`，先支持段落、标题、列表、引用、代码块、链接、粗体、斜体、行内代码和删除线。
- [x] 通过 feature flag 或 runtime 选择器启用 Tiptap adapter。
- [x] 增加 Markdown parse/serialize fixture，覆盖中文、英文、标题、列表、链接和代码。

### 3. Source/Hybrid/Preview 模式契约

- [ ] Hybrid 使用 Tiptap 富文本编辑。
- [ ] Hybrid 交互设计参考官方 Notion-like template，但保持 local-first、Markdown-first 和 Papyro token 化样式。
- [x] 增加 Tiptap mode controller，统一 Source、Hybrid、Preview，并让非 Hybrid 模式关闭富文本编辑态。
- [x] 增加可复用的 Tiptap slash command controller，覆盖标题、列表、引用、代码、分割线、表格、公式和 Mermaid。
- [x] 增加带键盘导航和 token 化样式的 Papyro slash command menu controller，用于常见 Markdown block 插入。
- [ ] 增加 Papyro 浮动格式栏，用于选中文字后的上下文格式操作。
- [ ] 先封装 Tiptap 下拉、popover、toolbar 和 block action menu primitives，再接高级 block。
- [ ] Source 使用源码编辑面板，并通过 `MarkdownSyncController` 同步到 Tiptap。
- [x] 增加 `MarkdownSyncController`，作为 Tiptap runtime 更新的 canonical Markdown 状态边界。
- [ ] Preview 继续使用 Rust HTML 渲染，不让 Tiptap 接管只读预览。
- [ ] 模式切换不丢 selection、dirty state 或 scroll snapshot。
- [ ] 大纲点击在 Source 和 Hybrid 都能跳到目标位置。

### 4. Rust/JS 协议兼容

- [ ] 保持 `content_changed`、`save_requested`、`paste_image_requested`、`runtime_ready`、`runtime_error` 事件不变。
- [ ] 保持 `insert_markdown`、`set_view_mode`、`set_preferences`、`destroy` 消息不变。
- [ ] 对 `set_block_hints` 做兼容处理：Tiptap 阶段可以忽略或只用于诊断，不应让 Rust 报错。
- [ ] 保持 `auto_link_paste` 行为。

### 5. Markdown block 能力迁移

- [ ] Task list：checkbox 直接切换并 round-trip 为 `- [ ]` / `- [x]`。
- [ ] Table：从 pipe table 解析到文档表格，支持新增/删除行列和单元格导航。
- [ ] Math：inline/display 公式有编辑态、预览态和错误反馈。
- [ ] Mermaid：保留源码编辑和渲染预览，失败时显示错误。
- [ ] Image：本地图片 URL、粘贴图片请求和 Markdown 图片语法保持兼容。
- [ ] Code block：语言信息、代码文本和高亮主题策略明确。

### 6. 删除 CodeMirror 依赖

- [ ] 替换所有 CodeMirror runtime 入口和测试。
- [ ] 移除 CodeMirror npm 依赖和 `codemirror-lang-mermaid`。
- [ ] 清理 `.cm-*` 专属 CSS，保留迁移后的 `.mn-editor-*` 和 `.mn-tiptap-*` 语义类。
- [ ] 确认 bundle 生成物同步且行数预算通过。

### 7. 验收

- [ ] `npm --prefix js run build`
- [ ] `npm --prefix js test`
- [ ] `cargo fmt --check`
- [ ] `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] `node scripts/check-ui-primitives.js`
- [ ] `node scripts/check-ui-a11y.js`
- [ ] `node scripts/check-ui-contrast.js`
- [ ] `node scripts/report-file-lines.js`
- [ ] `git diff --check`
- [ ] 手工 smoke：Source/Hybrid/Preview、中文 IME、粘贴、撤销、表格、公式、Mermaid、图片、大纲、保存失败、外部文件打开。

## 关键风险和处理策略

| 风险 | 处理 |
| --- | --- |
| `@tiptap/markdown` 仍是 beta，可能有 Markdown 边界问题 | 用 Papyro fixture 锁定 round-trip；复杂语法用自定义 handlers；失败时降级 Source |
| Source 模式可能不再保持原始格式细节 | 以 Markdown 内容语义为主；需要保真的区域先保留源码块策略；文档说明已知限制 |
| Tiptap extension 太分散导致运行时变大 | 每个 extension 独立模块和测试；构建后继续执行 bundle/行数预算 |
| Tiptap node view 与 Papyro CSS token 脱节 | 所有 node view 使用 `mn-tiptap-*` 语义类和现有 Markdown token |
| Rust block hints 与 Tiptap 文档模型重复 | 迁移期间保留协议兼容；最终由 Tiptap 文档模型承担交互式 block 判断，Rust 继续服务 preview/outline/summary |
| 多窗口和 tab 生命周期泄漏 editor instance | registry 必须有 destroy/recycle 测试；关闭 tab 后释放 Tiptap editor 和 DOM 监听 |

## 完成定义

Tiptap 迁移完成必须同时满足：

- `js/package.json` 不再依赖 CodeMirror。
- `window.papyroEditor` facade 仍可服务 Rust/Dioxus 现有消息。
- Source、Hybrid、Preview 都能完成日常 Markdown 写作。
- Markdown round-trip 覆盖标题、段落、列表、任务、链接、行内代码、代码块、表格、数学、Mermaid 和图片。
- 表格、公式、Mermaid、图片不是一次性 DOM hack，而是可测试、可维护的 extension 或 adapter 模块。
- 生成 bundle、桌面/mobile asset、Rust checks、JS tests 和 UI 检查全部通过。
