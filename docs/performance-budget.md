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

Treat these as interaction budgets, not full async completion budgets. A command may
continue work after the interaction if the writing surface stays responsive.

## Degradation

- At 1MB, preview keeps rendering but disables syntax highlighting.
- At 5MB, live preview pauses and outline extraction is skipped.
- Editing remains available while expensive preview work is reduced.

## Trace Names

- `perf editor pane render prep`
- `perf editor open note`
- `perf editor switch tab`
- `perf editor view mode change`
- `perf editor outline extract`
- `perf editor command set_view_mode`
- `perf editor command set_preferences`
- `perf editor input change`
- `perf editor preview render`
- `perf chrome toggle sidebar`
- `perf chrome resize sidebar`
- `perf chrome open modal`
- `perf tab close trigger`
- `perf runtime close_tab handler`

Add new trace points before changing the budget.

## Manual Scenarios

Run these scenarios with `PAPYRO_PERF=1` before and after editor architecture changes:

```bash
PAPYRO_PERF=1 cargo run -p papyro-desktop
```

1. Open a 100KB, 1MB, and 5MB Markdown file.
2. Switch between Source, Hybrid, and Preview from the editor tabbar view toggle.
3. Switch between Source, Hybrid, and Preview from the command palette.
4. Collapse and expand the sidebar from the header button.
5. Collapse and expand the sidebar with `Ctrl+\`.
6. Resize the sidebar and release the drag handle.
7. Open Settings, Quick Open, Command Palette, and Workspace Search.
8. Close the active tab after editing content.

Mode changes should be checked as a chain:

- `perf editor view mode change` records the UI action and trigger.
- `perf editor command set_view_mode` records command sends to each editor host.

Sidebar changes should only emit `perf chrome toggle sidebar` plus local JS layout
measurement for visible editor hosts. Rust should not send layout refresh commands,
and hidden or inactive hosts should not receive editor commands from a sidebar
toggle.

Chrome modal opens should emit `perf chrome open modal` once per user action. Repeated
editor command traces after opening a modal are a signal that chrome state is leaking
into the document lane.
