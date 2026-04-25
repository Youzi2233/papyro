# Papyro

Papyro 是一个基于 Rust 和 Dioxus 0.7 的跨端 Markdown 笔记项目，目前同时维护 desktop 和 mobile 两个宿主入口，并通过共享的应用层承接大部分运行时逻辑。

这份 README 的目标不是讲完所有设计细节，而是先解决两个最实际的问题：

- 这个项目现在应该怎么启动
- 现在的 workspace 结构到底怎么理解

更完整的架构重构计划可以看 [docs/refactoring-plan.md](docs/refactoring-plan.md)。

## 快速开始

### 1. 环境要求

建议先准备好这些工具：

- Rust stable
- Cargo
- Dioxus CLI

安装 Dioxus CLI：

```bash
cargo install dioxus-cli
```

确认版本：

```bash
dx --version
cargo --version
rustc --version
```

### 2. 安装依赖并检查项目

在仓库根目录执行：

```bash
cargo check
cargo test --workspace
```

如果这两步都通过，说明当前 workspace 是健康的。

## 现在怎么启动

当前项目有两种主要启动方式。

### 方式 A：启动 apps/desktop

如果你想从平台 app 入口的角度运行，也可以执行：

```bash
cargo run -p papyro-desktop
```

这就是当前 desktop 的正式宿主入口。

### 方式 B：启动 apps/mobile

```bash
cargo run -p papyro-mobile
```

这会走 mobile 宿主入口，并挂载共享的 `papyro-app` 运行时。

注意：

- mobile 入口当前仍是开发态结构，不代表所有移动端打包流程都已经收敛完成
- 如果你只是想先熟悉项目，建议优先从 desktop 启动

## 推荐给新人的启动顺序

如果你第一次接触这个仓库，建议按这个顺序：

1. `cargo check`
2. `cargo test --workspace`
3. `cargo run -p papyro-desktop`
4. 再看下面的 workspace 结构说明

这样先确保你能把项目跑起来，再去理解架构，不容易被目录结构绕晕。

## 当前 workspace 结构

这是当前更贴近现实的结构理解，不是历史文档里的旧版本。

```text
.
├─ apps/
│  ├─ desktop/             # desktop 平台入口包
│  └─ mobile/              # mobile 平台入口包
├─ crates/
│  ├─ app/                 # 共享应用层：运行时、commands、workspace flow
│  ├─ core/                # 纯核心模型、状态结构、trait 边界、纯规则
│  ├─ ui/                  # Dioxus 组件和布局
│  ├─ storage/             # SQLite、文件系统、watcher
│  ├─ platform/            # desktop / mobile 平台能力适配
│  └─ editor/              # Markdown 处理、文档统计、渲染相关能力
├─ assets/                 # workspace 级历史/共享静态资源；宿主优先使用 apps/*/assets
└─ docs/                   # 架构和重构文档
```

## 这些目录分别负责什么

### `apps/desktop`

这是 desktop 平台入口包。

它现在已经是真正的 desktop 宿主入口，负责：

- desktop 启动
- 窗口配置
- 首帧资源注入
- 挂载共享 `papyro-app::desktop::DesktopApp`

它不再直接装配 storage、platform、workspace flow 或 app commands。  
这些共享运行时职责已经收敛到 `crates/app`。

### `apps/mobile`

这是 mobile 平台入口包。

它负责：

- mobile 入口启动
- 注入 mobile 资源
- 挂载共享 `papyro-app::mobile::MobileApp`

它也不应该复用 desktop 源码路径。跨端共享逻辑统一进入 `crates/app`。

### `crates/app`

这是最近重构里最重要的一层。

你可以把它理解成：

- 共享应用层
- 共享运行时组装点
- shared commands / handlers / workspace flow 所在位置

如果你想理解“desktop 和 mobile 现在是如何共享主要逻辑的”，先看这里：

- [crates/app/src/lib.rs](crates/app/src/lib.rs)
- [crates/app/src/runtime.rs](crates/app/src/runtime.rs)
- [crates/app/src/desktop.rs](crates/app/src/desktop.rs)
- [crates/app/src/mobile.rs](crates/app/src/mobile.rs)

### `crates/core`

这里放的是更稳定、更底层的内容：

- 模型
- 状态结构
- trait 边界
- 不依赖 Dioxus 运行时装配的纯逻辑

如果你看到某段代码更像“应用流程编排”，那它原则上就不应该长期留在 `core`。

### `crates/ui`

这里是 Dioxus 组件与布局层。

如果你想改界面、交互排版、布局表现，先看这里。  
UI 现在通过 `AppContext` 消费应用状态和命令，避免组件到处直接读取零散 context。

### `crates/storage`

这里负责：

- SQLite 存储
- 文件系统读写
- workspace 扫描
- watcher

### `crates/platform`

这里是平台能力适配层，当前有 desktop 和 mobile 两套实现。

### `crates/editor`

这里放的是 Markdown / 编辑器相关能力，比如文档统计、渲染相关逻辑。

## 现在的启动链路怎么理解

以 desktop 为例，当前链路是这样的：

```text
cargo run -p papyro-desktop
-> apps/desktop/src/main.rs
-> papyro_app::desktop::DesktopApp
-> papyro-app 共享运行时
-> papyro-ui 渲染界面
```

以 mobile 为例：

```text
cargo run -p papyro-mobile
-> apps/mobile/src/main.rs
-> papyro_app::mobile::MobileApp
-> papyro-app 共享运行时
-> papyro-ui 渲染界面
```

所以现在最重要的认知更新是：

- 共享运行时已经进入 `crates/app`
- `apps/*` 是平台宿主壳层
- 根目录现在是纯 workspace 根，不再承载 app 入口源码

## 常用开发命令

### 编译检查

```bash
cargo check
```

### 运行所有测试

```bash
cargo test --workspace
```

### 启动 desktop

```bash
dx serve --package papyro-desktop
# or
cargo run -p papyro-desktop
```

### 启动 mobile

```bash
dx serve --package papyro-mobile
# or
cargo run -p papyro-mobile
```

## 编辑器前端资源

Edit 模式里的 CodeMirror 运行时来自 `js/src/editor.js`。这是唯一应该手动修改的源文件。

修改编辑器 JS 后，在仓库根目录执行：

```bash
cd js
npm install
npm run build
```

构建脚本会生成并同步这些文件：

- `assets/editor.js`：workspace 级构建产物
- `apps/desktop/assets/editor.js`：desktop 宿主启动时内联使用
- `apps/mobile/assets/editor.js`：mobile 宿主通过 Dioxus `asset!` 使用

这三份 `editor.js` 内容应该保持一致。`apps/*/assets/editor.js` 不是新的源码入口，只是宿主需要的生成副本；不要手动改它们。

### 单独检查某个包

```bash
cargo check -p papyro-app
cargo check -p papyro-core
cargo check -p papyro-ui
```

## 新人阅读顺序

如果你刚加入项目，建议按这个顺序看代码：

1. [README.md](README.md)
2. [docs/refactoring-plan.md](docs/refactoring-plan.md)
3. [crates/app/src/runtime.rs](crates/app/src/runtime.rs)
4. [crates/app/src/workspace_flow.rs](crates/app/src/workspace_flow.rs)
5. [crates/core/src/lib.rs](crates/core/src/lib.rs)
6. [crates/ui/src/lib.rs](crates/ui/src/lib.rs)

这样更容易先建立“运行时怎么拼起来”的整体图，再去深入各层。

## 当前架构状态说明

这个项目还在架构收敛过程中，不是假装已经完全定型的状态。

当前你需要知道的是：

- 共享应用层 `crates/app` 已经建立
- mobile 不再通过源码路径复用 desktop handler
- `core` 正在继续收紧边界
- 根目录 `src/` 已经移除，desktop 宿主已迁入 `apps/desktop`

也就是说，现在已经比之前清晰很多，但还不是最终形态。

## 遇到问题先看哪里

### 跑不起来

先执行：

```bash
cargo check
cargo test --workspace
```

如果 desktop 跑不起来，优先看：

- [apps/desktop/src/main.rs](apps/desktop/src/main.rs)
- [crates/app/src/desktop.rs](crates/app/src/desktop.rs)

如果 mobile 跑不起来，优先看：

- [apps/mobile/src/main.rs](apps/mobile/src/main.rs)
- [crates/app/src/mobile.rs](crates/app/src/mobile.rs)

### 看不懂共享运行时

优先看：

- [crates/app/src/runtime.rs](crates/app/src/runtime.rs)
- [crates/app/src/workspace_flow.rs](crates/app/src/workspace_flow.rs)

### 看不懂核心边界

优先看：

- [crates/core/src/lib.rs](crates/core/src/lib.rs)
- [docs/refactoring-plan.md](docs/refactoring-plan.md)

## 说明

这份 README 会随着重构继续更新。  
如果后面 `apps/desktop`、`apps/mobile`、`crates/app` 的关系继续收敛，这里也应该同步调整，而不是让文档再次落后于代码。
