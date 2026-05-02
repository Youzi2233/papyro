# Papyro UI Visual Brief

[简体中文](zh-CN/ui-visual-brief.md) | [Documentation](README.md)

This brief defines the visual direction for the Phase 3.5 UI/UX redesign. Use it before changing app chrome, component primitives, settings, editor chrome, or Markdown surfaces.

It builds on [UI/UX Benchmark And Redesign Decisions](ui-ux-benchmark.md) and [Theme System](theme-system.md).

## Design Position

Papyro should feel like a precise desktop writing instrument:

- calm enough for long writing sessions
- structured enough for large local workspaces
- professional enough for engineering and product documentation
- native enough for desktop habits
- editorial enough that Markdown documents feel worth reading

The aesthetic name is **disciplined utility**: quiet, exact, slightly editorial, and never decorative for its own sake.

Avoid:

- marketing-page composition inside the app
- oversized cards, noisy shadows, and generic gradients
- random accent colors for visual excitement
- AI-like filler copy or UI text explaining obvious controls
- one-off styling that cannot survive dark mode or narrow windows

## Layout Rhythm

Use compact, repeatable structure.

| Layer | Target |
| --- | --- |
| App shell | Stable two-zone layout: navigation chrome and writing surface. |
| Sidebar | Dense, scannable workspace navigator with clear selected and focus states. |
| Editor header | Fixed action zones: tab overflow, document state, view mode, outline, overflow actions. |
| Document canvas | Quiet, readable, and wider than the current cramped feel, but not full-window prose. |
| Dialogs/settings | Fixed shell, one-column rows, predictable left navigation, no height jumps. |

Spacing rules:

- Base spacing should follow a 4px grid.
- Primary control height: 30-32px.
- Compact row height: 28-30px.
- Tree row height: 28px desktop, 32px touch/mobile.
- Dialog row vertical gap: 14-18px.
- Page or panel padding: 16-24px depending on density.
- Avoid nested cards. Use sections, separators, and clear headings instead.

## Typography

Typography should be system-first and stable across platforms.

| Role | Direction |
| --- | --- |
| UI font | System UI stack first: Segoe UI, SF Pro, PingFang SC, Microsoft YaHei UI, system-ui. |
| Markdown body | User configurable, defaulting to system sans for mixed English/CJK documents. |
| Reading serif | Optional preset for long-form reading, not the default for app chrome. |
| Code font | Cascadia Code, JetBrains Mono, SF Mono, Consolas, monospace fallback. |
| Display text | Use sparingly. Inside the app, headings should be compact and functional. |

Rules:

- No negative letter spacing.
- Do not scale font size by viewport width.
- Keep app chrome labels in the 12-14px range.
- Markdown body default should stay readable at 16-17px with 1.65-1.75 line height.
- CJK copy needs enough line height and should not use condensed UI treatment.

## Color Roles

Color should explain state and hierarchy.

| Role | Usage |
| --- | --- |
| Canvas | Markdown writing area and Preview surface. Usually white or near-white in light mode. |
| Chrome | Sidebar, header, status bar, modal shell, command palette. Slightly separated from canvas. |
| Control | Buttons, inputs, selects, segmented controls, menus. |
| Border | Structure, dividers, row separation, and focus-visible fallback. |
| Accent | Current mode, active document, selected navigation, primary action. |
| Selection | Text selection and Hybrid block selection. Must be consistent across CodeMirror and native surfaces. |
| Status | Danger, warning, success, saving, unsaved. Never overload accent for warnings. |

Rules:

- Prefer semantic tokens over raw hex values.
- Raw colors belong in palette definitions, not component CSS.
- Accent should be restrained. Do not use accent as ordinary body text.
- Dark mode must keep selected/focused rows visible without high-glare fills.
- High contrast mode must preserve borders, focus, and selection even when shadows disappear.

## Surface And Elevation

Papyro should use subtle elevation.

| Surface | Treatment |
| --- | --- |
| App background | Flat, low contrast. |
| Sidebar | Slightly tinted chrome surface, no heavy shadow. |
| Editor canvas | Clean surface, strong readability, minimal decoration. |
| Floating menus | Small shadow plus border. |
| Modal windows | Clear border, modest shadow, fixed size where practical. |
| Toast/message | Informational, compact, non-blocking unless destructive. |

Border radius:

- Controls: 6-8px.
- Menus and popovers: 8px.
- Dialogs: 8px.
- Cards only when representing repeated items or framed tools.
- Avoid pill shapes except for badges, compact toggles, or clearly rounded affordances.

## Iconography

Icons should be familiar and semantic.

- Use common symbols for sidebar, outline, search, settings, theme, file, folder, trash, plus, rename, reveal, and external open.
- Do not use custom text glyphs when a standard icon would be clearer.
- Icon button size should be stable, usually 28-32px.
- Pair icons with text for destructive, unusual, or high-cost actions.
- Icons should not be the only indicator of selected state.

## Component State Contract

Every reusable component must define these states before broad adoption:

- default
- hover
- active/pressed
- selected/current
- disabled
- focus-visible
- loading, when applicable
- destructive, when applicable
- validation error, when applicable
- compact density, when applicable

Components that need this contract first:

- `Button`
- `IconButton`
- `Input` and `TextInput`
- `Select`
- `SegmentedControl`
- `Switch`
- `Dialog/Modal`
- `Popover`
- `DropdownMenu`
- `ContextMenu`
- `Tooltip`
- `Toast/Message`
- `Tabs`
- `SidebarItem`
- `TreeItem`
- `Toolbar`
- `EmptyState`
- `Skeleton`

## Writing Surface

Markdown surfaces must feel mature before more visual decoration is added.

Rules:

- Preview and Hybrid share Markdown typography tokens.
- Headings should create rhythm without huge vertical jumps.
- Lists should use normal text color unless the item itself is a link or status.
- Code blocks need readable contrast, visible selection, and accurate cursor hit testing.
- Inline code and links should not accidentally trigger source reveal on normal clicks.
- Tables need clear cell boundaries without looking like spreadsheets.
- Mermaid and math error states should be readable and compact.
- Selection backgrounds must cover glyph runs, not random line-height gaps.

## Motion

Motion should be functional:

- Use fast transitions for hover, focus, menus, and small state changes.
- Avoid slow smooth scrolling for outline jumps; direct jumps are better for document navigation.
- Do not animate layout height changes in settings or editor chrome.
- Respect reduced-motion preferences when available.

Recommended durations:

- Hover/focus: 90-120ms.
- Menu/popover: 120-160ms.
- Modal opacity: 140-180ms.
- No large decorative page entrance animations inside the desktop app.

## Copy Tone

Copy should be plain and professional.

- Prefer action verbs: Open, Rename, Move to trash, Restore.
- Avoid explaining controls that are already obvious.
- Use calm status text for save and recovery states.
- Chinese copy should be natural UI Chinese, not literal English translation.
- Keep Papyro as the product name in every language.

## Implementation Rules

- New visual work should start with tokens, then primitives, then product surfaces.
- If a CSS value appears in three places, promote it to a token or component class.
- Do not add a new primitive without documenting its required states.
- Do not redesign multiple surfaces in one commit unless they are mechanically coupled.
- Every broad UI change needs narrow-window and dark-mode verification.
