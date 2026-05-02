# UI 界面审计

[English](../ui-surface-audit.md) | [文档首页](README.md)

这份审计把 Phase 3.5 UI/UX 重构拆成逐界面的工作清单。它应和 [UI 信息架构](ui-information-architecture.md)、[UI 架构与组件盘点](ui-architecture.md)、[UI Token 审计](ui-token-audit.md) 一起阅读。

这份文档故意写得很实用：每一行都说明归属、当前代码、用户可见风险和下一步改造动作。

## 审计汇总

| 界面 | 当前代码 | 主要风险 | 下一步 |
| --- | --- | --- | --- |
| 桌面壳 | `crates/ui/src/layouts/desktop_layout.rs` | 布局能用，但还没有表达成可复用 app-shell primitive。 | 抽出 `AppShell`、`WorkspaceRail`、`MainColumn` 和 modal/tool-window layer contract。 |
| 侧边栏 | `components/sidebar/mod.rs`、`components/sidebar/file_tree.rs` | Workspace、文件树、空白区域和右键菜单状态仍然耦合在一个界面里。 | 建立 `WorkspaceRail`、`TreeItem` 和分场景菜单 pattern。 |
| 编辑器头部 | `components/editor/pane.rs` | Toolbar 区域经过 overflow 修补，但还不是稳定 primitive contract。 | 建立 `EditorToolbar` 和 `ToolbarZone`，固定右侧操作区规则。 |
| Tab bar | `components/editor/tabbar.rs`、`pane.rs` JS bridge | 溢出行为可用，但依赖一次性脚本和 CSS class。 | 把 overflow 规则沉淀为 `DocumentTabs` pattern，并补 smoke 覆盖。 |
| 大纲 | `components/editor/outline.rs` | 导航可用，但 active heading 和窄窗口行为仍然敏感。 | 把大纲当作文档导航 primitive，并增加 overlay fallback。 |
| 状态栏 | `components/status_bar.rs` | 有用但较轻；换行和状态优先级未完整定义。 | 转成带优先级和紧凑规则的 `StatusStrip`。 |
| 设置 | `components/settings/mod.rs` | 已改善，但产品内容和 dialog/form 布局职责仍混在一起。 | 建立 `SettingsWindow`、`SettingsNav`、`SettingsRow` 和稳定面板尺寸。 |
| 搜索 | `components/search.rs` | 结果行接近命令行，但不是共享 pattern。 | 使用共享 `ResultRow`、高亮、加载和错误 primitive。 |
| 快速打开 | `components/quick_open.rs` | 共用 command row class，但没有语义化可复用行。 | 切到带文档元信息槽位的 `ResultRow`。 |
| 命令面板 | `components/command_palette.rs` | action model 较好，但行样式和分组应该可复用。 | 拆分命令数据和 `CommandRow` 渲染 pattern。 |
| 回收站 | `components/trash.rs` | 使用 command-modal 样式承载破坏性管理界面。 | 使用 `DialogSection`、`ResultRow` 和 destructive footer 规则。 |
| 恢复 | `components/recovery.rs` | 密集行和对比面板依赖临时 inline layout。 | 使用 `RecoveryListRow`、`ComparePanel` 和冲突/错误状态 primitive。 |
| 空/加载/错误态 | 分散在多个界面 | `InlineAlert` 已覆盖预览提示和命令/搜索空态，但较大的阻断失败仍需要结构化。 | 增加 `Skeleton`、`ErrorState` 和 `EmptyState` 变体。 |

## 界面发现

### 桌面壳

可用点：

- `DesktopLayout` 保持核心壳简单：侧边栏、主编辑列、状态栏和 modal layer。
- 全局快捷键集中在 desktop layout。
- 设置在有 launcher 时已经可以作为独立窗口打开。

差距：

- `.mn-shell`、`.mn-workbench`、`.mn-main-column` 仍是 CSS 约定，不是命名 Dioxus 布局 primitive。
- Modal 和未来 tool-window 行为还没有作为独立层记录。
- 窄窗口行为依赖各界面零散修补。

改造决策：

- 下一轮大范围 CSS 前，先创建 shell primitives。
- 主编辑列必须拥有状态栏和编辑器 toolbar。
- Modal/tool-window layering 只定义一次，并复用于设置、回收站、恢复、搜索、快速打开和命令面板。

### 侧边栏

可用点：

- 侧边栏已经说明当前目录、支持根目录选中，并能处理空白区域语义。
- 已有 resize min/max 规则。
- 品牌、搜索、workspace 根目录、新建流程、文件树、底部区域有视觉分组。
- 文件和文件夹行现在共享 `TreeItemButton`、`TreeItemEditRow` 和 `TreeItemLabel` 基础组件来承载图标和行状态 class。

差距：

- 根目录行、底部行还没有共享 `SidebarItem` pattern。
- 右键菜单存在，但菜单项语法仍是界面内定制。
- 文件树仍承载大量行为，后续视觉微调风险较高。

改造决策：

- 继续抽出 `TreeItem` pattern，补 current/focus variants、context-menu target 和行密度。
- 根目录、文件夹、文件、空白区域菜单必须刻意不同。
- 侧边栏动作保持 workspace 导航范围。全局动作放命令面板或编辑器 chrome。

### 编辑器头部和 Tab Bar

可用点：

- 编辑器 chrome 已有左侧 tab 区和右侧工具区。
- Tab 横向滚动已经存在，规避了最明显的 overflow 回归。
- 视图模式和大纲控制靠近文档。

差距：

- Tab overflow 依赖 `TABBAR_WHEEL_BRIDGE_SCRIPT` 和 class toggle，而不是可复用 toolbar contract。
- 没有命名 primitive 表达固定/弹性 toolbar zone。
- 关闭符号、dirty 标记和滚动按钮需要更成熟的视觉语法。

改造决策：

- 引入 `EditorToolbar`、`ToolbarZone`、`DocumentTabs` pattern。
- 右侧控件固定且优先级最高；左侧 tabs 内部滚动。
- 增加多 tab、长文件名、窄窗口、dirty tab、conflict tab、键盘关闭的手工 smoke case。

### 文档区域

可用点：

- Source、Hybrid、Preview 已是明确产品模式。
- Preview 和 Hybrid 已共享更多 Markdown 渲染行为。
- 大文档策略能关闭昂贵 preview 功能。

差距：

- Hybrid selection 和 cursor 行为仍需要架构级处理，才可能达到企业级体验。
- Preview policy 消息使用 inline 字符串，而不是共享状态/alert primitive。
- CodeMirror runtime 样式和 app CSS 仍需要严格 token 对齐。

改造决策：

- 把 Hybrid hit testing、selection、源码显隐视为编辑器架构工作，不当作 CSS 美化。
- 等行为足够稳定并可测试后，再继续建立 Markdown 视觉 token。
- Preview policy 和错误消息使用 `InlineAlert`。

### 大纲

可用点：

- 大纲提取有缓存。
- 大纲条目可以在 Source、Hybrid、Preview 中跳转。
- active section 通过 runtime script 同步。

差距：

- 点击后 active heading 和滚动同步容易回归。
- 窄窗口行为应变成 overlay/popover pattern。
- 宽度和文字截断应该按文档导航设计，而不是按侧边装饰设计。

改造决策：

- 将大纲提升为文档导航组件。
- 验收点覆盖点击目标、立即 active、滚动同步、键盘导航和窄窗口 fallback。

### 状态栏

可用点：

- 能展示临时状态文本、字数和保存状态。
- 最近布局调整后，它位于编辑器列下方。
- footer 布局现在使用共享 `StatusStrip` 基础组件，左侧承载消息，右侧承载文档元信息。

差距：

- 状态优先级是隐式的。
- 长中英文文案仍可能挤压窄窗口。
- 状态 tone 目前只有 default、saving、attention。

改造决策：

- 继续完善 `StatusStrip`：紧凑换行和优先级排序。
- 只有映射到真实产品状态时，才增加 error、warning、success、neutral 等 tone。

### 设置

可用点：

- 设置分为通用设置和关于 Papyro。
- 已从可见 UI 中移除全局/工作区保存目标造成的理解成本。
- 语言和主题属于全局设置，可不重启更新。
- 当前界面已组合共享的 `SettingsNav`、`SettingsPanel`、`DialogSection` 和 `SettingsRow` 基础组件，不再由业务模块本地拥有全部布局 wrapper。

差距：

- 标签管理行和未来 helper/error 文案还需要可复用 row 契约。
- 部分控件使用早期 `Dropdown` primitive，仍带一点原生 select 感。
- 未来独立窗口需要启动、图标、主题、国际化和无白屏规则。

改造决策：

- 设置页作为第一个受控 UI 改造界面。
- 继续推进 `SettingsWindow`、`SettingsNav`、`SettingsPanel`、`SettingsRow` pattern。
- 面板尺寸稳定，内容区内部滚动。

### 搜索、快速打开和命令面板

可用点：

- 三者都是 query-first modal 交互。
- 已支持键盘导航。
- 命令面板 action model 比较清晰。

差距：

- 结果行已经共享可复用 `ResultRow` 行壳，但分组、图标、快捷键、加载和错误态仍需要一套交互语法。
- 空、加载、错误态不一致。
- 分组、快捷键、元信息和高亮行为应该标准化。

改造决策：

- 建立一套 result-row 语法：
  - 图标槽位
  - 主标签
  - 副路径/详情
  - 元信息 badge
  - 可选高亮片段
  - 键盘当前行状态
- 搜索加载和错误使用 `InlineAlert` 或 `EmptyState`，不要只显示普通字符串。

### 回收站和恢复

可用点：

- 回收站支持恢复和清空。
- 恢复支持比较、恢复、丢弃。
- 恢复比较能展示磁盘和草稿状态。

差距：

- 回收站借用了 command-modal 布局，但它其实是数据安全界面。
- 恢复行和 compare panel 使用 inline layout 字符串。
- 破坏性动作需要更强的确认和视觉层级规则。

改造决策：

- 把回收站和恢复当作数据安全界面。
- 使用 `DialogSection`、`ResultRow`、`ComparePanel`、`InlineAlert` 和 destructive footer variant。
- 因为这些流程保护用户数据，必须有清晰空状态和错误态。

## 共享状态审计

| 状态 | 当前情况 | 需要的 primitive |
| --- | --- | --- |
| Empty | `EmptyState` 已存在，但很多 modal 仍使用自定义空文本。 | `EmptyState` 变体：compact、onboarding、error、data-safety。 |
| Loading | 搜索用文本表示加载，workspace scan 也没有统一表现。 | `Skeleton` 和 inline loading row。 |
| Error | Preview/search 已使用 `InlineAlert`；storage 和阻断失败仍需要更强处理。 | `ErrorState`。 |
| Focus | 部分按钮和自定义控件依赖 CSS，但没有记录 focus contract。 | primitive 级 focus-visible 状态。 |
| Disabled | 多处存在 disabled，但禁用原因不一致。 | Disabled state 加 helper copy，尤其是阻断用户前进时。 |
| Destructive | 已有 Danger button，但破坏性 dialog 还需要更强结构。 | Destructive footer 和确认 pattern。 |

## 改造顺序

1. **设置：** 运行时风险最低，同时覆盖表单、dialog shell、导航 rail、控件和状态绑定。
2. **Result rows：** 在共享 `ResultRow` 行壳基础上继续统一图标、快捷键、分组、加载和错误态。
3. **Tree rows：** 抽出侧边栏文件/文件夹/根目录行。
4. **编辑器 toolbar：** 把左右区域和 tab overflow 固化成可复用规则。
5. **状态和 alerts：** 统一保存、preview、搜索、恢复、storage 消息。
6. **回收站和恢复：** 应用数据安全 dialog pattern。
7. **大纲：** 把导航行为和窄窗口 fallback 固化成稳定组件。
8. **Markdown surface：** 等 Hybrid 行为回归覆盖更强后继续。

## QA 清单

每个被重做界面都必须通过：

- 浅色、暗色、高对比视觉检查。
- 1280px、960px、720px 宽度下的窄窗口检查。
- 键盘路径检查：打开、导航、激活、关闭、Escape。
- 所有交互控件的 focus-visible 检查。
- 空、加载、错误、禁用、选中、active、hover、破坏性状态。
- 长英文和长中文文案检查。
- 改 CSS 时同步 `assets/`、`apps/desktop/assets/`、`apps/mobile/assets/`。
- `node scripts/report-file-lines.js` 和 `git diff --check`。
