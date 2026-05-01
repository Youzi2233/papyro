---
name: papyro-coding
description: Implement a scoped Papyro code change with the right validation and commit discipline.
---

# Papyro Coding

Use this skill when implementing or reviewing a scoped change.

## Start

1. Check `git status --short`.
2. Read the smallest relevant docs:
   - `docs/development-standards.md`
   - `docs/architecture.md`
   - `docs/editor.md` for Markdown/editor work
   - `docs/performance-budget.md` for render or interaction work
3. Identify the owner module before editing.

## Editing Rules

- Use existing patterns before adding abstractions.
- Keep edits scoped to the task.
- Use `apply_patch` for manual file edits.
- Do not revert user changes.
- Do not edit generated editor bundles by hand.
- Add tests when touching pure rules, storage flows, state transitions, or bug fixes.

## Validation Matrix

| Change | Minimum validation |
| --- | --- |
| Rust formatting | `cargo fmt --check` |
| Crate behavior | `cargo check -p PACKAGE` |
| Shared Rust behavior | `cargo test --workspace` |
| Dependency direction | `node scripts/check-workspace-deps.js` |
| Editor JS | `npm --prefix js run build` and `npm --prefix js test` |
| UI contrast/a11y | `node scripts/check-ui-a11y.js` and `node scripts/check-ui-contrast.js` |
| Performance docs | `node scripts/check-perf-docs.js` |
| Broad change | `scripts/check.ps1` or `scripts/check.sh` |

## Commit Rules

Use English Conventional Commits:

```text
fix: preserve dirty save state
feat: render hybrid headings
docs: update architecture guide
```

Keep the body optional and concise. Every body sentence must point to the actual diff.

## Final Response Checklist

- Say what changed.
- Say which validation ran.
- Mention anything not run or any residual risk.
- If a commit was made, include the hash.
