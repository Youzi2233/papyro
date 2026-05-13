import test from "node:test";
import assert from "node:assert/strict";

import { createPapyroImageExtensions } from "../src/tiptap-image.js";
import { createPapyroMathExtensions } from "../src/tiptap-math.js";
import { createPapyroMermaidExtensions } from "../src/tiptap-mermaid.ts";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.listeners = new Map();
    this.textContent = "";
    this.innerHTML = "";
    this.title = "";
    this.value = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  contains(target) {
    return target === this || this.children.includes(target);
  }

  focus() {}

  select() {}
}

function createFakeDocument() {
  const documentRef = {
    defaultView: {
      clearTimeout,
      setTimeout,
    },
    createElement(tagName) {
      return new FakeElement(tagName, documentRef);
    },
  };
  return documentRef;
}

function createThrowingEditor() {
  return {
    get view() {
      throw new Error("editor.view was read before mount");
    },
    commands: {
      focus() {},
    },
  };
}

function createMountedView(documentRef) {
  const transactions = [];
  const dom = documentRef.createElement("div");
  return {
    dom,
    dispatch(transaction) {
      transactions.push(transaction);
    },
    state: {
      tr: {
        setNodeMarkup(pos, type, attrs) {
          return { pos, type, attrs };
        },
      },
    },
    transactions,
  };
}

function createNode(name, attrs = {}) {
  return {
    attrs,
    type: { name },
  };
}

test("custom Tiptap image node view does not read editor.view during mount", () => {
  const [extension] = createPapyroImageExtensions();
  const documentRef = createFakeDocument();
  const nodeViewFactory = extension.config.addNodeView();

  const nodeView = nodeViewFactory({
    editor: createThrowingEditor(),
    node: createNode("image", {
      src: "https://example.com/logo.png",
      alt: "Papyro",
    }),
    view: createMountedView(documentRef),
  });

  assert.equal(nodeView.dom.className, "mn-tiptap-image");
  assert.equal(nodeView.dom.ownerDocument, documentRef);
});

test("custom Tiptap math node view uses ProseMirror view before editor mount is complete", () => {
  const [extension] = createPapyroMathExtensions();
  const documentRef = createFakeDocument();
  const view = createMountedView(documentRef);
  view.dom.dataset.language = "Chinese";
  const nodeViewFactory = extension.config.addNodeView();

  const nodeView = nodeViewFactory({
    editor: createThrowingEditor(),
    getPos: () => 3,
    node: createNode("inlineMath", { source: "x^2" }),
    view,
  });

  assert.equal(nodeView.dom.className, "mn-tiptap-inline-math");
  assert.equal(nodeView.dom.getAttribute("aria-label"), "\u7f16\u8f91\u884c\u5185\u516c\u5f0f\u6e90\u7801");
  assert.equal(nodeView.dom.ownerDocument, documentRef);
  assert.deepEqual(view.transactions, []);
});

test("custom Tiptap Mermaid node view uses ProseMirror view before editor mount is complete", async () => {
  const previousDocument = globalThis.document;
  const previousHTMLElement = globalThis.HTMLElement;
  const documentRef = createFakeDocument();
  globalThis.document = documentRef;
  globalThis.HTMLElement = FakeElement;

  try {
    const [extension] = createPapyroMermaidExtensions();
    const view = createMountedView(documentRef);
    view.dom.dataset.language = "Chinese";
    const nodeViewFactory = extension.config.addNodeView();

    const nodeView = nodeViewFactory({
      editor: createThrowingEditor(),
      getPos: () => 5,
      node: createNode("mermaidBlock", { source: "" }),
      view,
    });

    assert.equal(nodeView.dom.className, "mn-mermaid-block mn-tiptap-mermaid-block");
    assert.equal(nodeView.dom.getAttribute("aria-label"), "\u7f16\u8f91 Mermaid \u56fe\u8868\u6e90\u7801");
    assert.equal(nodeView.dom.ownerDocument, documentRef);
    await Promise.resolve();
    await Promise.resolve();
  } finally {
    globalThis.document = previousDocument;
    globalThis.HTMLElement = previousHTMLElement;
  }
});
