import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Window } from "happy-dom";

import {
  PapyroTable,
  PAPYRO_TABLE_CELL_RESET_ATTRS,
  PapyroTableCellBackground,
  PapyroTableCellContentActions,
  createPapyroTableExtensions,
  duplicateSelectedTableColumns,
  duplicateSelectedTableRows,
  moveSelectedTableAxis,
  resetSelectedTableCellAttrs,
  selectedTableCellsPlainText,
  setSelectedTableCellTextColor,
  sortSelectedTableColumns,
  sortSelectedTableRows,
  writeTableTextToClipboard,
} from "../src/tiptap-table.js";
import {
  tableSelectionGrid,
  tableSelectionState,
} from "../src/tiptap-table-geometry.js";
import { applyTableCellVisualState } from "../src/tiptap-table-chrome-model.js";
import { createPapyroTextStyleExtensions } from "../src/tiptap-text-style.js";

function installDomGlobals(windowRef) {
  const previous = new Map();
  for (const [name, value] of Object.entries({
    window: windowRef,
    document: windowRef.document,
    navigator: windowRef.navigator,
    HTMLElement: windowRef.HTMLElement,
    Element: windowRef.Element,
    Document: windowRef.Document,
    Node: windowRef.Node,
    DOMParser: windowRef.DOMParser,
    getComputedStyle: windowRef.getComputedStyle.bind(windowRef),
    innerHeight: 900,
    innerWidth: 1200,
  })) {
    previous.set(name, {
      exists: Object.prototype.hasOwnProperty.call(globalThis, name),
      value: globalThis[name],
    });
    globalThis[name] = value;
  }
  return previous;
}

function restoreDomGlobals(previous) {
  for (const [name, record] of previous.entries()) {
    if (record.exists) {
      globalThis[name] = record.value;
    } else {
      delete globalThis[name];
    }
  }
}

function tableCellPositions(doc) {
  const positions = [];
  doc?.descendants?.((node, pos) => {
    if (node?.type?.name === "tableCell" || node?.type?.name === "tableHeader") {
      positions.push(pos);
    }
  });
  return positions;
}

function tableJsonCells(editor) {
  return editor.getJSON().content[0].content.flatMap((row) => row.content);
}

test("Papyro table extensions expose the TableKit boundary", () => {
  const extensions = createPapyroTableExtensions();

  assert.deepEqual(
    extensions.map((extension) => extension.name),
    ["table", "tableKit", "papyroTableCellBackground", "papyroTableCellContentActions"],
  );
  assert.equal(extensions[0].options.resizable, true);
  assert.equal(extensions[0].options.handleWidth, 6);
  assert.equal(extensions[0].options.cellMinWidth, 96);
  assert.equal(extensions[0].options.lastColumnResizable, true);
  assert.equal(extensions[0].options.allowTableNodeSelection, false);
  assert.equal(extensions[1].options.table, false);
});

test("Papyro table chrome resolves DOM cells to selectable ProseMirror cell positions", () => {
  const windowRef = new Window();
  const previous = installDomGlobals(windowRef);
  try {
    windowRef.document.body.innerHTML = "<div id=\"root\"></div>";
    const editor = new Editor({
      element: windowRef.document.querySelector("#root"),
      extensions: [
        StarterKit.configure({ history: false }),
        ...createPapyroTableExtensions(),
      ],
      content:
        "<table><tbody><tr><th>H1</th><th>H2</th></tr><tr><td>A</td><td>B</td></tr></tbody></table>",
    });
    const table = editor.view.dom.querySelector("table");
    const cells = Array.from(table.querySelectorAll("th,td"));
    const docCellPositions = tableCellPositions(editor.state.doc);
    const domCellPositions = cells.map((cell) => editor.view.posAtDOM(cell, 0));
    const grid = tableSelectionGrid(table, editor.view);

    assert.deepEqual(
      grid.flatMap((row) => row.cells.map((cell) => cell.pos)),
      docCellPositions,
    );
    assert.notDeepEqual(domCellPositions, docCellPositions);

    editor.commands.setCellSelection({
      anchorCell: grid[0].cells[1].pos,
      headCell: grid[0].cells[1].pos,
    });
    const selection = tableSelectionState(editor.state.selection, grid);
    applyTableCellVisualState({ table, grid, selection, cell: cells[1] });

    assert.equal(selection.kind, "cell");
    assert.deepEqual([...selection.positions], [grid[0].cells[1].pos]);
    assert.equal(cells[1].classList.contains("mn-tiptap-table-cell-selected"), true);
    assert.equal(cells[1].classList.contains("mn-tiptap-table-cell-active"), true);
  } finally {
    restoreDomGlobals(previous);
  }
});

test("Papyro table Markdown renderer keeps pipe tables when Markdown is lossless", () => {
  const markdown = PapyroTable.config.renderMarkdown(
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", attrs: { align: null }, content: [{ type: "paragraph", content: [{ type: "text", text: "Name" }] }] },
            { type: "tableHeader", attrs: { align: "center" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Status" }] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", attrs: { align: null }, content: [{ type: "paragraph", content: [{ type: "text", text: "Papyro" }] }] },
            { type: "tableCell", attrs: { align: "center" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Ready" }] }] },
          ],
        },
      ],
    },
    { renderChildren: (nodes) => nodes.map((node) => node.content?.[0]?.text ?? node.text ?? "").join("") },
  );

  assert.equal(
    markdown,
    "\n| Name   | Status |\n| ------ | :------: |\n| Papyro | Ready  |\n",
  );
});

test("Papyro table Markdown renderer falls back to HTML when table attributes would be lost", () => {
  const markdown = PapyroTable.config.renderMarkdown(
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              attrs: {
                align: "center",
                backgroundColor: "rgba(245, 158, 11, 0.16)",
                colspan: 2,
                rowspan: 1,
              },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Title" }] }],
            },
          ],
        },
      ],
    },
    { renderChildren: (nodes) => nodes.map((node) => node.content?.[0]?.text ?? node.text ?? "").join("") },
  );

  assert.equal(
    markdown,
    '<table><tbody><tr><th data-cell-background="rgba(245, 158, 11, 0.16)" colspan="2" style="text-align: center; background-color: rgba(245, 158, 11, 0.16)">Title</th></tr></tbody></table>',
  );
});

test("Papyro table cell background extension adds cell attributes", () => {
  const [config] = PapyroTableCellBackground.config.addGlobalAttributes();
  const background = config.attributes.backgroundColor;
  const element = {
    style: { backgroundColor: "rgb(245, 158, 11)" },
    getAttribute(name) {
      return name === "data-cell-background" ? "rgba(245, 158, 11, 0.16)" : null;
    },
  };

  assert.deepEqual(config.types, ["tableCell", "tableHeader"]);
  assert.equal(background.default, null);
  assert.equal(background.parseHTML(element), "rgba(245, 158, 11, 0.16)");
  assert.deepEqual(background.renderHTML({ backgroundColor: "rgba(16, 185, 129, 0.14)" }), {
    "data-cell-background": "rgba(16, 185, 129, 0.14)",
    style: "background-color: rgba(16, 185, 129, 0.14)",
  });
  assert.deepEqual(background.renderHTML({ backgroundColor: null }), {});
});

test("Papyro table content actions expose resettable style attributes", () => {
  assert.deepEqual(PAPYRO_TABLE_CELL_RESET_ATTRS, ["align", "backgroundColor"]);
});

test("Papyro table content actions clear selected cell contents through ProseMirror tables", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [StarterKit, ...createPapyroTableExtensions()],
      content:
        "<table><tbody><tr><td>Alpha</td><td>Beta</td></tr><tr><td>Gamma</td><td>Delta</td></tr></tbody></table>",
      injectCSS: false,
    });
    const [anchorCell, headCell] = tableCellPositions(editor.state.doc);

    assert.equal(typeof editor.commands.clearSelectedTableCells, "function");
    assert.equal(typeof editor.commands.setSelectedTableCellTextColor, "function");
    assert.equal(
      editor.commands.setCellSelection({ anchorCell, headCell }),
      true,
    );
    assert.equal(editor.commands.clearSelectedTableCells(), true);
    assert.deepEqual(
      Array.from(editor.view.dom.querySelectorAll("td,th")).map((cell) => cell.textContent),
      ["", "", "Gamma", "Delta"],
    );
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions color selected cell text through textStyle marks", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [
        StarterKit,
        ...createPapyroTextStyleExtensions(),
        ...createPapyroTableExtensions(),
      ],
      content:
        "<table><tbody><tr><td>Alpha</td><td>Beta</td></tr></tbody></table>",
      injectCSS: false,
    });
    const [anchorCell, headCell] = tableCellPositions(editor.state.doc);

    editor.commands.setCellSelection({ anchorCell, headCell });
    assert.equal(editor.commands.setSelectedTableCellTextColor("var(--mn-accent)"), true);

    const [firstCell, secondCell] = editor.getJSON().content[0].content[0].content;
    assert.deepEqual(firstCell.content[0].content[0].marks, [
      {
        type: "textStyle",
        attrs: Object.assign(Object.create(null), { color: "var(--mn-accent)" }),
      },
    ]);
    assert.deepEqual(secondCell.content[0].content[0].marks, [
      {
        type: "textStyle",
        attrs: Object.assign(Object.create(null), { color: "var(--mn-accent)" }),
      },
    ]);

    assert.equal(editor.commands.setSelectedTableCellTextColor(null), true);
    const [clearedCell] = editor.getJSON().content[0].content[0].content;
    assert.equal(clearedCell.content[0].content[0].marks, undefined);
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions serialize selected cells for clipboard use", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [StarterKit, ...createPapyroTableExtensions()],
      content:
        "<table><tbody><tr><td>Alpha</td><td>Beta <strong>two</strong></td></tr><tr><td>Gamma</td><td>Delta<br>line</td></tr></tbody></table>",
      injectCSS: false,
    });
    const [anchorCell, , , headCell] = tableCellPositions(editor.state.doc);

    editor.commands.setCellSelection({ anchorCell, headCell });

    assert.equal(
      selectedTableCellsPlainText(editor.state),
      "Alpha\tBeta two\nGamma\tDelta line",
    );
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions copy selected cell text without mutating the document", async () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  const writes = [];
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [
        StarterKit,
        ...createPapyroTableExtensions({
          writeText: async (text) => writes.push(text),
        }),
      ],
      content:
        "<table><tbody><tr><td>Alpha</td><td>Beta</td></tr></tbody></table>",
      injectCSS: false,
    });
    const [anchorCell, headCell] = tableCellPositions(editor.state.doc);

    editor.commands.setCellSelection({ anchorCell, headCell });
    const before = editor.getJSON();
    assert.equal(editor.commands.copySelectedTableCells(), true);
    await Promise.resolve();

    assert.deepEqual(writes, ["Alpha\tBeta"]);
    assert.deepEqual(editor.getJSON(), before);
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions move selected rows and columns through ProseMirror tables", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [StarterKit, ...createPapyroTableExtensions()],
      content:
        "<table><tbody><tr><td>A1</td><td>A2</td></tr><tr><td>B1</td><td>B2</td></tr><tr><td>C1</td><td>C2</td></tr></tbody></table>",
      injectCSS: false,
    });
    const [, , secondRowFirstCell, secondRowSecondCell] = tableCellPositions(editor.state.doc);

    editor.commands.setCellSelection({
      anchorCell: secondRowFirstCell,
      headCell: secondRowSecondCell,
    });
    assert.equal(editor.commands.moveSelectedTableRow("up"), true);
    assert.deepEqual(
      Array.from(editor.view.dom.querySelectorAll("td,th")).map((cell) => cell.textContent),
      ["B1", "B2", "A1", "A2", "C1", "C2"],
    );

    const [, secondColumnTopCell, , , , secondColumnBottomCell] =
      tableCellPositions(editor.state.doc);
    editor.commands.setCellSelection({
      anchorCell: secondColumnTopCell,
      headCell: secondColumnBottomCell,
    });
    assert.equal(editor.commands.moveSelectedTableColumn("left"), true);
    assert.deepEqual(
      Array.from(editor.view.dom.querySelectorAll("td,th")).map((cell) => cell.textContent),
      ["B2", "B1", "A2", "A1", "C2", "C1"],
    );
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions duplicate selected rows and columns", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [StarterKit, ...createPapyroTableExtensions()],
      content:
        "<table><tbody><tr><td>A1</td><td>A2</td></tr><tr><td>B1</td><td>B2</td></tr></tbody></table>",
      injectCSS: false,
    });
    const [, , secondRowFirstCell, secondRowSecondCell] = tableCellPositions(editor.state.doc);

    editor.commands.setCellSelection({
      anchorCell: secondRowFirstCell,
      headCell: secondRowSecondCell,
    });
    assert.equal(editor.commands.duplicateSelectedTableRow(), true);
    assert.equal(editor.state.selection.isRowSelection?.(), true);
    assert.deepEqual(
      Array.from(editor.view.dom.querySelectorAll("td,th")).map((cell) => cell.textContent),
      ["A1", "A2", "B1", "B2", "B1", "B2"],
    );

    const [, secondColumnTopCell, , , , secondColumnBottomCell] =
      tableCellPositions(editor.state.doc);
    editor.commands.setCellSelection({
      anchorCell: secondColumnTopCell,
      headCell: secondColumnBottomCell,
    });
    assert.equal(editor.commands.duplicateSelectedTableColumn(), true);
    assert.equal(editor.state.selection.isColSelection?.(), true);
    assert.deepEqual(
      Array.from(editor.view.dom.querySelectorAll("td,th")).map((cell) => cell.textContent),
      ["A1", "A2", "A2", "B1", "B2", "B2", "B1", "B2", "B2"],
    );
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions sort rows with header rows fixed", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [StarterKit, ...createPapyroTableExtensions()],
      content:
        "<table><tbody><tr><th>Name</th><th>Priority</th><th>Owner</th></tr><tr><td>Gamma</td><td>2</td><td>Bea</td></tr><tr><td>Alpha</td><td>10</td><td>Dee</td></tr><tr><td></td><td>1</td><td>Cal</td></tr></tbody></table>",
      injectCSS: false,
    });

    const cells = tableCellPositions(editor.state.doc);
    editor.commands.setCellSelection({
      anchorCell: cells[0],
      headCell: cells.at(-3),
    });
    assert.equal(editor.commands.sortSelectedTableRows("asc"), true);
    assert.deepEqual(
      Array.from(editor.view.dom.querySelectorAll("td,th")).map((cell) => cell.textContent),
      [
        "Name",
        "Priority",
        "Owner",
        "Alpha",
        "10",
        "Dee",
        "Gamma",
        "2",
        "Bea",
        "",
        "1",
        "Cal",
      ],
    );
    assert.equal(editor.state.selection.isColSelection?.(), true);
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions sort columns with header columns fixed", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [StarterKit, ...createPapyroTableExtensions()],
      content:
        "<table><tbody><tr><th>Name</th><td>Beta</td><td>Alpha</td><td></td></tr><tr><th>Priority</th><td>2</td><td>1</td><td>3</td></tr></tbody></table>",
      injectCSS: false,
    });
    const cells = tableCellPositions(editor.state.doc);

    editor.commands.setCellSelection({
      anchorCell: cells[0],
      headCell: cells[3],
    });
    assert.equal(editor.commands.sortSelectedTableColumns("asc"), true);
    assert.deepEqual(
      Array.from(editor.view.dom.querySelectorAll("td,th")).map((cell) => cell.textContent),
      ["Name", "Alpha", "Beta", "", "Priority", "1", "2", "3"],
    );
    assert.equal(editor.state.selection.isRowSelection?.(), true);
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions sort selected axes without header columns", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [StarterKit, ...createPapyroTableExtensions()],
      content:
        "<table><tbody><tr><td>Beta</td><td>Alpha</td><td></td></tr><tr><td>2</td><td>1</td><td>3</td></tr></tbody></table>",
      injectCSS: false,
    });
    const cells = tableCellPositions(editor.state.doc);

    editor.commands.setCellSelection({
      anchorCell: cells[0],
      headCell: cells[2],
    });
    assert.equal(editor.commands.sortSelectedTableColumns("asc"), true);
    assert.deepEqual(
      Array.from(editor.view.dom.querySelectorAll("td,th")).map((cell) => cell.textContent),
      ["Alpha", "Beta", "", "1", "2", "3"],
    );
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions style selected rows and columns", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [
        StarterKit,
        ...createPapyroTextStyleExtensions(),
        ...createPapyroTableExtensions(),
      ],
      content:
        "<table><tbody><tr><td>A1</td><td>A2</td></tr><tr><td>B1</td><td>B2</td></tr></tbody></table>",
      injectCSS: false,
    });
    const [rowStart, rowEnd, , secondColumnEnd] = tableCellPositions(editor.state.doc);

    editor.commands.setCellSelection({ anchorCell: rowStart, headCell: rowEnd });
    assert.equal(editor.commands.setCellAttribute("backgroundColor", "rgba(16, 185, 129, 0.14)"), true);

    let [firstRowFirstCell, firstRowSecondCell, secondRowFirstCell, secondRowSecondCell] =
      tableJsonCells(editor);
    assert.equal(firstRowFirstCell.attrs.backgroundColor, "rgba(16, 185, 129, 0.14)");
    assert.equal(firstRowSecondCell.attrs.backgroundColor, "rgba(16, 185, 129, 0.14)");
    assert.equal(secondRowFirstCell.attrs.backgroundColor, null);
    assert.equal(secondRowSecondCell.attrs.backgroundColor, null);

    editor.commands.setCellSelection({ anchorCell: rowEnd, headCell: secondColumnEnd });
    assert.equal(editor.commands.setSelectedTableCellTextColor("var(--mn-danger)"), true);

    [firstRowFirstCell, firstRowSecondCell, secondRowFirstCell, secondRowSecondCell] =
      tableJsonCells(editor);
    assert.equal(firstRowFirstCell.content[0].content[0].marks, undefined);
    assert.deepEqual(firstRowSecondCell.content[0].content[0].marks, [
      {
        type: "textStyle",
        attrs: Object.assign(Object.create(null), { color: "var(--mn-danger)" }),
      },
    ]);
    assert.equal(secondRowFirstCell.content[0].content[0].marks, undefined);
    assert.deepEqual(secondRowSecondCell.content[0].content[0].marks, [
      {
        type: "textStyle",
        attrs: Object.assign(Object.create(null), { color: "var(--mn-danger)" }),
      },
    ]);
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions reject edge moves", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [StarterKit, ...createPapyroTableExtensions()],
      content:
        "<table><tbody><tr><td>A1</td><td>A2</td></tr><tr><td>B1</td><td>B2</td></tr></tbody></table>",
      injectCSS: false,
    });
    const [firstCell, secondCell] = tableCellPositions(editor.state.doc);

    editor.commands.setCellSelection({ anchorCell: firstCell, headCell: secondCell });
    assert.equal(editor.commands.moveSelectedTableRow("up"), false);
    assert.equal(editor.commands.moveSelectedTableColumn("left"), false);
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions can reset selected cell attributes while clearing contents", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [StarterKit, ...createPapyroTableExtensions()],
      content:
        "<table><tbody><tr><td style=\"text-align: right; background-color: rgba(245, 158, 11, 0.16)\">Alpha</td><td>Beta</td></tr></tbody></table>",
      injectCSS: false,
    });
    const [anchorCell] = tableCellPositions(editor.state.doc);

    assert.equal(
      editor.commands.setCellSelection({ anchorCell, headCell: anchorCell }),
      true,
    );
    assert.equal(editor.commands.clearSelectedTableCells({ resetAttrs: true }), true);

    const [firstCell, secondCell] = editor.getJSON().content[0].content[0].content;
    assert.equal(firstCell.content[0].content, undefined);
    assert.equal(firstCell.attrs.align, null);
    assert.equal(firstCell.attrs.backgroundColor, null);
    assert.equal(secondCell.content[0].content[0].text, "Beta");
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions reset selected styles without clearing text", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [
        StarterKit,
        ...createPapyroTextStyleExtensions(),
        ...createPapyroTableExtensions(),
      ],
      content:
        "<table><tbody><tr><td style=\"text-align: center; background-color: rgba(59, 130, 246, 0.14)\">Alpha</td></tr></tbody></table>",
      injectCSS: false,
    });
    const [anchorCell] = tableCellPositions(editor.state.doc);

    editor.commands.setCellSelection({ anchorCell, headCell: anchorCell });
    assert.equal(editor.commands.setSelectedTableCellTextColor("var(--mn-danger)"), true);
    assert.equal(editor.commands.resetSelectedTableCellAttrs(), true);

    const [firstCell] = editor.getJSON().content[0].content[0].content;
    assert.equal(firstCell.content[0].content[0].text, "Alpha");
    assert.equal(firstCell.content[0].content[0].marks, undefined);
    assert.equal(firstCell.attrs.align, null);
    assert.equal(firstCell.attrs.backgroundColor, null);
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});

test("Papyro table content actions expose the expected command name", () => {
  const commands = PapyroTableCellContentActions.config.addCommands();

  assert.equal(typeof commands.clearSelectedTableCells, "function");
  assert.equal(typeof commands.resetSelectedTableCellAttrs, "function");
  assert.equal(typeof commands.setSelectedTableCellTextColor, "function");
  assert.equal(typeof commands.copySelectedTableCells, "function");
  assert.equal(typeof commands.moveSelectedTableRow, "function");
  assert.equal(typeof commands.moveSelectedTableColumn, "function");
  assert.equal(typeof commands.duplicateSelectedTableRow, "function");
  assert.equal(typeof commands.duplicateSelectedTableColumn, "function");
  assert.equal(typeof commands.sortSelectedTableRows, "function");
  assert.equal(typeof commands.sortSelectedTableColumns, "function");
});

test("Papyro table clipboard writer reports unavailable and successful writes", async () => {
  const writes = [];

  assert.equal(await writeTableTextToClipboard(""), false);
  assert.equal(await writeTableTextToClipboard("Alpha"), false);
  assert.equal(
    await writeTableTextToClipboard("Alpha", async (text) => writes.push(text)),
    true,
  );
  assert.deepEqual(writes, ["Alpha"]);
});

test("Papyro table content actions reject non-cell selections when resetting attributes", () => {
  assert.equal(resetSelectedTableCellAttrs(null, null), false);
  assert.equal(setSelectedTableCellTextColor(null, null, null, "var(--mn-accent)"), false);
  assert.equal(moveSelectedTableAxis(null, null, "row", "up"), false);
  assert.equal(duplicateSelectedTableRows(null, null), false);
  assert.equal(duplicateSelectedTableColumns(null, null), false);
  assert.equal(sortSelectedTableRows(null, null), false);
  assert.equal(sortSelectedTableColumns(null, null), false);
});
