# Papyro Roadmap

本文是一份新的产品与工程路线图。它的目标不是继续堆功能清单，而是把 Papyro 推进到一个可长期维护、可跨端演进、编辑体验对齐 Typora 的理想形态。

这份路线图基于当前代码库状态编写：

- `cargo test --workspace` 当前通过，合计 29 个单元测试。
- 当前已经形成 `apps/desktop`、`apps/mobile`、`crates/app`、`crates/core`、`crates/ui`、`crates/editor`、`crates/storage`、`crates/platform` 的 workspace 结构。
- `crates/app` 已承担共享运行时与应用流程，`apps/*` 已基本收敛为平台宿主。
- 编辑器当前采用 CodeMirror 6 本地 bundle，并通过 Dioxus `document::eval` / channel 与 Rust 状态同步。

## 目标定义

### 产品目标

Papyro 的目标体验是“Typora 式 Markdown 写作软件”，不是传统左右分栏 Markdown 编辑器。

核心体验标准：

- 单栏写作，编辑和阅读在同一空间完成。
- 聚焦处保留可编辑 Markdown 语法，非聚焦内容尽量呈现接近最终排版的效果。
- 输入、选择、撤销、重做、中文输入法、快捷键都必须稳定。
- 文件、图片、搜索、导出、主题、设置等能力完整但不打扰写作。
- 默认界面安静、简约、信息密度适中，不做花哨装饰。

### 工程目标

代码目标不是“能跑”，而是“能持续迭代”。

- 分层边界清晰，依赖方向稳定。
- Rust 负责核心模型、存储、解析、导出、搜索、用例编排和可测试逻辑。
- Dioxus 0.7 负责跨端 UI、响应式状态、组件复用和宿主渲染。
- JS 编辑器 runtime 只负责浏览器编辑能力，不成为业务真相来源。
- 每个模块都有明确 owner、测试边界和失败策略。
- 新功能先进入用例层，再进入 UI，不让布局组件继续吸收业务流程。

## 当前现状

### 已经做对的部分

1. Workspace 结构已经从单体入口转向多 crate 分层。
2. `apps/desktop` 和 `apps/mobile` 已经变薄，不再互相复用源码路径。
3. `crates/app` 已经成为共享应用层，承接 runtime、commands、workspace flow 和 watcher。
4. `crates/core` 已经主要保留模型、状态结构和 trait 边界。
5. `crates/storage` 已经实现 SQLite、文件系统、workspace 扫描、recent files、settings 和 watcher。
6. `crates/editor` 已经提供 Markdown 统计和 HTML 渲染。
7. CodeMirror bundle 通过 `js/` 构建，避免运行时 CDN 依赖。
8. 单元测试已经覆盖一部分 workspace、tab、storage、startup chrome 行为。

### 当前架构图

```text
apps/desktop
apps/mobile
    |
    v
crates/app
    |
    +--> crates/ui
    +--> crates/core
    +--> crates/storage
    +--> crates/platform
    +--> crates/editor

crates/ui       -> crates/core
crates/ui       -> crates/editor (protocol and Markdown UI helpers only)
crates/storage  -> crates/core
crates/platform -> crates/core
crates/editor   -> crates/core
```

### 当前关键文件

```text
apps/desktop/src/main.rs              desktop 宿主入口和首帧资源注入
apps/mobile/src/main.rs               mobile 宿主入口和资源注入
crates/app/src/runtime.rs             app composition root 与 context 注入
crates/app/src/actions.rs             app action payload 定义
crates/app/src/dispatcher.rs          action dispatcher 与 AppCommands 兼容层
crates/app/src/effects.rs             watcher 等 app effect
crates/app/src/export.rs              HTML export 逻辑
crates/app/src/workspace_flow/*       workspace 与文件操作 use case
crates/app/src/handlers/*             action/use case 到 async UI runtime 的连接层
crates/ui/src/context.rs              UI 看到的 AppContext
crates/ui/src/layouts/*               desktop / mobile 布局
crates/ui/src/components/editor/mod.rs CodeMirror bridge、tabbar、toolbar、preview
js/src/editor.js                      CodeMirror runtime
crates/storage/src/lib.rs             SQLite + filesystem storage facade
crates/editor/src/renderer/html.rs    Markdown HTML 渲染与代码高亮
```

## 主要问题

### 1. Roadmap 仍偏功能清单

旧路线图更多是在列“未来要做什么功能”。它缺少三类信息：

- 功能之间的依赖顺序。
- 当前架构距离目标架构的差距。
- 每阶段怎么验收代码质量和体验质量。

新的路线图必须能指导后续 issue 拆分、PR 审查和版本发布。

### 2. `crates/app` 已建立，但 runtime 仍偏集中

`crates/app/src/runtime.rs` 同时承担：

- signal 初始化
- command 闭包组装
- unsaved close 策略
- export HTML
- settings 持久化
- watcher resource
- context 注入

这说明 composition root 已经出现，但还没有完全模块化。继续叠功能会让 runtime 变成新的大泥球。

### 3. AppContext 仍暴露过多原始 Signal

当前 UI 能直接拿到：

- `file_state`
- `editor_tabs`
- `tab_contents`
- `ui_state`
- `pending_close_tab`
- `commands`

这比过去散乱 context 好，但依然让 UI 组件知道太多内部状态结构。后续应该逐步收敛为更小的 view model 和 action facade。

### 4. 编辑器组件已经过重

`crates/ui/src/components/editor/mod.rs` 当前同时承担：

- tabbar
- toolbar
- preview
- CodeMirror host lifecycle
- JS bridge
- autosave debounce
- fallback UI
- retired host 管理
- performance tracing

编辑器是产品核心，这部分必须拆成可测试、可替换、可渐进增强的结构。

### 5. JS editor runtime 缺少协议级测试

`js/src/editor.js` 已经有 CodeMirror runtime、spare pool、format command、Rust channel routing，但目前缺少：

- JS 单元测试
- Rust/JS message contract 文档
- command/event schema 固化
- bundle 产物一致性检查
- IME、selection、tab recycle 的回归测试

这会直接影响 Typora 式编辑体验的稳定性。

### 6. Preview HTML 需要安全策略

`PreviewPane` 使用 `dangerous_inner_html` 渲染 `render_markdown_html` 的结果。Markdown 是否允许原始 HTML、如何清理脚本、如何处理图片和链接，都需要明确策略。

这是写作软件必须补齐的健壮性问题。

### 7. UI 仍有流程编排残留

`MobileLayout` 中仍然包含较多状态切换、设置保存、创建/重命名表单流程。后续如果继续把移动端交互塞进 layout，可读性会下降。

### 8. 存储层可用，但缺少更完整的文档资产模型

当前 storage 能读写 `.md`、维护 metadata、recent files 和 settings。对齐 Typora 还需要：

- 图片 assets 复制策略
- 相对路径规范
- 删除/移动时资源引用处理
- 回收站或安全删除
- 外部文件变化冲突处理
- 大 workspace 的增量索引

### 9. 测试层级还不完整

当前单元测试基础不错，但缺少：

- UI smoke test
- editor bridge contract test
- JS runtime test
- integration test
- architecture dependency check
- bundle sync check
- performance budget test

## 目标架构

### 分层职责

```text
apps/
  desktop/              # 平台宿主：窗口、桌面资源、launch
  mobile/               # 平台宿主：移动资源、launch

crates/
  app/                  # composition root、action dispatcher、use cases、effects
  core/                 # 领域模型、纯状态、trait、纯规则
  ui/                   # Dioxus 0.7 组件、layout、view model 渲染
  editor/               # Markdown/AST/render、editor protocol、document transform
  storage/              # SQLite、文件系统、workspace repository、watcher
  platform/             # desktop/mobile adapter

future crates when needed:
  search/               # tantivy/FTS 索引与查询
  export/               # HTML/PDF/DOCX/export templates
```

### 依赖原则

允许：

- `apps/* -> app`
- `app -> ui/core/editor/storage/platform`
- `ui -> core`
- `ui -> editor`（仅 editor protocol 与 Markdown UI helper）
- `editor -> core`
- `storage -> core`
- `platform -> core`

禁止：

- `apps/mobile -> apps/desktop`
- `ui -> storage`
- `ui -> concrete platform`
- `ui -> editor runtime business truth`
- `core -> dioxus`
- `storage -> dioxus`
- `platform -> ui`
- `editor JS runtime -> business truth`

### Dioxus 0.7 使用原则

后续所有 Dioxus 代码必须遵守 0.7 风格：

- 使用 `#[component] fn Name(...) -> Element`。
- 使用 `Signal<T>`、`ReadOnlySignal<T>`、`use_signal`、`use_memo`、`use_resource`。
- 使用 `rsx!` 里的 `for` 和 `if` 直接渲染元素。
- 使用 `document::Stylesheet`、`document::Script`、`asset!` 管理资源。
- 不引入旧 API：`cx`、`Scope`、`use_state`。

## 版本路线

```text
v0.1   稳定桌面 MVP：架构收敛、基础编辑、文件闭环、可手动发布
v0.2   Typora-like Alpha：单栏所见即所得核心体验、图片、搜索、命令面板
v0.3   桌面 Beta：导出、主题、插件前置边界、可靠升级、完整测试
v0.4   跨端 Beta：移动端可用、平台差异收敛、同步前置设计
v1.0   稳定版：核心体验稳定、数据安全、发布流水线、完整文档
```

## Phase 0：建立工程基线

目标：先冻结质量标准，让后续开发有清晰验收线。

### 0.1 文档基线

- [x] 重写 `docs/roadmap.md`。
- [x] 更新 `README.md` 的编码与展示，确保中文在常见终端和编辑器中正常显示。
- [x] 在 README 中明确”先读 roadmap，再按阶段开发”。
- [x] 将 `docs/architecture.md` 与本文中的目标架构保持一致。
- [x] 标记旧文档中的历史内容，避免新成员把旧设计当成现状。

### 0.2 测试基线

- [x] 确认 `cargo test --workspace` 通过。
- [x] 增加 `cargo check --workspace --all-features` 为固定检查命令。
- [x] 增加 `cargo clippy --workspace --all-targets --all-features` 检查。
- [x] 增加 `cargo fmt --check` 检查。
- [x] 增加 `npm run build` 检查 editor bundle 是否可构建。
- [x] 增加 bundle sync check，验证 `assets/editor.js`、`apps/desktop/assets/editor.js`、`apps/mobile/assets/editor.js` 一致。

### 0.3 架构基线

- [x] 增加 workspace dependency check，禁止错误依赖方向。
- [x] 增加文件行数报告，长期跟踪大文件。
- [x] 把 `workspace_flow.rs`、`runtime.rs`、`editor/mod.rs` 标为拆分优先级最高的模块。
- [x] 为所有新增模块建立 owner 注释或文档说明。

验收标准：

- 所有基础检查可以一条命令运行。
- 后续 PR 能明确说明属于哪个 Phase。
- 新代码不再扩大当前大文件的职责。

## Phase 1：收敛应用层架构

目标：让 `crates/app` 从“共享 runtime 文件”进化成正式应用层。

### 1.1 拆分 app runtime

- [x] 新建 `crates/app/src/state.rs`，集中创建 runtime state。
- [x] 新建 `crates/app/src/actions.rs`，定义 `AppAction`。
- [x] 新建 `crates/app/src/dispatcher.rs`，把 UI action 分发到 use case。
- [x] 新建 `crates/app/src/effects.rs`，管理 watcher、autosave、background task。
- [x] 新建 `crates/app/src/export.rs`，迁出 HTML export 逻辑。
- [x] 保留 `runtime.rs` 为 composition root，不再承载具体业务分支。

### 1.2 从 EventHandler 列表迁移到 action facade

- [x] 保留 `AppCommands` 作为兼容层。
- [x] 新增 `AppActions` 或 `AppDispatcher`，提供 `dispatch(AppAction)`。
- [x] 将 `open_workspace`、`create_note`、`save_tab` 等命令映射为 action。
- [x] 给 action 定义明确 payload 类型，避免到处传裸 `String`。
- [x] 为 action dispatcher 增加单元测试。

### 1.3 收敛 UI 可见状态

- [x] 新建 `AppViewModel`，只暴露 UI 当前需要渲染的数据。
- [x] 将 `file_state` 派生成 `WorkspaceViewModel`。
- [x] 将 `editor_tabs` / `tab_contents` 派生成 `EditorViewModel`。
- [x] 将 settings 派生成 `SettingsViewModel`。
- [x] UI 优先读 view model，通过 action 修改状态。
- [x] 保留 raw signal 兼容窗口，逐步迁移。

### 1.4 拆分 workspace flow

- [x] 将 `workspace_flow.rs` 拆为 `workspace/create.rs`、`workspace/open.rs`、`workspace/save.rs`、`workspace/rename.rs`、`workspace/delete.rs`。
- [x] 将测试替身迁入 `tests/support` 或 `#[cfg(test)] mod support`。
- [x] 把路径命名、选择目录、tree 查找等纯函数放入独立模块。
- [x] 给每个 use case 补充失败路径测试。
- [x] 明确“删除”是否直接删除还是进入回收站，当前阶段至少要有确认策略。

验收标准：

- `runtime.rs` 不再超过 200 行。
- `workspace_flow` 单个文件不再超过 250 行。
- UI 不再直接知道多数流程细节。
- action dispatcher 有测试覆盖。

## Phase 2：重构编辑器模块

目标：把编辑器从“大组件 + 大 JS 文件”重构为稳定内核。

### 2.1 拆分 Dioxus 编辑器组件

- [x] `components/editor/mod.rs` 只保留模块导出。
- [x] 新建 `pane.rs`，负责编辑器整体布局。
- [x] 新建 `tabbar.rs`，负责 tab 渲染和关闭交互。
- [x] 新建 `toolbar.rs`，负责格式化按钮。
- [x] 新建 `preview.rs`，负责 HTML preview。
- [x] 新建 `host.rs`，负责单个 editor host 生命周期。
- [x] 新建 `bridge.rs`，负责 Rust/JS 消息协议。
- [x] autosave debounce 与 save request 已迁入 `crates/app/src/effects.rs`。
- [x] 新建 `fallback.rs`，负责 runtime loading/error UI。

### 2.2 固化 Rust/JS 编辑器协议

- [x] 在 `crates/editor` 中定义 `EditorEvent` 和 `EditorCommand`，避免 UI 内部私有定义协议。
- [x] 使用 `serde` schema 文档化 message 格式。
- [x] 在 `docs/editor-protocol.md` 写清 command/event 列表。
- [x] 给 Rust 侧序列化/反序列化增加测试。
- [x] 给 JS 侧增加 lightweight test runner。
- [x] 测试 `set_content` 不回声触发 content_changed。
- [x] 测试 `apply_format` 对 selection、empty selection 的行为。
- [x] 测试 tab recycle 不串内容。

### 2.3 改善 autosave 可靠性

- [x] 将 autosave 从 UI 组件中迁入 app effect 或 editor service。
- [x] 每个 tab 使用 revision/version 防止旧任务覆盖新内容。
- [x] 增加“保存中”“已保存”“保存失败”状态。
- [x] 失败后保留 dirty，不误标 clean。
- [x] app 退出、切换 workspace、关闭 tab 前触发 flush。
- [x] 增加保存失败的单元测试。

### 2.4 编辑器性能预算

- [x] 记录打开文件、切换 tab、输入、预览渲染的耗时指标。
- [x] 设定 100KB、1MB、5MB markdown 文件的性能基准。
- [x] 大文件禁用昂贵实时特性，显示降级提示。
- [x] 避免每次 render 克隆完整文档内容。
- [x] 预览渲染使用 memo/resource，避免无关状态触发重渲染。

验收标准：

- `components/editor/mod.rs` 不再承载实现细节。
- JS/Rust 协议有文档和测试。
- autosave 失败不会丢数据。
- 1MB 文档基础编辑可用。

## Phase 3：实现 Typora-like 核心编辑体验

目标：从“Markdown 编辑器 + 预览切换”升级为单栏所见即所得体验。

### 3.1 设计编辑模式

- [x] 定义三种模式：`Source`、`Hybrid`、`Preview`。
- [x] 默认进入 `Hybrid`，保留 source mode 作为开发与高级用户模式。
- [x] `Preview` 作为只读阅读模式，不作为主要写作模式。
- [x] 将 `ViewMode` 从二值扩展为稳定 enum。
- [x] 为模式切换增加状态持久化。

### 3.2 Hybrid 渲染策略

- [x] 基于 CodeMirror extension / decoration 实现非焦点区域渲染。
- [x] 当前光标所在 block 显示原始 Markdown。
- [x] 非焦点 heading 渲染为视觉标题。
- [x] 非焦点 emphasis、strong、inline code 渲染为近似成品样式。
- [x] 非焦点 link 显示文本，但保留可编辑入口。
- [x] 非焦点 image 显示图片预览。
- [x] 非焦点 task list 显示 checkbox。
- [x] 保留纯文本 source 作为 fallback。

### 3.3 Markdown block 能力

- [x] 标题 H1-H6。
- [x] 段落。
- [x] 粗体、斜体、删除线。
- [x] 行内代码。
- [x] 代码块。
- [x] 引用块。
- [x] 有序/无序列表。
- [x] 任务列表。
- [x] 表格。
- [x] 水平线。
- [x] 链接。
- [x] 图片。
- [x] YAML front matter。

### 3.4 高级内容

- [x] KaTeX 行内公式。
- [x] KaTeX 块级公式。
- [ ] Mermaid 图表。（等待经过审计的渲染依赖策略；`mermaid@11.14.0` 当前依赖链要求 Node 22，且在当前 Node 20 工具链下引入生产审计告警。）
- [x] 脚注。
- [x] 目录/大纲。
- [x] 文档内搜索替换。

### 3.5 输入体验

- [ ] 中文输入法组合输入不丢字、不重复。
- [x] 列表回车自动延续。
- [x] 空列表项回车退出列表。
- [x] Tab / Shift+Tab 调整列表缩进。
- [x] 粘贴 URL 自动生成链接可选。
- [x] 粘贴图片自动保存到 assets。
- [x] 拖拽图片自动复制到 assets。
- [x] Markdown 快捷输入自动补全，例如 `# `、`> `、```。

### 3.6 快捷键

- [ ] `Ctrl/Cmd+B` 粗体。
- [ ] `Ctrl/Cmd+I` 斜体。
- [ ] `Ctrl/Cmd+K` 链接。
- [ ] `Ctrl/Cmd+Shift+I` 图片。
- [ ] `Ctrl/Cmd+E` 行内代码。
- [ ] `Ctrl/Cmd+Alt+C` 代码块。
- [ ] `Ctrl/Cmd+S` 保存。
- [ ] `Ctrl/Cmd+F` 文内查找。
- [ ] `Ctrl/Cmd+H` 替换。
- [ ] `Ctrl/Cmd+P` 快速打开。
- [ ] `Ctrl/Cmd+Shift+P` 命令面板。

验收标准：

- 用户无需切换预览即可获得接近 Typora 的写作体验。
- Hybrid mode 下编辑、撤销、选择、中文输入稳定。
- 所有 Markdown block 都有 source fallback。

## Phase 4：文件、资源与知识管理

目标：让软件从“能编辑文件”变成“能管理知识库”。

### 4.1 Workspace 行为

- [ ] 支持多个 workspace。
- [ ] 支持最近 workspace 列表。
- [ ] 支持 workspace 快速切换。
- [ ] 支持 workspace 设置覆盖全局设置。
- [ ] 支持打开最近文件时自动恢复 workspace。
- [ ] 外部移动/删除文件时给出清晰提示。

### 4.2 文件树 UX

- [ ] 文件树键盘导航。
- [ ] 文件树右键菜单。
- [ ] 新建文件默认在选中文件夹内。
- [ ] 重命名使用 inline input。
- [ ] 删除前确认。
- [ ] 支持拖拽移动文件。
- [ ] 支持展开状态持久化。
- [ ] 支持按名称、更新时间、创建时间排序。

### 4.3 图片与附件

- [ ] 每个 workspace 约定附件目录，例如 `assets/`。
- [ ] 插入图片时复制到附件目录。
- [ ] 文件名冲突自动重命名。
- [ ] Markdown 引用使用相对路径。
- [ ] 删除笔记时提示是否清理孤儿附件。
- [ ] 移动/重命名笔记时保持相对引用可用。
- [ ] 支持外链图片预览。

### 4.4 搜索

- [ ] Phase 4 初期可继续使用 SQLite/简单扫描。
- [ ] 内容量上来后引入 `tantivy`。
- [ ] 建立增量索引。
- [ ] watcher 触发索引更新。
- [ ] 支持标题、正文、路径搜索。
- [ ] 支持标签过滤。
- [ ] 搜索结果高亮。
- [ ] 支持快速打开文件。

### 4.5 标签、收藏和回收站

- [ ] 标签 CRUD。
- [ ] 标签颜色。
- [ ] 从 front matter 解析标签。
- [ ] 收藏文件。
- [ ] 回收站软删除。
- [ ] 恢复删除文件。
- [ ] 清空回收站。

验收标准：

- 用户可以长期维护一个真实笔记库。
- 文件变动和附件处理不破坏数据。
- 搜索在 1000 篇笔记下仍然可用。

## Phase 5：UI 与 UX 系统化

目标：形成简约、耐用、可复用的跨端界面系统。

### 5.1 视觉系统

- [ ] 整理 CSS token：颜色、字体、字号、间距、圆角、阴影、边框。
- [ ] 减少硬编码颜色。
- [ ] 保持亮色、暗色、系统主题一致。
- [ ] 建立编辑器排版 token。
- [ ] 建立 markdown preview typography。
- [ ] 检查移动端字体、按钮和输入框尺寸。

### 5.2 交互原则

- [ ] 常用写作动作优先快捷键。
- [ ] 次级动作进入菜单或命令面板。
- [ ] 不用大量说明性文字占据界面。
- [ ] 错误提示简短但可恢复。
- [ ] 空状态提供下一步动作。
- [ ] 删除、覆盖、关闭未保存内容必须有保护。

### 5.3 组件整理

- [ ] Button。
- [ ] IconButton。
- [ ] Tooltip。
- [ ] Modal。
- [ ] Menu。
- [ ] Dropdown。
- [ ] TextInput。
- [ ] SegmentedControl。
- [ ] Toggle。
- [ ] Slider。
- [ ] EmptyState。
- [ ] Toast/Status。

### 5.4 桌面体验

- [ ] 侧栏宽度可拖拽。
- [ ] 侧栏折叠状态持久化。
- [ ] 支持无标题栏/原生标题栏策略评估。
- [ ] 命令面板。
- [ ] 快速打开。
- [ ] 最近文件。
- [ ] 大纲侧栏。
- [ ] 全屏/专注模式。

### 5.5 移动体验

- [ ] 单栏优先。
- [ ] 文件浏览改为抽屉或独立页面。
- [ ] 工具栏触屏优化。
- [ ] 长按文本弹出格式菜单。
- [ ] 底部操作栏。
- [ ] 移动端文件选择策略。
- [ ] 移动端图片插入策略。

验收标准：

- 桌面端界面接近专业写作工具，而不是 demo。
- 移动端不只是桌面布局压缩版。
- UI 组件可复用，不再每个页面手写按钮和表单。

## Phase 6：导出、导入与发布能力

目标：补齐真实写作软件的输入输出闭环。

### 6.1 导出 HTML

- [x] 基础 HTML 导出。
- [ ] 迁出 inline CSS 到 export template。
- [ ] 支持主题选择。
- [ ] 支持图片资源复制。
- [ ] 支持代码高亮主题选择。

- [ ] 支持导出前预览。

### 6.2 导出 PDF

- [ ] 桌面端通过系统打印或 webview print。
- [ ] 支持页边距设置。
- [ ] 支持纸张大小。
- [ ] 支持页眉页脚。
- [ ] 支持代码块分页策略。

### 6.3 导出 DOCX

- [ ] 评估 `docx-rs`。
- [ ] 定义 Markdown 到 DOCX 样式映射。
- [ ] 支持标题、列表、表格、图片。
- [ ] 增加导出测试样例。

### 6.4 导入

- [ ] 导入 Markdown 文件夹。
- [ ] 导入单个 Markdown 文件。
- [ ] 导入图片资源。
- [ ] 导入时处理文件名冲突。
- [ ] 后续评估 HTML/DOCX 导入。

验收标准：

- 用户可以从 Papyro 产出可分享文档。
- 导出不会破坏图片、代码块和表格。
- 导出逻辑不留在 runtime 文件里。

## Phase 7：安全、可靠性与数据保护

目标：让 Papyro 适合承载长期笔记。

### 7.1 Markdown HTML 安全

- [ ] 明确是否支持原始 HTML。
- [ ] 默认禁用或清理 `<script>`、事件属性、危险 URL。
- [ ] 允许安全标签白名单。
- [ ] 外链点击使用平台 open，而不是在 webview 中任意跳转。
- [ ] 给渲染器补充安全测试。

### 7.2 文件安全

- [ ] 保存采用临时文件 + rename，降低写坏风险。
- [ ] 写入失败保留内存内容和 dirty 状态。
- [ ] 外部修改时提示冲突。
- [ ] 删除默认进入回收站或提供确认。
- [ ] 批量操作支持撤销或确认。

### 7.3 数据库迁移

- [ ] 每个 schema 变更必须有 migration。
- [ ] migration 测试覆盖升级路径。
- [ ] 启动失败时显示可理解错误。
- [ ] 备份 metadata 数据库。

### 7.4 崩溃恢复

- [ ] 编辑内容定期写入 recovery cache。
- [ ] 启动时检测未恢复草稿。
- [ ] 提供恢复/丢弃选项。
- [ ] 为 recovery cache 设置清理策略。

验收标准：

- 异常退出不应丢失最近编辑。
- 外部文件变化不会静默覆盖用户内容。
- Markdown 渲染不会引入明显安全风险。

## Phase 8：测试与质量体系

目标：让质量靠自动化保证，而不是靠记忆。

### 8.1 Rust 测试

- [ ] `core`：纯状态与领域规则测试。
- [ ] `app`：action/use case 测试。
- [ ] `storage`：文件系统和 SQLite 集成测试。
- [ ] `editor`：Markdown stats/render/protocol 测试。
- [ ] `platform`：adapter fallback 测试。

### 8.2 JS 测试

- [ ] editor runtime 初始化。
- [ ] format command。
- [ ] message handling。
- [ ] recycle editor。
- [ ] save request。
- [ ] content change suppress。

### 8.3 UI 测试

- [ ] 使用 browser/in-app browser 或 Playwright 做 smoke test。
- [ ] 打开 workspace。
- [ ] 创建文件。
- [ ] 输入内容。
- [ ] 自动保存。
- [ ] 切换主题。
- [ ] 切换编辑模式。
- [ ] 打开设置。

### 8.4 性能测试

- [ ] 启动耗时。
- [ ] 首次打开文件耗时。
- [ ] 切换 tab 耗时。
- [ ] 1MB 文档输入延迟。
- [ ] 搜索 1000 文件耗时。
- [ ] workspace reload 耗时。

### 8.5 CI/CD

- [ ] GitHub Actions：Rust check/test/fmt/clippy。
- [ ] GitHub Actions：JS install/build/test。
- [ ] GitHub Actions：bundle sync check。
- [ ] GitHub Actions：dependency direction check。
- [ ] GitHub Actions：desktop packaging smoke。

验收标准：

- 合并前能自动发现大多数回归。
- 编辑器、存储、导出都有独立测试。
- 性能退化有可观察指标。

## Phase 9：跨端发布

目标：从可运行进入可分发。

### 9.1 Desktop 打包

- [ ] Windows `.msi` 或 installer。
- [ ] macOS `.app` / `.dmg`。
- [ ] Linux AppImage 或 deb/rpm 评估。
- [ ] 应用图标。
- [ ] 版本号展示。
- [ ] 自动更新策略评估。

### 9.2 Desktop 平台能力

- [ ] 原生文件选择。
- [ ] Reveal in explorer/finder。
- [ ] 系统主题。
- [ ] 系统剪贴板。
- [ ] 打印。
- [ ] 外链打开。

### 9.3 Mobile 可用性

- [ ] iOS 构建链路。
- [ ] Android 构建链路。
- [ ] 移动端存储目录策略。
- [ ] 移动端文件导入/导出。
- [ ] 移动端键盘遮挡处理。
- [ ] 移动端图片选择。

验收标准：

- 非开发者可以安装桌面版。
- 移动端有独立交互设计，不复用桌面思维。

## Phase 10：长期能力

这些能力不应在架构稳定前提前开工。

### 10.1 同步

- [ ] WebDAV。
- [ ] iCloud Drive。
- [ ] Google Drive。
- [ ] 冲突解决 UI。
- [ ] 同步状态可视化。

### 10.2 插件与主题

- [ ] 插件 API 边界。
- [ ] WASM 或脚本方案评估。
- [ ] 主题包格式。
- [ ] 用户自定义 CSS。
- [ ] 插件安全模型。

### 10.3 协作

- [ ] CRDT 方案评估。
- [ ] 本地优先协作模型。
- [ ] 只读分享。
- [ ] 版本历史。

## 当前优先级排序

近期不要先做高级功能。推荐顺序如下：

1. Phase 0：工程基线。
2. Phase 1：应用层收敛。
3. Phase 2：编辑器模块化与协议固化。
4. Phase 3：Typora-like Hybrid 编辑体验。
5. Phase 4：图片、搜索、文件管理增强。
6. Phase 5：UI/UX 系统化。

原因很简单：Typora-like 体验会把编辑器、状态、存储、UI 都拉到一起。如果先不收敛架构，后续每个功能都会增加维护成本。

## Issue 拆分模板

后续每个任务建议按这个模板拆：

```markdown
## 背景

说明这个任务属于哪个 Phase，解决哪个问题。

## 范围

- 改哪些文件或模块
- 不改哪些内容

## 实现要点

- 关键设计
- 状态流向
- 错误处理
- 测试策略

## 验收标准

- 功能验收
- 测试验收
- 架构验收
```

## PR 审查清单

每个 PR 都要回答：

- 是否扩大了错误依赖方向。
- 是否让 UI 直接承担业务流程。
- 是否引入了旧 Dioxus API。
- 是否把 JS runtime 变成了业务真相来源。
- 是否有清晰错误处理。
- 是否更新了相关测试。
- 是否更新了相关文档。
- 是否让大文件继续变大。

## 完成定义

一个阶段只有同时满足这些条件才算完成：

- 功能能用。
- 代码边界清楚。
- 测试覆盖关键路径。
- 文档同步。
- 没有留下新的跨层快捷方式。
- 失败状态可恢复。
- UI 行为符合简约写作工具的体验目标。
