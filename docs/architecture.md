# Papyro 当前架构

本文描述的是当前代码库的真实结构，不是长期愿景草图。

如果你只是想启动项目，先看 [README.md](../README.md)。  
如果你想看重构推进计划，继续看 [docs/refactoring-plan.md](refactoring-plan.md)。
如果你想看模块 owner 和拆分优先级，继续看 [docs/module-ownership.md](module-ownership.md)。

## 总览

Papyro 是一个基于 Rust 和 Dioxus 0.7 的跨端 Markdown 笔记项目。

当前架构已经从“根包承载 desktop 运行时”调整为：

- `apps/desktop` 是 desktop 宿主入口
- `apps/mobile` 是 mobile 宿主入口
- `crates/app` 是共享应用层
- `crates/core` 保留核心模型、状态结构和 trait 边界
- `crates/ui` 提供 Dioxus 组件和布局
- `crates/storage` 提供 SQLite、文件系统和 watcher
- `crates/platform` 提供平台能力适配
- `crates/editor` 提供 Markdown 和编辑器相关能力

根目录现在是纯 Cargo workspace，不再包含 `src/` 应用入口源码。

## 启动链路

### Desktop

```text
cargo run -p papyro-desktop
-> apps/desktop/src/main.rs
-> papyro_app::desktop::DesktopApp
-> crates/app runtime
-> crates/ui DesktopLayout
```

`apps/desktop` 负责 desktop 壳层职责：

- 初始化日志
- 配置窗口
- 注入首帧 CSS / JS / favicon
- 读取启动主题
- 挂载共享 desktop app

### Mobile

```text
cargo run -p papyro-mobile
-> apps/mobile/src/main.rs
-> papyro_app::mobile::MobileApp
-> crates/app runtime
-> crates/ui MobileLayout
```

`apps/mobile` 负责 mobile 壳层职责：

- 初始化日志
- 注入 mobile 静态资源
- 挂载共享 mobile app

## 分层结构

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
crates/ui       -> crates/editor (protocol and Markdown UI helpers only)
```

## 每层职责

### `apps/desktop`

Desktop 宿主入口。

负责：

- desktop 启动
- 窗口大小、标题、背景色
- 首帧资源注入
- desktop 专属 Dioxus launch 配置

不负责：

- 业务命令
- workspace flow
- 文件操作流程
- UI 组件实现

### `apps/mobile`

Mobile 宿主入口。

负责：

- mobile 启动
- mobile 静态资源注入
- mobile 专属 Dioxus launch

不负责：

- 复用 desktop 源码
- 定义独立的一套业务 flow

### `crates/app`

共享应用层。

这是当前最重要的组合层。desktop 和 mobile 都通过这里复用主要运行时。

负责：

- 创建共享 runtime
- 注入 Dioxus context
- 组装 app commands
- 协调 workspace flow
- 协调 watcher 生命周期
- 对接 storage / platform / editor / core / ui

当前关键文件：

- `crates/app/src/runtime.rs`：共享 runtime 和 context 注入
- `crates/app/src/workspace_flow.rs`：workspace 打开、刷新、创建、重命名、删除等应用流程
- `crates/app/src/desktop.rs`：desktop app 组件入口和 desktop 启动 chrome 配置
- `crates/app/src/mobile.rs`：mobile app 组件入口
- `crates/app/src/handlers/*`：UI command 到 app flow 的连接层

### `crates/core`

核心层。

负责：

- 数据模型
- 编辑器状态结构
- 文件树状态结构
- UI 偏好状态结构
- storage trait 和数据传输结构
- 与具体平台和 Dioxus runtime 无关的纯规则

`core` 不应该承载启动流程、watcher 生命周期、平台初始化和 UI context 注入。

### `crates/ui`

Dioxus UI 层。

负责：

- desktop layout
- mobile layout
- sidebar、header、editor、settings 等组件
- command 接口类型
- 统一的 `AppContext` UI 入口

当前 UI 仍在收敛中。组件已经开始通过 `AppContext` 读取应用状态和命令，但后续仍要继续减少 layout 组件对底层 signal 和 app flow 的直接感知。

### `crates/storage`

存储层。

负责：

- SQLite 数据库
- schema migration
- `.md` 文件读写
- workspace 扫描
- 文件 watcher
- `NoteStorage` 的具体实现

### `crates/platform`

平台适配层。

负责：

- desktop 平台能力实现
- mobile 平台能力实现
- app data dir
- 文件选择
- reveal/open in explorer 等系统能力

### `crates/editor`

编辑器能力层。

负责：

- Markdown 统计
- Markdown 渲染
- 编辑器桥接相关能力

## 依赖规则

允许：

- `apps/* -> crates/app`
- `crates/app -> crates/ui`
- `crates/app -> crates/core`
- `crates/app -> crates/storage`
- `crates/app -> crates/platform`
- `crates/app -> crates/editor`
- `crates/storage -> crates/core`
- `crates/platform -> crates/core`
- `crates/editor -> crates/core`
- `crates/ui -> crates/core`
- `crates/ui -> crates/editor` for editor protocol and Markdown UI helpers only

禁止：

- `apps/mobile` 依赖 `apps/desktop` 源码
- `apps/desktop` 承载共享业务流程
- `crates/core` 依赖 Dioxus runtime 装配
- `crates/ui` 直接依赖 concrete storage
- `crates/ui` 依赖 editor runtime 业务真相
- `crates/storage` 直接修改 Dioxus signal

## 当前数据流

以打开笔记为例：

```text
User action
-> crates/ui command callback
-> crates/app runtime command
-> crates/app handler
-> crates/app workspace_flow
-> crates/storage NoteStorage implementation
-> crates/core state structures updated
-> Dioxus rerender
```

## 当前状态

已经完成：

- `src/` 根包入口已移除
- desktop 宿主迁入 `apps/desktop`
- desktop 首帧 settings / chrome 装配已从 `apps/desktop` 收进 `crates/app`
- mobile 不再通过 `#[path]` 复用 desktop handler
- 共享 runtime 已进入 `crates/app`
- workspace 应用编排已从 `crates/core` 迁入 `crates/app`

仍在推进：

- 继续收紧 `core` 边界
- 继续减少 UI layout 中的流程编排
- 让 `crates/app` 的 public API 更适合未来跨端复用
- 按 [module-ownership.md](module-ownership.md) 拆分高风险大文件

## 目标架构

详见 [roadmap.md](roadmap.md) 中的目标架构章节。核心演进方向：

- `crates/app` 从集中式 runtime 拆分为 state / actions / dispatcher / effects
- `AppContext` 收敛为更小的 view model + action facade，UI 不再直接操作原始 Signal
- `crates/ui/components/editor/mod.rs` 拆分为 tabbar / toolbar / host / bridge 等独立模块，autosave 由 `crates/app/src/effects.rs` 管理
- Rust/JS 编辑器协议固化到 `crates/editor`，不在 UI 内部私有定义
- 未来按需新增 `search/`、`export/` crate
