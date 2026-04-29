# UI Smoke Checklist

本文定义 Papyro 桌面 UI 的人工 smoke 流程。它用于自动化 UI 测试落地前的固定验收，也为后续 Playwright、截图检查或桌面事件驱动测试提供场景边界。

运行前准备：

- 使用一个临时 workspace。
- 准备 3 个 Markdown 文件：小文件、包含图片引用的文件、约 100KB 的长文档。
- 使用 `cargo run -p papyro-desktop` 启动。
- 如需性能日志，使用 `PAPYRO_PERF=1 cargo run -p papyro-desktop`。

## Workspace And File Flow

目标：验证真实笔记库的最小闭环。

步骤：

1. 打开 workspace。
2. 在文件树打开一个 Markdown 文件。
3. 输入一小段文字。
4. 手动保存。
5. 关闭当前 tab。

通过标准：

- 文件树显示 workspace 内容。
- 打开文件后编辑器成为主视觉区域。
- 输入不会丢失或跳焦。
- 保存后 dirty 状态清除。
- 关闭 tab 后不会留下空白 editor host 或错误状态。

## View Mode Flow

目标：验证 Source / Hybrid / Preview 切换。

步骤：

1. 打开一篇包含标题、列表、代码块和图片链接的笔记。
2. 切换到 Source。
3. 切换到 Hybrid。
4. 切换到 Preview。
5. 回到 Hybrid 并继续输入。

通过标准：

- 三种模式不会清空内容。
- 滚动位置没有明显跳动。
- Preview 中本地 workspace 图片可以显示。
- 回到可编辑模式后输入正常。

## Modal And Search Flow

目标：验证低频工具不会打断写作主路径。

步骤：

1. 打开 Command Palette。
2. 执行 Quick Open 或最近文件打开。
3. 打开 Settings，再关闭。
4. 打开 Workspace Search，输入查询，再清空。

通过标准：

- Modal 打开和关闭没有 editor command storm。
- 焦点进入预期输入框。
- 搜索空查询会清理结果。
- 关闭 modal 后当前编辑内容仍在。

## Chrome Flow

目标：验证 chrome 交互不阻塞编辑器。

步骤：

1. 折叠 sidebar。
2. 展开 sidebar。
3. 拖拽调整 sidebar 宽度并释放。
4. 切换亮色 / 暗色主题。

通过标准：

- sidebar toggle 响应迅速。
- resize 拖拽过程中布局稳定。
- 主题切换只改变视觉，不改变 active tab。
- 编辑器内容和选择不丢失。

## Visual Review

目标：确认主界面保持文档优先。

检查项：

- 第一视口中编辑器或文档内容是主视觉。
- tabbar、sidebar、status bar 不抢占写作区域。
- 按钮文字不溢出。
- modal 文本不遮挡操作按钮。
- 小窗口宽度下没有明显重叠。
- Light、Dark、System dark 三种主题文字对比清晰。

## 记录方式

每次人工 smoke 记录以下信息：

- commit hash。
- 操作系统。
- 是否开启 `PAPYRO_PERF`。
- 失败步骤。
- 截图或日志路径。

性能日志用以下命令检查：

```bash
node scripts/check-perf-smoke.js target/perf-smoke.log
```
