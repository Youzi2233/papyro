> **历史文档** — 当前目录结构以 [architecture.md](architecture.md) 为准。

# 项目目录结构

本文描述当前真实目录结构。

## Workspace 总览

```text
papyro/
├── Cargo.toml
├── Cargo.lock
├── README.md
├── Dioxus.toml
├── assets/
├── apps/
│   ├── desktop/
│   │   ├── Cargo.toml
│   │   ├── assets/
│   │   │   ├── editor.js
│   │   │   ├── favicon.ico
│   │   │   └── main.css
│   │   └── src/
│   │       └── main.rs
│   └── mobile/
│       ├── Cargo.toml
│       ├── assets/
│       │   ├── editor.js
│       │   └── main.css
│       └── src/
│           └── main.rs
├── crates/
│   ├── app/
│   ├── core/
│   ├── editor/
│   ├── platform/
│   ├── storage/
│   └── ui/
└── docs/
```

根目录现在是纯 Cargo workspace。  
项目根不再包含 `src/` 应用入口。

## Workspace Members

当前 `Cargo.toml` 中的 workspace members：

```toml
[workspace]
members = [
    "apps/desktop",
    "apps/mobile",
    "crates/app",
    "crates/core",
    "crates/ui",
    "crates/editor",
    "crates/storage",
    "crates/platform",
]
resolver = "2"
```

## Apps

### `apps/desktop`

Desktop 宿主入口。

```text
apps/desktop/
├── Cargo.toml
├── assets/
│   ├── editor.js
│   ├── favicon.ico
│   └── main.css
└── src/
    └── main.rs
```

职责：

- desktop 启动
- Dioxus desktop launch
- 窗口配置
- 首帧资源注入
- 挂载 `papyro_app::desktop::DesktopApp`

启动命令：

```bash
cargo run -p papyro-desktop
```

### `apps/mobile`

Mobile 宿主入口。

```text
apps/mobile/
├── Cargo.toml
├── assets/
│   ├── editor.js
│   └── main.css
└── src/
    └── main.rs
```

职责：

- mobile 启动
- mobile 静态资源注入
- 挂载 `papyro_app::mobile::MobileApp`

启动命令：

```bash
cargo run -p papyro-mobile
```

## Crates

### `crates/app`

共享应用层。

```text
crates/app/
├── Cargo.toml
└── src/
    ├── desktop.rs
    ├── lib.rs
    ├── mobile.rs
    ├── runtime.rs
    ├── workspace_flow.rs
    └── handlers/
        ├── file_ops.rs
        ├── mod.rs
        ├── notes.rs
        └── workspace.rs
```

职责：

- 共享 runtime
- Dioxus context 注入
- command 组装
- workspace flow
- watcher 协调
- desktop/mobile 共享 app 入口

### `crates/core`

核心模型和状态层。

```text
crates/core/
├── Cargo.toml
└── src/
    ├── editor_service.rs
    ├── editor_state.rs
    ├── file_state.rs
    ├── lib.rs
    ├── models.rs
    ├── storage.rs
    └── ui_state.rs
```

职责：

- 模型
- 状态结构
- storage trait
- 与 Dioxus runtime 无关的纯规则

### `crates/ui`

Dioxus UI 组件层。

```text
crates/ui/
├── Cargo.toml
└── src/
    ├── commands.rs
    ├── lib.rs
    ├── components/
    ├── layouts/
    └── theme/
```

职责：

- Dioxus 组件
- desktop/mobile layout
- UI command 类型
- 主题和界面结构

### `crates/storage`

存储实现层。

```text
crates/storage/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── db/
    ├── fs/
    └── index/
```

职责：

- SQLite
- migrations
- `.md` 文件读写
- workspace 扫描
- watcher
- `NoteStorage` trait 的具体实现

### `crates/platform`

平台适配层。

```text
crates/platform/
├── Cargo.toml
└── src/
    ├── desktop.rs
    ├── lib.rs
    ├── mobile.rs
    └── traits.rs
```

职责：

- desktop 平台能力
- mobile 平台能力
- 文件选择
- app data dir
- 系统 reveal/open 操作

### `crates/editor`

编辑器能力层。

```text
crates/editor/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── parser/
    └── renderer/
```

职责：

- Markdown 统计
- Markdown 渲染
- 编辑器相关纯能力

## 依赖方向

```text
apps/desktop ─┐
apps/mobile  ├──> crates/app

crates/app -> crates/ui
crates/app -> crates/core
crates/app -> crates/storage
crates/app -> crates/platform
crates/app -> crates/editor

crates/ui       -> crates/core
crates/storage  -> crates/core
crates/platform -> crates/core
crates/editor   -> crates/core
```

原则：

- app 入口只做宿主壳层
- 共享运行时放在 `crates/app`
- 核心模型和 trait 放在 `crates/core`
- UI 不直接做 storage 操作
- mobile 不复用 desktop 源码路径

## 常用命令

```bash
cargo check
cargo test --workspace
cargo run -p papyro-desktop
cargo run -p papyro-mobile
```
