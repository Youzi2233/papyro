# UI Design Baseline

This document defines the visual baseline for Papyro's desktop writing experience. It translates the product baseline into concrete UI rules that future CSS, component, and layout work can be reviewed against.

## Visual Principles

Papyro should feel restrained, clear, professional, durable, and low-decoration.

The interface should not compete with the note. It should make the current document, cursor, selection, save state, and workspace context easy to understand without creating a dashboard-like first impression.

Use these principles for review:

- Restraint: remove visual elements that do not help writing, navigation, or recovery.
- Clarity: every visible control should have a clear role and stable label or tooltip.
- Professional tone: prefer quiet hierarchy over playful decoration or strong theme personality.
- Durability: choose spacing, contrast, and type that still feel comfortable after long sessions.
- Low decoration: avoid ornamental gradients, heavy shadows, nested cards, and decorative backgrounds.

## Theme Direction

Light and dark themes should optimize for reading comfort and stable hierarchy.

Theme rules:

- Backgrounds should separate workspace chrome from document content without strong color casts.
- Accent color is for interaction state, focus, selection, and primary actions.
- The editor surface should not depend on large decorative fills, image backgrounds, or dramatic contrast.
- Borders and dividers should be quiet enough to disappear during writing, but visible enough for scanning.
- Error, danger, saving, dirty, and conflict states should be clear without dominating the shell.

Strong "skin" themes are outside the current phase. They can return later only after the default professional baseline is stable.

## Document Priority

The document is the primary visual object.

The shell should support this by following these rules:

- The central document area gets the most space and the lowest visual noise.
- The editor should avoid heavy card treatment, stacked frames, and strong shadows.
- Sidebar, tabbar, header, status bar, and modal surfaces are secondary.
- Management tools should be visually quieter than writing and reading surfaces.
- Empty states should be short and actionable.

If the first glance lands on controls, panels, badges, or decoration before the document, the layout needs correction.

## Management UI

Workspace management is necessary, but it should not become the product's visual identity.

Management UI should follow these rules:

- Keep persistent chrome sparse.
- Move low-frequency actions to command palette, quick open, context menus, or modals.
- Keep tabbar focused on open documents, active tab, dirty state, conflict state, and close/save affordances.
- Keep status bar focused on useful document and save state, not miscellaneous internal details.
- Keep settings, tags, trash, recovery, and search management in temporary panels or modals.

## Acceptance Checks

Use these checks before accepting UI work:

- The editor remains the calmest and most prominent region.
- Light and dark themes preserve text comfort, cursor visibility, and selection contrast.
- Chrome changes do not create new permanent controls without a main-path reason.
- Component styling uses shared tokens when a token exists.
- Any new color, radius, shadow, or spacing value has a clear reason.
- A screenshot can be explained as a writing tool, not a component showcase.
