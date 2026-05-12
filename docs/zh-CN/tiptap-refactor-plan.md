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
| 语言 | JavaScript (.js/.jsx) 235 个文件 | TypeScript (.ts/.tsx) |
| 构建 | esbuild (原生支持 TS，无需改动) | esbuild + tsconfig |
| UI 框架 | React 18.3 (已满足) | React 18.3 (不变) |
| Tiptap | 3.23.1 (已对齐) | 3.23.1+ (保持同版本) |
| 组件来源 | 大量自定义 DOM 控制器 + 部分 React | 官方 UI Components 源码 + 少量适配 |
| 样式 | 自定义 SCSS 散落各处 | 官方组件自带样式 + 统一 design tokens |

结论：React 已满足，TypeScript 可增量迁移（esbuild 原生支持），无阻塞项。

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
- [ ] 移除 `tiptap-table.js` 中被官方组件替代的代码
- [x] 确保表格 Markdown 序列化正确（GFM table 格式）

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
- [ ] 所有 `tiptap-ui/` 下的组件（官方源码本身就是 TSX）
- [ ] 所有 `tiptap-ui-primitive/` 下的原语
- [ ] 所有 `tiptap-node/` 下的节点组件
- [ ] `hooks/` 下的所有 hooks

#### 5.3 工具和测试
- [ ] `lib/` 下的工具函数
- [ ] 测试文件迁移（保持 `node --test` 运行器）

---

### 阶段 6：样式统一

- [ ] 建立统一的 design tokens（CSS 变量）对齐官方组件样式系统
- [ ] 移除所有与官方组件重复的自定义 SCSS
- [ ] 保留 Papyro 特有样式：Mermaid 图表、KaTeX 数学公式、源码模式
- [ ] 确保暗色/亮色主题通过 CSS 变量切换（官方组件已支持）
- [ ] 审计并删除 `table-node.scss`、`table-handle-menu.scss` 等被官方样式替代的文件

---

### 阶段 7：Papyro 特有功能适配

以下功能是 Papyro 独有的，不在官方模板中，需要保留并适配到新架构：

- [ ] Markdown 源码模式（Source/Hybrid/Preview 三模式切换）
- [ ] Rust 协议桥接（`window.papyroEditor` facade）
- [ ] 本地图片粘贴（通过 Rust 端处理文件保存）
- [ ] Mermaid 图表渲染
- [ ] KaTeX 数学公式渲染
- [ ] 大纲/TOC 生成（通过 Rust 端消费）
- [ ] i18n 多语言支持
- [ ] 多标签页编辑器实例管理（editorRegistry）

---

### 阶段 8：测试和验证

- [ ] 更新 `tiptap-runtime-smoke.js` 适配新架构
- [ ] 更新所有现有测试文件适配新模块路径
- [ ] 为每个官方组件接入添加 Markdown 序列化往返测试
- [ ] 验证 `scripts/check-editor-markdown-gate.js` 通过
- [ ] 在桌面 WebView 中端到端验证所有交互

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
