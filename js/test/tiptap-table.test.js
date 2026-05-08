import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Window } from "happy-dom";

import {
  PAPYRO_TABLE_CELL_RESET_ATTRS,
  PapyroTableCellBackground,
  PapyroTableCellContentActions,
  createPapyroTableExtensions,
  moveSelectedTableAxis,
  resetSelectedTableCellAttrs,
  selectedTableCellsPlainText,
  setSelectedTableCellTextColor,
  writeTableTextToClipboard,
} from "../src/tiptap-table.js";
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

test("Papyro table extensions expose the TableKit boundary", () => {
  const extensions = createPapyroTableExtensions();

  assert.deepEqual(
    extensions.map((extension) => extension.name),
    ["tableKit", "papyroTableCellBackground", "papyroTableCellContentActions"],
  );
  assert.equal(extensions[0].options.table.resizable, true);
  assert.equal(extensions[0].options.table.handleWidth, 6);
  assert.equal(extensions[0].options.table.cellMinWidth, 96);
  assert.equal(extensions[0].options.table.lastColumnResizable, true);
  assert.equal(extensions[0].options.table.allowTableNodeSelection, false);
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
});
