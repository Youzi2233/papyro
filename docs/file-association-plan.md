# File Association Plan

本文规划 Papyro 未来如何接管 `.md` / `.markdown` 文件打开。目标是让系统文件管理器双击 Markdown 文件时，只产生路径级打开请求，并复用现有 `OpenMarkdownTarget { path }` use case。

当前仓库不在这一阶段实现安装器、打包发布或系统注册写入。本文只定义边界和后续顺序。

## 目标

- Papyro 未运行时，系统双击 Markdown 文件可以启动 Papyro。
- Papyro 已运行时，系统双击 Markdown 文件可以把路径转发给当前进程。
- desktop host 只提交文件路径，不指定 tab、window 或 editor host。
- app runtime 统一把路径转换为 `OpenMarkdownTarget { path }`。
- Tabs 和未来 MultiWindow 模式共享同一套 path-based open use case。

## 当前能力

- 启动参数中的 Markdown 路径会进入 `DesktopStartupOpenRequest`。
- desktop `tao::Event::Opened` 已进入 runtime request channel。
- `papyro-platform::desktop::file_paths_from_opened_urls` 已把 desktop open URLs 收敛成文件路径。
- `MarkdownOpenRequestSender` 会过滤非 Markdown 路径并 absolutize 相对路径。
- dispatcher 会把路径列表映射成 `OpenMarkdownTarget { path }` 并顺序打开。

## 平台策略

### Windows

后续需要安装或便携注册流程把 `.md` / `.markdown` 关联到 Papyro 可执行文件。

推荐顺序：

- 先支持启动参数打开路径。
- 再实现已运行实例检测和路径转发。
- 最后补文件关联写入或安装器集成。

已运行实例转发不能携带 UI 内部状态。它只转发路径数组，接收端继续复用 `MarkdownOpenRequest`。

### macOS

后续需要在 app bundle metadata 中声明 Markdown 文档类型。

推荐顺序：

- 使用系统 open event 接收文件 URL。
- 通过 platform adapter 转换为文件路径。
- 交给 runtime request channel。

### Linux

后续需要 desktop entry 和 MIME association。

推荐顺序：

- desktop entry 接受文件路径参数。
- MIME association 指向 desktop entry。
- 已运行实例转发仍保持路径-only。

## 不变量

- 文件关联不绕过 storage 或 workspace use case。
- 系统双击不直接创建 tab。
- 系统双击不直接创建窗口。
- 系统双击不指定 editor host。
- 非 Markdown 路径在进入 dispatcher 前被过滤。
- 打开失败不清空已有 tab 或 dirty content。

## 后续顺序

1. 保持启动参数和 `tao::Event::Opened` 都走 `MarkdownOpenRequest`。
2. 增加单实例转发通道，转发 payload 只包含路径。
3. 在 MultiWindow route 可用后，把重复打开同一 note 的行为交给 `ProcessRuntimeSession`。
4. 为 Windows/macOS/Linux 分别补文件关联注册或打包配置。
5. 增加端到端 smoke，覆盖未运行启动和已运行转发两条路径。
