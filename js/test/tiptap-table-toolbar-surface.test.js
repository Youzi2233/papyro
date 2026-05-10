import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapTableToolbarController } from "../src/tiptap-table-toolbar.js";
import {
  createDocument,
  createTableHarness,
} from "./tiptap-table-toolbar-fixtures.js";

test("Tiptap table toolbar replaces native context menus inside table cells", () => {
  const { created, documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  const events = [];
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(
    editor.view.dom.listeners.get("contextmenu")({
      target: cells[1],
      preventDefault() {
        events.push("preventDefault");
      },
      stopPropagation() {
        events.push("stopPropagation");
      },
    }),
    true,
  );

  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  assert.deepEqual(events, ["preventDefault", "stopPropagation"]);
  assert.deepEqual(calls.slice(0, 2), [
    ["setCellSelection", 11, 11],
    ["focus"],
  ]);
  assert.equal(controller.state.menuOpen, true);
  assert.equal(root.hidden, false);
  assert.equal(root.dataset.selectionKind, "cell");
  assert.equal(root.style.left, "152px");
  assert.equal(root.style.top, "132px");

  controller.destroy();
  assert.equal(editor.view.dom.listeners.size, 0);
});

test("Tiptap table toolbar anchors right-click menus to the pointer", () => {
  const { created, documentRef } = createDocument();
  const { cells, editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  editor.view.dom.listeners.get("contextmenu")({
    target: cells[1],
    clientX: 310,
    clientY: 240,
    preventDefault() {},
    stopPropagation() {},
  });

  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  assert.equal(controller.state.menuAnchorRect.left, 310);
  assert.equal(controller.state.menuAnchorRect.top, 240);
  assert.equal(root.style.left, "222px");
  assert.equal(root.style.top, "248px");
});

test("Tiptap table toolbar previews inline text cell surfaces as visual selections", () => {
  const { created, documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness({
    mergeCells: () => true,
    setCellAttribute: () => true,
  });
  editor.view.posAtCoords = ({ left, top }) => {
    calls.push(["posAtCoords", left, top]);
    return { pos: 12 };
  };
  editor.commands.setTextSelection = (position) => {
    calls.push(["setTextSelection", position]);
    return true;
  };
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    parentElement: cells[0],
    parentNode: cells[0],
    textContent: "Alpha",
    closest(selector) {
      if (selector === "th,td") return cells[0];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) {
        return cells[0].closest(selector);
      }
      return null;
    },
    contains(target) {
      return target === this;
    },
  };
  const textNode = {
    nodeType: 3,
    parentElement: paragraph,
    parentNode: paragraph,
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const events = [];
  assert.equal(
    editor.view.dom.listeners.get("pointerdown")({
      target: textNode,
      button: 0,
      clientX: 146,
      clientY: 104,
      preventDefault() {
        events.push("preventDefault:down");
      },
      stopPropagation() {
        events.push("stopPropagation:down");
      },
      stopImmediatePropagation() {
        events.push("stopImmediatePropagation:down");
      },
    }),
    true,
  );

  assert.equal(controller.state.selection.kind, "cell");
  assert.deepEqual([...controller.state.selection.positions], [10]);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-selected"), true);
  const trigger = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-cell-menu-trigger"),
  );
  assert.equal(trigger.hidden, false);
  assert.equal(trigger.style.left, "200px");
  assert.equal(trigger.style.top, "107px");

  assert.equal(documentRef.listeners.has("pointermove"), true);
  assert.equal(documentRef.listeners.get("pointerup")?.length, 1);
  assert.deepEqual(events, [
    "stopPropagation:down",
    "stopImmediatePropagation:down",
  ]);
  assert.deepEqual(calls, [
    ["posAtCoords", 146, 104],
    ["setTextSelection", 12],
    ["focus"],
  ]);
  controller.refresh(editor);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(trigger.hidden, false);
  assert.equal(controller.state.selection.positions.size, 1);
});

test("Tiptap table toolbar selects filled cell surfaces on short clicks", () => {
  const { documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness();
  editor.view.posAtCoords = ({ left, top }) => {
    calls.push(["posAtCoords", left, top]);
    return { pos: 12 };
  };
  editor.commands.setTextSelection = (position) => {
    calls.push(["setTextSelection", position]);
    return true;
  };
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    parentElement: cells[0],
    parentNode: cells[0],
    textContent: "Alpha",
    closest(selector) {
      if (selector === "th,td") return cells[0];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) {
        return cells[0].closest(selector);
      }
      return null;
    },
    contains(target) {
      return target === this;
    },
  };
  const textNode = {
    nodeType: 3,
    parentElement: paragraph,
    parentNode: paragraph,
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  editor.view.dom.listeners.get("pointerdown")({
    target: textNode,
    button: 0,
    clientX: 146,
    clientY: 104,
  });

  documentRef.listeners.get("pointerup")?.({
    target: textNode,
    clientX: 146,
    clientY: 104,
  });

  assert.deepEqual(calls, [
    ["posAtCoords", 146, 104],
    ["setTextSelection", 12],
    ["focus"],
  ]);
  assert.equal(controller.state.selection.kind, "cell");
  assert.deepEqual([...controller.state.selection.positions], [10]);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-active"), false);
});

test("Tiptap table toolbar treats mousedown as a cell object selection fallback", () => {
  const { documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness();
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    parentElement: cells[1],
    parentNode: cells[1],
    textContent: "Beta",
    closest(selector) {
      if (selector === "th,td") return cells[1];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) {
        return cells[1].closest(selector);
      }
      return null;
    },
  };
  const textNode = {
    nodeType: 3,
    parentElement: paragraph,
    parentNode: paragraph,
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  const events = [];

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.equal(
    editor.view.dom.listeners.get("mousedown")({
      target: textNode,
      button: 0,
      clientX: 214,
      clientY: 104,
      preventDefault() {
        events.push("preventDefault:down");
      },
      stopPropagation() {
        events.push("stopPropagation:down");
      },
      stopImmediatePropagation() {
        events.push("stopImmediatePropagation:down");
      },
    }),
    true,
  );

  documentRef.listeners.get("pointerup")?.({
    target: textNode,
    clientX: 214,
    clientY: 104,
    preventDefault() {
      events.push("preventDefault:up");
    },
    stopPropagation() {
      events.push("stopPropagation:up");
    },
    stopImmediatePropagation() {
      events.push("stopImmediatePropagation:up");
    },
  });

  assert.deepEqual(events, [
    "stopPropagation:down",
    "stopImmediatePropagation:down",
  ]);
  assert.deepEqual(calls, []);
  assert.equal(controller.state.selection.kind, "cell");
  assert.deepEqual([...controller.state.selection.positions], [11]);
  assert.equal(cells[1].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(cells[1].classes.has("mn-tiptap-table-cell-active"), false);
});

test("Tiptap table toolbar drags filled cell text as a cell range", () => {
  const { created, documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness();
  editor.view.posAtCoords = ({ left, top }) => {
    calls.push(["posAtCoords", left, top]);
    return { pos: 12 };
  };
  editor.commands.setTextSelection = (position) => {
    calls.push(["setTextSelection", position]);
    return true;
  };
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    parentElement: cells[0],
    parentNode: cells[0],
    textContent: "Alpha",
    closest(selector) {
      if (selector === "th,td") return cells[0];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) {
        return cells[0].closest(selector);
      }
      return null;
    },
  };
  const textNode = {
    nodeType: 3,
    parentElement: paragraph,
    parentNode: paragraph,
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });
  const events = [];

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  editor.view.dom.listeners.get("pointerdown")({
    target: textNode,
    button: 0,
    clientX: 146,
    clientY: 104,
    preventDefault() {
      events.push("preventDefault:down");
    },
    stopPropagation() {
      events.push("stopPropagation:down");
    },
    stopImmediatePropagation() {
      events.push("stopImmediatePropagation:down");
    },
  });
  const dragMove = documentRef.listeners.get("pointermove");
  const dragEnd = documentRef.listeners.get("pointerup");
  dragMove?.({
    target: cells[1],
    clientX: 232,
    clientY: 104,
    preventDefault() {
      events.push("preventDefault:move");
    },
    stopPropagation() {
      events.push("stopPropagation:move");
    },
    stopImmediatePropagation() {
      events.push("stopImmediatePropagation:move");
    },
  });
  dragEnd?.({
    target: cells[1],
    clientX: 232,
    clientY: 104,
    preventDefault() {
      events.push("preventDefault:up");
    },
    stopPropagation() {
      events.push("stopPropagation:up");
    },
    stopImmediatePropagation() {
      events.push("stopImmediatePropagation:up");
    },
  });

  assert.deepEqual(events, [
    "stopPropagation:down",
    "stopImmediatePropagation:down",
    "preventDefault:move",
    "stopPropagation:move",
    "stopImmediatePropagation:move",
    "preventDefault:up",
    "stopPropagation:up",
    "stopImmediatePropagation:up",
  ]);
  assert.deepEqual(calls, [
    ["posAtCoords", 146, 104],
    ["setTextSelection", 12],
    ["focus"],
    ["setCellSelection", 10, 11],
    ["focus"],
  ]);
  assert.equal(controller.state.selection.kind, "cells");
  assert.deepEqual([...controller.state.selection.positions], [10, 11]);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(cells[1].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(
    created.some((element) =>
      String(element.className).includes("mn-tiptap-table-selection-cell") &&
      !element.removed,
    ),
    false,
  );
});

test("Tiptap table toolbar keeps native controls inside cells interactive", () => {
  const { documentRef } = createDocument();
  const { calls, cells, editor } = createTableHarness();
  const link = {
    nodeType: 1,
    tagName: "A",
    parentElement: cells[0],
    parentNode: cells[0],
    closest(selector) {
      if (selector.includes("a")) return link;
      if (selector === "th,td") return cells[0];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) {
        return cells[0].closest(selector);
      }
      return null;
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(
    editor.view.dom.listeners.get("pointerdown")({
      target: link,
      button: 0,
      clientX: 146,
      clientY: 104,
    }),
    false,
  );
  assert.deepEqual(calls, []);
  assert.equal(controller.state.selection.positions.size, 0);
});
