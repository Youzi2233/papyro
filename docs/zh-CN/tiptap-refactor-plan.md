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
| 语言 | 混合 TypeScript，且截至 2026-05-13 task list 迁移后，`js/src/` 下仍有 15 个被跟踪的 `.js` 文件且不再有被跟踪的 `.jsx` 文件 | TypeScript (.ts/.tsx) |
| 构建 | esbuild (原生支持 TS，无需改动) | esbuild + tsconfig |
| UI 框架 | React 18.3 (已满足) | React 18.3 (不变) |
| Tiptap | 3.23.1 (已对齐) | 3.23.1+ (保持同版本) |
| 组件来源 | 大量自定义 DOM 控制器 + 部分 React | 官方 UI Components 源码 + 少量适配 |
| 样式 | 自定义 SCSS 散落各处 | 官方组件自带样式 + 统一 design tokens |

结论：React 已满足，TypeScript 可增量迁移（esbuild 原生支持），无阻塞项。

## 当前专家审计（2026-05-13）

编辑器方向已经回到官方组件体系，但还没有达到官方 Notion-like 模板的体验标准。

- 表格架构：`PapyroOfficialTableNodeLayer` 已经把官方 `TableHandle`、`TableSelectionOverlay`、`TableCellHandleMenu`、`TableExtendRowColumnButtons` 挂在 `EditorContent` 外部，符合官方 table-node 集成契约。最新表格跟进已经移除宿主 chrome 漂移：Papyro CSS 不再重绘官方 handle、扩展按钮和单元格操作点；表格专属菜单 CSS 只限制顶层行/列/单元格菜单的层级、视口边界和文本裁剪，嵌套颜色/对齐子菜单回到官方 menu 表面。
- 表格 UX 目标：官方 table-node SCSS 负责组件外观，Papyro CSS 只做宿主布局、视口安全、主题 token 桥接和 Markdown 持久化约束。行列 handle 应该是接近 Notion-like 的轻量暗示，而不是常驻的开发者工具条控件。
- JavaScript 存量：task list 迁移后，`js/src/` 下仍有 15 个被跟踪的 `.js` 文件且不再有被跟踪的 `.jsx` 文件。它们是源码，不是生成物。剩余文件主要是需要行为覆盖后类型化的 Papyro 特有 Markdown/媒体适配，以及仍暴露旧 JS 边界的编辑器交互 helper；当官方 TS/TSX 组件完全接管对应行为时应直接删除。
- 格式化入口：顶部 shell 工具栏只保留应用级控制。富文本格式化入口应全部来自官方 Tiptap React 表面：`PapyroToolbarFloating`、slash menu、drag context menu、link popover 和 table-node menus。当前活跃的 `PapyroToolbarFloating` 仍与官方 Notion-like 工具栏组合有偏差：文本对齐、撤销/重做和高亮控件常驻展示；它应收敛为官方模板组合，仅移除 AI/Cloud 等 Papyro 暂未实现的能力。
- 验证标准：每个 UI 收敛步骤都要跑源码测试、构建和 editor Markdown gate；视觉改动在有可用 app target 时优先做 desktop WebView/manual smoke 或截图验证。

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
- [x] 创建 `js/tsconfig.json`，配置 `allowJs: true`、路径别名 `@` → `src/`
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
- [x] `tiptap-utils`（裁剪掉 AI/协作相关工具函数）

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
- [ ] 将 `js/src/` 下剩余 15 个 `.js` 文件迁移为 `.ts`/`.tsx`，并保持无被跟踪 `.jsx` 文件；若官方 TS/TSX 组件已经接管对应行为，则直接删除旧文件
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
- [ ] 在现有 TS 模板债务完成类型化或隔离后，新增可通过的 `npm --prefix js run typecheck` 闸门
- [ ] 启用 typecheck 闸门前解决已知阻塞：缺失的官方 image extension 依赖/类型、`allowImportingTsExtensions` import path、table-handle 工具里的隐式 `any`、以及 runtime context 的类型边界

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

---

### 阶段 8：测试和验证

- [x] 更新 `tiptap-runtime-smoke.js` 适配新架构
- [x] 更新所有现有测试文件适配新模块路径
- [x] 为每个官方组件接入添加 Markdown 序列化往返测试
- [x] 验证 `scripts/check-editor-markdown-gate.js` 通过
- [x] 在桌面 WebView 中端到端验证所有交互

---

### 阶段 9：编辑器 Chrome 与 UX 收敛

编辑区域优先对齐官方 Notion-like 模板体验；Papyro shell 控制保留在富文本格式化流程之外。

- [x] 移除顶部旧 Rust/Dioxus Markdown 插入工具栏
- [x] 顶栏只保留应用级控制：标签页、侧边栏开关、主题切换、设置、窗口控制和大纲开关
- [x] 使用官方 Tiptap 浮动工具栏、slash menu、drag context menu 和 table menus 作为格式化入口
- [x] 确认没有活跃 React 组件依赖后，删除或隔离旧 `mn-tiptap-format-toolbar`、旧 block handle、旧 block action menu CSS
- [x] 对照官方 Notion-like 工具栏组合审查 `PapyroToolbarFloating`，删除仍在重复官方 toolbar 组件的 Papyro 专属命令模型
- [x] 将活跃浮动工具栏替换为官方 Notion-like 组合：turn-into、marks、图片浮动控制、链接/文字颜色，以及把上标/下标、对齐、缩进收纳到 More 弹层；在真实本地或 Pro AI 工作流落地前排除 AI/Improve
- [ ] 每迁移一个组件后，对照官方 Notion-like 模板审计剩余顶层编辑器布局
- [ ] 当 desktop WebView smoke 能在 CI 中稳定运行后，为 table handles、cell menu、floating toolbar、slash menu 和 drag handle 补视觉回归覆盖

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
