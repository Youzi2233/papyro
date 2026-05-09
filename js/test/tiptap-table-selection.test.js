import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapTableToolbarController } from "../src/tiptap-table-toolbar.js";

function createHarness() {
  const calls = [];
  const listeners = new Map();
  const documentListeners = new Map();
  const created = [];
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
    body: {
      children: [],
      appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
      },
    },
    documentElement: { clientWidth: 1000, clientHeight: 800 },
    createElement(tagName) {
      const element = {
        nodeType: 1,
        tagName: String(tagName).toUpperCase(),
        children: [],
        dataset: {},
        hidden: false,
        className: "",
        parentElement: null,
        style: {
          setProperty(name, value) {
            this[name] = value;
          },
        },
        classList: {
          add(name) {
            const classes = new Set(String(element.className).split(/\s+/).filter(Boolean));
            classes.add(name);
            element.className = [...classes].join(" ");
          },
          remove(name) {
            element.className = String(element.className)
              .split(/\s+/)
              .filter((item) => item && item !== name)
              .join(" ");
          },
          toggle(name, enabled) {
            element.hidden = enabled && name === "hidden";
            enabled ? this.add(name) : this.remove(name);
          },
          contains(name) {
            return String(element.className).split(/\s+/).includes(name);
          },
        },
        appendChild(child) {
          this.children.push(child);
          child.parentElement = this;
        },
        append(...children) {
          children.forEach((child) => this.appendChild(child));
        },
        replaceChildren(...children) {
          this.children = [];
          this.append(...children);
        },
        setAttribute(name, value) {
          this[name] = value;
        },
        getAttribute(name) {
          return this[name] ?? null;
        },
        removeAttribute(name) {
          delete this[name];
        },
        addEventListener(name, handler) {
          this[`on${name}`] = handler;
        },
        removeEventListener(name, handler) {
          if (this[`on${name}`] === handler) {
            delete this[`on${name}`];
          }
        },
        contains(target) {
          return containsTarget(this, target);
        },
        querySelector(selector) {
          const matches = (node) => {
            if (selector.startsWith(".")) {
              return node.classList?.contains?.(selector.slice(1));
            }
            if (selector.startsWith("[data-command-id=")) {
              const id = selector.match(/"([^"]+)"/u)?.[1];
              return node.dataset?.commandId === id;
            }
            return false;
          };
          const visit = (node) => {
            if (matches(node)) return node;
            for (const child of node.children ?? []) {
              const found = visit(child);
              if (found) return found;
            }
            return null;
          };
          return visit(this);
        },
        remove() {
          this.removed = true;
        },
      };
      created.push(element);
      return element;
    },
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
    state: {
      selection: { from: 4 },
      doc: {
        resolve(pos) {
          const cellIndex = pos - 100;
          const cellPos = cellIndex + 10;
          return {
            depth: 2,
            node(depth) {
              return depth === 1
                ? { type: { name: "tableCell" } }
                : { type: { name: "paragraph" } };
            },
            before(depth) {
              return depth === 1 ? cellPos : pos;
            },
          };
        },
        nodeAt(pos) {
          return pos >= 10 && pos < 14 && Number.isInteger(pos)
            ? { type: { name: "tableCell" } }
            : { type: { name: "paragraph" } };
        },
      },
    },
    view: {
      dom: root,
      get state() {
        return editor.state;
      },
      domAtPos: () => ({ node: cells[0] }),
      posAtDOM(target) {
        return cells.indexOf(target) + 100;
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
            selectedPositions.forEach((pos) => {
              const item = positioned.find((cell) => cell.pos === pos);
              callback(item?.cell ?? {}, pos);
            });
          },
        };
        editor.view.domAtPos = () => ({ node: anchor?.cell ?? cells[0] });
        return true;
      },
    },
  };

  return { calls, cells, created, documentListeners, documentRef, editor, pushEvent, root, table };
}

function latestDragListeners(documentListeners) {
  return {
    move: documentListeners.get("pointermove")?.at(-1),
    end: documentListeners.get("pointerup")?.at(-1),
  };
}

function assertSingleCellVisualSelection(controller, cell, pos) {
  assert.equal(controller.state.cell, cell);
  assert.equal(cell.classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(cell.classes.has("mn-tiptap-table-cell-active"), false);
  assert.deepEqual([...controller.state.selection.positions], [pos]);
}

test("Tiptap table inline text click keeps caret native while showing object selection", () => {
  const { calls, cells, documentListeners, editor, root, table } = createHarness();
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
      preventDefault: () => events.push("preventDefault:down"),
      stopPropagation: () => events.push("stopPropagation:down"),
      stopImmediatePropagation: () => events.push("stopImmediatePropagation:down"),
    }),
    true,
  );

  assert.deepEqual(events, ["stopPropagation:down", "stopImmediatePropagation:down"]);
  assert.deepEqual(calls, [["setTextSelection", 13], ["focus"]]);
  assertSingleCellVisualSelection(controller, cells[1], 11);
  assert.equal(documentListeners.has("pointermove"), true);
  assert.ok((documentListeners.get("pointerup")?.length ?? 0) >= 1);
  const { move: dragMove, end: dragEnd } = latestDragListeners(documentListeners);

  dragMove({
    target: inline,
    clientX: 240,
    clientY: 96,
    preventDefault: () => events.push("preventDefault:move"),
    stopPropagation: () => events.push("stopPropagation:move"),
    stopImmediatePropagation: () => events.push("stopImmediatePropagation:move"),
  });
  dragEnd({
    target: inline,
    clientX: 240,
    clientY: 96,
    preventDefault: () => events.push("preventDefault:up"),
    stopPropagation: () => events.push("stopPropagation:up"),
    stopImmediatePropagation: () => events.push("stopImmediatePropagation:up"),
  });

  assert.deepEqual(events, ["stopPropagation:down", "stopImmediatePropagation:down"]);
  assert.deepEqual(calls.filter((call) => call[0] === "setCellSelection"), []);
});

test("Tiptap table empty paragraph click selects the cell visually and keeps the caret", () => {
  const { calls, cells, documentListeners, editor, root, table } = createHarness();
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
      preventDefault: () => events.push("preventDefault:down"),
      stopPropagation: () => events.push("stopPropagation:down"),
      stopImmediatePropagation: () => events.push("stopImmediatePropagation:down"),
    }),
    true,
  );

  assert.deepEqual(events, ["stopPropagation:down", "stopImmediatePropagation:down"]);

  latestDragListeners(documentListeners).end({
    target: paragraph,
    clientX: 220,
    clientY: 96,
    preventDefault: () => events.push("preventDefault:up"),
    stopPropagation: () => events.push("stopPropagation:up"),
    stopImmediatePropagation: () => events.push("stopImmediatePropagation:up"),
  });

  assert.deepEqual(events, ["stopPropagation:down", "stopImmediatePropagation:down"]);
  assert.deepEqual(calls, [["posAtCoords", 220, 96], ["setTextSelection", 12], ["focus"]]);
  assert.equal(controller.state.cellRect?.left, 190);
  assertSingleCellVisualSelection(controller, cells[1], 11);
});

test("Tiptap table blank cell clicks select the editable cell", () => {
  const { calls, cells, documentListeners, editor, root } = createHarness();
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
      preventDefault: () => events.push("preventDefault:down"),
      stopPropagation: () => events.push("stopPropagation:down"),
      stopImmediatePropagation: () => events.push("stopImmediatePropagation:down"),
    }),
    true,
  );

  assert.deepEqual(events, ["stopPropagation:down", "stopImmediatePropagation:down"]);

  latestDragListeners(documentListeners).end({
    target: cells[1],
    clientX: 220,
    clientY: 96,
    preventDefault: () => events.push("preventDefault:up"),
    stopPropagation: () => events.push("stopPropagation:up"),
    stopImmediatePropagation: () => events.push("stopImmediatePropagation:up"),
  });

  assert.deepEqual(events, ["stopPropagation:down", "stopImmediatePropagation:down"]);
  assert.deepEqual(calls, [["posAtCoords", 220, 96], ["setTextSelection", 12], ["focus"]]);
  assert.equal(controller.state.cellRect?.left, 190);
  assertSingleCellVisualSelection(controller, cells[1], 11);
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
    true,
  );

  assert.equal(controller.state.cell, cells[3]);
  assert.equal(controller.state.hover.cell, cells[3]);
  assertSingleCellVisualSelection(controller, cells[3], 13);

  latestDragListeners(documentListeners).end({
    target: cells[3],
    clientX: 230,
    clientY: 134,
  });
  assert.deepEqual(calls, [["setTextSelection", 15], ["focus"]]);
  assert.deepEqual([...controller.state.selection.positions], [13]);
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

test("Tiptap table filled paragraph short clicks select the cell visually", () => {
  const { calls, cells, documentListeners, editor, root, table } = createHarness();
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
    preventDefault: () => events.push("preventDefault:down"),
    stopPropagation: () => events.push("stopPropagation:down"),
    stopImmediatePropagation: () => events.push("stopImmediatePropagation:down"),
  });

  assert.equal(documentListeners.has("pointermove"), true);
  assert.ok((documentListeners.get("pointerup")?.length ?? 0) >= 1);
  assert.deepEqual(events, ["stopPropagation:down", "stopImmediatePropagation:down"]);
  assert.deepEqual(calls, [["setTextSelection", 12], ["focus"]]);
  assertSingleCellVisualSelection(controller, cells[0], 10);

  latestDragListeners(documentListeners).end({
    target: paragraph,
    clientX: 120,
    clientY: 94,
    preventDefault: () => events.push("preventDefault:up"),
    stopPropagation: () => events.push("stopPropagation:up"),
    stopImmediatePropagation: () => events.push("stopImmediatePropagation:up"),
  });

  assert.deepEqual(events, ["stopPropagation:down", "stopImmediatePropagation:down"]);
  assert.deepEqual(calls.filter((call) => call[0] === "setCellSelection"), []);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-active"), false);
});

test("Tiptap table filled paragraph drag extends cell object selection", () => {
  const { calls, cells, documentListeners, editor, root, table } = createHarness();
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
    preventDefault: () => events.push("preventDefault:down"),
    stopPropagation: () => events.push("stopPropagation:down"),
  });
  const { move: dragMove, end: dragEnd } = latestDragListeners(documentListeners);

  dragMove({
    target: paragraph,
    clientX: 220,
    clientY: 94,
    preventDefault: () => events.push("preventDefault:move"),
    stopPropagation: () => events.push("stopPropagation:move"),
  });
  dragEnd({
    target: paragraph,
    clientX: 220,
    clientY: 94,
    preventDefault: () => events.push("preventDefault:up"),
    stopPropagation: () => events.push("stopPropagation:up"),
  });

  assert.deepEqual(events, [
    "stopPropagation:down",
    "preventDefault:move",
    "stopPropagation:move",
    "preventDefault:up",
    "stopPropagation:up",
  ]);
  assert.deepEqual(calls, [["setTextSelection", 12], ["focus"], ["setCellSelection", 10, 11], ["focus"]]);
});

test("Tiptap table empty paragraph content can start table selection drag", () => {
  const { calls, cells, documentListeners, editor, root, table } = createHarness();
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
    preventDefault: () => events.push("preventDefault:down"),
    stopPropagation: () => events.push("stopPropagation:down"),
  });

  assert.equal(documentListeners.has("pointermove"), true);
  assert.equal(documentListeners.get("pointerup")?.length, 2);
  assert.deepEqual(events, ["stopPropagation:down"]);
  assert.deepEqual(calls, [["setTextSelection", 12], ["focus"]]);
  assertSingleCellVisualSelection(controller, cells[0], 10);
});

test("Tiptap table cell drag extends the selected cell range", () => {
  const { calls, cells, documentListeners, editor, root } = createHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });
  const events = [];

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const basePointerMoveListeners = documentListeners.get("pointermove")?.length ?? 0;
  assert.equal(
    root.listeners.get("pointerdown")({
      target: cells[0],
      button: 0,
      clientX: 120,
      clientY: 94,
      preventDefault: () => events.push("preventDefault:down"),
      stopPropagation: () => events.push("stopPropagation:down"),
    }),
    true,
  );
  const { move: dragMove, end: dragEnd } = latestDragListeners(documentListeners);
  dragMove({
    target: cells[0],
    clientX: 121,
    clientY: 95,
    preventDefault: () => events.push("preventDefault:move-small"),
    stopPropagation: () => events.push("stopPropagation:move-small"),
  });
  dragMove({
    target: cells[3],
    clientX: 230,
    clientY: 134,
    preventDefault: () => events.push("preventDefault:move"),
    stopPropagation: () => events.push("stopPropagation:move"),
  });
  dragEnd({
    target: cells[3],
    preventDefault: () => events.push("preventDefault:up"),
    stopPropagation: () => events.push("stopPropagation:up"),
  });

  assert.deepEqual(calls.filter((call) => call[0] === "setCellSelection"), [
    ["setCellSelection", 10, 13],
  ]);
  assert.deepEqual(events, [
    "stopPropagation:down",
    "preventDefault:move",
    "stopPropagation:move",
    "preventDefault:up",
    "stopPropagation:up",
  ]);
  controller.refresh(editor);
  assert.equal(controller.state.selection.kind, "table");
  assert.deepEqual([...controller.state.selection.positions], [10, 11, 12, 13]);
  assert.equal(documentListeners.get("pointermove")?.length ?? 0, basePointerMoveListeners);
});

test("Tiptap table visual cell clicks suppress the follow-up native click", () => {
  const { calls, cells, documentListeners, editor, root, table } = createHarness();
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
    timeStamp: 10,
    preventDefault: () => events.push("preventDefault:down"),
    stopPropagation: () => events.push("stopPropagation:down"),
    stopImmediatePropagation: () => events.push("stopImmediatePropagation:down"),
  });
  latestDragListeners(documentListeners).end({
    target: paragraph,
    clientX: 120,
    clientY: 94,
    timeStamp: 20,
    preventDefault: () => events.push("preventDefault:up"),
    stopPropagation: () => events.push("stopPropagation:up"),
    stopImmediatePropagation: () => events.push("stopImmediatePropagation:up"),
  });

  assert.equal(
    root.listeners.get("click")({
      target: paragraph,
      clientX: 120,
      clientY: 94,
      timeStamp: 30,
      preventDefault: () => events.push("preventDefault:click"),
      stopPropagation: () => events.push("stopPropagation:click"),
      stopImmediatePropagation: () => events.push("stopImmediatePropagation:click"),
    }),
    true,
  );
  assert.deepEqual(events, [
    "stopPropagation:down",
    "stopImmediatePropagation:down",
    "preventDefault:click",
    "stopPropagation:click",
    "stopImmediatePropagation:click",
  ]);
  assert.deepEqual(calls.filter((call) => call[0] === "setCellSelection"), []);
  assert.deepEqual([...controller.state.selection.positions], [10]);
});

test("Tiptap table Delete clears a visual cell selection without stealing text selection", () => {
  const { calls, cells, documentListeners, editor, root, table } = createHarness();
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
  editor.commands.clearSelectedTableCells = () => {
    calls.push(["clearSelectedTableCells"]);
    editor.state.selection = { from: 12 };
    editor.view.domAtPos = () => ({ node: cells[0] });
    return true;
  };
  editor.commands.setTextSelection = (pos) => {
    calls.push(["setTextSelection", pos]);
    editor.state.selection = { from: pos };
    editor.view.domAtPos = () => ({ node: cells[0] });
    return true;
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
  });
  latestDragListeners(documentListeners).end({
    target: paragraph,
    clientX: 120,
    clientY: 94,
  });

  assertSingleCellVisualSelection(controller, cells[0], 10);

  assert.equal(
    controller.handleKeyDown({
      key: "Delete",
      preventDefault: () => events.push("preventDefault"),
      stopPropagation: () => events.push("stopPropagation"),
    }),
    true,
  );

  assert.deepEqual(events, ["preventDefault", "stopPropagation"]);
  assert.deepEqual(calls.filter((call) => call[0] !== "focus").slice(-3), [
    ["setCellSelection", 10, 10],
    ["clearSelectedTableCells"],
    ["setTextSelection", 12],
  ]);
  assertSingleCellVisualSelection(controller, cells[0], 10);
  assert.deepEqual(editor.state.selection, { from: 12 });
});

test("Tiptap table double click enters text editing inside the cell", () => {
  const { calls, cells, editor, pushEvent, root, table } = createHarness();
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    parentElement: cells[0],
    parentNode: cells[0],
    textContent: "Revenue",
    closest(selector) {
      if (selector === "th,td") return cells[0];
      if (selector.includes(".mn-tiptap-table") || selector.includes(", table")) return table;
      return null;
    },
  };
  editor.view.posAtCoords = ({ left, top }) => {
    calls.push(["posAtCoords", left, top]);
    return { pos: 17 };
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: root.ownerDocument },
  });
  const events = [];

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  assert.equal(
    root.listeners.get("dblclick")({
      target: paragraph,
      clientX: 124,
      clientY: 94,
      preventDefault: pushEvent(events, "preventDefault:dblclick"),
      stopPropagation: pushEvent(events, "stopPropagation:dblclick"),
      stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:dblclick"),
    }),
    true,
  );

  assert.deepEqual(events, [
    "preventDefault:dblclick",
    "stopPropagation:dblclick",
    "stopImmediatePropagation:dblclick",
  ]);
  assert.deepEqual(calls.slice(0, 3), [
    ["posAtCoords", 124, 94],
    ["setTextSelection", 17],
    ["focus"],
  ]);
  assert.equal(
    calls.some((call) => call[0] === "setCellSelection"),
    false,
  );
  assert.equal(controller.state.selection.positions.size, 0);
});
