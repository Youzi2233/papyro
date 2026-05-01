---
name: papyro-architecture
description: Quickly understand Papyro's crate boundaries, data flow, and where a change belongs.
---

# Papyro Architecture

Use this skill before changing module boundaries, adding a use case, touching storage, or deciding where code belongs.

## Read First

- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/development-standards.md`

## Layer Map

```text
apps/*          platform shells only
crates/app     runtime, dispatcher, handlers, effects, workspace flows
crates/core    models, state structs, traits, pure rules
crates/ui      Dioxus components, layouts, view models, i18n
crates/storage SQLite, filesystem, watcher, workspace scan
crates/platform dialogs, app data, reveal, external URLs
crates/editor  Markdown summary, render, protocol
js/            CodeMirror runtime source
```

## Decision Rules

- UI layout or control: start in `crates/ui`.
- User flow or state mutation: start in `crates/app`.
- Pure rule or model: start in `crates/core`.
- File or SQLite behavior: start in `crates/storage`.
- System integration: start in `crates/platform`.
- Markdown render or protocol: start in `crates/editor`.
- Cursor, selection, IME, paste, or decoration behavior: start in `js/src`.

## Data Flow

```text
Dioxus component
-> AppCommands
-> AppAction
-> AppDispatcher
-> handler/effect
-> workspace_flow or storage/platform/editor service
-> RuntimeState
-> view model memo
-> Dioxus component
```

## Guardrails

- Do not put shared business flow in `apps/*`.
- Do not make `crates/core` depend on Dioxus or filesystem APIs.
- Do not let UI components save files directly.
- Do not let JS own saved content truth.
- Do not clear dirty state after failed storage writes.
- Do not add a dependency direction without running `node scripts/check-workspace-deps.js`.

## Current Architecture Priorities

- settings should become an independent process-level window
- OS Markdown file-open events should route through one app use case
- active tab should drive the visible workspace tree when tabs span roots
- Hybrid editor behavior must become stable before more decoration is added
