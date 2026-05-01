# Release QA 检查清单

[English](../release-qa.md) | [文档](README.md)

在给桌面端打 tag，或者把类似安装包的构建交给非开发用户之前，使用这份清单。自动化检查必须先通过；这里覆盖仍然需要人工确认的产品路径。

## 发布门禁

```mermaid
flowchart LR
    checks["自动化检查"]
    build["Release build"]
    smoke["人工 smoke"]
    trace["性能 trace"]
    notes["Release notes"]
    tag["Tag 或发布"]

    checks --> build --> smoke --> trace --> notes --> tag
```

前一步失败时不要继续发布。

## 1. 自动化基线

- [ ] Windows 运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`，Unix-like 系统运行 `bash scripts/check.sh`。
- [ ] 确认生成的 editor bundle 已同步。
- [ ] 确认 `git status --short` 只有本次发布需要的变更。
- [ ] 检查 `main` 分支最新 CI 是否通过。

## 2. 桌面端构建

- [ ] 运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-desktop.ps1` 构建桌面端包。
- [ ] 从生成的 `target/dist/papyro-desktop-<os>-<arch>-v<version>/` 目录启动 release 二进制。
- [ ] 确认 `papyro-release-manifest.json` 记录了预期版本和 commit。
- [ ] 确认窗口标题、图标、favicon 和侧边栏 logo 都使用当前 Papyro 资源。
- [ ] 确认原生 `Window`、`Edit`、`Help` 菜单栏不可见。

## 3. 首次启动和工作区

- [ ] 不设置 `PAPYRO_WORKSPACE` 启动，确认应用能打开可用的默认工作区。
- [ ] 分别打开小工作区和大型项目工作区。
- [ ] 确认 workspace 扫描不会卡住壳层。
- [ ] 确认文件树按预期忽略生成目录和构建目录。
- [ ] 确认根目录空白区域菜单可以创建根目录笔记或文件夹。

## 4. 文件操作

- [ ] 从侧边栏创建笔记，并确认能快速打开。
- [ ] 从目录右键菜单创建文件夹。
- [ ] 重命名笔记，并确认 tab 标题和文件树同步更新。
- [ ] 删除笔记，并确认进入回收站。
- [ ] 恢复回收站笔记，并确认文件树选中它。
- [ ] 在系统文件管理器中定位笔记。

## 5. 编辑器模式

- [ ] 打开包含标题、列表、表格、链接、图片、代码块、数学公式和 Mermaid 的 Markdown 文件。
- [ ] 在 Source、Hybrid、Preview 之间切换，确认不会丢失滚动上下文。
- [ ] 确认 Preview 能渲染代码高亮、表格、数学公式和 Mermaid。
- [ ] 确认 Hybrid 中标题、列表、inline code、链接、表格、代码块、数学公式和 Mermaid 与 Preview 视觉一致。
- [ ] 确认粘贴会替换已选文本。
- [ ] 确认 Source 和 Hybrid 中撤销/重做、IME composition 和键盘导航行为稳定。

## 6. 导航和壳层

- [ ] 在正常和窄窗口宽度下切换侧边栏。
- [ ] 调整侧边栏宽度，并确认编辑器操作区始终可见。
- [ ] 打开目录，并点击多个标题。
- [ ] 确认目录高亮跟随编辑器或预览滚动位置。
- [ ] 打开 quick open、command palette、搜索、回收站和恢复弹窗。
- [ ] 确认窄窗口下状态栏内容不会溢出。

## 7. 设置

- [ ] 从侧边栏、编辑器顶部和 command palette 打开设置。
- [ ] 在通用设置和关于之间切换，确认窗口大小不变化。
- [ ] 修改语言并保存，确认 UI 文案更新。
- [ ] 修改主题并保存，确认整个壳层更新。
- [ ] 修改字体、字号、行高、URL 粘贴转链接和自动保存延迟。
- [ ] 确认暗色模式下设置导航和按钮对比度可读。

## 8. 外部文件打开

- [ ] 在测试机上把 release 二进制配置为 Markdown 打开程序。
- [ ] 从操作系统打开 `.md` 文件。
- [ ] 确认 Papyro 为该文件新增 tab。
- [ ] 确认侧边栏切换到该文件所在父目录工作区。
- [ ] 从两个不同目录打开文件，并确认切换 tab 时侧边栏工作区跟随更新。
- [ ] 确认 workspace context 切换前会保护 dirty tab。

## 9. 数据安全

- [ ] 编辑笔记后关闭 tab，确认出现 dirty 确认提示。
- [ ] 保存笔记后从外部修改文件，确认冲突提示可操作。
- [ ] 将目标文件设为只读来模拟保存失败，确认 tab 仍保持 dirty。
- [ ] 未保存编辑后重启，确认恢复草稿说明清楚。
- [ ] 清空回收站前必须二次确认破坏性操作。

## 10. 性能 Trace

- [ ] 运行 `PAPYRO_PERF=1 cargo run -p papyro-desktop`。
- [ ] 采集启动、tab 切换、模式切换、侧边栏切换、打开设置、搜索和关闭 tab 交互。
- [ ] 将日志保存到 `target/perf-smoke.log`。
- [ ] 运行 `node scripts/check-perf-smoke.js target/perf-smoke.log`。
- [ ] 将 trace 摘要附到 release notes 或 release issue。

## 11. Release Notes 证据

发布前记录：

- Commit SHA。
- 操作系统和架构。
- 构建命令。
- 检查脚本结果。
- 人工 QA 日期和测试人。
- 仍然存在的 known limitations。
- 如果发布说明包含截图或短视频，也记录对应素材。
