# Papyro Development Standards

[简体中文](zh-CN/development-standards.md) | [Documentation](README.md)

These rules keep Papyro easy to change, review, and recover. They apply to humans and AI coding agents.

## Working Principles

- Read [roadmap.md](roadmap.md) before starting roadmap work.
- Keep one task to one minimal behavioral goal.
- Prefer existing module boundaries and helper APIs.
- Avoid unrelated refactors, formatting churn, dependency changes, and generated file drift.
- Keep `git status` explainable before every commit.
- Never revert work you did not make unless explicitly asked.

## Architecture Boundaries

| Area | Owns | Must not own |
| --- | --- | --- |
| `apps/*` | platform shell, launch config, assets | shared business flow |
| `crates/app` | runtime, dispatcher, handlers, effects, workspace flows | low-level persistence details |
| `crates/core` | models, state structs, traits, pure rules | Dioxus, filesystem, SQLite |
| `crates/ui` | Dioxus components, layouts, view models, i18n | direct file writes |
| `crates/storage` | SQLite, files, workspace scan, watcher | UI behavior |
| `crates/platform` | dialogs, app data, reveal, external links | app state mutation |
| `crates/editor` | Markdown summary, render, protocol | storage writes |
| `js/` | CodeMirror runtime behavior | Rust state truth |

When dependency direction changes, run:

```bash
node scripts/check-workspace-deps.js
```

## Dioxus 0.7 Rules

- Use `#[component] fn Name(...) -> Element`.
- Use `Signal<T>`, `ReadOnlySignal<T>`, `use_signal`, `use_memo`, and `use_resource`.
- Props must be owned values and implement `PartialEq + Clone`.
- Use `document::Stylesheet`, `document::Script`, and `asset!` for resources.
- Do not use removed APIs: `cx`, `Scope`, or `use_state`.

## Rust Rules

- Run `cargo fmt --check`.
- Keep clippy warning-free.
- Preserve error context with `anyhow`, `thiserror`, or explicit messages.
- Never hide save, watcher, or filesystem failures.
- Never mark a dirty tab clean after a failed write.
- Avoid blocking IO and large clones in Dioxus render paths.
- Add tests for pure rules, state transitions, storage flows, and bug fixes.

## Editor JS Rules

Only edit these source files by hand:

- `js/src/editor.js`
- `js/src/editor-core.js`

Then run:

```bash
npm --prefix js run build
npm --prefix js test
```

Generated files must be committed with the source change:

- `assets/editor.js`
- `apps/desktop/assets/editor.js`
- `apps/mobile/assets/editor.js`

## Documentation Rules

- README is for visitors and quick start.
- [architecture.md](architecture.md) is the current code map.
- [roadmap.md](roadmap.md) is the current product and engineering priority.
- [editor.md](editor.md) is the Markdown/editor contract.
- [performance-budget.md](performance-budget.md) must mention every trace checked by `scripts/check-perf-docs.js`.
- Keep Chinese docs aligned when contributor-facing behavior changes.
- Finishing a task includes updating existing documentation that the task changes. Do not leave roadmap, architecture, editor, performance, README, or skills documents describing the old behavior.
- Architecture-affecting roadmap work must update [architecture.md](architecture.md) in the same task or explicitly explain why no architecture document change is needed.
- Editor behavior changes must update [editor.md](editor.md) when protocol, Hybrid behavior, Preview behavior, Markdown rendering, or JS/Rust responsibilities change.
- Performance-sensitive changes must update [performance-budget.md](performance-budget.md) when trace names, budgets, large-document policy, or render-path ownership changes.
- AI workflow changes must update [ai-skills.md](ai-skills.md) and the relevant `skills/*/SKILL.md` file.

## Validation

Use the full script before broad changes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1
```

```bash
bash scripts/check.sh
```

The full suite includes:

```bash
cargo fmt --check
cargo check --workspace --all-features
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
node scripts/check-workspace-deps.js
node scripts/report-file-lines.js
node scripts/report-file-lines.js --self-test
node scripts/check-ui-a11y.js
node scripts/check-ui-a11y.js --self-test
node scripts/check-ui-contrast.js
node scripts/check-ui-contrast.js --self-test
node scripts/generate-perf-fixtures.js --self-test
node scripts/check-perf-smoke.js --self-test
node scripts/check-perf-docs.js
node scripts/check-perf-docs.js --self-test
npm --prefix js run build
npm --prefix js test
```

The script also verifies generated editor bundles stay synchronized.

## Commit Standards

- Use English Conventional Commits: `type: summary`.
- One commit should represent one minimal task.
- Keep the title readable, ideally under 50 characters and never over 72.
- `scope` is optional. Use it only when it improves search.
- Body is optional. Do not write a body when the title is enough.
- If a body is needed, keep it directly tied to the diff.
- Do not pad commit messages with roadmap slogans, tool logs, or generic praise.
- Do not mix unrelated formatting, dependency updates, generated files, and behavior changes.

Common types:

| Type | Use |
| --- | --- |
| `feat` | user-visible capability |
| `fix` | bug fix or incorrect state correction |
| `docs` | documentation or explanatory comments |
| `refactor` | structural change without behavior change |
| `test` | test additions or fixes |
| `perf` | performance improvement |
| `build` | build, dependency, packaging, generated flow |
| `ci` | CI or automation |
| `style` | CSS or formatting-only change |
| `chore` | maintenance |

Good titles:

```text
docs: update architecture guide
fix: preserve dirty save state
feat: render hybrid headings
refactor: move autosave effects
test: cover save retry flow
```

Good body:

```text
fix: preserve dirty save state

Keep SaveStatus::Dirty when storage rejects a write so the tab still
prompts before close.
```

Bad titles:

```text
update code
fix things
wip
misc changes
feat: add everything
```

Bad body:

```text
- Improve many files and keep existing architecture boundaries.
- Update according to roadmap and run checks.
- Make the app cleaner, safer, and more professional.
```

## PR Checklist

- The change solves one clear problem.
- The module boundary is respected.
- Generated files are in sync.
- Relevant English and Chinese docs are updated.
- Tests or manual validation are listed.
- Data safety, performance, or rollback risk is called out when relevant.
- `git status` contains no accidental files.

## Safety Rules

- Do not commit secrets, tokens, local-only paths, or personal environment files.
- File write, delete, rename, export, and sync changes must prioritize user content safety.
- Delete flows need explicit UI entry and confirmation strategy.
- If data safety is uncertain, reduce risk before adding capability.
