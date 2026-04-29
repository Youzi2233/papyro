# Papyro 开发规范

本文定义 Papyro 的开发、评审、提交和发布前检查规范。目标是让每次改动都能追踪、能回滚、能被后续维护者快速理解。

## 基本原则

- 先读 `docs/roadmap.md`，再开始实现。任何偏离路线图的架构调整，都要同步更新相关文档。
- 一次只解决一个最小任务。每个任务应该有清晰边界、可验证结果和独立提交。
- 优先沿用现有代码风格、模块边界和工具链。只有在确实降低复杂度时，才新增抽象。
- 不混入无关重构。格式化、依赖调整、生成文件更新都要服务于当前任务。
- 保持工作区可解释。提交前确认 `git status` 中没有意外文件。

## 分支与协作流程

- `main` 代表可继续开发的稳定线。常规团队协作应通过短生命周期分支和 Pull Request 合入。
- 分支命名建议使用 `type/scope-summary`，例如 `feat/editor-tabs`、`fix/save-state`、`docs/dev-standards`。
- 每个 PR 聚焦一个目标：一个功能、一个缺陷修复、一次文档更新或一次明确的架构整理。
- 合入前必须解决评审意见，不能留下未解释的失败检查。
- 如需连续推进 roadmap 阶段，仍按最小任务拆提交，避免一个提交承载整阶段变化。

## 架构边界

- `apps/*` 只做宿主入口、窗口或平台启动配置，不承载共享业务流程。
- `crates/app` 负责应用运行时、命令分发、effects、workspace flow 和跨平台用例编排。
- `crates/core` 只放纯模型、状态结构、trait 边界和无 UI 依赖的规则。
- `crates/ui` 只放 Dioxus 0.7 组件、布局和交互表现。UI 通过 `AppContext` 和应用动作消费状态，不直接成为业务事实源。
- `crates/storage` 负责 SQLite、文件系统、workspace 扫描和 watcher 适配。
- `crates/platform` 负责 desktop / mobile 平台能力适配。
- `crates/editor` 负责 Markdown、编辑器协议、文档统计和渲染相关能力。
- 新增模块时，必须说明 owner、scope、validation 和 dependency rule。优先更新 `docs/module-ownership.md`。
- 调整 crate 依赖后，必须运行 `node scripts/check-workspace-deps.js`。

## Dioxus 规范

- 只使用 Dioxus 0.7 API。不要使用已经移除的 `cx`、`Scope`、`use_state`。
- 组件使用 `#[component]`，返回 `Element`。
- Props 必须是 owned value，并实现 `PartialEq + Clone`。需要响应式 props 时使用 `ReadOnlySignal`。
- 本地状态使用 `use_signal`，派生状态使用 `use_memo`，异步数据使用 `use_resource` 或全栈场景下的 `use_server_future`。
- SSR 或 hydration 相关代码中，首屏客户端渲染必须与服务端输出一致。浏览器专属 API 放进 `use_effect`。

## 代码质量

- Rust 代码必须通过 `cargo fmt --check`，并避免引入 clippy warning。
- 错误处理要保留上下文。不要用静默失败掩盖数据丢失、保存失败或 watcher 异常。
- 状态写入失败时，不得错误清除 dirty 标记。
- 避免在渲染路径做大文档 clone、阻塞 IO 或无界计算。确需这样做时，必须给出理由并更新性能预算。
- 修改编辑器 JS 时，只手动改 `js/src/editor.js` 与 `js/src/editor-core.js`，再运行 `npm --prefix js run build` 同步生成物。
- 生成文件必须和源文件同提交，不能让构建产物处于未同步状态。

## 测试策略

- 纯规则和状态迁移优先写单元测试。
- workspace、storage、watcher 和保存流程优先写集成测试或端到端式用例。
- UI 结构性改动至少运行对应 crate 的 `cargo check`。复杂交互应补 smoke test 或后续测试任务。
- 缺陷修复应先用测试或可重复验证步骤描述问题，再修复。
- 无法自动化验证时，PR 中必须写明手动验证步骤和剩余风险。

## 提交规范

- 一个提交只对应一个最小任务。
- 提交标题采用英文 Conventional Commits，格式为 `type: summary`。
- 标题使用祈使句或结果导向短句，例如 `feat: render hybrid headings`。
- 标题建议控制在 50 字符以内，最多 72 字符。不要为了极短而牺牲可读性。
- `scope` 可选，只有能显著提升检索价值时才使用：`type(scope): summary`。
- 提交正文统一使用英文，可详细说明背景、主要改动、影响范围、风险和验证结果。
- 正文建议每行 72 字符左右，按主题拆成短段落或 bullet。
- 简单文档、注释或机械变更可以不写正文；涉及架构、协议、存储、数据安全或多模块协作时建议写正文。
- 不把无关格式化、依赖升级、生成文件和功能改动混在同一提交。
- 提交前确认源码、测试、文档和生成文件处于一致状态。

常用 type：

| type | 用途 |
| --- | --- |
| `feat` | 新功能或新增用户可感知能力 |
| `fix` | 缺陷修复或错误状态修正 |
| `docs` | 文档、规范或注释说明 |
| `refactor` | 不改变行为的结构整理 |
| `test` | 测试新增或测试修正 |
| `perf` | 性能优化 |
| `build` | 构建、依赖、打包或生成流程 |
| `ci` | CI、检查脚本或自动化流程 |
| `style` | 纯格式、样式或无行为变化调整 |
| `chore` | 维护性杂项 |

推荐示例：

```text
docs: update commit standards
fix: preserve dirty save state
feat: render hybrid headings
refactor: move autosave effects
test: cover save retry flow
```

正文示例：

```text
feat: route editor view mode

- Add set_view_mode to the Rust/JS editor protocol so the runtime can
  receive Source, Hybrid, and Preview changes without relying on UI-only
  state.

- Store the normalized mode on the JS editor registry and DOM dataset.
  Reused editor hosts now keep mode state consistent when tabs are
  recycled or reattached.

- Cover protocol serialization and JS mode normalization with tests, then
  rebuild generated editor bundles so host assets stay synchronized.
```

不推荐示例：

```text
update code
fix things
finish all refactors
wip
misc changes
feat: add everything
```

## PR 规范

每个 PR 必须说明：

- 本次改动解决了什么问题。
- 改动范围包含哪些模块。
- 运行了哪些检查命令。
- 是否有迁移、数据安全、性能或回滚风险。
- UI 变化需提供截图或说明验证方式。

PR 合入前必须满足：

- 没有红色检查。
- 没有无关文件变更。
- 没有违反模块依赖方向。
- 文档、测试和生成物与代码行为一致。
- commit title 和 body 都使用英文。
- commit title 符合 `type: summary`，建议 50 字符以内，最多 72 字符。

## 标准检查命令

完整检查以 `scripts/check.sh` 为准：

```bash
bash scripts/check.sh
```

等价命令如下：

```bash
cargo fmt --check
cargo check --workspace --all-features
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
node scripts/check-workspace-deps.js
node scripts/report-file-lines.js
node scripts/report-file-lines.js --self-test
node scripts/check-perf-smoke.js --self-test
npm --prefix js run build
npm --prefix js test
diff assets/editor.js apps/desktop/assets/editor.js
diff assets/editor.js apps/mobile/assets/editor.js
```

`node scripts/report-file-lines.js` 不只是报告文件体量，也会检查非生成文件的单文件行数预算。默认预算是 2500 行，可用 `PAPYRO_FILE_LINE_LIMIT` 临时调整；`PAPYRO_LINE_REPORT_TOP` 可调整输出的最大文件数量。

在 Windows 环境缺少 Bash 或 `diff` 时，可运行等价 PowerShell 命令，并在 PR 中写明替代方式。

## 文档维护

- 行为变化要更新 README 或对应 docs。
- 架构边界变化要更新 `docs/architecture.md`、`docs/directory-structure.md` 或 `docs/module-ownership.md`。
- roadmap 阶段完成、拆分或改序时，要同步更新 `docs/roadmap.md`。
- 文档不要追求“大而全”，要让下一位开发者能做出正确下一步。

## 安全与数据

- 不提交密钥、令牌、本地路径或个人环境配置。
- 涉及文件写入、删除、重命名、导出和同步时，必须优先保证用户内容不丢失。
- 删除类能力必须有明确入口和确认策略。批量删除或隐式删除不得绕过应用层用例。
- 出现数据安全疑问时，先降低风险，再推进功能。
