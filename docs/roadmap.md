# Papyro Roadmap

本文是 Papyro 的产品与工程路线图。目标不是把功能越堆越多，而是把 Papyro 做成一个本地优先、长期可维护、性能稳定、视觉审美大众可接受的专业 Markdown 笔记软件。

当前最重要的判断：Papyro 现在的主要问题不是缺少更多功能或更多菜单，而是架构、性能和 UI/UX 的基础还没有达到专业笔记软件的标准。页面操作卡顿、Hybrid mode 和 Typora 体验差距明显、界面层级和设计语言不合理，这些都必须优先解决。

## 2026-04-28 路线重排

本版路线图重新拉回完整战略，但把当前重心放在三件事上：

1. 架构重设：把应用状态、文档状态、编辑器 runtime、窗口会话、workspace 和 chrome 状态彻底分层。
2. 性能治理：让 tab 切换、关闭 tab、模式切换、侧栏折叠、打开面板和输入路径都达到明确预算。
3. UI/UX 重做：重建桌面 shell、文档编辑区、Hybrid 体验、设计 token 和交互层级，让主界面真正像成熟笔记软件。

后续仍会保留专业本地笔记软件需要的能力，例如数据保护、搜索、打包、跨端适配和长期维护边界。但它们不能抢占当前主线。当前主线没有完成前，新增大功能只会扩大卡顿和架构债。

## 产品北极星

Papyro 的理想形态：

- 本地优先的 Markdown 笔记软件，用户自己的 `.md` 文件是第一等公民。
- 默认体验接近 Typora 式单栏写作，而不是传统左右分栏 Markdown demo。
- 支持 workspace 管理、快速打开、搜索、标签、附件、回收站、最近文件，以及可配置的 tab / 多窗口工作模式。
- 对普通用户来说，界面干净、稳定、熟悉、专业，不需要理解内部架构。
- 对高阶用户来说，Source、Hybrid、Preview、文件系统、快捷键和命令面板都足够可控。
- 对工程来说，每个模块边界明确，能长期迭代，而不是靠临时状态和 UI 组件互相调用撑起来。

## 专业级质量标准

“专业级”在 Papyro 里不是功能堆叠，而是先满足以下基础质量：

- 性能稳定：常见操作有预算、有指标、有回归测试。
- 数据可靠：保存失败、外部修改、崩溃、删除、移动都可恢复或可解释。
- 设计成熟：视觉风格克制、大众可接受，不依赖花哨装饰，不像实验性 demo。
- 交互一致：同类操作在文件树、tab、命令面板、右键菜单中行为一致。
- 架构清晰：UI 不直接承载 storage、platform、editor runtime 的业务真相。
- 可测试：核心 use case、JS editor contract、UI smoke、性能预算和依赖方向都能自动检查。
- 可扩展：未来打包、移动端和平台能力有边界，不污染当前核心本地笔记体验。

## 当前架构事实

当前 workspace 已经形成基本分层：

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

crates/storage  -> crates/core
crates/platform -> crates/core
crates/editor   -> crates/core
crates/ui       -> crates/core
crates/ui       -> crates/editor
```

当前已经做对的部分：

- `apps/desktop` 和 `apps/mobile` 已经变薄，主要作为平台宿主。
- `crates/app` 已经承担 runtime、dispatcher、workspace flow、effects。
- `crates/core` 已经保留模型、状态结构和 trait 边界。
- `crates/storage` 已经负责 SQLite、文件系统、workspace 扫描、recent files、settings、watcher。
- `crates/editor` 已经提供 Markdown 统计、渲染和协议相关能力。
- `js/` 构建 CodeMirror 6 本地 bundle，避免运行时 CDN 依赖。
- `EditorTabs`、`TabContentsMap`、content revision、preview/outline cache 已经有基础。
- 桌面端已有 Quick Open、Command Palette、workspace search、recent files 等入口。

当前真正的问题：

- 架构虽然分了 crate，但运行时状态和 UI 订阅边界仍然会互相放大重渲染。
- UI 组件仍能接触过多 raw signal，导致 chrome 操作容易牵动 document/editor lane。
- `EditorPane`、host pool、Preview、Outline、Tabbar、Toolbar 和 JS bridge 的配合仍然偏重。
- Hybrid decoration 和 CodeMirror runtime 仍像在现有 editor 上叠能力，而不是从“所见即所得写作体验”倒推架构。
- CSS 和视觉系统缺少真正的产品级设计语言，界面像功能拼装，而不是成熟工具。
- 交互路径没有统一优先级，文件树、tabbar、toolbar、outline、settings、status bar 同时抢注意力。
- 性能预算虽有文档和部分 trace，但还没有成为强制验收线。
- 外部 Markdown 文件打开、系统双击和 tab / 多窗口工作模式还没有统一模型。

## 当前停止条件

在 Phase 1 到 Phase 4 没有达到验收前，避免推进以下工作：

- 不新增首屏常驻功能入口，除非它直接服务写作。
- 不新增会扩大 `EditorPane`、`EditorHost`、`PreviewPane`、`OutlinePane` 无关重渲染的状态依赖。
- 不继续扩展 Hybrid decoration，除非先补输入稳定性、布局稳定性和性能验证。
- 不把“组件 primitive 已完成”当作“UI/UX 已完成”。
- 不推进与本地笔记主线无关的长尾能力。
- 不为了功能完整牺牲主写作区的稳定、干净和响应速度。

## 目标架构

### 分层职责

```text
apps/
  desktop/              # 窗口、启动参数、系统文件打开、桌面资源、Dioxus desktop launch
  mobile/               # 移动宿主、移动资源、平台启动

crates/
  app/                  # application runtime、use cases、dispatcher、effects、window/session orchestration
  core/                 # 领域模型、纯状态、trait、纯规则、无 Dioxus 依赖
  ui/                   # Dioxus 0.7 组件、layout、view model、design system
  editor/               # Markdown 派生、editor protocol、document transform、render helper
  storage/              # SQLite、文件系统、workspace repository、watcher、metadata
  platform/             # desktop/mobile adapter、系统文件选择、打开外链、reveal

future crates when justified:
  search/               # FTS / Tantivy / incremental index
```

### 会话模型

未来必须区分这些状态层级：

```text
ProcessRuntime
  - shared storage handle
  - app settings cache
  - effective note open mode
  - recent workspaces/files metadata
  - single-instance / file-open event routing

WindowSession
  - window id
  - shell mode
  - active workspace
  - editor tabs
  - tab contents
  - chrome state
  - pending close/delete state

WorkspaceSession
  - workspace metadata
  - file tree
  - expanded paths
  - watcher subscription
  - search index state

DocumentSession
  - tab id
  - note id
  - path
  - content snapshot
  - revision
  - dirty/save/conflict state
  - selection/scroll/undo restoration metadata

EditorRuntimeSession
  - CodeMirror host instance id
  - runtime ready/error state
  - view mode
  - visible/layout size
  - command dedupe cache
```

关键原则：

- 一个窗口关闭 tab，不影响另一个窗口的 tab 或 editor host。
- storage 和 metadata 可以进程共享，但未保存编辑内容不能跨窗口静默覆盖。
- `WindowSession` 可以共享 `ProcessRuntime`，但不能共享 `tab_contents`。
- 系统双击 Markdown 文件、文件树打开笔记、Quick Open 和搜索结果，最终都进入同一条 app use case。
- 笔记打开后的呈现方式由软件级 `note_open_mode` 决定，而不是由某个文件树手势临时决定。
- `note_open_mode` 在启动时读取并成为本次进程的 effective mode；设置变更写入持久化配置，但重启后才生效。

### 渲染通道

应用必须继续收敛到四条渲染通道：

```text
Workspace lane
  input: workspace path, file watcher, file operations
  output: file tree, recent files, trash, tags, selected path

Chrome lane
  input: sidebar, modals, command palette, settings, status bar
  output: shell layout and transient UI

Document lane
  input: active document snapshot and revision
  output: stats, outline, preview HTML, search snippets

Editor runtime lane
  input: visible editor host, view mode, content snapshot, preferences
  output: editor ready/error, content changes, save requests, selection/scroll
```

禁止事项：

- Chrome lane 更新触发 preview HTML、outline 或 stats 重算。
- Workspace lane 选择、排序、右键菜单触发 CodeMirror host 重建。
- Document lane 派生数据在 Dioxus render path 中阻塞计算。
- Editor runtime lane 持有业务真相，或绕过 `crates/app` 修改 storage。

### Dioxus 0.7 约束

后续所有 UI 代码必须遵守 Dioxus 0.7 风格：

- 使用 `#[component] fn Name(...) -> Element`。
- 使用 `Signal<T>`、`ReadOnlySignal<T>`、`use_signal`、`use_memo`、`use_resource`。
- 在 `rsx!` 里用 `for` 和 `if` 直接渲染元素。
- 通过 `document::Stylesheet`、`document::Script`、`asset!` 管理资源。
- 不引入旧 API：`cx`、`Scope`、`use_state`。

## 性能预算

性能预算不是建议，是重构验收线。

| 场景 | 目标 | 说明 |
| --- | ---: | --- |
| 普通 chrome 操作 | 50ms | 侧栏折叠、侧栏 resize commit、打开 modal、settings chrome 更新 |
| View mode 切换 | 100ms | Rust UI action + active host editor command |
| Tab 切换 | 80ms | active editor host 可用，不重建隐藏 host |
| Tab 关闭 | 80ms | 交互路径完成，heavy cleanup 延迟 |
| 输入帧 | 16ms | preview、outline、stats 不阻塞输入 |
| 100KB 文件打开 | 250ms | editor 可编辑，不要求所有派生数据完成 |
| 1MB 文件打开 | 800ms | preview 可延迟，输入必须可用 |
| 5MB 文件打开 | 2500ms | 走降级策略，编辑优先 |

所有高风险改动必须检查这些 trace：

- `perf editor pane render prep`
- `perf editor open note`
- `perf editor switch tab`
- `perf editor view mode change`
- `perf editor outline extract`
- `perf editor command refresh_layout`
- `perf editor command set_view_mode`
- `perf editor command set_preferences`
- `perf editor input change`
- `perf editor preview render`
- `perf chrome toggle sidebar`
- `perf chrome resize sidebar`
- `perf chrome open modal`
- `perf tab close trigger`
- `perf runtime close_tab handler`

## Phase 0：重新建立产品和工程基线

目标：让团队对“为什么当前要重做架构、UI、性能”有统一判断。

### 0.1 产品基线

- [ ] 明确 Papyro 当前阶段不是功能扩张，而是架构、性能、UI/UX 修复期。
- [ ] 定义主用户路径：打开 workspace、打开笔记、编辑、保存、搜索、切换 tab、切换模式、关闭 tab。
- [ ] 定义桌面首屏标准：第一眼是文档，不是工具集合。
- [ ] 定义大众可接受视觉方向：克制、清晰、专业、低装饰、长时间阅读舒适。
- [ ] 定义 Hybrid 体验目标：向 Typora 的单栏写作体验靠近，而不是传统 preview/editor 拼接。

### 0.2 工程基线

- [x] workspace 已拆分为 `apps/*` 与 `crates/*`。
- [x] app runtime 已有 state / actions / dispatcher / effects 基础。
- [x] editor 组件已拆分为 pane / host / bridge / preview / outline / tabbar / toolbar。
- [x] preview/outline/stats 已有 revision cache 基础。
- [x] editor host lifecycle 已有 instance id、stale destroy 防护和 contract test 基础。
- [ ] 把性能预算变成 PR 必填项，而不是只存在文档里。
- [ ] 把 UI/UX 验收纳入 Phase 任务，不允许“代码能跑但体验很差”算完成。

验收标准：

- 每个新 issue 能明确属于架构、性能、UI/UX、文件体验、可靠性或平台体验。
- 每个 PR 能说明是否影响四条渲染通道。
- 每次重构都能说明性能预算和 UI 验收方式。

## Phase 1：顶层架构重设

目标：用顶层会话模型和状态通道重新约束代码，让卡顿不再靠局部补丁解决。

### 1.1 WindowSession 与 ProcessRuntime

- [ ] 定义 `ProcessRuntime` 和 `WindowSession` 的边界文档。
- [ ] 明确哪些状态进程共享：storage handle、settings metadata、effective note open mode、recent files、recent workspaces。
- [ ] 明确哪些状态窗口独立：editor tabs、tab contents、active tab、chrome state、pending close/delete。
- [ ] 为未来多窗口保留 `window_id` 或等价标识，不让 tab id 承担窗口身份。
- [ ] 桌面启动参数和系统文件打开事件先进入 `apps/desktop`，再交给 `crates/app` use case。

### 1.2 打开模式设置

- [ ] 在 `AppSettings` 中增加软件级 `note_open_mode`，默认值为 `Tabs`。
- [ ] 支持两个模式：`Tabs` 和 `MultiWindow`。
- [ ] 设置页提供一个清晰的分段控件切换模式。
- [ ] 保存设置后提示“重启后生效”，当前运行中的窗口和 tab 不迁移。
- [ ] 启动时读取 `note_open_mode` 并写入 `ProcessRuntime` 的 effective mode。
- [ ] 所有打开入口只提交 `OpenMarkdownTarget { path }`，具体打开到 tab 还是窗口由 effective mode 决定。
- [ ] 为设置持久化、默认值、重启生效语义补测试。

### 1.3 AppAction 与 use case 边界

- [x] `AppAction` 和 dispatcher 已存在。
- [ ] 所有打开笔记入口收敛到 path-based `OpenMarkdown` use case。
- [ ] 文件树、Quick Open、Search、Recent、系统双击都不直接各写一套 open flow。
- [ ] `OpenNote(FileNode)` 作为兼容入口时，也应转成 path-based open。
- [ ] `crates/app` 暴露面向桌面宿主的启动/打开请求，不让 `apps/desktop` 调 UI command。
- [ ] 为每个 use case 明确输入、输出、失败状态、状态更新范围。

### 1.4 State Domain 切分

- [ ] 将 runtime state 文档化为 WorkspaceState、ChromeState、DocumentState、EditorRuntimeState。
- [ ] UI 组件优先读取 view model，不直接读多个 raw signal 拼业务判断。
- [ ] `DesktopLayout` 只能感知 shell/chrome 需要的数据。
- [ ] `EditorPane` 只接收 active editor surface 所需数据。
- [ ] Sidebar、Header、StatusBar 不读取 document content 或 editor host 状态。
- [x] StatusBar 改为消费 `EditorViewModel`，不再直接读取 `EditorTabs` 和 `TabContentsMap`。
- [x] Header 改为消费 `SettingsViewModel`，展示逻辑不再直接读取 raw `UiState`。
- [x] DesktopLayout 的主题和侧栏展示状态改为消费 `SettingsViewModel`。
- [x] MobileLayout 的主题和浏览器展示状态改为消费 `SettingsViewModel`。
- [x] Sidebar 展示宽度改为消费 `SettingsViewModel`，resize 提交统一走 `crates/ui/src/chrome.rs` helper。
- [x] Sidebar workspace 和选中项展示数据改为消费 `WorkspaceViewModel`。
- [x] sidebar toggle/resize/theme/view mode 等 chrome 动作统一走 `crates/ui/src/chrome.rs` helper，不在入口组件里重复写 settings mutation。
- [ ] 为 view model 派生函数补充“无关状态变化不改变输出”的测试。

### 1.5 Document Pipeline

- [ ] 定义 `DocumentSnapshot { tab_id, path, revision, content }` 作为派生数据边界。
- [ ] preview HTML、outline、stats、search snippets 统一按 `tab_id + revision` 缓存。
- [ ] 大文档 preview 和 outline 计算移出 render path。
- [ ] 派生数据计算支持取消或丢弃过期 revision。
- [ ] 派生数据失败只影响对应面板，不阻塞编辑。

### 1.6 Editor Runtime Boundary

- [ ] Rust/JS 协议由 `crates/editor` 维护，不在 UI 内散落私有 schema。
- [ ] JS runtime 只处理浏览器编辑能力：输入、selection、IME、scroll、decorations、format command。
- [ ] Rust 仍是文档内容、保存状态、tab 状态、workspace 状态的真相来源。
- [ ] `RefreshLayout`、`SetViewMode`、`SetPreferences` 必须去重。
- [ ] host 创建、销毁、隐藏、恢复都有可观测 trace 和 contract test。

验收标准：

- 侧栏折叠、打开设置、打开命令面板不触发 preview/outline 重算。
- 文件树点击非打开操作不触发 CodeMirror host 重建。
- 同一 use case 可以被 UI、启动参数、系统打开事件复用。
- 新增状态必须归属到明确 domain。

## Phase 2：性能治理

目标：把“卡顿”从体感问题变成可定位、可预算、可回归检查的问题。

### 2.1 性能观测

- [x] 已有 `PAPYRO_PERF` trace 基础。
- [ ] 为每个主路径建立 trace chain：用户事件、Dioxus action、use case、state update、render prep、editor command。
- [ ] trace 必须包含 tab id、window id、revision、view mode、file size、trigger reason。
- [ ] 性能日志按交互路径聚合，避免只看到零散点。
- [ ] 增加脚本化手工场景，覆盖 100KB、1MB、5MB Markdown。

### 2.2 Dioxus render 收敛

- [ ] 检查所有 `use_memo` 依赖，确保 chrome 更新不读 document content。
- [ ] 拆分会导致大面积 rerender 的 props。
- [ ] 大 Vec / HashMap 避免作为宽 props 穿过多层组件。
- [ ] 对稳定结构使用更小 view model 或 id list。
- [x] `EditorPaneModel` 使用 `use_memo` 派生，避免 chrome/settings render 重建 tab/document snapshot。
- [x] Quick Open 候选列表和查询过滤使用 `use_memo` 派生，避免输入时重复 flatten 文件树。
- [ ] 避免在 render 中 clone 大内容、渲染 HTML、提取 outline。

### 2.3 Editor host 性能

- [x] 已有 bounded retired host 和 stale destroy 防护。
- [x] 重新评估是否所有 open tab 都需要保留 host。
- [x] 明确 active host、warm host、hidden host 的数量上限。
- [ ] 非活动 tab 的 selection、scroll、undo 状态保存策略文档化。
- [ ] 关闭 tab 的 heavy cleanup 保持 idle 或批处理。
- [ ] 模式切换只向 active/visible host 发送必要命令。

### 2.4 文档派生性能

- [x] preview/outline/stats 已有 revision cache 基础。
- [ ] 1MB 以上文件默认降低 preview 和 syntax highlight 压力。
- [ ] 5MB 文件默认暂停 live preview，保证编辑优先。
- [ ] outline 提取异步化并支持过期结果丢弃。
- [ ] preview HTML 渲染失败或超时显示轻量占位。
- [ ] 搜索 snippet 生成不阻塞编辑器输入。

### 2.5 UI 操作性能

- [ ] 侧栏折叠只影响 shell 布局和 visible host layout。
- [x] 侧栏拖拽过程中使用本地 preview width，释放鼠标时才提交 settings。
- [x] sidebar/theme/view mode 的 settings 持久化移出 chrome 交互热路径，并通过后台队列合并重复保存。
- [ ] 打开 Command Palette、Quick Open、Settings、Workspace Search 不触发 editor command storm。
- [ ] Tab close 交互路径不等待 JS destroy。
- [ ] 切换 theme/settings 只更新必要 CSS variables 和 active host preferences。

验收标准：

- 普通 chrome 操作低于 50ms。
- View mode 切换低于 100ms。
- Tab 切换低于 80ms。
- 输入不被 preview、outline、stats 阻塞。
- 性能退化必须能通过 trace 定位到 lane 和 trigger。

## Phase 3：UI/UX 重新设计

目标：让 Papyro 从“功能型 demo”变成大众能接受的专业写作软件。

### 3.1 视觉方向

- [ ] 建立新的视觉原则：克制、清晰、专业、耐看、低装饰。
- [ ] 避免强烈主题皮肤感，不使用大面积装饰性背景。
- [ ] 亮色和暗色都以阅读舒适、光标清晰、层级稳定为先。
- [ ] 主编辑区不使用过重 card、阴影、边框和多层容器。
- [ ] 管理功能降低视觉权重，写作内容成为第一视觉主角。

### 3.2 Design Tokens

- [ ] 重建颜色 token：背景、surface、border、text、muted、accent、danger、success、selection。
- [ ] 重建 typography token：UI 字体、正文、标题、代码、行高、段落节奏。
- [ ] 重建 spacing token：shell、sidebar、tabbar、modal、editor paper、menu。
- [ ] 重建 radius、border、shadow token，避免各组件随意硬编码。
- [ ] 将 editor typography、Hybrid decoration、Preview typography 共用同一套文档 token。
- [ ] CSS 中减少硬编码颜色和一次性 class。

### 3.3 桌面 Shell

- [ ] 重新定义默认桌面布局：左侧文件区、顶部轻量 chrome、中央文档。
- [ ] 默认减少常驻控件，低频功能进入命令面板、右键菜单或按需面板。
- [ ] Tabbar 只表达打开文档和 dirty/save 状态，不承担大工具栏职责。
- [x] Outline toggle 从 tabbar 常驻控件降级到命令面板入口。
- [x] Format toolbar 从 tabbar 常驻控件移除，避免顶部区域抢占写作注意力。
- [x] Sidebar action 文案改为稳定文本，避免符号按钮在不同环境乱码或含义不清。
- [ ] Status bar 只放必要状态，不做信息垃圾桶。
- [ ] Sidebar 支持清晰的 workspace、文件树、搜索入口，但不抢主编辑区。
- [ ] 设置、标签管理、回收站以 modal/panel 形式按需打开。

### 3.4 编辑区体验

- [ ] 建立统一文档纸面：舒适阅读宽度、稳定 padding、稳定行高。
- [ ] Source、Hybrid、Preview 使用同一套文档尺度。
- [ ] 光标、selection、composition 状态清晰可见。
- [ ] 图片、表格、代码块、引用、列表在三种模式中节奏一致。
- [ ] 编辑区空状态直接引导打开或创建笔记，不展示大段说明文字。

### 3.5 交互原则

- [ ] 高频写作动作优先快捷键：保存、快速打开、搜索、命令面板、模式切换。
- [ ] 次级动作进入右键菜单、命令面板或按需浮层。
- [ ] 危险动作有确认和恢复路径。
- [ ] 错误提示短、明确、可行动。
- [ ] 同一动作在文件树、tab、搜索结果中的命名和行为一致。
- [ ] 鼠标路径和键盘路径都完整。

### 3.6 可访问性和大众接受度

- [ ] 文字对比度满足长时间阅读。
- [ ] 所有图标按钮有 tooltip / aria label。
- [ ] 焦点环清晰，键盘导航不丢焦。
- [ ] 不使用依赖文化偏好过强的视觉风格。
- [ ] 常见屏幕尺寸下不出现文字溢出、遮挡、错位。
- [ ] Windows 默认字体和 macOS 默认字体都要看起来正常。

验收标准：

- 打开应用第一眼是文档，不是工具集合。
- UI 不再像临时 demo 或组件展示页。
- 用户可以连续写作 30 分钟，不被视觉噪音和布局跳动打扰。
- 亮色、暗色、系统主题都能达到专业工具的最低审美线。

## Phase 4：Hybrid Editor 重做

目标：让 Hybrid mode 真正接近 Typora 式体验，而不是 Source 与 Preview 的折中拼接。

### 4.1 体验定义

Hybrid mode 应该满足：

- 当前聚焦块保留可编辑 Markdown 语法。
- 非聚焦块尽量呈现接近最终排版的阅读效果。
- 光标移动、选择、输入法、撤销、重做、快捷键稳定。
- 滚动时不出现大量布局跳动。
- 模式切换像同一篇文档的不同状态，不像切换到另一个产品。
- 图片、代码块、表格、列表、引用、任务列表都有稳定编辑体验。

### 4.2 Block Model

- [ ] 在 `crates/editor` 中定义 Markdown block 分析边界，避免 JS runtime 私有解析所有业务语义。
- [ ] 每个 block 有稳定范围、类型、revision 关联和降级策略。
- [ ] JS decoration 只消费必要的 block hints，不成为文档真相来源。
- [ ] 当前块、邻近块、远端块使用不同 decoration 等级。
- [ ] 大文档中只对 viewport 附近 block 做重 decoration。

### 4.3 Decoration Strategy

- [ ] Heading、emphasis、link、image、task、code、quote、table 分层实现。
- [ ] 每类 decoration 定义开启条件、关闭条件、性能预算和 fallback。
- [ ] IME composition 期间暂停可能干扰输入的 decoration command。
- [ ] selection 跨 block 时不强行重排或隐藏源语法。
- [ ] 失焦块的渲染不能改变文档实际内容。

### 4.4 CodeMirror Integration

- [ ] Rust -> JS command schema 固化到 `crates/editor` protocol。
- [ ] JS -> Rust event schema 固化并测试：content changed、save requested、runtime ready/error、layout changed。
- [ ] Content update 支持 suppress echo，避免 Rust 更新再触发 JS 回流。
- [ ] View mode、preferences、layout refresh 都做 idempotent。
- [ ] Runtime error 必须回退到 fallback editor，而不是让页面空白。

### 4.5 Typora-like 验收场景

- [ ] 中文输入法连续输入、选词、回车、标点不丢字、不重复。
- [ ] 输入 `# ` 后标题视觉变化不打断输入。
- [ ] 粘贴图片后能插入相对 Markdown 链接并预览。
- [ ] 在列表中回车、缩进、退格符合用户预期。
- [ ] 代码块中输入不触发错误 decoration。
- [ ] 表格编辑至少不破坏文本结构，后续再增强表格 UI。
- [ ] Source / Hybrid / Preview 切换保持滚动位置和阅读宽度。

验收标准：

- Hybrid mode 在 100KB 文档中输入、选择、滚动稳定。
- Hybrid mode 不再给用户“半成品 preview”的感觉。
- 与 Typora 的差距被拆成明确缺口，而不是泛泛说“体验不像”。

## Phase 5：Markdown 打开模式

目标：让用户通过软件设置选择自己的工作方式。Papyro 提供 `Tabs` 和 `MultiWindow` 两种打开模式，设置保存后重启生效。文件树、Quick Open、搜索结果、最近文件和系统双击都服从同一个模式。

### 5.1 打开模式定义

目标类型：

```rust
pub enum NoteOpenMode {
    Tabs,
    MultiWindow,
}

pub struct OpenMarkdownTarget {
    pub path: PathBuf,
}
```

规则：

- `Tabs` 是默认模式。
- `MultiWindow` 是软件级模式，不是某个文件树操作或右键菜单的临时动作。
- 设置页可以修改 `note_open_mode`，但本次运行保持当前 effective mode。
- 保存设置后显示“重启后生效”。
- 重启后，所有打开入口都使用新的 effective mode。

### 5.2 统一打开 use case

- [ ] 在 `crates/app/src/actions.rs` 增加 `OpenMarkdown(OpenMarkdownTarget)`。
- [ ] 在 `crates/ui/src/commands.rs` 增加 command，供 Dioxus UI 入口使用。
- [ ] 桌面宿主通过 `crates/app` 启动/打开请求注入路径，不直接调用 UI command。
- [ ] 在 `workspace_flow/open.rs` 增加 path-based open use case。
- [ ] 统一文件树、Quick Open、Workspace Search、Recent File、系统双击的打开行为。
- [ ] 打开流程先解析路径和 workspace，再根据 effective mode 选择 tab 或 window。
- [ ] 非 Markdown 文件给出清晰错误，不改变当前 tab 或窗口。

### 5.3 Tabs 模式

Tabs 模式适合一个窗口内管理多篇笔记，是默认工作方式。

- [ ] 打开 `.md` 或 `.markdown` 时，在当前主窗口新增或激活 tab。
- [ ] 同一窗口重复打开同一 note id，激活已有 tab，不重复创建。
- [ ] 打开另一个 workspace 的文件前，先 flush dirty tabs 或给出保护提示。
- [ ] 打开失败不清空已有 tab。
- [ ] tabbar 表达 title、dirty、saving、failed 状态，不承担大工具栏职责。
- [ ] recent files 记录系统双击和外部打开。

### 5.4 MultiWindow 模式

MultiWindow 模式适合用户把多篇笔记摊开在多个窗口中写作。它由设置决定，重启后全局生效。

- [ ] 打开 `.md` 或 `.markdown` 时，为该笔记创建或聚焦独立文档窗口。
- [ ] 每个文档窗口拥有独立 `WindowSession`、`tab_contents`、chrome state 和 editor host。
- [ ] 多窗口模式下可以隐藏或弱化 tabbar，避免“窗口里再套 tab”的混乱体验。
- [ ] 重复打开同一 note id 时，优先聚焦已有文档窗口，而不是创建重复窗口。
- [ ] 新窗口复用 shared storage、settings metadata、recent files。
- [ ] 原窗口关闭不销毁其他窗口的 editor host。
- [ ] 同一文件被多个窗口编辑时，保存前检测 mtime/revision 冲突。
- [ ] watcher 通知各窗口，但不覆盖 dirty 内容。

### 5.5 设置和重启生效

- [ ] Settings 增加 `Note open mode` 分段控件：`Tabs` / `Multi-window`。
- [ ] 修改设置后只持久化，不迁移当前窗口结构。
- [ ] 状态栏或设置页显示“Restart Papyro to apply this change”。
- [ ] 启动时读取 `note_open_mode`，并注入 `ProcessRuntime` effective mode。
- [ ] 为默认值、保存、重启后生效、当前运行不变补测试。

### 5.6 系统集成

- [ ] 用户在操作系统文件管理器中双击 `.md` / `.markdown` 且 Papyro 未运行时，由文件关联启动 Papyro 并把文件路径作为启动参数传入。
- [ ] `apps/desktop` 解析启动参数中的 Markdown 路径，并提交 `OpenMarkdownTarget { path }`。
- [ ] 支持已运行实例接收外部打开请求。第一阶段可先支持新进程参数，后续做单实例转发。
- [ ] 规划 `.md` / `.markdown` 文件关联，不把完整打包发布提前塞进当前阶段。
- [ ] 平台层提供必要文件打开事件抽象。
- [ ] 系统双击只提交 `OpenMarkdownTarget { path }`，不指定 tab 或 window。

验收标准：

- 设置页可以选择 `Tabs` 或 `Multi-window`，保存后明确提示重启生效。
- Papyro 未运行时，系统双击 Markdown 文件可以启动 Papyro 并打开该文件。
- 重启后，所有打开入口都遵守同一个 effective mode。
- Tabs 模式下重复打开同一笔记只激活已有 tab。
- MultiWindow 模式下重复打开同一笔记聚焦已有窗口。
- 两个窗口编辑同一文件不会静默覆盖。
- 所有打开入口共享同一套 use case 和错误处理。

## Phase 6：笔记工作流闭环

目标：让 Papyro 能承载真实长期笔记库。

### 6.1 Workspace

- [x] 支持多个 workspace。
- [x] 支持 recent workspace。
- [x] 支持 workspace settings override。
- [ ] 大 workspace 扫描分阶段加载，不阻塞首屏编辑。
- [ ] watcher 事件合并，避免文件系统抖动触发 UI storm。
- [ ] workspace reload 不关闭未保存 tab。

### 6.2 文件操作

- [x] 创建、重命名、移动、删除已有基础。
- [x] 删除进入 `.papyro-trash/` 并支持恢复。
- [x] 移动/重命名时更新打开 tab 路径。
- [ ] 保存采用临时文件 + atomic rename。
- [ ] 外部删除已打开文件时，保留 tab 内容并提示另存或关闭。
- [ ] 外部修改 clean tab 时可刷新，dirty tab 时提示冲突。

### 6.3 附件和图片

- [x] workspace `assets/` 作为默认附件目录。
- [x] paste/drop 图片复制到附件目录。
- [x] 插入相对 Markdown 图片链接。
- [x] 移动/重命名笔记时重写相对图片引用。
- [ ] 统一附件清理策略，避免误删仍被引用的文件。
- [ ] 大图预览异步化，不阻塞 editor input。

### 6.4 搜索、标签、收藏、回收站

- [x] workspace search 已有扫描版。
- [x] Quick Open 已可过滤文件。
- [x] 标签 CRUD、front matter 保持一致已有基础。
- [x] 收藏和回收站已有基础。
- [ ] 搜索 UI 重做，结果层级更清晰。
- [ ] 大 workspace 引入增量索引或 FTS。
- [ ] watcher 驱动索引更新。
- [ ] 标签入口降噪，不抢占写作主路径。

验收标准：

- 用户可以用 Papyro 管理真实笔记库，而不是只编辑单个 demo 文件。
- 文件移动、删除、恢复、附件引用不会破坏数据。
- 搜索 1000 篇笔记仍可用，且不会拖慢编辑器。

## Phase 7：可靠性、安全和数据保护

目标：让 Papyro 适合长期存放重要笔记。

### 7.1 保存与冲突

- [ ] 保存前记录文件 mtime 或 content hash。
- [ ] 写入失败保留内存内容和 dirty 状态。
- [ ] 保存冲突提供 reload、overwrite、save as 的策略。
- [ ] autosave 不覆盖外部修改。
- [ ] 退出和关闭窗口前 flush dirty tabs 或提示。

### 7.2 崩溃恢复

- [ ] dirty 内容定期写入 recovery cache。
- [ ] 启动时检测未恢复草稿。
- [ ] 提供恢复、比较、丢弃选项。
- [ ] recovery cache 有清理策略。

### 7.3 Markdown 渲染安全

- [ ] 明确是否支持原始 HTML。
- [ ] 默认清理 `<script>`、事件属性和危险 URL。
- [ ] 外链点击走 platform open，而不是在 webview 中任意跳转。
- [ ] preview sanitizer 有测试覆盖。

### 7.4 数据库和迁移

- [ ] schema 变更必须有 migration。
- [ ] migration 测试覆盖升级路径。
- [ ] 启动失败显示可理解错误。
- [ ] metadata 数据库支持备份和恢复策略。

验收标准：

- 异常退出不丢失最近编辑。
- 外部文件变化不会静默覆盖用户内容。
- Markdown preview 不引入明显安全风险。

## Phase 8：质量体系

目标：让质量靠系统保证，而不是靠记忆。

### 8.1 Rust 测试

- [ ] `core`：纯状态、tab、settings、workspace 规则。
- [ ] `app`：action、dispatcher、open/save/close use case。
- [ ] `storage`：文件系统、SQLite、watcher、migration。
- [ ] `editor`：Markdown stats、render、protocol。
- [ ] `platform`：adapter fallback 和错误路径。

### 8.2 JS 测试

- [ ] editor runtime 初始化。
- [ ] Rust message handling。
- [ ] content change suppress。
- [ ] stale destroy。
- [ ] format command。
- [ ] IME composition safety。
- [ ] decoration fallback。

### 8.3 UI 和视觉测试

- [ ] UI smoke：打开 workspace、打开文件、输入、保存、关闭 tab。
- [ ] UI smoke：切换 Source/Hybrid/Preview。
- [ ] UI smoke：打开 Command Palette、Quick Open、Settings、Workspace Search。
- [ ] UI smoke：侧栏折叠、resize、主题切换。
- [ ] 截图检查主界面是否保持文档优先。
- [ ] 检查文字溢出、遮挡、错位。

### 8.4 性能测试

- [ ] 100KB、1MB、5MB 文件打开。
- [ ] tab switch、tab close、mode switch。
- [ ] 侧栏折叠和 modal open。
- [ ] workspace search 1000 文件。
- [ ] 输入延迟和 preview 降级。

### 8.5 CI 和门禁

- [ ] `cargo fmt --check`
- [ ] `cargo check --workspace --all-features`
- [ ] `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] JS build/test
- [ ] bundle consistency check
- [ ] dependency direction check
- [ ] performance smoke 或手工性能 checklist

验收标准：

- 合并前能发现大多数架构、编辑器、UI、性能回归。
- 性能和视觉问题不能只靠主观记忆。
- 每个阶段都有可执行验收，而不是“感觉好了”。

## Phase 9：本地应用平台体验

目标：在核心本地笔记体验稳定后，让 Papyro 更像一个完整桌面应用。这个阶段只关注本地平台体验和系统集成。

### 9.1 Desktop 分发

- [ ] Windows installer / MSI 评估。
- [ ] macOS `.app` / `.dmg` 评估。
- [ ] Linux AppImage / deb / rpm 评估。
- [ ] 文件关联安装策略。
- [ ] 自动更新策略。
- [ ] 崩溃日志和用户可理解错误报告。

### 9.2 桌面平台能力

- [ ] 系统双击 `.md` / `.markdown` 文件时可靠启动 Papyro。
- [ ] 已运行实例接收外部文件打开请求。
- [ ] Reveal in explorer / finder。
- [ ] 使用系统默认方式打开外链。
- [ ] 系统主题跟随和窗口尺寸恢复。
- [ ] 多窗口模式下窗口标题、任务栏显示和关闭行为清晰。

### 9.3 Mobile 本地体验

- [ ] 移动端单栏写作优先。
- [ ] 文件浏览改为抽屉或独立页面。
- [ ] 触屏 toolbar 和 selection 菜单。
- [ ] 移动端文件选择和图片插入策略。
- [ ] 移动端键盘遮挡处理。

验收标准：

- 分发能力不反向污染核心架构。
- 文件关联、系统打开和多窗口模式都服务本地笔记体验。
- 移动端不只是桌面界面的压缩版。

## 当前优先级排序

当前推荐顺序：

1. Phase 1：顶层架构重设，先解决状态边界和会话模型。
2. Phase 2：性能治理，让卡顿可测、可定位、可回归。
3. Phase 3：UI/UX 重新设计，重做桌面 shell 和设计系统。
4. Phase 4：Hybrid Editor 重做，追 Typora 式单栏体验。
5. Phase 5：Markdown 文件打开、tab 模式和多窗口模式。
6. Phase 6：笔记工作流闭环，强化 workspace、文件、搜索、附件。
7. Phase 7/8：可靠性、安全和质量体系。
8. Phase 9：本地应用平台体验。

核心原因：如果侧栏折叠、关闭 tab、模式切换、打开 modal 都会卡，继续做高级能力只会把问题扩散到更大表面。现在必须先把架构、性能、UI/UX 和本地笔记打开体验打牢。

## Issue 拆分模板

```markdown
## 背景

说明任务属于哪个 Phase，解决哪个具体体验或架构问题。

## 当前问题

- 用户可见问题
- 代码结构问题
- 性能或稳定性风险

## 范围

- 改哪些模块
- 不改哪些模块
- 不顺手做哪些事

## 实现要点

- 状态归属
- 数据流向
- 错误处理
- 性能观测点
- UI/UX 验收方式

## 验收标准

- 功能验收
- 性能验收
- 架构验收
- 测试验收
```

## PR 审查清单

每个 PR 都要回答：

- 是否直接改善当前主线：架构、性能、UI/UX、Hybrid、笔记打开或可靠性？
- 是否扩大了错误依赖方向？
- 是否让 UI 直接承担 storage、platform 或业务 use case？
- 是否让 JS runtime 成为业务真相来源？
- 是否让 chrome 状态变化触发 editor host、preview 或 outline 的无关重算？
- 是否为新增交互补充性能 trace？
- 是否保持主写作区优先？
- 是否让 Source、Hybrid、Preview 的排版尺度继续分裂？
- 是否保护了 dirty 内容和保存失败状态？
- 是否更新了相关 Rust/JS/UI/性能测试？
- 是否更新了相关文档？

## 完成定义

一个阶段只有同时满足这些条件才算完成：

- 用户路径可用，失败状态可恢复。
- 代码边界符合当前目标架构。
- 性能预算没有退化。
- UI 行为符合专业写作工具的体验目标。
- 关键路径有测试或明确手工验收脚本。
- 文档更新。
- 没有留下新的跨层快捷方式。
- 主界面第一眼是文档，不是工具集合。
