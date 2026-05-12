import test from "node:test";
import assert from "node:assert/strict";

import {
  PAPYRO_CODE_LANGUAGE_OPTIONS,
  codeBlockLanguageLabel,
  codeBlockLanguageOption,
  codeBlockLanguageOptionToken,
  codeBlockLanguageUiLabel,
  createCodeHighlightDecorations,
  createPapyroCodeBlockNodeView,
  createPapyroCodeBlockOptions,
  createPapyroCodeBlockExtensions,
  inferCodeBlockLanguage,
  normalizeCodeBlockLanguage,
} from "../src/tiptap-code-block.js";
import { Schema } from "@tiptap/pm/model";

function createElementFactory() {
  const documentRef = {
    body: null,
    documentElement: {
      clientWidth: 960,
      clientHeight: 720,
      lang: "en",
    },
    listeners: new Map(),
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (this.listeners.get(type) === handler) {
        this.listeners.delete(type);
      }
    },
    createElement(tagName) {
      const element = {
        tagName: String(tagName).toUpperCase(),
        className: "",
        dataset: {},
        style: {},
        hidden: false,
        children: [],
        attributes: new Map(),
        ownerDocument: documentRef,
        parentElement: null,
        classList: {
          toggle(className, enabled) {
            const classes = new Set(String(element.className).split(/\s+/).filter(Boolean));
            if (enabled) {
              classes.add(className);
            } else {
              classes.delete(className);
            }
            element.className = [...classes].join(" ");
          },
        },
        append(...children) {
          children.forEach((child) => this.appendChild(child));
        },
        appendChild(child) {
          this.children.push(child);
          child.parentElement = this;
          return child;
        },
        replaceChildren(...children) {
          this.children = [];
          this.append(...children);
        },
        setAttribute(name, value) {
          this.attributes.set(name, String(value));
          this[name] = String(value);
        },
        getAttribute(name) {
          return this.attributes.get(name);
        },
        focus(options) {
          this.focusOptions = options;
        },
        addEventListener(type, handler) {
          this[`on${type}`] = handler;
        },
        remove() {
          this.removed = true;
        },
        contains(target) {
          let current = target;
          while (current) {
            if (current === this) return true;
            current = current.parentElement;
          }
          return false;
        },
        getBoundingClientRect() {
          return {
            left: 120,
            top: 48,
            right: 184,
            bottom: 76,
            width: 64,
            height: 28,
          };
        },
      };
      return element;
    },
  };
  documentRef.body = documentRef.createElement("body");
  return documentRef;
}

test("Papyro code block options keep Tiptap's official node configurable", () => {
  const options = createPapyroCodeBlockOptions();
  assert.equal(options.defaultLanguage, null);
  assert.equal(options.enableTabIndentation, true);
  assert.equal(options.tabSize, 2);
  assert.equal(options.languageClassPrefix, "language-");
  assert.equal(options.HTMLAttributes.class, "mn-tiptap-code-block");
  assert.equal(typeof options.lowlight.highlight, "function");
  assert.ok(options.lowlight.listLanguages().includes("rust"));
  assert.ok(options.lowlight.listLanguages().includes("sql"));
  assert.ok(options.lowlight.listLanguages().includes("yaml"));
});

test("Papyro code block language normalization accepts safe language ids", () => {
  assert.equal(normalizeCodeBlockLanguage("Rust"), "rust");
  assert.equal(normalizeCodeBlockLanguage("ts-node"), "ts-node");
  assert.equal(normalizeCodeBlockLanguage("c++"), "c++");
  assert.equal(normalizeCodeBlockLanguage(""), null);
  assert.equal(normalizeCodeBlockLanguage("bad lang"), null);
  assert.equal(normalizeCodeBlockLanguage("x".repeat(80)), null);
});

test("Papyro code block extension uses lowlight and exposes language commands", () => {
  const [extension] = createPapyroCodeBlockExtensions();
  assert.equal(extension.name, "codeBlock");
  assert.equal(typeof extension.config.addCommands, "function");
  assert.equal(typeof extension.config.addNodeView, "function");
});

test("Papyro code block extension can inject a node view renderer with DOM fallback", () => {
  const documentRef = createElementFactory();
  const editorDom = documentRef.createElement("div");
  const node = {
    type: { name: "codeBlock" },
    attrs: { language: "rust" },
    textContent: "fn main() {}",
  };
  const editor = {
    view: {
      dom: editorDom,
      dispatch() {},
    },
    state: {
      doc: {
        nodeAt(pos) {
          return pos === 4 ? node : null;
        },
      },
      tr: {
        setNodeMarkup() {
          return this;
        },
      },
    },
    commands: {
      focus() {},
    },
  };
  const calls = [];
  const [extension] = createPapyroCodeBlockExtensions({
    nodeViewRenderer({ options, fallbackNodeView }) {
      calls.push(["factory", options.HTMLAttributes.class, typeof fallbackNodeView]);
      return (props) => {
        calls.push(["render", props.node.type.name]);
        return fallbackNodeView(props);
      };
    },
  });
  const configuredOptions = {
    ...createPapyroCodeBlockOptions(),
    ...extension.options,
  };
  const addNodeView = extension.config.addNodeView.bind({
    options: configuredOptions,
  });

  const renderer = addNodeView();
  const view = renderer({
    editor,
    node,
    getPos: () => 4,
    view: {
      dom: editorDom,
      dispatch() {},
    },
  });

  assert.deepEqual(calls, [
    ["factory", "mn-tiptap-code-block", "function"],
    ["render", "codeBlock"],
  ]);
  assert.equal(view.dom.className, "mn-tiptap-code-block");
  assert.equal(view.dom.dataset.codeLanguage, "rust");
  assert.equal(view.contentDOM.className, "language-rust hljs language-rust");
});

test("Papyro code block language options are stable and label empty fences", () => {
  assert.equal(codeBlockLanguageLabel(""), "auto");
  assert.equal(codeBlockLanguageLabel("Rust"), "rust");
  assert.equal(codeBlockLanguageUiLabel("Chinese", null), "自动");
  assert.equal(codeBlockLanguageUiLabel("Chinese", "plaintext"), "纯文本");
  assert.equal(codeBlockLanguageOptionToken("javascript"), "JS");
  assert.equal(codeBlockLanguageOptionToken("typescript"), "TS");
  assert.equal(codeBlockLanguageOptionToken("plaintext"), "TXT");
  assert.equal(codeBlockLanguageOption("ts-node"), null);
  assert.deepEqual(
    PAPYRO_CODE_LANGUAGE_OPTIONS.slice(0, 4).map((option) => option.id),
    ["auto", "plaintext", "javascript", "typescript"],
  );
});

test("Papyro code block normalizes highlighted language classes", () => {
  const documentRef = createElementFactory();
  const editorDom = documentRef.createElement("div");
  const node = {
    type: { name: "codeBlock" },
    attrs: { language: "html" },
  };
  const editor = {
    view: {
      dom: editorDom,
      dispatch() {},
    },
    state: {
      doc: {
        nodeAt() {
          return node;
        },
      },
      tr: {
        setNodeMarkup() {
          return this;
        },
      },
    },
    commands: {
      focus() {},
    },
  };

  const view = createPapyroCodeBlockNodeView({
    editor,
    node,
    getPos: () => 4,
    options: createPapyroCodeBlockOptions(),
  });

  assert.equal(view.dom.dataset.codeLanguage, "html");
  assert.equal(view.contentDOM.className, "language-html hljs language-html");
});

test("Papyro code block node view does not read editor.view before mount", () => {
  const documentRef = createElementFactory();
  const editorDom = documentRef.createElement("div");
  const node = {
    type: { name: "codeBlock" },
    attrs: { language: "rust" },
    textContent: "fn main() {}",
  };
  const editor = {
    get view() {
      throw new Error("view is not available");
    },
    state: {
      doc: {
        nodeAt() {
          return node;
        },
      },
      tr: {
        setNodeMarkup() {
          return this;
        },
      },
    },
    commands: {
      focus() {},
    },
  };

  const view = createPapyroCodeBlockNodeView({
    editor,
    view: {
      dom: editorDom,
      dispatch() {},
    },
    node,
    getPos: () => 4,
    options: createPapyroCodeBlockOptions(),
  });

  assert.equal(view.dom.ownerDocument, documentRef);
  assert.equal(view.dom.dataset.codeLanguage, "rust");
  assert.equal(view.contentDOM.className, "language-rust hljs language-rust");
});

test("Papyro code blocks expose a conservative auto-detected language label", () => {
  assert.equal(inferCodeBlockLanguage("function greet(name) { return `hi ${name}` }"), "javascript");
  assert.equal(inferCodeBlockLanguage("fn main() { println!(\"hi\"); }"), null);
  assert.equal(codeBlockLanguageUiLabel("Chinese", null), "自动");
});

test("Papyro code block node view exposes an editable language menu", () => {
  const documentRef = createElementFactory();
  const root = documentRef.createElement("div");
  root.className = "mn-tiptap-runtime";
  root.dataset.language = "Chinese";
  const editorDom = documentRef.createElement("div");
  editorDom.parentElement = root;
  editorDom.closest = (selector) => (selector === ".mn-tiptap-runtime" ? root : null);
  const calls = [];
  const node = {
    type: { name: "codeBlock" },
    attrs: { language: "rust" },
    textContent: "fn main() {}",
  };
  const tr = {
    setNodeMarkup(pos, _type, attrs) {
      calls.push(["setNodeMarkup", pos, attrs.language]);
      return this;
    },
  };
  const editor = {
    view: {
      dom: editorDom,
      dispatch(transaction) {
        calls.push(["dispatch", transaction === tr]);
      },
    },
    state: {
      doc: {
        nodeAt(pos) {
          return pos === 4 ? node : null;
        },
      },
      tr,
    },
    commands: {
      focus() {
        calls.push(["focus"]);
      },
    },
  };

  const view = createPapyroCodeBlockNodeView({
    editor,
    node,
    getPos: () => 4,
    options: createPapyroCodeBlockOptions(),
  });
  const languageButton = view.dom.children[0];
  const code = view.contentDOM;
  const menu = documentRef.body.children.find((child) =>
    String(child.className).includes("mn-tiptap-code-language-menu"),
  );

  assert.equal(view.dom.dataset.codeLanguage, "rust");
  assert.equal(view.dom.dataset.codeLanguageMode, "explicit");
  assert.equal(view.dom.dataset.hasLanguageControl, "true");
  assert.equal(languageButton.textContent, "Rust");
  assert.equal(languageButton.dataset.languageBadge, "RS");
  assert.equal(languageButton.dataset.languageMode, "explicit");
  assert.equal(languageButton.dataset.languageValue, "rust");
  assert.equal(languageButton["aria-haspopup"], "menu");
  assert.equal(view.dom.children[1].className, "mn-tiptap-code-toolbar");
  assert.equal(code.className, "language-rust hljs language-rust");

  languageButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });
  assert.equal(menu.hidden, false);
  assert.equal(menu.children[0].textContent, "代码语言");
  assert.equal(
    menu.children[1].children.find((child) => child.dataset.languageId === "auto").textContent,
    "自动检测",
  );
  assert.equal(
    menu.children[1].children.find((child) => child.dataset.languageId === "plaintext").dataset.languageToken,
    "TXT",
  );

  const plaintext = menu.children[1].children.find((child) => child.dataset.languageId === "plaintext");
  plaintext.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls, [
    ["setNodeMarkup", 4, "plaintext"],
    ["dispatch", true],
    ["focus"],
  ]);
  assert.equal(menu.hidden, true);
});

test("Papyro code block chrome copies code without changing document content", async () => {
  const previousNavigator = globalThis.navigator;
  const clipboardWrites = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        async writeText(text) {
          clipboardWrites.push(text);
        },
      },
    },
  });

  try {
    const documentRef = createElementFactory();
    const node = {
      type: { name: "codeBlock" },
      attrs: { language: "javascript" },
      textContent: "const answer = 42;",
    };
    const calls = [];
    const editor = {
      view: {
        dom: documentRef.createElement("div"),
        dispatch() {
          calls.push(["dispatch"]);
        },
      },
      state: {
        doc: {
          nodeAt() {
            return node;
          },
        },
        tr: {
          setNodeMarkup() {
            calls.push(["setNodeMarkup"]);
            return this;
          },
        },
      },
      commands: {
        focus() {
          calls.push(["focus"]);
        },
      },
    };

    const view = createPapyroCodeBlockNodeView({
      editor,
      node,
      getPos: () => 4,
      options: createPapyroCodeBlockOptions(),
    });
    const toolbar = view.dom.children[1];
    const copyButton = toolbar.children[0];

    await copyButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });

    assert.deepEqual(clipboardWrites, ["const answer = 42;"]);
    assert.deepEqual(calls, []);
    assert.equal(copyButton.dataset.state, "copied");
    assert.equal(copyButton.attributes.get("aria-label"), "Copied");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: previousNavigator,
    });
  }
});

test("Papyro code block chrome exposes a local soft-wrap toggle", () => {
  const documentRef = createElementFactory();
  const node = {
    type: { name: "codeBlock" },
    attrs: { language: "rust" },
    textContent: "fn main() {}",
  };
  const editor = {
    view: {
      dom: documentRef.createElement("div"),
      dispatch() {},
    },
    state: {
      doc: {
        nodeAt() {
          return node;
        },
      },
      tr: {
        setNodeMarkup() {
          return this;
        },
      },
    },
    commands: {
      focus() {},
    },
  };

  const view = createPapyroCodeBlockNodeView({
    editor,
    node,
    getPos: () => 4,
    options: createPapyroCodeBlockOptions(),
  });
  const wrapButton = view.dom.children[1].children[1];

  assert.equal(view.dom.dataset.codeWrap, "false");
  assert.equal(wrapButton.attributes.get("aria-pressed"), "false");
  assert.equal(wrapButton.attributes.get("aria-label"), "Wrap lines");

  wrapButton.onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.equal(view.dom.dataset.codeWrap, "true");
  assert.equal(wrapButton.attributes.get("aria-pressed"), "true");
  assert.equal(wrapButton.attributes.get("aria-label"), "Disable line wrap");

  wrapButton.onclick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(view.dom.dataset.codeWrap, "true");

  wrapButton.onclick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(view.dom.dataset.codeWrap, "false");
  assert.equal(wrapButton.attributes.get("aria-pressed"), "false");
});

test("Papyro code block language menu supports keyboard navigation", () => {
  const documentRef = createElementFactory();
  const root = documentRef.createElement("div");
  root.className = "mn-tiptap-runtime";
  root.dataset.language = "english";
  const editorDom = documentRef.createElement("div");
  editorDom.parentElement = root;
  editorDom.closest = (selector) => (selector === ".mn-tiptap-runtime" ? root : null);
  const calls = [];
  const node = {
    type: { name: "codeBlock" },
    attrs: { language: "rust" },
    textContent: "fn main() {}",
  };
  const tr = {
    setNodeMarkup(pos, _type, attrs) {
      calls.push(["setNodeMarkup", pos, attrs.language]);
      return this;
    },
  };
  const editor = {
    view: {
      dom: editorDom,
      dispatch(transaction) {
        calls.push(["dispatch", transaction === tr]);
      },
    },
    state: {
      doc: {
        nodeAt(pos) {
          return pos === 4 ? node : null;
        },
      },
      tr,
    },
    commands: {
      focus() {
        calls.push(["focus"]);
      },
    },
  };
  const events = [];
  const keyboardEvent = (key) => ({
    key,
    preventDefault() {
      events.push(["preventDefault", key]);
    },
    stopPropagation() {
      events.push(["stopPropagation", key]);
    },
  });

  const view = createPapyroCodeBlockNodeView({
    editor,
    node,
    getPos: () => 4,
    options: createPapyroCodeBlockOptions(),
  });
  const languageButton = view.dom.children[0];
  const menu = documentRef.body.children.find((child) =>
    String(child.className).includes("mn-tiptap-code-language-menu"),
  );

  languageButton.onkeydown(keyboardEvent("ArrowDown"));

  assert.equal(menu.hidden, false);
  assert.deepEqual(menu.focusOptions, { preventScroll: true });
  assert.equal(menu.attributes.get("aria-activedescendant"), `${menu.id}-item-4`);

  menu.onkeydown(keyboardEvent("ArrowDown"));
  assert.equal(menu.attributes.get("aria-activedescendant"), `${menu.id}-item-5`);

  menu.onkeydown(keyboardEvent("Home"));
  assert.equal(menu.attributes.get("aria-activedescendant"), `${menu.id}-item-0`);

  menu.onkeydown(keyboardEvent("Enter"));

  assert.deepEqual(calls, [
    ["setNodeMarkup", 4, null],
    ["dispatch", true],
    ["focus"],
  ]);
  assert.equal(menu.hidden, true);
  assert.deepEqual(events, [
    ["preventDefault", "ArrowDown"],
    ["stopPropagation", "ArrowDown"],
    ["preventDefault", "ArrowDown"],
    ["stopPropagation", "ArrowDown"],
    ["preventDefault", "Home"],
    ["stopPropagation", "Home"],
    ["preventDefault", "Enter"],
    ["stopPropagation", "Enter"],
  ]);
});

test("Papyro code block language menus use unique active descendant ids", () => {
  const documentRef = createElementFactory();
  const editorDom = documentRef.createElement("div");
  const node = {
    type: { name: "codeBlock" },
    attrs: { language: "rust" },
    textContent: "fn main() {}",
  };
  const editor = {
    view: {
      dom: editorDom,
      dispatch() {},
    },
    state: {
      doc: {
        nodeAt() {
          return node;
        },
      },
      tr: {
        setNodeMarkup() {
          return this;
        },
      },
    },
    commands: {
      focus() {},
    },
  };

  const first = createPapyroCodeBlockNodeView({
    editor,
    node,
    getPos: () => 4,
    options: createPapyroCodeBlockOptions(),
  });
  const second = createPapyroCodeBlockNodeView({
    editor,
    node,
    getPos: () => 8,
    options: createPapyroCodeBlockOptions(),
  });
  const menus = documentRef.body.children.filter((child) =>
    String(child.className).includes("mn-tiptap-code-language-menu"),
  );

  first.dom.children[0].onpointerdown({ preventDefault() {}, stopPropagation() {} });
  second.dom.children[0].onpointerdown({ preventDefault() {}, stopPropagation() {} });

  assert.notEqual(menus[0].id, menus[1].id);
  assert.equal(menus[0].attributes.get("aria-activedescendant"), `${menus[0].id}-item-4`);
  assert.equal(menus[1].attributes.get("aria-activedescendant"), `${menus[1].id}-item-4`);
});

test("Papyro code block node view labels automatic syntax detection when reliable", () => {
  const documentRef = createElementFactory();
  const root = documentRef.createElement("div");
  root.className = "mn-tiptap-runtime";
  root.dataset.language = "Chinese";
  const editorDom = documentRef.createElement("div");
  editorDom.parentElement = root;
  editorDom.closest = (selector) => (selector === ".mn-tiptap-runtime" ? root : null);
  const node = {
    type: { name: "codeBlock" },
    attrs: { language: null },
    textContent: "function greet(name) { return `hi ${name}` }",
  };
  const editor = {
    view: {
      dom: editorDom,
      dispatch() {},
    },
    state: {
      doc: {
        nodeAt() {
          return node;
        },
      },
      tr: {
        setNodeMarkup() {
          return this;
        },
      },
    },
    commands: {
      focus() {},
    },
  };

  const view = createPapyroCodeBlockNodeView({
    editor,
    node,
    getPos: () => 4,
    options: createPapyroCodeBlockOptions(),
  });

  assert.equal(view.dom.dataset.codeLanguage, "auto");
  assert.equal(view.dom.dataset.codeLanguageMode, "auto");
  assert.equal(view.dom.dataset.codeLanguageDetected, "javascript");
  assert.equal(view.dom.dataset.codeLanguageHighlighted, "javascript");
  assert.equal(view.dom.dataset.codeLanguageLabel, "自动 · JavaScript");
  assert.equal(view.dom.children[0].dataset.languageBadge, "JS");
  assert.equal(view.dom.children[0].dataset.languageMode, "auto");
  assert.equal(view.dom.children[0].dataset.languageDetected, "javascript");
  assert.equal(view.contentDOM.className, "language-javascript hljs language-javascript");
});

test("Papyro code block static render exposes detected syntax classes", () => {
  const [extension] = createPapyroCodeBlockExtensions();
  const renderHTML = extension.config.renderHTML.bind({
    options: createPapyroCodeBlockOptions(),
  });

  const rendered = renderHTML({
    node: {
      attrs: { language: null },
      textContent: "const answer = 42;\nfunction greet(name) { return `hi ${name}`; }",
    },
    HTMLAttributes: {},
  });

  assert.equal(rendered[1]["data-code-language"], "auto");
  assert.equal(rendered[1]["data-code-language-mode"], "auto");
  assert.equal(rendered[1]["data-code-language-detected"], "javascript");
  assert.equal(rendered[1]["data-code-language-highlighted"], "javascript");
  assert.equal(rendered[2][1].class, "language-javascript hljs language-javascript");
});

test("Papyro code block decorations add lowlight token classes", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      text: { group: "inline" },
      codeBlock: {
        group: "block",
        content: "text*",
        marks: "",
        code: true,
        attrs: { language: { default: null } },
      },
    },
  });
  const doc = schema.node("doc", null, [
    schema.node("codeBlock", { language: "javascript" }, [
      schema.text("const answer = 42;"),
    ]),
  ]);

  const decorations = createCodeHighlightDecorations(doc).find();
  const classes = decorations.map((decoration) => decoration.type.attrs.class);

  assert.ok(classes.some((className) => String(className).includes("hljs-keyword")));
  assert.ok(classes.some((className) => String(className).includes("hljs-number")));
});
