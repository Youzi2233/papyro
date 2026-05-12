import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Window } from "happy-dom";
import { importBundledModule } from "./helpers/load-esbuild-module.js";

const {
  PapyroTable,
  PAPYRO_TABLE_CELL_RESET_ATTRS,
  PapyroTableCellBackground,
  PapyroTableCellContentActions,
  createPapyroTableExtensions,
  resetSelectedTableCellAttrs,
  selectedTableCellsPlainText,
  setSelectedTableCellTextColor,
  writeTableTextToClipboard,
} = await importBundledModule(
  new URL("../src/tiptap-table.js", import.meta.url),
);
const { createPapyroTextStyleExtensions } = await importBundledModule(
  new URL("../src/tiptap-text-style.js", import.meta.url),
);

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
    [
      "table",
      "tableKit",
      "tableHandleExtension",
      "papyroTableCellBackground",
      "papyroTableCellContentActions",
    ],
  );
  assert.equal(extensions[0].options.resizable, true);
  assert.equal(extensions[0].options.handleWidth, 6);
  assert.equal(extensions[0].options.cellMinWidth, 96);
  assert.equal(extensions[0].options.lastColumnResizable, true);
  assert.equal(extensions[0].options.allowTableNodeSelection, false);
  assert.equal(extensions[1].options.table, false);
  assert.equal(extensions[2].name, "tableHandleExtension");
});

test("Papyro table view exposes official table-node portal containers only", () => {
  const windowRef = new Window();
  const previous = installDomGlobals(windowRef);
  let editor = null;
  try {
    windowRef.document.body.innerHTML = "<div id=\"root\"></div>";
    editor = new Editor({
      element: windowRef.document.querySelector("#root"),
      extensions: [
        StarterKit.configure({ history: false }),
        ...createPapyroTableExtensions(),
      ],
      content:
        "<table><tbody><tr><th>H1</th><th>H2</th></tr><tr><td>A</td><td>B</td></tr></tbody></table>",
    });
    const table = editor.view.dom.querySelector("table");
    const wrapper = table.closest(".tableWrapper");
    const cells = Array.from(table.querySelectorAll("th,td"));
    const docCellPositions = tableCellPositions(editor.state.doc);

    assert.equal(wrapper.dataset.contentType, "table");
    const tableControls = wrapper.querySelector(":scope > .table-controls");
    const selectionOverlayContainer = wrapper.querySelector(
      ":scope > .table-selection-overlay-container",
    );
    assert.ok(tableControls);
    assert.ok(selectionOverlayContainer);
    assert.equal(tableControls.hasAttribute("aria-hidden"), false);
    assert.equal(selectionOverlayContainer.hasAttribute("aria-hidden"), false);
    assert.equal(tableControls.childElementCount, 0);
    assert.equal(selectionOverlayContainer.childElementCount, 0);
    assert.equal(docCellPositions.length, cells.length);
    assert.equal(wrapper.querySelector(".mn-tiptap-table-toolbar"), null);
    assert.equal(wrapper.querySelector(".mn-tiptap-table-context-menu"), null);
    assert.equal(wrapper.querySelector(".mn-tiptap-table-cell-selected"), null);

    editor.commands.setCellSelection({
      anchorCell: docCellPositions[1],
      headCell: docCellPositions[1],
    });

    assert.equal(typeof editor.state.selection.forEachCell, "function");
    assert.equal(wrapper.querySelector(".mn-tiptap-table-cell-selected"), null);
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previous);
  }
});

test("Papyro table Markdown renderer keeps GFM pipe tables when Markdown is lossless", () => {
  const markdown = PapyroTable.config.renderMarkdown(
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", attrs: { align: null }, content: [{ type: "paragraph", content: [{ type: "text", text: "Name" }] }] },
            { type: "tableHeader", attrs: { align: "center" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Status" }] }] },
            { type: "tableHeader", attrs: { align: "right" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Owner" }] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", attrs: { align: null }, content: [{ type: "paragraph", content: [{ type: "text", text: "Papyro" }] }] },
            { type: "tableCell", attrs: { align: "center" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Ready" }] }] },
            { type: "tableCell", attrs: { align: "right" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Team" }] }] },
          ],
        },
      ],
    },
    { renderChildren: (nodes) => nodes.map((node) => node.content?.[0]?.text ?? node.text ?? "").join("") },
  );

  assert.equal(
    markdown,
    "\n| Name   | Status | Owner |\n| ------ | :------: | -----: |\n| Papyro | Ready  | Team  |\n",
  );
  assert.match(markdown, /^\| ------ \| :------: \| -----: \|$/m);
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
});
