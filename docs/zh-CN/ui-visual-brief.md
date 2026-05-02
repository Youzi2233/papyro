# Papyro UI 视觉 Brief

[English](../ui-visual-brief.md) | [文档首页](README.md)

这份 brief 定义 Phase 3.5 UI/UX 重构的视觉方向。修改 app chrome、基础组件、设置页、编辑器头部或 Markdown 界面前，应先参考它。

它基于 [UI/UX 对标与改版决策](ui-ux-benchmark.md) 和 [主题系统](theme-system.md)。

## 设计定位

Papyro 应该像一个精确的桌面写作工具：

- 足够安静，适合长时间写作。
- 足够结构化，能承载大型本地 workspace。
- 足够专业，适合工程和产品文档。
- 足够贴近桌面端使用习惯。
- 具备一点编辑排版感，让 Markdown 文档值得阅读。

视觉气质命名为 **disciplined utility**：安静、准确、带一点编辑感，不为了装饰而装饰。

避免：

- 在 app 内部使用营销页式构图。
- 大面积卡片、厚重阴影和泛滥渐变。
- 为了“丰富”而随手使用随机强调色。
- AI 味的填充文案，或解释显而易见控件的 UI 文本。
- 无法支撑暗色模式或窄窗口的一次性样式。

## 布局节奏

使用紧凑、可重复的结构。

| 层级 | 目标 |
| --- | --- |
| App shell | 稳定的双区域结构：导航 chrome 和写作 surface。 |
| 侧边栏 | 高密度、可扫描的 workspace navigator，selected 和 focus 状态清楚。 |
| 编辑器头部 | 固定操作区：tab overflow、文档状态、视图模式、大纲、更多操作。 |
| 文档画布 | 安静、可读，比当前局促感更开阔，但不是全窗口大段铺满。 |
| 弹窗/设置 | 固定 shell、一列表单、可预测的左侧导航，不随内容切换跳高。 |

间距规则：

- 基础间距遵循 4px grid。
- 主要控件高度：30-32px。
- 紧凑行高：28-30px。
- 文件树行高：桌面端 28px，触控/移动端 32px。
- 弹窗表单行纵向间距：14-18px。
- 页面或 panel padding：根据密度使用 16-24px。
- 避免 card 套 card。优先使用 section、分割线和清晰标题。

## 字体

字体应优先使用系统字体，并保证跨平台稳定。

| 角色 | 方向 |
| --- | --- |
| UI 字体 | 系统 UI 栈优先：Segoe UI、SF Pro、PingFang SC、Microsoft YaHei UI、system-ui。 |
| Markdown 正文 | 用户可配置，默认使用适合中英文混排的系统 sans。 |
| 阅读衬线 | 可作为长文阅读预设，但不作为 app chrome 默认。 |
| 代码字体 | Cascadia Code、JetBrains Mono、SF Mono、Consolas、monospace fallback。 |
| 展示文字 | 克制使用。App 内标题应该紧凑并服务功能。 |

规则：

- 不使用负 letter spacing。
- 不用 viewport width 缩放字号。
- App chrome 标签保持在 12-14px。
- Markdown 正文默认 16-17px，line-height 1.65-1.75。
- 中文内容需要足够 line-height，不能使用过窄、过挤的 UI 处理。

## 色彩角色

颜色用于解释状态和层级。

| 角色 | 用途 |
| --- | --- |
| Canvas | Markdown 写作区和 Preview surface。浅色模式通常为白色或近白色。 |
| Chrome | 侧边栏、顶部栏、状态栏、弹窗 shell、命令面板。和 canvas 保持轻微区分。 |
| Control | 按钮、输入框、select、segmented control、菜单。 |
| Border | 结构、分割、行间隔和 focus-visible fallback。 |
| Accent | 当前模式、当前文档、选中导航、主要动作。 |
| Selection | 文本选区和 Hybrid block 选区。CodeMirror 和原生 surface 必须一致。 |
| Status | danger、warning、success、saving、unsaved。不要用 accent 承担 warning。 |

规则：

- 优先使用语义 token，不直接写裸 hex。
- 裸色值应该只出现在 palette 定义里，不出现在组件 CSS。
- Accent 要克制，不能作为普通正文色。
- 暗色模式下 selected/focused 行必须清楚，但不能刺眼。
- 高对比模式在阴影消失时，也要保留 border、focus 和 selection。

## Surface 和层级

Papyro 使用克制层级。

| Surface | 处理方式 |
| --- | --- |
| App 背景 | 扁平、低对比。 |
| 侧边栏 | 轻微 tinted chrome surface，不用厚重阴影。 |
| 编辑器画布 | 干净、可读、尽量少装饰。 |
| 浮层菜单 | 小阴影加边框。 |
| 弹窗 | 清晰边框、适度阴影，尽量固定尺寸。 |
| Toast/message | 信息密度高、非阻塞；危险操作除外。 |

圆角：

- 控件：6-8px。
- 菜单和 popover：8px。
- Dialog：8px。
- Card 只用于重复 item 或真正需要 frame 的工具。
- 除 badge、紧凑 toggle 或明确圆形 affordance 外，避免大量 pill。

## 图标

图标应熟悉、语义清楚。

- 侧边栏、大纲、搜索、设置、主题、文件、文件夹、回收站、新建、重命名、显示位置、外部打开，都使用大众熟悉的符号。
- 标准图标能表达时，不使用自定义文字 glyph。
- Icon button 尺寸稳定，通常 28-32px。
- 危险、不常见或成本高的动作要图标加文字。
- 图标不能成为 selected 状态的唯一提示。

## 组件状态契约

每个可复用组件在大面积使用前都必须定义这些状态：

- default
- hover
- active/pressed
- selected/current
- disabled
- focus-visible
- loading，适用时
- destructive，适用时
- validation error，适用时
- compact density，适用时

优先补齐契约的组件：

- `Button`
- `IconButton`
- `Input` 和 `TextInput`
- `Select`
- `SegmentedControl`
- `Switch`
- `Dialog/Modal`
- `Popover`
- `DropdownMenu`
- `ContextMenu`
- `Tooltip`
- `Toast/Message`
- `Tabs`
- `SidebarItem`
- `TreeItem`
- `Toolbar`
- `EmptyState`
- `Skeleton`

## 写作界面

Markdown surface 必须先成熟，再谈更多视觉装饰。

规则：

- Preview 和 Hybrid 共用 Markdown 排版 token。
- 标题要建立阅读节奏，但不要造成巨大纵向跳动。
- 列表默认使用普通文本色，除非列表项本身是链接或状态。
- 代码块需要可读对比度、可见选区，以及准确的光标命中。
- Inline code 和链接不应在普通点击时意外触发源码显示。
- 表格边界要清楚，但不能像厚重表格软件。
- Mermaid 和公式错误态要可读、紧凑。
- 选区背景只覆盖字形区域，不覆盖随机行高空隙。

## 动效

动效服务功能：

- hover、focus、菜单、小状态变化可以使用快速过渡。
- 大纲跳转避免慢速 smooth scrolling；文档导航直接跳转更合适。
- 设置和编辑器 chrome 的高度变化不要做动画。
- 能检测 reduced-motion 时应尊重用户设置。

建议时长：

- Hover/focus：90-120ms。
- Menu/popover：120-160ms。
- Modal opacity：140-180ms。
- 桌面 app 内部不做大型装饰性入场动画。

## 文案语气

文案保持直接、专业。

- 优先使用动作动词：Open、Rename、Move to trash、Restore。
- 不解释已经显而易见的控件。
- 保存和恢复状态使用冷静的状态文案。
- 中文文案应是自然 UI 中文，不做英文直译。
- 所有语言中都保留 Papyro 作为产品名。

## 实现规则

- 新视觉工作从 token 开始，再到基础组件，最后到产品界面。
- 同一个 CSS 值出现三次，应考虑提成 token 或组件 class。
- 新增基础组件前先记录必要状态。
- 不在一个提交里重做多个界面，除非它们是机械耦合的。
- 大范围 UI 改动必须做窄窗口和暗色模式验证。
