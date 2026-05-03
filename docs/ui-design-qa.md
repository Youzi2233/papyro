# UI Design QA Checklist

[简体中文](zh-CN/ui-design-qa.md) | [Documentation](README.md)

This checklist turns Phase 3.5 UI work into repeatable review artifacts. It does not require screenshots to live in the repository; store screenshots in the issue, PR, or release notes for the UI task being reviewed.

## When To Use It

Run this checklist for:

- broad visual changes to `assets/main.css`, `assets/styles/*.css`, or mirrored app assets
- new primitives or significant primitive state changes
- editor chrome, sidebar, outline, settings, search, command palette, or modal redesign work
- any change that claims to improve professional polish, responsive layout, dark mode, or accessibility

Small copy-only or bug-only changes can link to this document and explain why the checklist is not needed.

## Required Views

Capture or inspect these views before and after a visual task:

| View | Width / State | What To Verify |
| --- | --- | --- |
| Desktop workspace | 1440 x 920, light theme | Sidebar, editor chrome, tabs, outline, status bar, and primary writing surface feel balanced. |
| Narrow desktop | 900 x 640, light theme | Sidebar, tab overflow, right toolbar actions, outline button, and status bar stay reachable. |
| Dark theme | 1440 x 920, dark theme | Text, icons, borders, active states, and destructive actions remain readable. |
| High contrast | 1440 x 920, high contrast theme | Focus, selected rows, active tabs, and status colors remain distinguishable. |
| Settings window | default size, two sections | Section switch does not resize the window; controls reflect current language and theme. |
| Command/search modal | with results, empty, loading/error when possible | Row density, active state, keyboard focus, and empty/error copy are consistent. |
| File tree | long names, nested folders, blank-area context menu | Icons, truncation, selected state, inline rename, and menu scoping stay clear. |
| Editor document | Source, Hybrid, Preview | Typography, Markdown blocks, code, tables, Mermaid, selection, and cursor behavior do not drift unexpectedly. |

## Interaction Checks

- Keyboard focus is visible on every button, tab, menu item, input, and result row.
- Opening a modal focuses the first meaningful control.
- Closing a modal returns focus to the opener when possible.
- Tab overflow scrolls inside the tab zone and never pushes the right toolbar offscreen.
- Context menus show only actions valid for the target: root, folder, Markdown file, or blank tree area.
- Destructive actions use a clear destructive state and are not icon-only unless the meaning is obvious.
- Disabled controls communicate their state through both styling and the actual disabled attribute.

## Automated Checks

Run the narrowest set that matches the change:

```bash
cargo fmt --check
cargo clippy -p papyro-ui --all-targets --all-features -- -D warnings
cargo test -p papyro-ui
node scripts/check-ui-a11y.js
node scripts/check-ui-primitives.js
node scripts/check-ui-contrast.js
node scripts/report-ui-tokens.js
node scripts/report-file-lines.js
git diff --check
```

For Markdown visual or editor runtime changes, also run:

```bash
node scripts/check-markdown-style-smoke.js
npm --prefix js run build
npm --prefix js test
```

## Review Notes Template

Use this short template in the PR or task notes:

```text
UI Design QA
- Views checked:
- Screenshots attached:
- Keyboard paths checked:
- Dark/high-contrast result:
- Narrow-window result:
- Automated checks:
- Known follow-ups:
```

## Failure Criteria

Do not ship a UI redesign task if:

- primary actions leave the visible viewport at narrow widths
- text overlaps, clips, or becomes unreadable in normal supported themes
- dark mode has low-contrast navigation, settings, or destructive controls
- tab overflow changes the toolbar layout instead of scrolling inside the tab zone
- a new surface duplicates an existing primitive state or control style
- screenshots reveal a demo-like layout that conflicts with the visual brief
