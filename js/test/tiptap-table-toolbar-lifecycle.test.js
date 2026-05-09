import test from "node:test";
import assert from "node:assert/strict";

import {
  createTiptapTableToolbarController,
  selectTableAxis,
} from "../src/tiptap-table-toolbar.js";
import {
  createDocument,
  createDismissDocument,
  createTableHarness,
  createViewSpy,
} from "./tiptap-table-toolbar-fixtures.js";

test("selectTableAxis rejects missing table selection commands", () => {
  assert.equal(selectTableAxis({ commands: {} }, [], "row", 0), false);
  const selected = [];
  assert.equal(
    selectTableAxis(
      {
        commands: {
          setCellSelection(selection) {
            selected.push(selection);
            return true;
          },
          focus() {},
        },
      },
      [
        { cells: [{ pos: 3 }, { pos: 4 }] },
        { cells: [{ pos: 8 }, { pos: 9 }] },
      ],
      "table",
      0,
    ),
    true,
  );
  assert.deepEqual(selected, [{ anchorCell: 3, headCell: 9 }]);
  assert.equal(
    selectTableAxis(
      {
        commands: {
          setCellSelection: () => false,
        },
      },
      [{ cells: [{ pos: 1 }] }],
      "row",
      0,
    ),
    false,
  );
});

test("Tiptap table toolbar closes on outside pointer events", () => {
  const { editor } = createTableHarness();
  editor.commands.deleteTable = () => true;
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  documentRef.emit("pointerup", { target: { id: "outside" } });

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap table toolbar stays open for pointer events inside the active table", () => {
  const { editor, table } = createTableHarness();
  editor.commands.deleteTable = () => true;
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  documentRef.emit("pointerup", { target: table });

  assert.equal(controller.state.open, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap table toolbar keeps editor blur stable for table chrome and WebView focus races", () => {
  const { editor, table } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  const view = createViewSpy();
  const documentRef = {
    body: { id: "body" },
  };
  const toolbarTarget = { id: "table-toolbar" };
  view.setContainedTarget(toolbarTarget);
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    view,
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(controller.shouldKeepOpenOnEditorBlur(toolbarTarget), true);
  assert.equal(controller.shouldKeepOpenOnEditorBlur(table), true);
  assert.equal(controller.shouldKeepOpenOnEditorBlur(null), true);
  assert.equal(controller.shouldKeepOpenOnEditorBlur(documentRef.body), true);
  assert.equal(controller.shouldKeepOpenOnEditorBlur({ id: "outside" }), false);

  controller.close();
  assert.equal(controller.shouldKeepOpenOnEditorBlur(toolbarTarget), false);
});

test("Tiptap table toolbar does not mount legacy chrome when React chrome is available", () => {
  const { created, documentRef } = createDocument();
  const { cells, editor } = createTableHarness({
    addRowAfter: () => true,
    addColumnAfter: () => true,
    mergeCells: () => true,
  });
  const chromeCalls = [];
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    chromeRendererFactory({ root }) {
      chromeCalls.push(["mount", root.className]);
      return {
        render(state) {
          chromeCalls.push(["render", state.open, state.selection?.kind]);
          return true;
        },
        hide() {
          chromeCalls.push(["hide"]);
        },
        contains(target) {
          return target?.id === "react-chrome";
        },
        destroy() {
          chromeCalls.push(["destroy"]);
        },
      };
    },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(
    cells.some((cell) =>
      cell.classes.has("mn-tiptap-table-cell-selected") ||
      cell.classes.has("mn-tiptap-table-cell-active"),
    ),
    false,
  );
  assert.equal(
    documentRef.body.children.some((element) =>
      String(element.className).includes("mn-tiptap-table-chrome-root"),
    ),
    true,
  );
  assert.deepEqual(
    documentRef.body.children
      .map((element) => String(element.className))
      .filter((className) =>
        className.includes("mn-tiptap-table-quick-add") ||
        className.includes("mn-tiptap-table-cell-menu-trigger") ||
        className.includes("mn-tiptap-complex-block-insert") ||
        className.includes("mn-tiptap-table-selection-backdrop"),
      ),
    [],
  );
  assert.equal(
    created.some((element) =>
      String(element.className).includes("mn-tiptap-table-quick-add"),
    ),
    true,
  );
  assert.deepEqual(chromeCalls.slice(0, 2), [
    ["mount", "mn-tiptap-table-chrome-root hidden"],
    ["render", true, "cell"],
  ]);

  controller.close();
  controller.destroy();

  assert.deepEqual(chromeCalls.slice(-2), [["hide"], ["destroy"]]);
});

test("Tiptap table toolbar keeps focus races inside the editor from dismissing menus", () => {
  const { editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const editorDom = editor.view.dom;
  const containsTableTarget = editorDom.contains.bind(editorDom);
  editorDom.contains = (target) => target === editorDom || containsTableTarget(target);
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  documentRef.emit("focusin", { type: "focusin", target: editorDom });
  assert.equal(controller.state.open, true);

  documentRef.emit("focusin", { type: "focusin", target: { id: "outside-focus" } });
  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap table context menu survives editor scroll races", () => {
  const { editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const editorDom = editor.view.dom;
  const containsTableTarget = editorDom.contains.bind(editorDom);
  editorDom.contains = (target) => target === editorDom || containsTableTarget(target);
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  controller.openCellMenu("context");

  documentRef.emit("scroll", { type: "scroll", target: editorDom });

  assert.equal(controller.state.open, true);
  assert.equal(controller.state.menuOpen, true);
  assert.notDeepEqual(view.calls.at(-1), ["hide"]);

  documentRef.emit("scroll", { type: "scroll", target: { id: "outside-scroll" } });
  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});
