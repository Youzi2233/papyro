import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapTableToolbarController } from "../src/tiptap-table-toolbar.js";

function createHarness() {
  const calls = [];
  const listeners = new Map();
  const documentListeners = new Map();
  const containsTarget = (owner, target) => {
    let current = target;
    while (current) {
      if (current === owner) return true;
      current = current.parentElement ?? current.parentNode ?? null;
    }
    return false;
  };
  const pushEvent = (events, name) => (event) => {
    events.push(name);
    event?.();
  };
  const cells = [];
  let table = null;
  const rows = Array.from({ length: 2 }, (_, rowIndex) => {
    const rowCells = Array.from({ length: 2 }, (_, columnIndex) => {
      const cell = {
        nodeType: 1,
        tagName: "TD",
        rowIndex,
        columnIndex,
        classes: new Set(),
        classList: {
          add(name) {
            cell.classes.add(name);
          },
          remove(name) {
            cell.classes.delete(name);
          },
          toggle(name, enabled) {
            enabled ? cell.classes.add(name) : cell.classes.delete(name);
          },
          contains(name) {
            return cell.classes.has(name);
          },
        },
        parentElement: null,
        get parentNode() {
          return cell.parentElement;
        },
        contains(target) {
          return containsTarget(cell, target);
        },
        closest(selector) {
          if (selector === "th,td") return cell;
          if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) return table;
          return null;
        },
        getBoundingClientRect: () => ({
          left: 100 + columnIndex * 90,
          top: 80 + rowIndex * 36,
          right: 190 + columnIndex * 90,
          bottom: 116 + rowIndex * 36,
          width: 90,
          height: 36,
        }),
      };
      cells.push(cell);
      return cell;
    });
    return {
      cells: rowCells,
      parentElement: null,
      get parentNode() {
        return this.parentElement;
      },
      getBoundingClientRect: () => ({
        left: 100,
        top: 80 + rowIndex * 36,
        right: 280,
        bottom: 116 + rowIndex * 36,
        width: 180,
        height: 36,
      }),
      querySelectorAll(selector) {
        return selector === "th,td" ? rowCells : [];
      },
    };
  });
  rows.forEach((row) =>
    row.cells.forEach((cell) => {
      cell.parentElement = row;
    }),
  );
  const documentRef = {
    body: { appendChild() {} },
    documentElement: { clientWidth: 1000, clientHeight: 800 },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      const next = (documentListeners.get(type) ?? []).filter((item) => item !== listener);
      if (next.length > 0) {
        documentListeners.set(type, next);
      } else {
        documentListeners.delete(type);
      }
    },
    get parentNode() {
      return null;
    },
  };
  const root = {
    ownerDocument: documentRef,
    listeners,
    contains: (target) => containsTarget(root, target),
    parentElement: null,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  table = {
    className: "mn-tiptap-table",
    ownerDocument: documentRef,
    parentElement: root,
    classList: {
      contains(name) {
        return name === "mn-tiptap-table";
      },
    },
    closest(selector) {
      return selector.includes(".mn-tiptap-table") || selector.includes(", table") ? table : null;
    },
    get parentNode() {
      return table.parentElement;
    },
    contains: (target) => containsTarget(table, target),
    getBoundingClientRect: () => ({ left: 100, top: 80, right: 280, bottom: 152 }),
    querySelectorAll(selector) {
      if (selector === "tr") return rows;
      if (selector === ".mn-tiptap-table-cell-selected") {
        return cells.filter((cell) => cell.classes.has("mn-tiptap-table-cell-selected"));
      }
      if (selector === ".mn-tiptap-table-cell-active") {
        return cells.filter((cell) => cell.classes.has("mn-tiptap-table-cell-active"));
      }
      if (selector === "th,td") return cells;
      return [];
    },
  };
  rows.forEach((row) => {
    row.parentElement = table;
  });
  const editor = {
    state: { selection: { from: 4 } },
    view: {
      dom: root,
      domAtPos: () => ({ node: cells[0] }),
      posAtDOM(target) {
        return cells.indexOf(target) + 10;
      },
    },
    commands: {
      addRowAfter: () => true,
      setTextSelection(pos) {
        calls.push(["setTextSelection", pos]);
        editor.state.selection = { from: pos };
        const activeIndex = Math.max(0, Math.min(cells.length - 1, pos - 11));
        editor.view.domAtPos = () => ({ node: cells[activeIndex] });
        return true;
      },
      setCellAttribute: () => true,
      focus: () => calls.push(["focus"]),
      setCellSelection(selection) {
        calls.push(["setCellSelection", selection.anchorCell, selection.headCell]);
        const positioned = cells.map((cell, index) => ({ cell, pos: index + 10 }));
        const anchor = positioned.find((item) => item.pos === selection.anchorCell);
        const head = positioned.find((item) => item.pos === selection.headCell);
        const minRow = Math.min(anchor.cell.rowIndex, head.cell.rowIndex);
        const maxRow = Math.max(anchor.cell.rowIndex, head.cell.rowIndex);
        const minColumn = Math.min(anchor.cell.columnIndex, head.cell.columnIndex);
        const maxColumn = Math.max(anchor.cell.columnIndex, head.cell.columnIndex);
        const selectedPositions = positioned
          .filter(
            (item) =>
              item.cell.rowIndex >= minRow &&
              item.cell.rowIndex <= maxRow &&
              item.cell.columnIndex >= minColumn &&
              item.cell.columnIndex <= maxColumn,
          )
          .map((item) => item.pos);
        editor.state.selection = {
          from: 4,
          $anchorCell: { pos: selection.anchorCell },
          $headCell: { pos: selection.headCell },
          forEachCell(callback) {
            selectedPositions.forEach((pos) => callback({}, pos));
          },
        };
        return true;
      },
    },
  };

  return { calls, cells, documentListeners, documentRef, editor, pushEvent, root, table };
}

test("Tiptap table inline text content previews the cell without stealing native selection", () => {
  const { calls, cells, documentListeners, editor, pushEvent, root, table } = createHarness();
  const inline = {
    nodeType: 1,
    tagName: "SPAN",
    parentElement: cells[1],
    parentNode: cells[1],
    textContent: "inline",
    closest(selector) {
      if (selector === "th,td") return cells[1];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) return table;
      return null;
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });
  const events = [];

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.equal(
    root.listeners.get("pointerdown")({
      target: inline,
      button: 0,
      clientX: 220,
      clientY: 96,
      preventDefault: pushEvent(events, "preventDefault:down"),
      stopPropagation: pushEvent(events, "stopPropagation:down"),
    }),
    false,
  );

  assert.deepEqual(events, []);
  assert.deepEqual(calls, []);
  assert.deepEqual([...controller.state.selection.positions], [11]);
  assert.equal(documentListeners.has("pointermove"), false);
  assert.equal(documentListeners.get("pointerup")?.length, 1);
});

test("Tiptap table empty paragraph surface focuses like the whole cell", () => {
  const { calls, cells, documentListeners, editor, pushEvent, root, table } = createHarness();
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    parentElement: cells[1],
    parentNode: cells[1],
    textContent: "",
    closest(selector) {
      if (selector === "th,td") return cells[1];
      if (selector === ".mn-tiptap-table, table" || selector === "table") return table;
      return null;
    },
  };
  editor.view.posAtCoords = ({ left, top }) => {
    calls.push(["posAtCoords", left, top]);
    return { pos: 12 };
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });
  const events = [];

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.equal(
    root.listeners.get("pointerdown")({
      target: paragraph,
      button: 0,
      clientX: 220,
      clientY: 96,
      preventDefault: pushEvent(events, "preventDefault:down"),
      stopPropagation: pushEvent(events, "stopPropagation:down"),
    }),
    false,
  );

  documentListeners.get("pointerup").at(-1)({
    target: paragraph,
    clientX: 220,
    clientY: 96,
    preventDefault: pushEvent(events, "preventDefault:up"),
    stopPropagation: pushEvent(events, "stopPropagation:up"),
  });

  assert.deepEqual(events, []);
  assert.deepEqual(calls, [["posAtCoords", 220, 96], ["setTextSelection", 12], ["focus"]]);
  assert.equal(controller.state.cell, cells[1]);
  assert.equal(controller.state.cellRect?.left, 190);
});

test("Tiptap table blank cell clicks focus the editable cell", () => {
  const { calls, cells, documentListeners, editor, pushEvent, root } = createHarness();
  editor.view.posAtCoords = ({ left, top }) => {
    calls.push(["posAtCoords", left, top]);
    return { pos: 12 };
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });
  const events = [];

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.equal(
    root.listeners.get("pointerdown")({
      target: cells[1],
      button: 0,
      clientX: 220,
      clientY: 96,
      preventDefault: pushEvent(events, "preventDefault:down"),
      stopPropagation: pushEvent(events, "stopPropagation:down"),
    }),
    false,
  );

  documentListeners.get("pointerup").at(-1)({
    target: cells[1],
    clientX: 220,
    clientY: 96,
    preventDefault: pushEvent(events, "preventDefault:up"),
    stopPropagation: pushEvent(events, "stopPropagation:up"),
  });

  assert.deepEqual(events, []);
  assert.deepEqual(calls, [["posAtCoords", 220, 96], ["setTextSelection", 12], ["focus"]]);
  assert.equal(controller.state.cell, cells[1]);
  assert.equal(controller.state.cellRect?.left, 190);
});

test("Tiptap table cell clicks preview the active cell immediately", () => {
  const { calls, cells, documentListeners, editor, root } = createHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.equal(
    root.listeners.get("pointerdown")({
      target: cells[3],
      button: 0,
      clientX: 230,
      clientY: 134,
    }),
    false,
  );

  assert.equal(controller.state.cell, cells[3]);
  assert.equal(controller.state.hover.cell, cells[3]);
  assert.deepEqual([...controller.state.selection.positions], [13]);

  documentListeners.get("pointerup").at(-1)({
    target: cells[3],
    clientX: 230,
    clientY: 134,
  });
  assert.deepEqual(calls, [["setTextSelection", 14], ["focus"]]);
});

test("Tiptap table interactive inline content clicks stay native", () => {
  const { calls, cells, documentListeners, editor, root, table } = createHarness();
  const inline = {
    nodeType: 1,
    tagName: "A",
    parentElement: cells[1],
    parentNode: cells[1],
    closest(selector) {
      if (selector.includes("a")) return inline;
      if (selector === "th,td") return cells[1];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) return table;
      return null;
    },
  };
  editor.view.posAtCoords = () => {
    calls.push(["posAtCoords"]);
    return { pos: 12 };
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  root.listeners.get("pointerdown")({
    target: inline,
    button: 0,
    clientX: 220,
    clientY: 96,
  });

  documentListeners.get("pointerup")?.at(-1)?.({
    target: inline,
    clientX: 220,
    clientY: 96,
  });

  assert.deepEqual(calls, []);
});

test("Tiptap table filled paragraph content preserves native text selection", () => {
  const { calls, cells, documentListeners, editor, pushEvent, root, table } = createHarness();
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    parentElement: cells[0],
    parentNode: cells[0],
    textContent: "Revenue",
    closest(selector) {
      if (selector === "th,td") return cells[0];
      if (selector === ".mn-tiptap-table, table" || selector === "table") return table;
      return null;
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });
  const events = [];

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  root.listeners.get("pointerdown")({
    target: paragraph,
    button: 0,
    clientX: 120,
    clientY: 94,
    preventDefault: pushEvent(events, "preventDefault:down"),
    stopPropagation: pushEvent(events, "stopPropagation:down"),
  });

  assert.equal(documentListeners.has("pointermove"), false);
  assert.equal(documentListeners.get("pointerup")?.length, 1);
  assert.deepEqual(events, []);
  assert.deepEqual(calls, []);
  assert.equal(controller.state.cell, cells[0]);
  assert.deepEqual([...controller.state.selection.positions], [10]);
});

test("Tiptap table empty paragraph content can start table selection drag", () => {
  const { calls, cells, documentListeners, editor, pushEvent, root, table } = createHarness();
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    parentElement: cells[0],
    parentNode: cells[0],
    textContent: "",
    closest(selector) {
      if (selector === "th,td") return cells[0];
      if (selector === ".mn-tiptap-table, table" || selector === "table") return table;
      return null;
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });
  const events = [];

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  root.listeners.get("pointerdown")({
    target: paragraph,
    button: 0,
    clientX: 120,
    clientY: 94,
    preventDefault: pushEvent(events, "preventDefault:down"),
    stopPropagation: pushEvent(events, "stopPropagation:down"),
  });

  assert.equal(documentListeners.has("pointermove"), true);
  assert.equal(documentListeners.get("pointerup")?.length, 2);
  assert.deepEqual(events, []);
  assert.deepEqual(calls, []);
  assert.equal(controller.state.cell, cells[0]);
  assert.deepEqual([...controller.state.selection.positions], [10]);
});

test("Tiptap table cell drag extends the selected cell range", () => {
  const { calls, cells, documentListeners, editor, pushEvent, root } = createHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });
  const events = [];

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.equal(
    root.listeners.get("pointerdown")({
      target: cells[0],
      button: 0,
      clientX: 120,
      clientY: 94,
      preventDefault: pushEvent(events, "preventDefault:down"),
      stopPropagation: pushEvent(events, "stopPropagation:down"),
    }),
    false,
  );
  const dragMove = documentListeners.get("pointermove").at(-1);
  const dragEnd = documentListeners.get("pointerup").at(-1);
  dragMove({
    target: cells[0],
    clientX: 121,
    clientY: 95,
    preventDefault: pushEvent(events, "preventDefault:move-small"),
    stopPropagation: pushEvent(events, "stopPropagation:move-small"),
  });
  dragMove({
    target: cells[3],
    clientX: 230,
    clientY: 134,
    preventDefault: pushEvent(events, "preventDefault:move"),
    stopPropagation: pushEvent(events, "stopPropagation:move"),
  });
  dragEnd({
    target: cells[3],
    preventDefault: pushEvent(events, "preventDefault:up"),
    stopPropagation: pushEvent(events, "stopPropagation:up"),
  });

  assert.deepEqual(calls.filter((call) => call[0] === "setCellSelection"), [
    ["setCellSelection", 10, 13],
  ]);
  assert.deepEqual(events, [
    "preventDefault:move",
    "stopPropagation:move",
    "preventDefault:up",
    "stopPropagation:up",
  ]);
  controller.refresh(editor);
  assert.equal(controller.state.selection.kind, "table");
  assert.deepEqual([...controller.state.selection.positions], [10, 11, 12, 13]);
  assert.equal(documentListeners.has("pointermove"), false);
});
