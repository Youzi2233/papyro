# Papyro 开发规范

[English](../development-standards.md) | [文档首页](README.md)

这些规则用于保证 Papyro 的每次改动都可理解、可评审、可回滚。它们同时适用于人类贡献者和 AI coding agent。

## 基本原则

- 做 roadmap 相关工作前先读 [roadmap.md](roadmap.md)。
- 一个任务只解决一个最小行为目标。
- 优先沿用现有模块边界和 helper API。
- 不混入无关重构、格式化、依赖调整或生成文件漂移。
- 每次提交前确认 `git status` 可解释。
- 不要回滚别人或用户的改动，除非用户明确要求。

## 架构边界

| 区域 | 负责 | 不负责 |
| --- | --- | --- |
| `apps/*` | 平台宿主、启动配置、资源 | 共享业务流程 |
| `crates/app` | runtime、dispatcher、handlers、effects、workspace flows | 低层持久化细节 |
| `crates/core` | 模型、状态结构、trait、纯规则 | Dioxus、文件系统、SQLite |
| `crates/ui` | Dioxus 组件、布局、view model、i18n | 直接写文件 |
| `crates/storage` | SQLite、文件、workspace 扫描、watcher | UI 行为 |
| `crates/platform` | 对话框、app data、reveal、外链 | app 状态变更 |
| `crates/editor` | Markdown 统计、渲染、协议 | storage 写入 |
| `js/` | CodeMirror runtime 行为 | Rust 状态真相 |

调整 crate 依赖方向后运行：

```bash
node scripts/check-workspace-deps.js
```

## Dioxus 0.7 规则

- 使用 `#[component] fn Name(...) -> Element`。
- 使用 `Signal<T>`、`ReadOnlySignal<T>`、`use_signal`、`use_memo`、`use_resource`。
- Props 必须是 owned value，并实现 `PartialEq + Clone`。
- 使用 `document::Stylesheet`、`document::Script`、`asset!` 管理资源。
- 不使用旧 API：`cx`、`Scope`、`use_state`。

## Rust 规则

- 通过 `cargo fmt --check`。
- 不引入 clippy warning。
- 错误处理要保留上下文。
- 不隐藏保存、watcher 或文件系统失败。
- 写入失败时不得把 dirty tab 标记为 clean。
- 不在 Dioxus render path 中做阻塞 IO 或大对象 clone。
- 纯规则、状态迁移、存储流程和 bug fix 要优先补测试。

## 编辑器 JS 规则

只手动修改：

- `js/src/editor.js`
- `js/src/editor-core.js`

改完后运行：

```bash
npm --prefix js run build
npm --prefix js test
```

生成物必须和源码同提交：

- `assets/editor.js`
- `apps/desktop/assets/editor.js`
- `apps/mobile/assets/editor.js`

## 文档规则

- README 面向游客和快速启动。
- [architecture.md](architecture.md) 描述当前代码结构。
- [roadmap.md](roadmap.md) 描述当前产品和工程优先级。
- [editor.md](editor.md) 描述 Markdown/editor contract。
- [performance-budget.md](performance-budget.md) 必须包含 `scripts/check-perf-docs.js` 检查的所有 trace。
- 贡献者可见规则变更时，中英文文档要同步。
- 完成一个任务时，也要同步更新被该任务影响的现有文档。不要让 roadmap、architecture、editor、performance、README 或 skills 继续描述旧行为。
- 影响架构的 roadmap 工作必须在同一任务中更新 [architecture.md](architecture.md)，或者明确说明为什么不需要改架构文档。
- 编辑器行为变化必须在协议、Hybrid 行为、Preview 行为、Markdown 渲染或 JS/Rust 职责变化时更新 [editor.md](editor.md)。
- 性能敏感改动如果改变 trace 名、预算、大文档策略或 render path 归属，必须更新 [performance-budget.md](performance-budget.md)。
- 大范围 UI 重构应运行 `node scripts/report-ui-tokens.js`；token 债务明显变化时同步更新 [ui-token-audit.md](ui-token-audit.md)。
- AI 协作流程变化必须更新 [ai-skills.md](ai-skills.md) 和相关的 `skills/*/SKILL.md`。

## 验证

完整检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1
```

```bash
bash scripts/check.sh
```

常用检查包括：

```bash
cargo fmt --check
cargo check --workspace --all-features
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
node scripts/check-workspace-deps.js
node scripts/report-file-lines.js
node scripts/check-ui-a11y.js
node scripts/check-ui-primitives.js
node scripts/check-ui-primitives.js --self-test
node scripts/check-ui-contrast.js
node scripts/report-ui-tokens.js
node scripts/check-perf-docs.js
npm --prefix js run build
npm --prefix js test
```

完整脚本还会校验 editor bundle 生成物是否同步。

## 提交规范

- 提交标题使用英文 Conventional Commits：`type: summary`。
- 一个提交只对应一个最小任务。
- 标题建议 50 字符以内，最多 72 字符。
- `scope` 可选，只在提升检索价值时使用。
- 正文可选。标题足够清晰时不要硬写正文。
- 如果需要正文，只写和本次 diff 直接对应的内容。
- 不要在正文里堆 roadmap 口号、工具日志或泛泛描述。
- 不要把无关格式化、依赖更新、生成文件和行为变更混进同一提交。

常用 type：

| Type | 用途 |
| --- | --- |
| `feat` | 用户可感知能力 |
| `fix` | bug 修复或错误状态修正 |
| `docs` | 文档或说明性注释 |
| `refactor` | 不改变行为的结构调整 |
| `test` | 测试新增或修正 |
| `perf` | 性能优化 |
| `build` | 构建、依赖、打包、生成流程 |
| `ci` | CI 或自动化 |
| `style` | CSS 或纯格式变更 |
| `chore` | 维护 |

推荐标题：

```text
docs: update architecture guide
fix: preserve dirty save state
feat: render hybrid headings
refactor: move autosave effects
test: cover save retry flow
```

## PR 检查清单

- 改动解决一个明确问题。
- 没有破坏模块边界。
- 生成文件已同步。
- 相关中英文文档已更新。
- 写明测试或手动验证。
- 涉及数据安全、性能或回滚风险时明确说明。
- `git status` 没有意外文件。

## 安全规则

- 不提交密钥、token、本地私有路径或个人环境配置。
- 文件写入、删除、重命名、导出、同步要优先保护用户内容。
- 删除流程必须有明确入口和确认策略。
- 数据安全不确定时，先降低风险，再加功能。
