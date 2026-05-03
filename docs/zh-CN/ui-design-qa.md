# UI 设计 QA 检查清单

[English](../ui-design-qa.md) | [文档首页](README.md)

这份清单把 Phase 3.5 的 UI 工作变成可重复评审的资产。截图不需要提交进仓库；可以放在 issue、PR 或本次 UI 任务的发布说明里。

## 什么时候使用

以下改动需要使用这份清单：

- 大范围修改 `assets/main.css`、`assets/styles/*.css` 或 app 镜像资源。
- 新增基础组件，或明显修改基础组件状态。
- 重做编辑器头部、侧边栏、大纲、设置、搜索、命令面板或弹窗。
- 声称提升专业度、响应式布局、暗色模式或可访问性的改动。

只有文案或小型 bug 修复可以只链接本文，并说明为什么不需要完整 QA。

## 必查视图

视觉任务前后都应截图或检查这些视图：

| 视图 | 宽度 / 状态 | 检查重点 |
| --- | --- | --- |
| 桌面 workspace | 1440 x 920，浅色主题 | 侧边栏、编辑器头部、tabs、大纲、状态栏和主写作区域是否平衡。 |
| 窄桌面窗口 | 900 x 640，浅色主题 | 侧边栏、tab 溢出、右侧工具区、大纲按钮和状态栏是否仍可达。 |
| 暗色主题 | 1440 x 920，暗色主题 | 文本、图标、边框、active 状态和破坏性操作是否可读。 |
| 高对比主题 | 1440 x 920，高对比主题 | 焦点、选中行、active tab 和状态色是否可区分。 |
| 设置窗口 | 默认尺寸，两个分区 | 切换分区不改变窗口尺寸；控件反映当前语言和主题。 |
| 命令/搜索弹窗 | 有结果；尽量覆盖空、加载、错误 | 行密度、active 状态、键盘焦点和空/错误文案是否一致。 |
| 文件树 | 长文件名、嵌套目录、空白区域菜单 | 图标、截断、选中态、inline rename 和菜单作用域是否清晰。 |
| 编辑器文档 | Source、Hybrid、Preview | 字体、Markdown block、代码、表格、Mermaid、选区和光标行为是否意外漂移。 |

## 交互检查

- 每个按钮、tab、菜单项、输入框和结果行都有可见键盘焦点。
- 打开 modal 后聚焦第一个有意义的控件。
- 关闭 modal 后尽量把焦点还给触发入口。
- Tab 溢出只在 tab 区域内部滚动，不能把右侧工具区顶出视口。
- 右键菜单只展示当前目标有效的动作：根目录、文件夹、Markdown 文件或文件树空白区域。
- 破坏性操作必须有清晰的破坏性状态；除非含义非常明确，否则不要只用图标。
- 禁用控件既要有样式反馈，也要有真实的 disabled 属性。

## 自动化检查

按改动范围运行最小但充分的检查：

```bash
cargo fmt --check
cargo clippy -p papyro-ui --all-targets --all-features -- -D warnings
cargo test -p papyro-ui
node scripts/check-ui-a11y.js
node scripts/check-ui-primitives.js
node scripts/check-ui-contrast.js
node scripts/report-ui-tokens.js
node scripts/report-file-lines.js
git diff --check
```

涉及 Markdown 视觉或编辑器 runtime 时，还要运行：

```bash
node scripts/check-markdown-style-smoke.js
npm --prefix js run build
npm --prefix js test
```

## 评审记录模板

在 PR 或任务记录里使用这个简短模板：

```text
UI Design QA
- Views checked:
- Screenshots attached:
- Keyboard paths checked:
- Dark/high-contrast result:
- Narrow-window result:
- Automated checks:
- Known follow-ups:
```

## 不可交付标准

出现以下情况时，不应交付 UI 改版任务：

- 窄窗口下主操作离开可视区域。
- 文本在正常支持的主题里重叠、裁切或不可读。
- 暗色模式里的导航、设置或破坏性控件对比度不足。
- tab 溢出改变整个工具栏布局，而不是在 tab 区内部滚动。
- 新界面重复实现了已有基础组件状态或控件样式。
- 截图表现仍像 demo 级布局，和视觉 brief 冲突。
