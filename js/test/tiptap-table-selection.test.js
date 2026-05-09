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

test("Tiptap table inline text content previews the cell as an object selection", () => {
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
      stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:down"),
    }),
    false,
  );

  assert.deepEqual(events, [
    "preventDefault:down",
    "stopPropagation:down",
    "stopImmediatePropagation:down",
  ]);
  assert.deepEqual(calls, []);
  assert.deepEqual([...controller.state.selection.positions], [11]);
  assert.equal(documentListeners.has("pointermove"), true);
  assert.ok((documentListeners.get("pointerup")?.length ?? 0) >= 1);
  const dragMove = documentListeners.get("pointermove").at(-1);
  const dragEnd = documentListeners.get("pointerup").at(-1);

  dragMove({
    target: inline,
    clientX: 240,
    clientY: 96,
    preventDefault: pushEvent(events, "preventDefault:move"),
    stopPropagation: pushEvent(events, "stopPropagation:move"),
    stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:move"),
  });
  dragEnd({
    target: inline,
    clientX: 240,
    clientY: 96,
    preventDefault: pushEvent(events, "preventDefault:up"),
    stopPropagation: pushEvent(events, "stopPropagation:up"),
    stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:up"),
  });

  assert.deepEqual(events, [
    "preventDefault:down",
    "stopPropagation:down",
    "stopImmediatePropagation:down",
    "preventDefault:move",
    "stopPropagation:move",
    "stopImmediatePropagation:move",
    "preventDefault:up",
    "stopPropagation:up",
    "stopImmediatePropagation:up",
  ]);
  assert.deepEqual(calls, [["setCellSelection", 11, 11], ["focus"]]);
});

test("Tiptap table empty paragraph surface selects the whole cell", () => {
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
      stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:down"),
    }),
    false,
  );

  assert.deepEqual(events, [
    "preventDefault:down",
    "stopPropagation:down",
    "stopImmediatePropagation:down",
  ]);

  documentListeners.get("pointerup").at(-1)({
    target: paragraph,
    clientX: 220,
    clientY: 96,
    preventDefault: pushEvent(events, "preventDefault:up"),
    stopPropagation: pushEvent(events, "stopPropagation:up"),
    stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:up"),
  });

  assert.deepEqual(events, [
    "preventDefault:down",
    "stopPropagation:down",
    "stopImmediatePropagation:down",
    "preventDefault:up",
    "stopPropagation:up",
    "stopImmediatePropagation:up",
  ]);
  assert.deepEqual(calls, [["setCellSelection", 11, 11], ["focus"]]);
  assert.equal(controller.state.cell, cells[1]);
  assert.equal(controller.state.cellRect?.left, 190);
  assert.deepEqual([...controller.state.selection.positions], [11]);
  assert.equal(cells[1].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(cells[1].classes.has("mn-tiptap-table-cell-active"), false);
});

test("Tiptap table blank cell clicks select the editable cell", () => {
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
      stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:down"),
    }),
    false,
  );

  assert.deepEqual(events, [
    "preventDefault:down",
    "stopPropagation:down",
    "stopImmediatePropagation:down",
  ]);

  documentListeners.get("pointerup").at(-1)({
    target: cells[1],
    clientX: 220,
    clientY: 96,
    preventDefault: pushEvent(events, "preventDefault:up"),
    stopPropagation: pushEvent(events, "stopPropagation:up"),
    stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:up"),
  });

  assert.deepEqual(events, [
    "preventDefault:down",
    "stopPropagation:down",
    "stopImmediatePropagation:down",
    "preventDefault:up",
    "stopPropagation:up",
    "stopImmediatePropagation:up",
  ]);
  assert.deepEqual(calls, [["setCellSelection", 11, 11], ["focus"]]);
  assert.equal(controller.state.cell, cells[1]);
  assert.equal(controller.state.cellRect?.left, 190);
  assert.deepEqual([...controller.state.selection.positions], [11]);
  assert.equal(cells[1].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(cells[1].classes.has("mn-tiptap-table-cell-active"), false);
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
  assert.deepEqual(calls, [["setCellSelection", 13, 13], ["focus"]]);
  assert.deepEqual([...controller.state.selection.positions], [13]);
  assert.equal(cells[3].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(cells[3].classes.has("mn-tiptap-table-cell-active"), false);
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

test("Tiptap table filled paragraph short clicks select the cell object", () => {
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
    stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:down"),
  });

  assert.equal(documentListeners.has("pointermove"), true);
  assert.ok((documentListeners.get("pointerup")?.length ?? 0) >= 1);
  assert.deepEqual(events, [
    "preventDefault:down",
    "stopPropagation:down",
    "stopImmediatePropagation:down",
  ]);
  assert.deepEqual(calls, []);
  assert.equal(controller.state.cell, cells[0]);
  assert.deepEqual([...controller.state.selection.positions], [10]);

  documentListeners.get("pointerup").at(-1)({
    target: paragraph,
    clientX: 120,
    clientY: 94,
    preventDefault: pushEvent(events, "preventDefault:up"),
    stopPropagation: pushEvent(events, "stopPropagation:up"),
    stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:up"),
  });

  assert.deepEqual(events, [
    "preventDefault:down",
    "stopPropagation:down",
    "stopImmediatePropagation:down",
    "preventDefault:up",
    "stopPropagation:up",
    "stopImmediatePropagation:up",
  ]);
  assert.deepEqual(calls, [["setCellSelection", 10, 10], ["focus"]]);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-selected"), true);
  assert.equal(cells[0].classes.has("mn-tiptap-table-cell-active"), false);
});

test("Tiptap table filled paragraph drag extends cell object selection", () => {
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
  const dragMove = documentListeners.get("pointermove").at(-1);
  const dragEnd = documentListeners.get("pointerup").at(-1);

  dragMove({
    target: paragraph,
    clientX: 220,
    clientY: 94,
    preventDefault: pushEvent(events, "preventDefault:move"),
    stopPropagation: pushEvent(events, "stopPropagation:move"),
  });
  dragEnd({
    target: paragraph,
    clientX: 220,
    clientY: 94,
    preventDefault: pushEvent(events, "preventDefault:up"),
    stopPropagation: pushEvent(events, "stopPropagation:up"),
  });

  assert.deepEqual(events, [
    "preventDefault:down",
    "stopPropagation:down",
    "preventDefault:move",
    "stopPropagation:move",
    "preventDefault:up",
    "stopPropagation:up",
  ]);
  assert.deepEqual(calls, [["setCellSelection", 10, 11], ["focus"]]);
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
  assert.deepEqual(events, ["preventDefault:down", "stopPropagation:down"]);
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
  const basePointerMoveListeners = documentListeners.get("pointermove")?.length ?? 0;
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
    "preventDefault:down",
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

test("Tiptap table object clicks suppress the follow-up native click", () => {
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
    timeStamp: 10,
    preventDefault: pushEvent(events, "preventDefault:down"),
    stopPropagation: pushEvent(events, "stopPropagation:down"),
    stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:down"),
  });
  documentListeners.get("pointerup").at(-1)({
    target: paragraph,
    clientX: 120,
    clientY: 94,
    timeStamp: 20,
    preventDefault: pushEvent(events, "preventDefault:up"),
    stopPropagation: pushEvent(events, "stopPropagation:up"),
    stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:up"),
  });

  assert.equal(
    root.listeners.get("click")({
      target: paragraph,
      clientX: 120,
      clientY: 94,
      timeStamp: 30,
      preventDefault: pushEvent(events, "preventDefault:click"),
      stopPropagation: pushEvent(events, "stopPropagation:click"),
      stopImmediatePropagation: pushEvent(events, "stopImmediatePropagation:click"),
    }),
    true,
  );
  assert.deepEqual(events, [
    "preventDefault:down",
    "stopPropagation:down",
    "stopImmediatePropagation:down",
    "preventDefault:up",
    "stopPropagation:up",
    "stopImmediatePropagation:up",
    "preventDefault:click",
    "stopPropagation:click",
    "stopImmediatePropagation:click",
  ]);
  assert.deepEqual(calls, [["setCellSelection", 10, 10], ["focus"]]);
  assert.deepEqual([...controller.state.selection.positions], [10]);
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
