# Tiptap 编辑器重构方案

[English](../tiptap-refactor-plan.md)

本文档是将 Papyro 编辑器从当前混乱的自定义实现重构为基于 Tiptap 官方 UI 组件的 Notion-like 编辑器的完整执行计划。

## 目标

- 高度对齐 Tiptap 官方 Notion-like Editor 模板的体验和架构
- 最大化使用官方 UI Components（Pro 许可已具备）
- 迁移至 React + TypeScript 技术栈
- 删除所有冗余自定义代码，提升可维护性和可读性
- 保持 Markdown 作为持久化源格式不变

## 技术栈评估

| 维度 | 当前状态 | 目标状态 |
|------|---------|---------|
| 语言 | `js/src/` 下源码已全量 TypeScript；截至 2026-05-13 code block 迁移后，不再有被跟踪的 `.js` 或 `.jsx` 文件 | TypeScript (.ts/.tsx) |
| 构建 | esbuild (原生支持 TS，无需改动) | esbuild + tsconfig |
| UI 框架 | React 18.3 (已满足) | React 18.3 (不变) |
| Tiptap | 3.23.1 (已对齐) | 3.23.1+ (保持同版本) |
| 组件来源 | 大量自定义 DOM 控制器 + 部分 React | 官方 UI Components 源码 + 少量适配 |
| 样式 | 自定义 SCSS 散落各处 | 官方组件自带样式 + 统一 design tokens |

结论：React 已满足，TypeScript 可增量迁移（esbuild 原生支持），无阻塞项。

## 当前专家审计（2026-05-13）

编辑器方向已经回到官方组件体系，但还没有达到官方 Notion-like 模板的体验标准。

- 表格架构：`PapyroOfficialTableNodeLayer` 已经把官方 `TableHandle`、`TableSelectionOverlay`、`TableCellHandleMenu`、`TableExtendRowColumnButtons` 挂在 `EditorContent` 外部，符合官方 table-node 集成契约。最新表格跟进已经恢复官方 table wrapper 操作轨道（`--tt-table-pad-*`），让行列 handle 和扩展按钮拥有与 Notion-like 模板一致的留白；Papyro CSS 不再重绘官方 handle、扩展按钮和单元格操作点，表格专属菜单 CSS 只限制视口边界和文本裁剪，嵌套颜色/对齐子菜单回到官方 menu 表面与层级。
- 表格 UX 目标：官方 table-node SCSS 负责组件外观，Papyro CSS 只做宿主布局、视口安全、主题 token 桥接和 Markdown 持久化约束。行列 handle 应该是接近 Notion-like 的轻量暗示，而不是常驻的开发者工具条控件。
- JavaScript 存量：code block 迁移后，`js/src/` 下已有 0 个被跟踪的 `.js` 文件和 0 个被跟踪的 `.jsx` 文件。生成后的 bundle 仍是 JavaScript 产物，但编辑器源码已经只保留 TS/TSX。
- TypeScript 状态：最新 table-node 跟进已经类型化官方 table-handle extension、plugin、helper、hook 和 action-button 模块，同时保留 Papyro 在 `CellSelection` 后恢复光标的本地行为。官方 `image-node` 依赖已经通过 `@tiptap/extension-image@3.23.1` 显式补齐，因此之前的 image/table-node typecheck 阻塞不再是下一步风险。
- 模板存量：未挂载的官方 AI/Improve、emoji、mention、TOC、textarea-autosize、协作 token helper 和完整 Notion demo shell 源码已经从 `js/src` 移除。Papyro 只保留活跃的 Papyro 适配版 Notion-like 工具栏（`PapyroToolbarFloating`）和实际挂载的编辑器表面。
- 格式化入口：顶部 shell 工具栏只保留应用级控制。富文本格式化入口应全部来自官方 Tiptap React 表面：`PapyroToolbarFloating`、slash menu、drag context menu、link popover 和 table-node menus。当前活跃的 `PapyroToolbarFloating` 仍与官方 Notion-like 工具栏组合有偏差：文本对齐、撤销/重做和高亮控件常驻展示；它应收敛为官方模板组合，仅移除 AI/Cloud 等 Papyro 暂未实现的能力。
- 验证标准：每个 UI 收敛步骤都要跑源码测试、构建和 editor Markdown gate；视觉改动在有可用 app target 时优先做 desktop WebView/manual smoke 或截图验证。

## 编辑器 UI/UX 长期推进规格（2026-05-15）

接入官方组件只代表源码路径正确，不代表体验已经达到官方 Notion-like 模板标准。后续 AI 推进时，必须把“官方源码接入”“Papyro 宿主适配”和“真实桌面体验验收”分开判断。

### 体验目标

Papyro 编辑区域应是安静、精确、可长期写作的桌面文档 surface。视觉方向遵循 `docs/zh-CN/ui-visual-brief.md` 的 **disciplined utility**，交互和组件组合优先对齐 `.reference/notion-like-editor` 中的官方 Notion-like 模板。

- 文档画布保持克制、可读、稳定，不做营销页式 hero、卡片堆叠或装饰性渐变。
- 富文本操作只在上下文中出现：选区浮动工具栏、slash menu、drag context menu、link/color popover 和 table-node menu。
- 顶部 app shell 不承载 Markdown 格式化动作；它只负责标签页、视图模式、大纲、设置、主题和窗口级控制。
- 官方组件的 DOM、状态机、ARIA、keyboard navigation 和 SCSS 是默认基线；Papyro 只做必要的 Markdown、i18n、主题 token、本地资源和 Rust 协议适配。

### Surface Ownership

| Surface | 视觉/交互所有者 | Papyro 允许适配 | 不允许做法 |
|---------|----------------|----------------|------------|
| 文档画布 | 官方 Notion-like layout + Papyro Markdown typography tokens | 内容宽度、中文排版、Source/Hybrid/Preview 一致性、Mermaid/KaTeX/error state | 用全局 CSS 破坏官方 block 间距、选区、placeholder 或 node view 命中区域 |
| 浮动工具栏 | 官方 `Toolbar`、`FloatingElement`、按钮/Popover 原语 | 本地化、移除未实现 AI/Cloud 项、保持选区、防止 WebView 焦点丢失 | 重新发明旧顶部格式栏，或让常驻按钮挤占写作区 |
| Slash menu | 官方 `slash-dropdown-menu` + `suggestion-menu` | Papyro block 命令、最近项、Markdown fallback | 用全局 menu CSS 覆盖官方 active/focus/disabled 状态 |
| Drag context menu | 官方 `drag-context-menu` | Papyro 块移动、复制、删除、重置格式、颜色/高亮命令 | 恢复旧 block handle/controller 视觉或旧 DOM 注入 |
| Link/Color/Image popover | 官方 popover/menu/input 原语 | 本地图片、链接 Markdown 序列化、中文标签、焦点返还 | 弹层透明、无边框、被裁剪、或点击后丢失编辑器选区 |
| Table chrome | 官方 `table-node`、`TableHandle`、`TableSelectionOverlay`、`TableCellHandleMenu`、`TableExtendRowColumnButtons` | table host wrapper、视口安全、主题 token、Markdown GFM 序列化 | 重绘官方 handle/menu，给单元格注入会改变行高的占位内容，或让 resize handle 造成额外空行 |

### 交互验收标准

每次修改编辑区域 UI，都至少按以下场景自检。无法自动化时，在任务记录中说明手工检查结果。

- Hover：表格行/列 handle、单元格 handle、拖拽 handle 只作为轻量暗示出现，不推动布局、不改变单元格高度、不遮挡文本光标。
- Click：handle/menu 触发后，弹层锚点正确、表面不透明、有边框/阴影、菜单项密度一致，且编辑器选区不会意外丢失。
- Resize：表格列宽拖拽使用 overlay/handle 命中区，不能让每个单元格多出空段落、空行或异常 padding。
- Keyboard：slash menu、drag menu、table menu、link/color popover 支持方向键、Enter、Escape；焦点可见，关闭后尽量回到触发入口或编辑器。
- State：default、hover、active、selected/current、disabled、focus-visible、destructive、dark/high-contrast 状态都必须可区分。
- Layout：在 1440x920、900x640、暗色主题、高对比主题、中英文标签、长表格内容和长文件名场景下不重叠、不裁切关键动作。
- Persistence：所有 UI 动作必须保持 Markdown 往返稳定；视觉修复不能引入只存在于 DOM 里的不可序列化状态。

### 视觉 QA 记录要求

涉及编辑器 UI 的任务，完成前应优先记录这些视图；截图不必提交进仓库，但应在任务汇报或 PR 里说明。

- 普通段落选区 + 浮动工具栏。
- `/` 触发 slash menu，并覆盖搜索、active item、空结果。
- 块拖拽 handle + drag context menu。
- 链接编辑 popover、颜色 popover、图片浮动 controls。
- 表格 hover、列宽拖拽、行/列 handle、单元格 handle、cell menu、嵌套颜色/对齐菜单。
- Source、Hybrid、Preview 三模式下同一 Markdown 文档的视觉一致性。

### 不可交付标准

出现以下情况时，不能把任务标记为完成：

- 菜单透明、无背景、层级错乱、菜单项重叠或被 editor 容器裁剪。
- 表格 hover/resize 导致单元格额外空行、行高跳变或文本光标命中异常。
- 官方组件外观被 Papyro 全局 CSS 大面积覆盖，但没有对应的官方参考差异说明。
- 顶部 app shell 又出现富文本格式化按钮。
- 只通过 fake DOM / 单元测试，未对真实 desktop WebView 或截图场景做任何说明。
- 暗色或高对比主题下 selected、focus、hover、destructive 状态不可辨认。

## 架构对齐：官方 Notion-like 模板结构

重构后的目录结构应对齐官方 CLI 安装的布局：

```
js/src/
├── components/
│   ├── tiptap-templates/
│   │   └── notion/              # 主编辑器模板入口
│   ├── tiptap-ui/               # 官方 UI 组件（功能级）
│   │   ├── slash-dropdown-menu/
│   │   ├── drag-context-menu/
│   │   ├── link-popover/
│   │   ├── heading-dropdown-menu/
│   │   ├── list-dropdown-menu/
│   │   ├── mark-button/
│   │   ├── color-highlight-popover/
│   │   ├── text-align-button/
│   │   ├── undo-redo-button/
│   │   ├── turn-into-dropdown/
│   │   ├── blockquote-button/
│   │   ├── code-block-button/
│   │   └── image-upload-button/
│   ├── tiptap-ui-primitive/     # 官方 UI 原语（底层构建块）
│   │   ├── button/
│   │   ├── dropdown-menu/
│   │   ├── popover/
│   │   ├── toolbar/
│   │   ├── separator/
│   │   ├── spacer/
│   │   └── tooltip/
│   ├── tiptap-node/             # 官方 Node 组件（编辑器内渲染）
│   │   ├── paragraph-node/
│   │   ├── heading-node/
│   │   ├── code-block-node/
│   │   ├── list-node/
│   │   ├── blockquote-node/
│   │   ├── horizontal-rule-node/
│   │   ├── image-node/
│   │   └── table-node/
│   ├── tiptap-extension/        # 自定义/适配扩展
│   │   ├── selection-extension/
│   │   ├── link-extension/
│   │   ├── trailing-node-extension/
│   │   └── mathematics-extension/
│   └── tiptap-icons/            # 图标组件
├── hooks/                       # 共享 hooks
│   ├── use-mobile.ts
│   ├── use-window-size.ts
│   └── use-ui-editor-state.ts
├── lib/                         # 工具库
│   └── tiptap-utils.ts
├── styles/                      # 全局样式 / design tokens
├── editor-entry.ts              # 打包入口
└── editor-runtime.ts            # 运行时核心
```

---

## 阶段划分

### 阶段 0：通过官方 CLI 生成基准模板

官方推荐路径：先用 Tiptap CLI 安装完整的 Notion-like Editor 模板，获得官方标准源码，再裁剪不需要的部分并适配 Papyro 架构。

> CLI 设计目标是 Vite/Next.js 项目。Papyro 使用自定义 esbuild，因此策略是：
> 用 CLI 在 `.reference/` 下生成一个完整的 Vite 参考项目，作为权威源码基准。

#### 0.1 生成官方模板参考项目
- [x] 登录 Tiptap Pro 账号：`npx @tiptap/cli@latest login`
- [x] 在 `.reference/` 下初始化完整模板：
  ```bash
  cd .reference
  npx @tiptap/cli@latest init notion-like-editor --framework vite
  ```
- [x] 将生成的项目目录加入 `.gitignore`
- [x] 审查生成的完整文件结构，确认包含所有组件、扩展、hooks、样式

#### 0.2 TypeScript 基础配置
- [x] 添加 `typescript`、`@types/react`、`@types/react-dom` 到 `js/package.json` devDependencies
- [x] 创建 `js/tsconfig.json`，配置 `allowJs: true`、`allowImportingTsExtensions: true`、路径别名 `@` → `src/`
- [x] 更新 `js/build.js` 入口为 `.ts` 扩展名，添加 `.ts`/`.tsx` loader 映射
- [x] 验证 esbuild 能正常打包混合 JS/TS 文件

#### 0.3 按官方模板重组目录结构
- [x] 对照生成的模板目录结构，在 `js/src/` 下创建对应目录
- [x] 将官方模板中的组件源码（TSX）直接复制到项目中
- [x] 裁剪不需要的组件（AI、协作、Emoji、Mention 相关）
- [x] 保留现有 `tiptap-node/table-node/`（已对齐官方）
- [x] 对照官方样式配置，引入必要的全局样式和 CSS 变量

---

### 阶段 1：接入官方 UI 组件

从 CLI 生成的模板中复制官方组件源码到项目，逐个接入并验证。每个组件独立一个提交。

#### 1.1 样式基础设施
- [x] 从模板中复制官方样式配置（CSS 变量、design tokens）
- [x] 对照模板的 `styles/` 目录，建立 Papyro 的全局样式基础
- [x] 确保暗色/亮色主题 CSS 变量就位

#### 1.2 UI 原语层（Primitives）
从模板中复制以下原语组件（它们是所有上层组件的依赖）：
- [x] `button` + `button-group`
- [x] `dropdown-menu`
- [x] `popover`
- [x] `toolbar`（含 `ToolbarGroup`、`ToolbarSeparator`）
- [x] `separator`
- [x] `spacer`
- [x] `tooltip`

#### 1.3 Hooks 和工具库
- [x] `use-mobile`
- [x] `use-window-size`
- [x] `use-ui-editor-state`
- [x] `tiptap-utils` / `tiptap-ui-utils`（裁剪掉 AI/协作相关工具函数，只保留本地 UI helper）

#### 1.4 Slash 命令菜单（最高优先级）
- [x] 复制官方 `slash-dropdown-menu` 组件
- [x] 复制依赖的 `suggestion-menu` 工具组件
- [x] 配置 Papyro 支持的 block 类型（heading、list、code、blockquote、hr、image、table、math、mermaid）
- [x] 连接 Rust 端的 `run_slash_command` 协议
- [x] 验证 `/` 触发、搜索过滤、键盘导航正常

#### 1.5 拖拽手柄 + 块操作菜单
- [x] 复制官方 `drag-context-menu` 组件
- [x] 复制依赖的 `floating-element` 工具组件
- [x] 配置上下文菜单项：转换块类型、颜色/高亮、复制/删除、重置格式
- [x] 确保 `withSlashCommandTrigger` 与 1.4 的 slash 菜单联动
- [x] 验证拖拽排序在 Markdown 序列化后正确

#### 1.6 浮动格式工具栏（Bubble Menu）
- [x] 使用官方 `<Tiptap.BubbleMenu>` 作为容器
- [x] 复制并接入以下官方工具栏组件：
  - `mark-button`（bold、italic、underline、strike、code）
  - `heading-dropdown-menu`
  - `list-dropdown-menu`
  - `color-highlight-popover`
  - `text-align-button`
  - `link-popover`
  - `turn-into-dropdown`
  - `undo-redo-button`
- [x] 使用官方 `toolbar` 原语组织布局

#### 1.7 链接编辑
- [x] 复制官方 `link-popover` 组件
- [x] 复制官方 `link-extension` 扩展
- [x] 确保链接在 Markdown 中正确序列化

#### 1.8 Node 组件
- [x] 复制官方 `paragraph-node`
- [x] 复制官方 `heading-node`
- [x] 复制官方 `code-block-node`（保留 lowlight 集成）
- [x] 复制官方 `list-node`
- [x] 复制官方 `blockquote-node`
- [x] 复制官方 `horizontal-rule-node`
- [x] 复制官方 `image-node`（适配本地图片粘贴协议）

#### 1.9 扩展层
- [x] 复制官方 `selection-extension`
- [x] 复制官方 `trailing-node-extension`
- [x] 复制官方 `mathematics-extension`（对接现有 KaTeX）
- [x] 复制官方 `unique-id-extension`

---

### 阶段 2：删除旧自定义代码

在阶段 1 的官方组件确认可用后，逐步删除对应的旧实现：

#### 2.1 删除旧 DOM 控制器
当前 `tiptap-runtime.js` 中通过依赖注入创建了大量控制器，这些已被官方 React 组件替代：

- [x] 删除 `block-handle-controller`（替代：官方 `drag-context-menu`）
- [x] 删除 `block-action-menu-controller`（替代：官方 `drag-context-menu` 内置）
- [x] 删除 `format-toolbar-controller`（替代：官方 `BubbleMenu` + toolbar 组件）
- [x] 删除 `slash-menu-controller`（替代：官方 `slash-dropdown-menu`）
- [x] 删除 `link-editor-controller`（替代：官方 `link-popover`）
- [x] 删除 `table-toolbar-controller`（替代：官方 `table-node` 内置菜单）

#### 2.2 删除自定义 React 视图（被官方组件替代）
- [x] 删除 `tiptap-react/slash-menu-view.jsx`
- [x] 删除 `tiptap-react/block-action-menu-view.jsx`
- [x] 删除 `tiptap-react/block-handle-view.jsx`
- [x] 删除 `tiptap-react/format-toolbar-view.jsx`
- [x] 删除 `tiptap-react/link-editor-view.jsx`
- [x] 删除 `tiptap-react/components/block-action-menu.jsx`
- [x] 删除 `tiptap-react/components/block-handle.jsx`
- [x] 删除 `tiptap-react/components/format-toolbar.jsx`
- [x] 删除 `tiptap-react/components/link-editor.jsx`
- [x] 删除 `tiptap-react/commands/block-action-menu-model.js`（功能合入 drag-context-menu）

#### 2.3 删除自定义样式文件
- [x] 审计所有 `.scss` 文件，删除与官方组件重复的自定义样式
- [x] 保留仅与 Papyro 特有功能相关的样式（Mermaid、KaTeX 等）

#### 2.4 删除过时文档
- [x] 删除 `docs/tiptap-enterprise-editor-todo.md`（被本文档替代）
- [x] 删除 `docs/zh-CN/tiptap-enterprise-editor-todo.md`
- [x] 审查其他 docs 文件，删除不再适用的内容

---

### 阶段 3：核心运行时重构

#### 3.1 简化 editor-runtime
- [x] 将 `tiptap-runtime.js` 重写为 `editor-runtime.ts`
- [x] 移除所有控制器工厂注入，改为 React 组件自行管理状态
- [x] 保留核心职责：Editor 实例创建、Rust 协议桥接、Markdown 同步
- [x] 运行时只负责：创建 Editor → 挂载 React 树 → 转发 Rust 命令/事件

#### 3.2 简化 editor-entry
- [x] 将 `editor-tiptap-entry.js` 重写为 `editor-entry.ts`
- [x] 移除所有视图工厂注册（不再需要 DI 注入 React 视图）
- [x] 入口只做：创建 runtime → 安装到 `window.papyroEditor`

#### 3.3 React 岛重构
- [x] 保留 `island.jsx` → 迁移为 `island.tsx`
- [x] 保留 slot 架构（BeforeContent / EditorContent / AfterContent / OverlayLayer）
- [x] 保留 `runtime-context` → 迁移为 TS，简化接口
- [x] 保留 `mount-controller` → 迁移为 TS
- [x] 删除 `slots.tsx` 中不再使用的 slot 定义

---

### 阶段 4：Table 组件完善

当前 table-node 已部分集成，需要完善：

- [x] 确认官方 table-node 的所有交互已正确挂载：
  - 行/列 handle（hover 显示）
  - 单元格选择覆盖层
  - 行/列扩展按钮
  - 右键菜单（插入/删除行列、合并/拆分单元格）
  - 列宽调整
- [x] 移除 `tiptap-table-command-controller.js` 中的冗余桥接逻辑
- [x] 移除 `tiptap-table.js` 中被官方组件替代的代码
- [x] 确保表格 Markdown 序列化正确（GFM table 格式）
- [x] 2026-05-13 跟进：从 `markdown.css` 与 `tiptap-chrome-base.css` 移除旧 Papyro 表格 chrome；只在 `tiptap-chrome-table.css` 保留宿主适配，让官方 handle/menu SCSS 负责组件外观
- [x] 2026-05-13 跟进：将 `tiptap-react/official-table-node-layer.jsx` 迁移为 `official-table-node-layer.tsx`
- [x] 2026-05-13 跟进：通过 `tiptap-table-menu-content` 将表格下拉菜单的尺寸、层级和菜单项节奏限定在官方 table-node 菜单内，避免全局覆盖 slash/link/drag 菜单
- [x] 2026-05-13 审计跟进：弱化 Papyro 表格宿主覆盖，让官方 table-node 的 handle、扩展轨道和单元格操作点更接近 Notion-like 参考体验
- [x] 2026-05-13 审计跟进：让嵌套表格菜单（`ColorMenu`、`TableAlignMenu`）继续使用受限的表格菜单表面，同时不改动 slash/link/drag 菜单样式
- [x] 2026-05-13 审计跟进：移除 Papyro 专属的 handle、扩展按钮和单元格圆点视觉覆盖，让官方 table-node SCSS 接管 Notion-like 表格 chrome
- [x] 2026-05-13 审计跟进：不再把表格专属菜单 class 传给嵌套颜色/对齐子菜单，并将 Papyro 表格菜单 CSS 收敛到层级、视口边界和文本裁剪，让官方 menu/combobox 样式接管 Notion-like 表面
- [x] 2026-05-13 审计跟进：恢复官方 table wrapper 操作轨道 padding，并移除宿主 wrapper 的 margin reset，修复行列 handle、扩展控件和嵌套表格菜单相对 Notion-like 参考过于拥挤的问题
- [x] 2026-05-13 类型跟进：将官方 table-handle extension/plugin/helper、table-handle 状态 hook、表格工具函数和表格 action-button 模块对齐为类型化 TS/TSX 源码，同时保留 Papyro 在 `CellSelection` 后恢复光标以及表格菜单 scoped surface 的本地行为
- [x] 2026-05-13 类型跟进：通过 Papyro table 边界暴露 `TableKit`，并补齐 `image-node` 需要的官方 `@tiptap/extension-image@3.23.1` 对齐依赖

---

### 阶段 5：TypeScript 增量迁移

按模块优先级迁移，每次迁移一个模块：

#### 5.1 核心模块（优先）
- [x] `tiptap-runtime.js` → `editor-runtime.ts`
- [x] `editor-runtime.js` → `editor-runtime-contract.ts`
- [x] `editor-tiptap-entry.js` → `editor-entry.ts`
- [x] `tiptap-react/runtime-context.jsx` → `.tsx`
- [x] `tiptap-react/runtime-model.js` → `.ts`
- [x] `tiptap-react/island.jsx` → `.tsx`
- [x] `tiptap-react/mount-controller.jsx` → `.tsx`

#### 5.2 组件模块
- [x] 所有 `tiptap-ui/` 下的组件（官方源码本身就是 TSX）
- [x] 所有 `tiptap-ui-primitive/` 下的原语
- [x] 所有 `tiptap-node/` 下的节点组件
- [x] `hooks/` 下的所有 hooks

#### 5.3 工具和测试
- [x] `lib/` 下的工具函数
- [x] 测试文件迁移（保持 `node --test` 运行器）

#### 5.4 当前 TypeScript 债务审计（2026-05-13）
- [x] 审计剩余被跟踪的 JS/JSX 存量：`js/src/` 下有 44 个 `.js` 文件和 4 个 `.jsx` 文件
- [x] 删除已经由 TS/TSX 替代或不再被引用的旧 JS/JSX 文件：`components/input-group.js`、`components/tiptap-extension/node-alignment-extension.js`、`components/tiptap-extension/node-background-extension.js` 和 `tiptap-react-island.jsx`
- [x] 将 `editor-registry.js`、`editor-runtime-bootstrap.js` 和 `editor-runtime-selector.js` 转换为带类型的 `.ts` 模块
- [x] 将 `markdown-sync-controller.js` 转换为带类型的 `.ts` 模块
- [x] 将 `editor-host-runtime.js` 转换为带类型的 `.ts` 模块
- [x] 将 `editor-core.js` 转换为 `.ts` 源码模块，同时保持当前测试覆盖的行为表面不变
- [x] 将 `editor-clipboard.js` 转换为带类型的 `.ts` 模块
- [x] 将 `tiptap-ui-primitives.js` 转换为带类型的 `.ts` 模块
- [x] 将 `js/src/` 下最后一个被跟踪的 `.js` 文件迁移为 `.ts`，并保持 `js/src/` 下无被跟踪 `.js`/`.jsx` 源码文件
- [x] 将剩余 JS/JSX 迁移拆成三条线推进：核心运行时（`editor-*`、`markdown-sync-controller`）、Papyro 功能适配（`tiptap-math`、`tiptap-mermaid`、`tiptap-image`、`tiptap-callout` 等）、残留 React 支撑（`tiptap-react/*`）；当前核心运行时和 React 支撑线已收口
- [x] 在表格命令行为已有源码测试和 runtime 测试覆盖后，将 `tiptap-table-command-controller.js` 迁移为 `tiptap-table-command-controller.ts`
- [x] 在表格命令行为已有源码测试和 runtime 测试覆盖后，将 `tiptap-table.js` 迁移为 `tiptap-table.ts`
- [x] 将 `tiptap-table-commands.js` 迁移为 `tiptap-table-commands.ts`，让表格命令元数据和菜单模型暴露类型化边界
- [x] 迁移 `editor-core.js`
- [x] 将 React 支撑 helper 模块迁移为类型化边界：`code-block-command-model.ts`、`use-pointer-activation.ts`、`use-hover-intent-activation.ts` 和 `floating.ts`
- [x] 迁移 `js/src/tiptap-react/` 下剩余 React 支撑文件，包括 code-block node view、primitive wrappers、command icons、code-block node-view extension 和 package index
- [x] 将 `tiptap-format-snapshot.js` 迁移为 `tiptap-format-snapshot.ts`，让浮动工具栏状态读取进入类型化快照模型
- [x] 将 `tiptap-history-commands.js` 迁移为 `tiptap-history-commands.ts`，让撤销/重做命令路由进入类型化 controller 边界
- [x] 将 `tiptap-mode-controller.js` 和 `tiptap-mode-snapshots.js` 迁移为类型化 mode 边界模块，覆盖 Source/Hybrid/Preview 状态与选区恢复
- [x] 将 `tiptap-turn-into-commands.js` 迁移为 `tiptap-turn-into-commands.ts`，让浮动工具栏与拖拽菜单的块转换命令共享类型化边界
- [x] 将 `tiptap-preferences-controller.js` 迁移为 `tiptap-preferences-controller.ts`，让 Rust 偏好 payload 与运行时 entry 偏好状态共享类型化边界
- [x] 将 `tiptap-block-hints-controller.js` 迁移为 `tiptap-block-hints-controller.ts`，让 Rust 块提示 payload 与运行时 entry 提示状态共享类型化边界
- [x] 将 `tiptap-paste-controller.js` 迁移为 `tiptap-paste-controller.ts`，让自动链接粘贴行为与运行时粘贴处理共享类型化边界
- [x] 将 `tiptap-block-move.js` 迁移为 `tiptap-block-move.ts`，让拖拽上下文和块菜单的块移动共享类型化 ProseMirror transaction 边界
- [x] 将 `tiptap-format-commands.js` 迁移为 `tiptap-format-commands.ts`，让浮动格式工具栏命令模型暴露类型化边界
- [x] 将 `tiptap-text-style.js` 迁移为 `tiptap-text-style.ts`，让文字颜色、高亮和块级 mark helper 暴露类型化扩展边界
- [x] 将 `tiptap-task-list.js` 迁移为 `tiptap-task-list.ts`，让官方 task list 扩展配置和 checkbox 可访问性标签暴露类型化边界
- [x] 将 `tiptap-markdown-snippets.js` 迁移为 `tiptap-markdown-snippets.ts`，让 slash、drag、turn-into 和 callout 的 Markdown fallback 共享类型化片段 helper
- [x] 将 `tiptap-official-drag-handle.js` 迁移为 `tiptap-official-drag-handle.ts`，让官方 drag-context menu 配置和嵌套 handle 规则暴露类型化边界
- [x] 将 `tiptap-navigation.js` 迁移为 `tiptap-navigation.ts`，让 Source/Hybrid 行跳转、outline 同步和编辑器滚动定位暴露类型化运行时边界
- [x] 将 `tiptap-source-pane.js` 迁移为 `tiptap-source-pane.ts`，让 Source 模式 textarea 同步、保存快捷键和 Markdown 解析失败上报暴露类型化运行时边界
- [x] 将 `tiptap-i18n.js` 迁移为 `tiptap-i18n.ts`，让编辑器 chrome 标签、slash 命令、表格菜单和 Papyro 特有标签共享类型化本地化边界
- [x] 将 `tiptap-callout.js` 迁移为 `tiptap-callout.ts`，让 Markdown admonition 解析、渲染和 callout 命令暴露类型化 Papyro 功能边界
- [x] 将 `tiptap-math.js` 迁移为 `tiptap-math.ts`，让 inline/display math tokenization、KaTeX 渲染、NodeView 编辑和 `setInlineMath`/`setMathBlock` 命令路由暴露类型化 Papyro 功能边界
- [x] 将 `tiptap-mermaid.js` 迁移为 `tiptap-mermaid.ts`，让 fenced diagram tokenization、渲染、NodeView 编辑和 `setMermaidBlock` 命令路由暴露类型化 Papyro 功能边界
- [x] 将 `tiptap-image.js` 迁移为 `tiptap-image.ts`，让 Markdown 图片 tokenization、source sanitization、NodeView 预览和 `setImage` 命令路由暴露类型化 Papyro 功能边界
- [x] 将 `mermaid-renderer.js` 迁移为 `mermaid-renderer.ts`，让严格 Mermaid 渲染、超时处理、过期渲染保护和 Preview 重新渲染暴露类型化运行时边界
- [x] 将 `tiptap-runtime-smoke.js` 迁移为 `tiptap-runtime-smoke.ts`，让真实挂载 Tiptap 的 gate helper 暴露类型化 fake-DOM、facade 和 Markdown 往返边界
- [x] 将 `tiptap-slash-commands.js` 迁移为 `tiptap-slash-commands.ts`，让官方 slash menu 的 Papyro 命令适配器暴露类型化命令、查询、最近项和 Markdown fallback 边界
- [x] 将 `tiptap-block-actions.js` 迁移为 `tiptap-block-actions.ts`，让官方 drag context menu 的 Papyro 适配器暴露类型化块目标、编辑器 facade、子菜单和命令结果边界
- [x] 将 `tiptap-markdown.js` 迁移为 `tiptap-markdown.ts`，让 Markdown manager、扩展链、持久化归一化，以及 parse/serialize/round-trip helper 暴露类型化边界
- [x] 将 `tiptap-code-block.js` 迁移为 `tiptap-code-block.ts`，让 lowlight、DOM fallback NodeView chrome、React code-block NodeView 注入、语言菜单状态、复制/换行动作和 `setCodeBlockLanguage` 暴露类型化边界
- [x] 解决上一轮 image/table-node typecheck 阻塞：`@tiptap/extension-image` 已安装为对齐的 Tiptap 版本，官方 table-handle helper/extension/action 模块已具备类型化 TS/TSX 边界
- [x] 从 `js/src` 移除未使用的官方模板残留：AI/Improve、emoji、mention、TOC、textarea-autosize、协作 token helper、完整 Notion demo shell 文件和 AI 专用图标；将剩余通用 helper 边界重命名为 `tiptap-ui-utils`
- [x] 清理 `turn-into-dropdown` 和 `editor-clipboard.ts` 的集中 TS 阻塞：为本地化后的官方 dropdown 暴露共享块选项类型边界，避开 ES2020 target 下的 `String.prototype.at`，并同时兼容 DOM `FileReader` 与测试 reader 构造器
- [x] 将 `tiptap-ui-primitives.ts` 从当前 typecheck 阻塞列表中清出：补齐 DOM/fake-DOM listener 边界、floating dismiss 配置、hidden-state 选项、floating placement 选项和 command menu active descendant helper 的类型
- [x] 将 `tiptap-react/utils/floating.ts` 从当前 typecheck 阻塞列表中清出：补齐 React floating options 类型，先归一化编辑器锚点 rect 再定位，并用源码测试覆盖浮层定位与侧边面板翻转判断
- [x] 将 React mount/slot 边界从当前 typecheck 阻塞列表中清出：类型化 `tiptap-react/mount-controller.tsx` 和 `tiptap-react/slots.tsx`，保留官方 drag/table/menu slot 组合，并让源码测试 loader 支持与 editor bundle 一致的 alias、样式和目录入口解析
- [ ] 在现有 TS 模板债务完成类型化或隔离后，新增可通过的 `npm --prefix js run typecheck` 闸门
- [ ] 启用 typecheck 闸门前解决剩余阻塞：`editor-core.ts`、`editor-runtime.ts`、`editor-runtime-contract.ts`、`tiptap-react/runtime-model.ts`、`editor-runtime-protocol.ts`、`tiptap-react/runtime-context.tsx`、`editor-host-runtime.ts`、`tiptap-block-move.ts` 等全局 runtime/model 债务；runtime context/island 边界等当前组件/运行时支撑类型债务；以及 `tiptap-table.ts` 中 Papyro 自定义表格 action/Markdown 层的类型债务

---

### 阶段 6：样式统一

- [x] 建立统一的 design tokens（CSS 变量）对齐官方组件样式系统
- [x] 移除所有与官方组件重复的自定义 SCSS
- [x] 保留 Papyro 特有样式：Mermaid 图表、KaTeX 数学公式、源码模式
- [x] 确保暗色/亮色主题通过 CSS 变量切换（官方组件已支持）
- [x] 审计 `table-node.scss`、`table-handle-menu.scss` 等文件；保留上游官方 SCSS，将 Papyro 专属表格宿主覆盖移动到 `tiptap-chrome-table.css`

---

### 阶段 7：Papyro 特有功能适配

以下功能是 Papyro 独有的，不在官方模板中，需要保留并适配到新架构：

- [x] Markdown 源码模式（Source/Hybrid/Preview 三模式切换）
- [x] Rust 协议桥接（`window.papyroEditor` facade）
- [x] 本地图片粘贴（通过 Rust 端处理文件保存）
- [x] Mermaid 图表渲染
- [x] KaTeX 数学公式渲染
- [x] 大纲/TOC 生成（通过 Rust 端消费）
- [x] i18n 多语言支持
- [x] 多标签页编辑器实例管理（editorRegistry）
- [x] 加固 desktop/macOS 运行时资源：普通桌面启动继续使用轻量 `/assets/editor.js` 外链脚本，macOS 打包场景保留生成后 editor runtime 的内联 fallback；品牌 logo 改为内嵌 PNG data URL，同时继续把 editor runtime、logo、favicon 和 CSS bytes 镜像到 Dioxus native asset roots，包括 macOS `.app/Contents/Resources/assets`

---

### 阶段 8：测试和验证

- [x] 更新 `tiptap-runtime-smoke.ts` 适配新架构
- [x] 更新所有现有测试文件适配新模块路径
- [x] 为每个官方组件接入添加 Markdown 序列化往返测试
- [x] 验证 `scripts/check-editor-markdown-gate.js` 通过
- [x] 在桌面 WebView 中端到端验证所有交互

---

### 阶段 9：编辑器 Chrome 与 UX 收敛

编辑区域优先对齐官方 Notion-like 模板体验；Papyro shell 控制保留在富文本格式化流程之外。

#### 9.1 格式化入口收敛

- [x] 移除顶部旧 Rust/Dioxus Markdown 插入工具栏
- [x] 顶栏只保留应用级控制：标签页、侧边栏开关、主题切换、设置、窗口控制和大纲开关
- [x] 使用官方 Tiptap 浮动工具栏、slash menu、drag context menu 和 table menus 作为格式化入口
- [x] 确认没有活跃 React 组件依赖后，删除或隔离旧 `mn-tiptap-format-toolbar`、旧 block handle、旧 block action menu CSS
- [x] 对照官方 Notion-like 工具栏组合审查 `PapyroToolbarFloating`，删除仍在重复官方 toolbar 组件的 Papyro 专属命令模型
- [x] 将活跃浮动工具栏替换为官方 Notion-like 组合：turn-into、marks、图片浮动控制、链接/文字颜色，以及把上标/下标、对齐、缩进收纳到 More 弹层；在真实本地或 Pro AI 工作流落地前排除 AI/Improve

#### 9.2 文档画布与排版收敛

- [ ] 对照官方 `.notion-like-editor-layout` 审计 Papyro 编辑画布宽度、左右操作轨道、底部留白和窄窗口表现，确保 Source/Hybrid/Preview 不出现布局跳变
- [ ] 统一 Markdown typography token：标题、段落、列表、blockquote、inline code、code block、table、Mermaid、KaTeX 在 Hybrid 和 Preview 中共享同一阅读节奏
- [ ] 审计中英文混排、长 URL、长代码行、宽表格和图片节点的 overflow 行为，禁止关键操作被裁剪到不可达
- [ ] 保留 app shell 的 disciplined utility 风格，不把编辑器画布包装成大卡片或营销页式 section
- [x] 2026-05-15 跟进：将正文阅读列收敛到接近官方 Notion-like 模板的 708px 内容宽度，并建立 `--mn-document-content-width` / `--mn-document-wide-width` 画布契约；Source、Hybrid、Preview、错误 fallback 共享同一正文 rail，代码块、表格、Mermaid/KaTeX 等宽内容通过自身容器滚动，不再把整个文档正文拉成宽工作台
- [x] 2026-05-15 跟进：为三模式画布宽度、Preview 横向溢出、代码块宽度、表格滚动和 Source/fallback 宽度一致性补 Markdown style smoke 防回归

#### 9.3 浮层与菜单系统收敛

- [ ] 对照官方 `menu`、`popover`、`dropdown-menu`、`combobox` SCSS，审计 slash menu、drag context menu、link popover、color popover、table menu 是否共享一致的背景、边框、阴影、圆角、item density 和 active/focus 状态
- [ ] 修复所有浮层透明、层级错乱、被裁剪、锚点漂移和关闭后焦点丢失的问题
- [ ] 建立菜单层级规则：编辑器上下文浮层高于文档内容，低于 app modal；嵌套 table color/alignment menu 不应覆盖或污染 slash/link/drag 菜单
- [ ] 为菜单 keyboard path 补源码测试或 smoke 记录：打开、方向键移动、Enter 执行、Escape 关闭、焦点返还
- [x] 2026-05-15 跟进：将表格菜单根浮层限定为定位/层级容器，保持 `overflow: visible` 以允许嵌套颜色/对齐 flyout 正常展开；直接子 `ComboboxList` 承担不透明背景、边框、阴影、滚动和视口宽度约束，避免透明菜单、双层面板或嵌套菜单被裁剪
- [x] 2026-05-15 跟进：建立编辑器上下文浮层 surface 契约，统一 slash menu、drag context menu、link/color popover、floating toolbar、table menu 和 code language menu 的不透明背景、边框、阴影、层级、视口宽高、文本裁剪和 focus-visible 兜底；静态 `tiptap-chrome-command.css` 与运行时最终加载的 `papyro-menu-surface.scss` 双层守护，避免官方 SCSS 注入顺序导致 WebView 内菜单再次透明或错位
- [x] 2026-05-15 跟进：为浮层 token 桥接、菜单 z-index/viewport、generic combobox panel、card/toolbar opaque surface、按钮文本裁剪和焦点环补 Markdown style smoke 防回归

#### 9.4 表格体验收敛

- [ ] 对照官方 table-node 模板重新审计表格 hover、row/column handle、cell handle、extend button、selection overlay、resize handle、cell menu 和 nested menu 的完整路径
- [ ] 修复列宽 hover/resize 导致单元格多出空行、额外 paragraph 或行高被撑大的问题；优先检查 ProseMirror table cell 默认内容、CSS `min-height`、resize handle DOM 和 wrapper padding 的相互作用
- [ ] 修复 cell handle menu 的背景、层级、布局和 item density，确保其是官方 menu 表面，而不是透明或错乱的宿主浮层
- [ ] 限制 Papyro 表格 CSS 的职责：host wrapper、overflow、theme token、Markdown table baseline；禁止重绘官方 handle、button、menu item 和 overlay
- [ ] 验证表格交互后 Markdown 仍输出稳定 GFM table，复杂表格在不支持 GFM 表达的能力上必须有明确降级策略
- [x] 2026-05-15 跟进：将表格单元格内容选择器限定为 `:not(.column-resize-handle)`，并在宿主 CSS 中锁定 resize handle 为绝对定位、零内容高度，避免 hover/resize chrome 参与单元格正文布局导致行高被撑开
- [x] 2026-05-15 跟进：为 `tiptap-table-menu-content` 增加官方 card/menu token 的不透明表面兜底，并把 resize handle 出流约束与 table menu 背景写入 Markdown style smoke 防回归
- [x] 2026-05-15 跟进：收敛 `tiptap-table-menu-content` 的职责边界，根菜单不再绘制表面，直接面板使用官方 combobox/card token 与统一按钮节奏，并把直接面板、嵌套 flyout、按钮对齐和文本裁剪写入 Markdown style smoke 防回归
- [x] 2026-05-15 跟进：移除宿主 CSS 对所有表格单元格正文的 `min-height` 强制值，只保留官方 resize handle 的出流、零文本度量和 layout/paint 隔离；同时让 table menu 直接面板具备 `overflow-y: auto` 与稳定 scrollbar gutter，避免菜单长内容挤压或透明穿透
- [x] 2026-05-15 跟进：扩展 desktop Tiptap WebView smoke 为真实表格交互验收：点击单元格、移动到列边缘触发 ProseMirror `columnResizing` 句柄、断言 hover 前后单元格高度/正文子节点/文本稳定，并打开 `TableCellHandleMenu` 断言不透明 bounded surface、按钮对齐、文本裁剪和滚动行为

#### 9.5 官方组件差异审计

- [x] 建立官方模板差异清单：逐项记录 `PapyroToolbarFloating`、`SlashDropdownMenu`、`DragContextMenu`、`TableHandleMenu`、`TableCellHandleMenu`、`ImageNodeFloating` 与 `.reference/notion-like-editor` 的源码差异和原因
- [x] 每迁移或调整一个官方组件后，对照官方 Notion-like 模板审计剩余顶层编辑器布局、组件状态和 CSS override
- [x] 对所有保留的 Papyro 适配加注释或文档说明：Markdown 持久化、Rust 协议、i18n、本地资源或 WebView 焦点保护；无法说明的适配应删除
- [x] 2026-05-15 跟进：新增 `js/test/tiptap-official-component-diff-source.test.ts`，用源码守护测试固定“官方模板主体 + Papyro 必要适配”的边界，避免后续误加官方 AI/Cloud/协作依赖，或误删 WebView 焦点保护、i18n、本地资源和 Markdown 持久化适配

官方组件差异清单：

| 组件 | 与 `.reference/notion-like-editor` 的差异 | 保留原因 | 后续策略 |
|------|------------------------------------------|----------|----------|
| `PapyroToolbarFloating` | 由官方 `NotionToolbarFloating` 重命名；移除 `ImproveDropdown`；保留 turn-into、marks、image floating、link/color、More options；More 弹层增加本地化 label、`transaction` 监听和鼠标/指针按下时的选区保护 | Papyro 暂无真实本地/Pro AI 工作流；桌面 WebView 点击按钮时容易让 ProseMirror 选区丢失；More 文案需要跟随运行时语言 | 继续对齐官方组合；只有 AI 工作流、协作评论或本地审核能力真正落地后，才恢复对应入口 |
| `SlashDropdownMenu` | 保留官方 suggestion menu/card 结构；删除 AI、mention、emoji、TOC 项；table 使用 `keywords`；active item 滚动使用浏览器原生 `scrollIntoView({ block: "nearest" })` | 当前编辑器以本地 Markdown 为持久化源，无用户系统、emoji picker、TOC node UI 或在线 AI 依赖；命令列表必须只暴露能序列化/能执行的能力 | 如接入用户系统、emoji 数据源或本地 AI，再按官方模板恢复对应项并补 Markdown/协议验收 |
| `DragContextMenu` | 保留官方 drag handle、menu、transform、color、table align/fit、copy/duplicate/delete 和 slash trigger；删除 AI ask、copy anchor link、image download、TOC title；`setLockDragHandle` 做可选命令保护；节点名从当前 selection parent 派生 | Papyro 未启用 Cloud/AI/TOC node/anchor link 发布流；桌面 runtime 中命令扩展可能按模式裁剪，必须防止可选命令缺失导致菜单崩溃 | 保持块级菜单精简；新增能力必须先证明本地协议、Markdown 往返和 UI 验收完整 |
| `TableHandleMenu` | 源码主体保持官方 paid table-node 菜单；只在 `MenuContent` 加 `tiptap-table-menu-content` 类，用宿主 CSS 限定视口、滚动和 opaque surface | 官方菜单挂在 Papyro WebView/desktop shell 内时需要额外的层级、背景和视口兜底，避免透明或被裁剪 | 不重绘官方 handle/menu item；Papyro CSS 只允许做 surface/viewport/token 桥接 |
| `TableCellHandleMenu` | 与 `TableHandleMenu` 相同，只保留 `tiptap-table-menu-content` surface 适配；cell action、ColorMenu、TableAlignMenu 仍来自官方 table-node 路径 | 修复 cell menu 透明、布局错乱和长菜单滚动问题，同时不破坏官方 table-node 状态机 | 表格后续视觉问题优先回查官方 SCSS 和宿主覆盖，不再新增旧 Papyro fallback 菜单 |
| `ImageNodeFloating` | `image-node` 目录与官方模板保持同构：align、caption、download、replace、delete 仍在官方浮动工具栏内；本地图片协议不写入 node UI | 图片文件保存、logo/磁盘资源识别属于 Rust/资源协议层，不应污染官方 image node 组件 | 只在本地资源 resolver 和 Markdown 图片序列化层处理 Papyro 特例，node UI 继续跟随官方 |

#### 9.6 视觉回归与发布验收

- [x] 扩展 `docs/zh-CN/tiptap-release-smoke.md` 的编辑器 UI 场景，覆盖 table handles、cell menu、floating toolbar、slash menu、drag handle、link/color popover 和 image controls
- [x] 为 slash menu、floating toolbar、link/color popover、drag context menu、table resize/cell menu 和 image controls 补 desktop WebView smoke 覆盖；截图级视觉回归仍留给后续 CI/browser 基础设施任务
- [x] UI 任务汇报必须包含：检查过的视图、键盘路径、暗色/高对比结果、窄窗口结果、自动化检查和已知 follow-up
- [ ] 发布前运行 `node scripts/check-editor-markdown-gate.js`，并根据改动范围补充 `node scripts/check-tiptap-theme-bridge.js`、`node scripts/check-ui-contrast.js`、`node scripts/check-ui-a11y.js`
- [x] 2026-05-15 跟进：让 `node scripts/check-tiptap-release-smoke.js` 守护中英文 release checklist 必须保留编辑器 UI surface 视觉验收章节，确保 table handles、cell menu、floating toolbar、slash menu、drag handle、link/color popover、image controls、窄窗口和暗色/高对比检查不会从发布门禁里消失
- [x] 2026-05-15 跟进：扩展 `node scripts/check-desktop-tiptap-webview-smoke.js`，在真实 desktop WebView 中验证 slash menu、floating toolbar、link popover、color popover、drag context menu、table cell menu 和 image floating controls 的不透明 bounded surface 与可用控件

---

## 需要接入的官方 UI Components 完整清单

### UI 组件（功能级）

| 组件名 | 用途 | 许可 | 优先级 |
|--------|------|------|--------|
| `slash-dropdown-menu` | `/` 命令面板 | Start | P0 |
| `drag-context-menu` | 拖拽手柄 + 块操作菜单 | Start | P0 |
| `link-popover` | 链接创建/编辑弹层 | MIT | P0 |
| `mark-button` | 行内格式按钮 | MIT | P0 |
| `heading-dropdown-menu` | 标题级别下拉 | MIT | P1 |
| `list-dropdown-menu` | 列表类型下拉 | MIT | P1 |
| `color-highlight-popover` | 高亮颜色选择 | MIT | P1 |
| `text-align-button` | 文本对齐 | MIT | P1 |
| `turn-into-dropdown` | 块类型转换 | Start | P1 |
| `undo-redo-button` | 撤销/重做 | MIT | P1 |
| `blockquote-button` | 引用块按钮 | MIT | P2 |
| `code-block-button` | 代码块按钮 | MIT | P2 |
| `image-upload-button` | 图片上传按钮 | MIT | P2 |
| `color-text-popover` | 文字颜色选择 | MIT | P2 |
| `copy-to-clipboard-button` | 复制到剪贴板 | MIT | P3 |
| `delete-node-button` | 删除节点 | MIT | P3 |
| `duplicate-button` | 复制节点 | MIT | P3 |
| `move-node-button` | 移动节点 | MIT | P3 |
| `reset-all-formatting-button` | 重置格式 | MIT | P3 |

### Node 组件（编辑器内渲染）

| 组件名 | 用途 | 许可 | 优先级 |
|--------|------|------|--------|
| `paragraph-node` | 段落样式 | MIT | P0 |
| `heading-node` | 标题样式 | MIT | P0 |
| `code-block-node` | 代码块（含语言选择） | MIT | P0 |
| `list-node` | 列表样式 | MIT | P1 |
| `blockquote-node` | 引用块样式 | MIT | P1 |
| `horizontal-rule-node` | 分割线样式 | MIT | P1 |
| `image-node` | 图片展示 | MIT | P1 |
| `table-node` | 表格（已集成） | Start | P1 |

### UI 原语（底层构建块）

| 组件名 | 用途 | 许可 |
|--------|------|------|
| `button` | 通用按钮 | MIT |
| `dropdown-menu` | 下拉菜单 | MIT |
| `popover` | 弹出层 | MIT |
| `toolbar` | 工具栏容器 | MIT |
| `separator` | 分隔符 | MIT |
| `spacer` | 间距 | MIT |
| `tooltip` | 提示 | MIT |

### 工具组件

| 组件名 | 用途 | 许可 |
|--------|------|------|
| `floating-element` | 浮动定位 | MIT |
| `suggestion-menu` | 建议菜单基础 | MIT |

---

## 不接入的组件（明确排除）

| 组件名 | 排除原因 |
|--------|---------|
| `ai-menu` / `ai-ask-button` | 需要在线 AI 服务，本地编辑器不适用 |
| `improve-dropdown` | AI 功能，同上 |
| `emoji-dropdown-menu` | 本地 Markdown 编辑器暂不需要 |
| `mention-dropdown-menu` | 需要用户系统，本地编辑器不适用 |
| `toc-node` | Papyro 通过 Rust 侧消费大纲/TOC，不应在编辑器内保留未挂载的官方 TOC node UI |
| `textarea-autosize` | 只被已移除的 AI/Improve 流程依赖 |
| `collaboration` / `collab-context` | 需要 Tiptap Cloud，本地编辑器不适用 |
| `image-node-pro` | 评估后决定，基础 `image-node` 可能已足够 |

---

## 执行原则

1. **CLI-first**：以 `npx @tiptap/cli@latest init notion-like-editor` 生成的模板为权威参考源，所有组件实现以官方生成代码为准，不自行发明
2. **直接复制 + 裁剪**：从生成的模板中直接复制官方 TSX 源码到项目，仅做必要适配（移除 AI/协作依赖、对接 Papyro Rust 协议、本地图片处理）
3. **每个官方组件独立一个 commit**，包含：源码引入、适配修改、旧代码删除、测试验证
4. **先建后删**：先接入官方组件确认可用，再删除对应的旧自定义实现，避免功能断档
5. **Markdown 序列化优先**：每接入一个组件，必须验证其内容在 Markdown 往返中不丢失
6. **渐进式 TS 迁移**：官方组件本身就是 TSX，直接保持；旧代码随重构逐步转换
7. **不引入在线依赖**：排除所有需要 Tiptap Cloud / AI 服务的组件

## 预估工作量

| 阶段 | 预估时间 | 说明 |
|------|---------|------|
| 阶段 0 | 1-2 天 | CLI 生成模板 + TS 配置 + 目录重组 |
| 阶段 1 | 5-7 天 | 从模板复制官方组件并适配（最大工作量） |
| 阶段 2 | 2-3 天 | 删除旧自定义代码（需逐个验证不破坏功能） |
| 阶段 3 | 2-3 天 | 运行时重构 |
| 阶段 4 | 1-2 天 | Table 完善 |
| 阶段 5 | 3-4 天 | TS 迁移剩余文件 |
| 阶段 6 | 1-2 天 | 样式统一 |
| 阶段 7 | 2-3 天 | Papyro 特有功能适配 |
| 阶段 8 | 1-2 天 | 测试验证 |

总计约 **18-28 个工作日**。
