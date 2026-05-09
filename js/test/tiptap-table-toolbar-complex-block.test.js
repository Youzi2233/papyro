import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapTableToolbarController } from "../src/tiptap-table-toolbar.js";
import { createDocument } from "./tiptap-table-toolbar-fixtures.js";

function createCodeBlockHarness() {
  const calls = [];
  const codeBlock = {
    nodeType: 1,
    tagName: "PRE",
    className: "mn-tiptap-code-block",
    ownerDocument: {
      documentElement: {
        clientWidth: 1000,
        clientHeight: 800,
      },
    },
    contains(target) {
      return target === this;
    },
    closest(selector) {
      if (selector.includes(".mn-tiptap-code-block") || selector.includes("pre")) return this;
      return null;
    },
    getBoundingClientRect: () => ({
      left: 160,
      top: 140,
      right: 520,
      bottom: 220,
      width: 360,
      height: 80,
    }),
  };
  const root = {
    listeners: new Map(),
    contains: (target) => target === codeBlock,
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (this.listeners.get(type) === listener) this.listeners.delete(type);
    },
  };
  codeBlock.parentElement = root;
  const codeNode = { nodeSize: 12, type: { name: "codeBlock" } };
  const editor = {
    state: {
      selection: { from: 4 },
      doc: {
        nodeAt(pos) {
          return pos === 5 ? codeNode : null;
        },
        resolve() {
          return { depth: 0 };
        },
      },
    },
    view: {
      dom: root,
      domAtPos() {
        return { node: codeBlock };
      },
      posAtDOM(target) {
        return target === codeBlock ? 5 : 9;
      },
    },
    commands: {
      insertContentAt(position, content, options) {
        calls.push(["insertContentAt", position, content, options]);
        return true;
      },
      setTextSelection(position) {
        calls.push(["setTextSelection", position]);
        return true;
      },
      focus() {
        calls.push(["focus"]);
      },
    },
  };

  return { calls, codeBlock, editor, root };
}

function complexInsertRail(created) {
  return created.find((element) =>
    String(element.className).includes("mn-tiptap-complex-block-insert"),
  );
}

test("Tiptap table toolbar inserts before complex blocks from the top rail", () => {
  const { created, documentRef } = createDocument();
  const { calls, codeBlock, editor, root } = createCodeBlockHarness();
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  root.listeners.get("pointermove")({
    target: codeBlock,
    clientX: 240,
    clientY: 142,
  });
  const insertRail = complexInsertRail(created);

  assert.equal(controller.state.hover.edge, "block-before");
  assert.equal(insertRail.hidden, false);
  assert.equal(insertRail.style.top, "120px");
  assert.equal(insertRail.dataset.insertEdge, "before");
  assert.equal(insertRail.title, "Insert block before");
  assert.equal(insertRail["aria-label"], "Insert block before");

  insertRail.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [
    [
      "insertContentAt",
      5,
      { type: "paragraph" },
      { updateSelection: true },
    ],
    ["setTextSelection", 6],
    ["focus"],
  ]);
});

test("Tiptap table toolbar opens the insert menu before complex blocks from the top rail", () => {
  const { created, documentRef } = createDocument();
  const { calls, codeBlock, editor, root } = createCodeBlockHarness();
  const insertMenu = {
    calls: [],
    contains() {
      return false;
    },
    openAtBlock(target, options = {}) {
      this.calls.push([
        "openAtBlock",
        target.kind,
        target.pos,
        target.node?.nodeSize,
        options.edge,
        options.anchorRect?.top,
      ]);
      return { open: true };
    },
  };
  const controller = createTiptapTableToolbarController({
    dom: { document: documentRef },
    insertMenu,
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  root.listeners.get("pointermove")({
    target: codeBlock,
    clientX: 240,
    clientY: 142,
  });
  complexInsertRail(created).onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(insertMenu.calls, [["openAtBlock", "code_block", 5, 12, "before", 140]]);
  assert.deepEqual(calls, []);
});
