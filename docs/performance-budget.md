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

## Degradation

- At 1MB, preview keeps rendering but disables syntax highlighting.
- At 5MB, live preview pauses and shows a large-document notice.
- Editing remains available while expensive preview work is reduced.

## Trace Names

- `perf editor pane render prep`
- `perf editor preview render`
- `perf tab close trigger`
- `perf runtime close_tab handler`

Add new trace points before changing the budget.
