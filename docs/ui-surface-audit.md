# UI Surface Audit

[简体中文](zh-CN/ui-surface-audit.md) | [Documentation](README.md)

This audit turns the Phase 3.5 UI/UX redesign into a surface-by-surface worklist. It should be read with [UI Information Architecture](ui-information-architecture.md), [UI Architecture And Component Inventory](ui-architecture.md), and [UI Token Audit](ui-token-audit.md).

The audit is intentionally practical: every row names the owner, the current code, the user-facing risk, and the next redesign move.

## Audit Summary

| Surface | Current Code | Main Risk | Next Move |
| --- | --- | --- | --- |
| Desktop shell | `crates/ui/src/layouts/desktop_layout.rs` | Layout is functional but not yet expressed as reusable app-shell primitives. | Extract `AppShell`, `WorkspaceRail`, `MainColumn`, and modal/tool-window layer contracts. |
| Sidebar | `components/sidebar/mod.rs`, `components/sidebar/file_tree.rs` | Workspace, tree, blank-area, and context-menu states are still too coupled to one surface. | Create `WorkspaceRail`, `TreeItem`, and scoped menu patterns. |
| Editor header | `components/editor/pane.rs` | Toolbar zones have been patched for overflow but are not yet a primitive contract. | Create `EditorToolbar` and `ToolbarZone` rules with fixed right-zone behavior. |
| Tab bar | `components/editor/tabbar.rs`, `pane.rs` JS bridge | Overflow behavior works but depends on one-off script and CSS classes. | Move overflow rules into a documented `DocumentTabs` pattern and add smoke coverage. |
| Outline | `components/editor/outline.rs` | Navigation works, but active-heading and narrow-window behavior remain sensitive. | Treat outline as a document navigation primitive with overlay fallback. |
| Status bar | `components/status_bar.rs` | Useful but minimal; wrapping and status priority are not fully defined. | Convert to `StatusStrip` with priority and compact rules. |
| Settings | `components/settings/mod.rs` | Improved, but still mixes product content with dialog/form layout concerns. | Build `SettingsWindow`, `SettingsNav`, `SettingsRow`, and stable panel sizing. |
| Search | `components/search.rs` | Result rows mostly resemble command rows but are not a shared pattern. | Adopt shared `ResultRow`, highlight, loading, and error primitives. |
| Quick open | `components/quick_open.rs` | Shares command row classes without a semantic reusable row. | Move to `ResultRow` with document metadata slots. |
| Command palette | `components/command_palette.rs` | Strong action model, but row styling and grouping should be reusable. | Split command data from `CommandRow` rendering pattern. |
| Trash | `components/trash.rs` | Uses command-modal styling for a destructive management surface; empty state and rows now use shared primitives. | Add `DialogSection` and destructive footer rules. |
| Recovery | `components/recovery.rs` | Draft rows, empty state, and comparison panels now use shared primitives; conflict/error status hierarchy still needs a data-safety pattern. | Add conflict/error status primitives and destructive footer rules. |
| Empty/loading/error states | scattered | `InlineAlert` now covers preview notices and command/search/trash/recovery empty states, but larger blocking failures still need structure. | Add `Skeleton`, `ErrorState`, and compact/onboarding `EmptyState` variants. |

## Surface Findings

### Desktop Shell

What works:

- `DesktopLayout` keeps the core shell simple: sidebar, main editor column, status bar, and modal layer.
- Global shortcuts are centralized in the desktop layout.
- Settings can already launch as a separate window when a launcher exists.

Gaps:

- `.mn-shell`, `.mn-workbench`, and `.mn-main-column` are CSS conventions, not named Dioxus layout primitives.
- Modal and future tool-window behavior are not documented as separate layers.
- Narrow-window behavior depends on individual surface fixes.

Redesign decision:

- Create shell primitives before another broad CSS pass.
- The main column must own the status bar and editor toolbar.
- Modal/tool-window layering should be described once and reused by settings, trash, recovery, search, quick open, and command palette.

### Sidebar

What works:

- The sidebar now explains the current folder, supports root selection, and scopes blank-area behavior.
- Resize min/max rules exist.
- Brand, search, workspace root, create flow, file tree, and footer are visually grouped.
- File and folder rows now share `TreeItemButton`, `TreeItemEditRow`, and `TreeItemLabel` primitives for icons and row state classes.

Gaps:

- Root rows and footer rows are not yet covered by a shared `SidebarItem` pattern.
- Context menus exist but their item grammar is still surface-specific.
- The tree still carries a lot of behavior in one file, which makes UI polish risky.

Redesign decision:

- Continue extracting the `TreeItem` pattern with current/focus variants, context-menu targets, and row density.
- Keep root, folder, file, and blank-area menus intentionally different.
- Sidebar actions should remain scoped to workspace navigation. App-wide actions belong in command palette or editor chrome.

### Editor Header And Tab Bar

What works:

- Editor chrome already has a left tab zone and a right tool zone.
- Tab scrolling exists and avoids the worst overflow regression.
- View mode and outline controls stay near the document.

Gaps:

- Tab overflow depends on `TABBAR_WHEEL_BRIDGE_SCRIPT` and class toggles instead of a reusable toolbar contract.
- There is no named primitive for fixed/flexible toolbar zones.
- The close glyph, dirty markers, and scroll affordances need a more polished visual grammar.

Redesign decision:

- Introduce `EditorToolbar`, `ToolbarZone`, and `DocumentTabs` patterns.
- Right-zone controls are fixed and primary; left-zone tabs scroll.
- Add manual smoke cases for many tabs, long filenames, narrow windows, dirty tabs, conflict tabs, and keyboard close.

### Document Area

What works:

- Source, Hybrid, and Preview exist as clear product modes.
- Preview and Hybrid now share more Markdown rendering behavior.
- Large-document policy can disable expensive preview features.

Gaps:

- Hybrid selection and cursor behavior still need architectural attention before it can feel enterprise-grade.
- Preview policy messages use inline strings instead of a shared status/alert primitive.
- CodeMirror runtime styling and app CSS still require careful token alignment.

Redesign decision:

- Treat Hybrid hit testing, selection, and source reveal as editor architecture work, not CSS polish.
- Build Markdown visual tokens only after behavior is stable enough to test.
- Use `InlineAlert` for preview policy and error messages.

### Outline

What works:

- Outline extraction is cached.
- Outline items can navigate in Source, Hybrid, and Preview.
- Active-section sync exists through runtime scripts.

Gaps:

- Active-heading accuracy after clicks and scroll can regress.
- Narrow-window behavior should become an overlay/popover pattern.
- Width and text truncation need to be designed as document navigation, not a side decoration.

Redesign decision:

- Promote outline to a document navigation component.
- Add acceptance checks for click target, immediate active state, scroll sync, keyboard navigation, and narrow-window fallback.

### Status Bar

What works:

- It shows transient status text, word count, and save states.
- It stays under the editor column after the recent layout pass.
- Footer layout now uses the shared `StatusStrip` primitive with left message and right document metadata slots.

Gaps:

- Status priority is implicit.
- Long localized messages can still pressure narrow windows.
- Status tones are limited to default, saving, and attention.

Redesign decision:

- Continue refining `StatusStrip` with compact wrapping and priority ordering.
- Add status tones for error, warning, success, and neutral only when they map to real product states.

### Settings

What works:

- Settings are grouped into General and About.
- Workspace/global save-target confusion is removed from the visible UI.
- Language and theme are global settings and can update without restart.
- The surface now composes shared `SettingsNav`, `SettingsPanel`, `DialogSection`, and `SettingsRow` primitives instead of owning every layout wrapper locally.

Gaps:

- Tag management rows and future helper/error copy still need reusable row contracts.
- Some controls use native select-like behavior through an early `Dropdown` primitive.
- Future independent-window behavior needs startup, icon, theme, localization, and no-flash rules.

Redesign decision:

- Use settings as the first controlled UI redesign surface.
- Continue the split toward `SettingsWindow`, `SettingsNav`, `SettingsPanel`, and `SettingsRow` patterns.
- Keep panel size stable and scroll inside the content region.

### Search, Quick Open, And Command Palette

What works:

- Search, quick open, and command palette all use modal query-first interaction.
- Keyboard navigation exists.
- Command palette has a useful action model.

Gaps:

- Rows now share a reusable `ResultRow` shell, but richer grouping, icons, shortcuts, loading, and error states still need one interaction grammar.
- Empty/loading/error states are inconsistent.
- Grouping, shortcuts, metadata, and highlight behavior should be standardized.

Redesign decision:

- Create one result-row grammar:
  - icon slot
  - primary label
  - secondary path/detail
  - metadata badge
  - optional highlight segments
  - current keyboard row state
- Search loading and errors should use `InlineAlert` or `EmptyState`, not plain strings.

### Trash And Recovery

What works:

- Trash supports restore and empty-trash flows.
- Trash empty state uses `InlineAlert`, and trashed-note rows now use `ResultRow`.
- Recovery supports compare, restore, and discard.
- Recovery empty state uses `InlineAlert`, and draft rows now use `ResultRow`.
- Recovery compare exposes disk-vs-draft state through `ComparePanel`.

Gaps:

- Trash still borrows command-modal layout even though it is a destructive management surface.
- Destructive actions need stronger confirmation and visual hierarchy rules.

Redesign decision:

- Treat trash and recovery as data-safety surfaces.
- Use `DialogSection`, `ResultRow`, `ComparePanel`, `InlineAlert`, and destructive footer variants.
- Require clear empty states and error states because these flows protect user data.

## Shared State Audit

| State | Current Situation | Required Primitive |
| --- | --- | --- |
| Empty | `EmptyState` exists and modal empty text is increasingly covered by `InlineAlert`. | `EmptyState` variants: compact, onboarding, error, data-safety. |
| Loading | Search has text loading; workspace scan has non-unified affordances. | `Skeleton` and inline loading row. |
| Error | Preview/search now use `InlineAlert`; storage and blocking failures still need stronger treatment. | `ErrorState`. |
| Focus | Some buttons and custom controls depend on CSS but lack documented focus contracts. | Primitive-level focus-visible state. |
| Disabled | Exists in places, but disabled reasons are inconsistent. | Disabled state plus helper copy when blocking user progress. |
| Destructive | Danger button exists, but destructive dialogs need stronger structure. | Destructive footer and confirmation pattern. |

## Redesign Order

1. **Settings:** lowest runtime risk, exercises forms, dialog shell, nav rail, controls, and state binding.
2. **Result rows:** build on the shared `ResultRow` shell to align icons, shortcuts, grouping, loading, and error states.
3. **Tree rows:** extract sidebar file/folder/root row behavior.
4. **Editor toolbar:** lock left/right zones and tab overflow into reusable rules.
5. **Status and alerts:** normalize save, preview, search, recovery, and storage messages.
6. **Trash and recovery:** apply data-safety dialog patterns.
7. **Outline:** convert navigation behavior and narrow-window fallback into a stable component.
8. **Markdown surface:** only after Hybrid behavior regressions have stronger coverage.

## QA Checklist

Each redesigned surface must pass:

- Light, dark, and high-contrast visual review.
- Narrow-window review at 1280px, 960px, and 720px wide.
- Keyboard path review: open, navigate, activate, close, escape.
- Focus-visible review for all interactive controls.
- Empty, loading, error, disabled, selected, active, hover, and destructive states.
- Long English and Chinese text review.
- CSS mirror sync for `assets/`, `apps/desktop/assets/`, and `apps/mobile/assets/` when CSS changes.
- `node scripts/report-file-lines.js` and `git diff --check`.
