# Product Baseline

This baseline defines what Papyro optimizes for during the current rebuild phase. It is intentionally narrow: every near-term change should improve architecture, performance, or writing experience before adding more surface area.

## Current Phase

Papyro is not in a feature expansion phase. The current priority is to make the existing local-first Markdown workflow feel reliable, fast, and professionally designed.

Near-term work should improve at least one of these areas:

- Architecture boundaries: UI, app use cases, storage, platform, editor runtime, and derived document data stay separated.
- Performance: common interactions stay responsive and measurable.
- UI/UX quality: the main writing area becomes visually calm, stable, and document-first.
- Data safety: dirty content, external changes, failed saves, deletes, and crashes remain recoverable or clearly explained.

Feature work can continue only when it supports those goals directly. A new permanent control, mode, panel, or workflow is not acceptable just because it is useful in isolation.

## Main User Path

The primary path is:

1. Open a workspace.
2. Open a Markdown note.
3. Edit the note.
4. Save changes.
5. Search within the workspace.
6. Switch between open tabs.
7. Switch Source, Hybrid, and Preview modes.
8. Close a tab without losing unsaved work.

This path is the default acceptance path for product, performance, and regression checks. Secondary features should not make any step in this path slower, noisier, or harder to understand.

## Desktop First View

The first visible impression should be the document. The shell should help users orient themselves, then get out of the way.

The desktop first view should follow these rules:

- The central editor is the largest and calmest visual area.
- Sidebar, tabbar, header, and status bar are supporting chrome.
- Empty states should guide users to open or create a note without becoming a landing page.
- Low-frequency tools belong in command palette, quick open, context menus, settings, or temporary panels.
- Visual weight should not accumulate around management features like tags, search filters, trash, or settings.

If a screenshot reads as a tool dashboard before it reads as a writing space, the UI is failing this baseline.

## Visual Direction

Papyro should feel restrained, clear, professional, and comfortable for long reading sessions.

The visual direction is:

- Low decoration and low theme theatrics.
- Stable contrast in both light and dark themes.
- Clear hierarchy without heavy cards, nested panels, or dramatic shadows in the editor.
- Familiar desktop software behavior over experimental presentation.
- Neutral enough for broad user acceptance across different ages, languages, and operating systems.

Accent color is for focus, selection, state, and primary actions. It should not dominate the page.

## Hybrid Experience Target

Hybrid mode should move toward a Typora-like single-column writing experience. It should not behave like a traditional source editor glued to a preview pane.

The target behavior is:

- Source text remains editable and truthful.
- Decorations help reading but do not change document content.
- Current, nearby, and distant blocks can use different decoration levels.
- Input safety wins over visual cleverness, especially during IME composition.
- Source, Hybrid, and Preview share document width, typography, and rhythm.

Hybrid work must wait for document pipeline, editor runtime, and performance boundaries when a change would otherwise add brittle decoration logic.

## Review Questions

Before accepting a change, answer these questions:

- Does it improve the main user path?
- Does it keep the document as the first visual priority?
- Does it avoid expanding permanent UI chrome?
- Does it preserve dirty content and recoverability?
- Does it respect the four runtime lanes: Workspace, Chrome, Document, and Editor runtime?
- Does it include a test, trace, or explicit manual acceptance path?
