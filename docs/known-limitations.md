# Known Limitations

[简体中文](zh-CN/known-limitations.md) | [Documentation](README.md)

Papyro is usable for development and dogfooding, but it is not a finished end-user release yet. This page lists current limitations so contributors and testers know which rough edges are expected.

## Product Status

- Desktop builds are the primary target today.
- Mobile shares the runtime and assets, but it is not production-ready.
- Basic desktop zip packaging exists; native installers are not finalized.
- First-run onboarding is not implemented yet.
- The app is local-first only; cloud sync, accounts, and collaboration are intentionally out of scope for now.

## Markdown Editing

- Hybrid mode is still architecture-sensitive. Cursor hit testing, selection behavior, inline decoration edges, IME, and keyboard navigation need more hardening before it can be called enterprise-grade.
- Source and Preview are safer for precise Markdown control.
- Mermaid, math, tables, links, images, and code blocks are supported, but their edit affordances are still being refined.
- Large documents may disable live preview or code highlighting to keep editing responsive.
- Raw HTML in Markdown is sanitized instead of rendered as arbitrary HTML.

## Workspace And Files

- Very large workspaces should be tested before relying on them for daily work.
- Workspace switching follows the active tab, but full multi-window routing is not implemented.
- OS file association support is in progress; installer-level registration is not finalized.
- Trash and recovery exist, but testers should still keep external backups of important notes.

## Desktop Shell

- Settings still runs in the main window experience. A process-level tool window is planned.
- Multi-window document editing is modeled in core, but not available as a user-facing mode.
- Some release polish remains open: native installers, demo media, and first-run workspace onboarding.

## Performance

- Automated smoke checks cover the highest-risk paths, but manual desktop traces are still required before large editor or shell changes.
- The editor bundle is local and offline, but generated JS assets must stay synchronized with `js/src` changes.

## What To Report

Please report behavior that is worse than the limitations above, especially:

- data loss, failed save recovery, or confusing dirty-state behavior
- editor cursor, selection, paste, or IME bugs that can be reproduced
- file operations that block the UI
- workspace scans that freeze on real projects
- dark-mode contrast or narrow-window layout regressions
