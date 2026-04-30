# Editor Performance Budget

This budget keeps large Markdown files usable while the editor grows.

Enable runtime traces with:

```bash
PAPYRO_PERF=1 dx serve
```

## Targets

| File size | Open | Switch tab | Input | Preview |
| --- | ---: | ---: | ---: | ---: |
| 100KB | 250ms | 80ms | 16ms | 200ms |
| 1MB | 800ms | 150ms | 32ms | 1000ms |
| 5MB | 2500ms | 300ms | 50ms | 150ms |

The 5MB preview budget is for the degradation path, not full HTML rendering.

## Interaction Targets

| Action | Target | Notes |
| --- | ---: | --- |
| Chrome action | 50ms | Sidebar toggle, sidebar resize commit, modal open, and theme/settings chrome updates. |
| View mode switch | 100ms | Rust UI action plus editor command dispatch for the active host. |
| Tab switch | 80ms | The active editor host should become usable without rebuilding hidden hosts. |
| Tab close | 80ms | UI close trigger; heavy cleanup should run after the interaction path. |
| Input frame | 16ms | Preview, outline, and stats must not block keystroke handling. |
| Workspace search | 500ms | Search over the 1000-note smoke workspace should stay off the UI thread and return the first 50 results. |

Treat these as interaction budgets, not full async completion budgets. A command may
continue work after the interaction if the writing surface stays responsive.

## Degradation

- At 1MB, preview keeps rendering but disables syntax highlighting.
- At 5MB, live preview pauses and outline extraction is skipped.
- Editing remains available while expensive preview work is reduced.

## Hybrid Markdown Editing Acceptance

Hybrid mode should keep the writing surface responsive while richer Markdown
blocks are added:

| File size | Hybrid input | Hybrid behavior |
| --- | ---: | --- |
| 100KB | 16ms | Full block hints and near-visible decorations stay enabled. |
| 1MB | 32ms | Source-like editing remains available; expensive widgets and highlighting may be disabled. |
| 5MB | 50ms | Hybrid explicitly degrades to source_fallback for heavy block rendering. |

The degradation path should be visible in tests or traces. A large document should
never create enough decorations, widgets, Mermaid renders, or code highlights to
block keystroke handling.

Hybrid input traces must identify the block path being edited:

| Field | Expected values |
| --- | --- |
| `hybrid_block_kind` | `heading`, `paragraph`, `list_item`, `block_quote`, `fenced_code`, `table`, `image`, `math`, `mermaid`, `source_fallback`, or `none`. |
| `hybrid_block_state` | `editing`, `rendered`, `error`, `source_fallback`, or the non-Hybrid mode name. |
| `hybrid_block_tier` | `current`, `near`, `remote`, `source_fallback`, or `none`. |
| `hybrid_fallback_reason` | `none`, `document_too_large`, `too_many_blocks`, `missing_hints`, or `invalid_cursor`. |

`perf editor view mode change` also records `hybrid_render_gate`. Switching into
Hybrid should report `block_hints` for small documents and `source_fallback` for
documents above the interactive block analysis limit.

## Trace Names

- `perf app dispatch action`
- `perf editor pane render prep`
- `perf editor open markdown`
- `perf editor switch tab`
- `perf editor view mode change`
- `perf editor outline extract`
- `perf editor command set_view_mode`
- `perf editor command set_preferences`
- `perf editor input change`
- `perf editor preview render`
- `perf editor host lifecycle`
- `perf editor host destroy`
- `perf editor stale bridge cleanup`
- `perf chrome toggle sidebar`
- `perf chrome resize sidebar`
- `perf chrome toggle theme`
- `perf chrome open modal`
- `perf workspace search`
- `perf tab close trigger`
- `perf runtime close_tab handler`

Add new trace points before changing the budget.

## Trace Context

Every `PAPYRO_PERF` trace should include these shared fields so logs can be
grouped by interaction path instead of read as isolated points:

- `interaction_path`: logical lane, for example `editor.tab_close`,
  `editor.view_mode`, `editor.input`, `document.derived`, `chrome.sidebar`,
  `chrome.theme`, or `chrome.modal`.
- `window_id`: current window identity. The single-window implementation uses
  `main` until the future `WindowSession` boundary is implemented.
- `tab_id`: active or target tab id, or `none` for chrome-only traces.
- `revision`: document revision, or `-1` when the trace is not document-bound.
- `view_mode`: `source`, `hybrid`, `preview`, or `none`.
- `content_bytes`: document size, or `-1` when no document is involved.
- `trigger_reason`: user or runtime trigger, for example `click`, `shortcut`,
  `app_action`, `document_snapshot`, `size_gate`, or `runtime_command`.

## Manual Scenarios

Run these scenarios with `PAPYRO_PERF=1` before and after editor architecture changes:

```bash
node scripts/generate-perf-fixtures.js
PAPYRO_PERF=1 cargo run -p papyro-desktop
```

The fixture script writes deterministic Markdown files to `target/perf-fixtures/`:

- `papyro-100kb.md`
- `papyro-1mb.md`
- `papyro-5mb.md`
- `workspace-search-1000/`

Capture the trace output and validate it with the smoke checker:

```bash
PAPYRO_PERF=1 cargo run -p papyro-desktop 2>&1 | tee target/perf-smoke.log
node scripts/check-perf-smoke.js target/perf-smoke.log
```

On PowerShell:

```powershell
$env:PAPYRO_PERF = "1"
cargo run -p papyro-desktop 2>&1 | Tee-Object target/perf-smoke.log
node scripts/check-perf-smoke.js target/perf-smoke.log
```

The checker fails when required smoke traces are missing, shared trace context is
missing, an interaction exceeds its budget, or a large document still uses live
preview instead of the degraded preview path. It also fails when Hybrid input
records omit block kind/state/tier/fallback fields, or when the smoke log does
not include both normal block rendering and source fallback coverage. CI runs
`node scripts/generate-perf-fixtures.js --self-test` and
`node scripts/check-perf-smoke.js --self-test` so the fixtures and checker do
not silently rot.

1. Open a 100KB, 1MB, and 5MB Markdown file.
2. Switch between Source, Hybrid, and Preview from the editor tabbar view toggle.
3. Switch between Source, Hybrid, and Preview from the command palette.
4. Collapse and expand the sidebar from the header button.
5. Collapse and expand the sidebar with `Ctrl+\`.
6. Resize the sidebar and release the drag handle.
7. Open Settings, Quick Open, Command Palette, and Workspace Search.
8. Open `target/perf-fixtures/workspace-search-1000/` as a workspace, then search
   for `papyro-search-target` from Workspace Search. The target term appears in
   the final 50 notes so the scan exercises the full 1000-file workspace.
9. In Hybrid mode, edit at least one rich block in the 100KB file, such as a
   table, image, Mermaid block, or heading.
10. In Hybrid mode, type in the 1MB or 5MB file and confirm the input trace uses
    `hybrid_block_state="source_fallback"`.
11. Close the active tab after editing content.

Mode changes should be checked as a chain:

- `perf editor view mode change` records the UI action and trigger.
- `perf editor view mode change` records `hybrid_render_gate`, so the log shows
  whether Hybrid will use block hints or source fallback.
- `perf editor command set_view_mode` records command sends to each editor host.

Sidebar changes should only emit `perf chrome toggle sidebar` plus local JS layout
measurement for visible editor hosts. Rust should not send layout refresh commands,
and hidden or inactive hosts should not receive editor commands from a sidebar
toggle.

Chrome modal opens should emit `perf chrome open modal` once per user action. Repeated
editor command traces after opening a modal are a signal that chrome state is leaking
into the document lane.
