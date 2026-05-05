# Tiptap Release Smoke Checklist

[简体中文](zh-CN/tiptap-release-smoke.md) | [Release QA](release-qa.md) | [Tiptap Migration Plan](tiptap-migration-plan.md)

Use this checklist before merging the `feat-tiptap` branch back to the main release line, tagging a release candidate, or sharing a Tiptap-based desktop build with non-developers.

This checklist is intentionally stricter than the general [Release QA checklist](release-qa.md). It focuses on the editor runtime behaviors most likely to regress during the CodeMirror-to-Tiptap migration.

## Evidence

Fill this section before marking the smoke run complete.

| Field | Value |
| --- | --- |
| Commit SHA |  |
| Tester |  |
| Date |  |
| OS and architecture |  |
| Build command |  |
| Build type | Debug / Release |
| Workspace used |  |
| Result | Pass / Fail |
| Blocking issues |  |

## Preconditions

- [ ] Run the automated baseline from [Development Standards](development-standards.md).
- [ ] Build the editor bundle from source, not from stale generated assets.
- [ ] Launch the desktop app from the same commit recorded above.
- [ ] Use a normal workspace with at least one existing Markdown file.
- [ ] Keep devtools or logs available for runtime errors.
- [ ] Confirm `git status --short` contains no unintended generated drift before and after the run.

## Fixture Document

Create a Markdown note named `tiptap-smoke.md` with representative content. The exact wording can differ, but the note must include these block types:

- H1, H2, and H3 headings.
- English and Chinese paragraphs.
- Bold, italic, inline code, strike, and links.
- Ordered, unordered, and task lists.
- Blockquote and callout.
- Fenced code block with a language.
- Pipe table with alignment.
- Inline math and display math.
- Mermaid fenced block.
- Markdown image syntax that points to a local asset.

Recommended fixture:

````markdown
# Tiptap Smoke

中文输入法测试：这是第一段文字，用来验证光标、选区、撤销和粘贴。

## Formatting

This paragraph has **bold**, *italic*, `inline code`, ~~strike~~, and [Papyro](https://github.com/youzi2233/papyro).

- Alpha item
- Beta item
  - Nested item

1. First ordered item
2. Second ordered item

- [ ] Unchecked task
- [x] Checked task

> [!NOTE]
> Callout content should round-trip through Markdown.

```rust
fn main() {
    println!("hello tiptap");
}
```

| Name | Count | Status |
| :--- | ---: | :---: |
| Alpha | 12 | Ready |
| Beta | 3 | Draft |

Inline math: $a^2 + b^2 = c^2$

$$
\int_0^1 x^2 dx = \frac{1}{3}
$$

```mermaid
flowchart LR
    source["Source"] --> hybrid["Hybrid"]
    hybrid --> preview["Preview"]
```

![Local image](assets/example.png)

## Notes

End of document.
````

## 1. Runtime Launch And Mode Contract

- [ ] Open `tiptap-smoke.md` and confirm the editor starts without an `Editor runtime failed` banner.
- [ ] Confirm the tab title uses the file name.
- [ ] Switch Source -> Hybrid -> Preview -> Hybrid -> Source.
- [ ] Confirm content is not duplicated, reordered, or lost after each mode switch.
- [ ] Confirm scroll position remains close to the same document region when switching modes.
- [ ] Confirm Source remains raw Markdown, Hybrid remains editable rich text, and Preview remains read-only rendered HTML.
- [ ] Confirm no `runtime_error`, panic, or unhandled promise rejection appears in logs.

## 2. Chinese IME, Selection, Paste, And Undo

- [ ] In Hybrid, type Chinese text with an IME inside a paragraph.
- [ ] Confirm composition text is not committed early, duplicated, or moved to the wrong block.
- [ ] Type Chinese text inside a heading, list item, task item, and table cell.
- [ ] Select a word in Hybrid and paste replacement text.
- [ ] Select a phrase in Source and paste replacement text.
- [ ] Select visible text in Hybrid and paste a URL. Confirm it becomes a link when auto-link paste is enabled.
- [ ] Undo and redo each operation with keyboard shortcuts.
- [ ] Confirm undo does not cross unrelated mode switches or restore stale content from before the smoke run.

## 3. Hybrid Block Controls

- [ ] Hover several paragraphs and headings.
- [ ] Confirm the block handle and `+` insert affordance stay reachable while moving the pointer from text to the controls.
- [ ] Click the block handle.
- [ ] Confirm the current block is selected or visibly anchored, and a block action menu opens.
- [ ] Use the block action menu to copy a block as Markdown.
- [ ] Duplicate a block and confirm the duplicate appears directly after the original.
- [ ] Delete a duplicated block and confirm surrounding content stays intact.
- [ ] Use the `+` affordance to open the insertion menu.
- [ ] Insert H1, H2, bullet list, ordered list, task list, quote, code block, callout, math, Mermaid, image placeholder, and table blocks.
- [ ] Confirm each inserted block can be edited immediately without clicking into a hidden source fallback.
- [ ] Drag a block above and below neighboring blocks.
- [ ] Confirm the drop indicator follows pointer movement and the final order is correct.

## 4. Table Editing

- [ ] Insert a table from slash search.
- [ ] Insert another table from the `+` menu table-size picker.
- [ ] Confirm 1x1 through 6x6 table sizes can be chosen.
- [ ] Edit text in several cells.
- [ ] Use Tab and Shift+Tab to move between cells.
- [ ] Use keyboard arrows inside cells and confirm the caret does not jump outside the table unexpectedly.
- [ ] Click row, column, and top-left whole-table handles.
- [ ] Confirm the selected row, column, or table is visually clear.
- [ ] Add a row below from the quick edge control.
- [ ] Add a column to the right from the quick edge control.
- [ ] Add and delete rows from the table toolbar.
- [ ] Add and delete columns from the table toolbar.
- [ ] Toggle header row and header column.
- [ ] Apply left, center, and right alignment to selected cells.
- [ ] Apply and clear cell background colors.
- [ ] Merge cells and then split them.
- [ ] Run table repair when available.
- [ ] Delete the table through the toolbar and confirm no orphan handles remain.
- [ ] Switch to Source and confirm the table remains valid Markdown.
- [ ] Switch back to Hybrid and confirm the table still renders as an editable table.

## 5. Math, Mermaid, Images, And Code

- [ ] Edit inline math in Hybrid and confirm preview/error feedback updates.
- [ ] Edit display math and confirm invalid syntax shows a useful error state instead of breaking the editor.
- [ ] Edit Mermaid source and confirm valid diagrams render.
- [ ] Introduce a Mermaid syntax error and confirm the block shows an error state while the source remains editable.
- [ ] Paste an image from the clipboard and confirm Papyro emits the image paste request path.
- [ ] Drop an image file into Hybrid and confirm the image request path remains stable.
- [ ] Confirm Markdown image syntax remains visible and editable in Source.
- [ ] Edit a fenced code block language and body text.
- [ ] Confirm code block content survives mode switching.

## 6. Outline And Navigation

- [ ] Open the outline panel.
- [ ] Click each heading in Source, Hybrid, and Preview.
- [ ] Confirm the target heading jumps into view without a slow smooth-scroll delay.
- [ ] Scroll Source and confirm active outline heading updates.
- [ ] Scroll Hybrid and confirm active outline heading updates.
- [ ] Scroll Preview and confirm active outline heading updates.
- [ ] Resize the app to a narrow width and repeat a heading click.
- [ ] Confirm toolbar, outline toggle, status bar, and editor content remain visible.

## 7. Save, Dirty State, And Recovery Safety

- [ ] Edit the fixture and confirm the tab becomes dirty.
- [ ] Save and confirm the dirty marker clears only after the write succeeds.
- [ ] Make the target file read-only or otherwise simulate a failed save.
- [ ] Edit again and try to save.
- [ ] Confirm the failed save is visible to the user and the tab remains dirty.
- [ ] Close the dirty tab and confirm the user is warned before losing content.
- [ ] Restart after unsaved edits and confirm recovery draft messaging is understandable.

## 8. OS-Opened Markdown Files And Workspace Sync

- [ ] Configure the test build as the Markdown opener on the machine.
- [ ] Open a `.md` file from outside the current workspace.
- [ ] Confirm Papyro opens a tab for that file.
- [ ] Confirm the sidebar workspace switches to the file parent directory.
- [ ] Open another `.md` file from a different folder.
- [ ] Switch between the two tabs.
- [ ] Confirm the sidebar workspace follows the active tab.
- [ ] Repeat the flow with one dirty tab and confirm workspace switching does not silently discard edits.

## 9. Accessibility And Keyboard Paths

- [ ] Navigate Source, Hybrid, slash menu, block action menu, floating format toolbar, and table toolbar with keyboard where applicable.
- [ ] Confirm Escape closes floating menus without changing content.
- [ ] Confirm Enter activates the highlighted menu item.
- [ ] Confirm outside clicks close floating menus without clearing editor content.
- [ ] Confirm focus returns to the editor after menu actions.
- [ ] Confirm controls have readable labels or tooltips in both English and Chinese UI.

## 10. Pass And Fail Rules

The smoke run fails if any of these occur:

- Editor runtime cannot mount.
- Markdown content is lost, duplicated, or silently corrupted.
- Save failure clears dirty state.
- IME input commits incorrectly in common writing blocks.
- Source/Hybrid/Preview mode switching loses the user's work.
- Table editing leaves orphan handles, broken Markdown, or unreachable cells.
- Floating menus cannot be opened, dismissed, or operated predictably.
- OS-opened files do not synchronize tab and workspace context.

When a failure occurs:

- [ ] Record the exact section and step.
- [ ] Save logs or screenshots.
- [ ] Keep the fixture file if it demonstrates corruption.
- [ ] Open a focused issue or task before continuing release work.
- [ ] Do not mark the migration done until the failing step passes on a later run.
