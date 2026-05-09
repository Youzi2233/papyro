import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapTableToolbarController } from "../src/tiptap-table-toolbar.js";
import {
  createDocument,
  createTableHarness,
  tableToolbarHeader,
  toolbarCommandButton,
  toolbarCommandIds,
} from "./tiptap-table-toolbar-fixtures.js";

test("Tiptap table toolbar reflects selected rows columns and cells in chrome", () => {
  const { cells, created, documentRef, editor } = (() => {
    const { created, documentRef } = createDocument();
    const harness = createTableHarness();
    return { ...harness, created, documentRef };
  })();
  editor.commands.mergeCells = () => true;
  editor.state.selection = {
    from: 4,
    $anchorCell: { pos: 10 },
    $headCell: { pos: 12 },
    forEachCell(callback) {
      [10, 11, 12].forEach((pos) => callback({}, pos));
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const rowHandles = created.filter((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle row"),
  );
  const columnHandles = created.filter((element) =>
    String(element.className).includes("mn-tiptap-table-axis-handle column"),
  );
  assert.equal(root.dataset.selectionKind, "row");
  assert.equal(rowHandles.length, 0);
  assert.equal(rowHandles.some((handle) => !handle.hidden), false);
  assert.equal(columnHandles.length, 0);
  assert.deepEqual(
    cells.map((cell) => cell.classes.has("mn-tiptap-table-cell-selected")),
    [true, true, true, false, false, false],
  );

  controller.close();
  assert.equal(cells.some((cell) => cell.classes.has("mn-tiptap-table-cell-selected")), false);
});

test("Tiptap table toolbar marks only the focused editable cell as active", () => {
  const { cells, editor } = createTableHarness();
  const { documentRef } = createDocument();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-active"), true);
  assert.equal(cells[1].classes.has("mn-tiptap-table-cell-active"), false);

  editor.view.domAtPos = () => ({ node: cells[4] });
  controller.refresh(editor);

  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-active"), false);
  assert.equal(cells[4].classes.has("mn-tiptap-table-cell-active"), true);

  editor.commands.setCellSelection({ anchorCell: 10, headCell: 11 });
  controller.refresh(editor);

  assert.equal(cells.some((cell) => cell.classes.has("mn-tiptap-table-cell-active")), false);
});

test("Tiptap table toolbar keeps the cell menu trigger hidden until the edge is intentional", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness();
  editor.commands.mergeCells = () => true;
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  assert.equal(trigger.hidden, true);
  assert.equal(trigger.dataset.visible, "false");
  assert.equal(trigger["aria-hidden"], "true");
  assert.equal(trigger.tabIndex, -1);
  assert.equal(trigger.textContent ?? "", "");
  assert.equal(trigger.dataset.selectionKind, "cell");
  assert.equal(trigger.dataset.selectedCount, "0");
  assert.equal(trigger["aria-expanded"], "false");
});

test("Tiptap table toolbar reveals the cell trigger after selecting a cell", () => {
  const { created, documentRef } = createDocument();
  const { cells, editor } = createTableHarness({ setCellAttribute: () => true });
  editor.commands.addColumnAfter = () => true;
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );

  editor.view.dom.listeners.get("pointermove")({
    target: cells[0],
    clientX: 181,
    clientY: 112,
  });
  assert.equal(trigger.hidden, true);

  editor.view.dom.listeners.get("pointermove")({
    target: cells[0],
    clientX: 195,
    clientY: 107,
  });
  assert.equal(trigger.hidden, true);

  editor.view.dom.listeners.get("pointermove")({
    target: cells[0],
    clientX: 197,
    clientY: 107,
  });
  assert.equal(trigger.hidden, false);
  assert.equal(trigger.dataset.visible, "true");
  assert.equal(trigger["aria-hidden"], undefined);
  assert.equal(trigger.style.left, "200px");
  assert.equal(trigger.style.top, "107px");
  assert.equal(trigger.dataset.edgeIntent, "true");
  assert.equal(trigger.dataset.placement, "edge");

  editor.commands.setCellSelection({ anchorCell: 10, headCell: 10 });
  controller.refresh(editor);
  assert.equal(trigger.hidden, false);
  assert.equal(trigger.style.left, "200px");
  assert.equal(trigger.style.top, "107px");
  assert.equal(trigger.dataset.placement, "quiet-edge");
  assert.equal(controller.state.selection.kind, "cell");
});

test("Tiptap table toolbar anchors a selected cell trigger from the grid selection", () => {
  const { created, documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness({ setCellAttribute: () => true });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );

  editor.commands.setCellSelection({ anchorCell: 11, headCell: 11 });
  editor.view.domAtPos = () => ({ node: cells[0] });
  controller.refresh(editor);

  assert.equal(trigger.hidden, false);
  assert.equal(trigger.style.left, "280px");
  assert.equal(trigger.style.top, "107px");
  assert.equal(cells[1].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-selected"), false);

  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls.filter((call) => call[0] === "setCellSelection").at(-1), [
    "setCellSelection",
    11,
    11,
  ]);
});

test("Tiptap table toolbar keeps the cell trigger quiet outside the vertical center zone", () => {
  const { created, documentRef } = createDocument();
  const { cells, editor } = createTableHarness({ setCellAttribute: () => true });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );

  editor.view.dom.listeners.get("pointermove")({
    target: cells[0],
    clientX: 195,
    clientY: 123,
  });

  assert.equal(trigger.hidden, true);
  assert.notEqual(controller.state.hover.edge, "cell-menu");
});

test("Tiptap table toolbar does not expose split cell without a can command", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    splitCell: () => true,
    setCellAttribute: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(toolbarCommandIds(created).includes("split-cell"), false);
});

test("Tiptap table toolbar exposes split only when a merged cell can be split", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    splitCell: () => true,
    setCellAttribute: () => true,
  });
  editor.can = () => ({
    splitCell: () => true,
    setCellAttribute: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  const split = toolbarCommandButton(created, "split-cell");
  assert.ok(split, "expected split command for a splittable merged cell");
  assert.equal(split.title, "Split merged cell");
});

test("Tiptap table toolbar anchors multi-cell actions to the head cell", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness();
  editor.commands.mergeCells = () => true;
  editor.commands.setCellAttribute = () => true;
  editor.state.selection = {
    from: 4,
    $anchorCell: { pos: 10 },
    $headCell: { pos: 11 },
    forEachCell(callback) {
      [11, 10].forEach((pos) => callback({}, pos));
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  assert.equal(controller.state.selection.kind, "cells");
  assert.equal(trigger.style.left, "280px");
  assert.equal(trigger.style.top, "107px");
  assert.equal(trigger.dataset.selectionKind, "cells");
  assert.equal(trigger.dataset.placement, "center");
  assert.equal(trigger.dataset.selectedCount, "2");
  trigger.getBoundingClientRect = () => ({
    left: 232,
    top: 97,
    right: 248,
    bottom: 113,
    width: 12,
    height: 16,
  });

  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(root.hidden, false);
  assert.equal(trigger["aria-expanded"], "true");
  assert.equal(root.style.left, "152px");
  assert.equal(root.style.top, "121px");
});

test("Tiptap table toolbar renders localized context headers for table selections", () => {
  const { created, documentRef } = createDocument();
  const { editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  editor.state.selection = {
    from: 4,
    $anchorCell: { pos: 10 },
    $headCell: { pos: 11 },
    forEachCell(callback) {
      [10, 11].forEach((pos) => callback({}, pos));
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({
    editor,
    root: {},
    entry: { viewMode: "hybrid", preferences: { language: "Chinese" } },
  });
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  trigger.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  const { eyebrow, title, subtitle } = tableToolbarHeader(created);
  assert.equal(eyebrow.textContent, "表格");
  assert.equal(title.textContent, "选区操作");
  assert.equal(subtitle.textContent, "已选择 2 个单元格");
});
