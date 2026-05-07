import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { Window } from "happy-dom";

import {
  createPapyroMarkdownManager,
  createPapyroTiptapExtensions,
} from "./tiptap-markdown.js";

export function checkTiptapRuntimeSmoke(markdown) {
  const failures = [];
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installDomGlobals(windowRef);
  const root = windowRef.document.createElement("div");
  windowRef.document.body.appendChild(root);

  const extensions = createPapyroTiptapExtensions();
  const markdownManager = createPapyroMarkdownManager({ extensions });
  let editor = null;

  try {
    editor = new Editor({
      element: root,
      extensions: [...extensions, Markdown],
      content: markdown,
      contentType: "markdown",
      injectCSS: false,
      editorProps: {
        attributes: {
          class: "mn-tiptap-editor",
        },
      },
    });

    checkMountedEditor(failures, editor);
    checkRenderedDom(failures, editor.view?.dom);
    checkRoundTrip(failures, editor, markdownManager);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    editor?.destroy?.();
    restoreDomGlobals(previousGlobals);
    windowRef.close?.();
  }

  return failures;
}

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

function checkMountedEditor(failures, editor) {
  if (!editor?.view) {
    failures.push("editor view is not available after mount");
    return;
  }

  if (!editor.view.dom?.classList?.contains("ProseMirror")) {
    failures.push("editor view DOM is missing ProseMirror root class");
  }

  if (editor.isDestroyed) {
    failures.push("editor is destroyed immediately after mount");
  }
}

function checkRenderedDom(failures, dom) {
  if (!dom) return;

  const expectedSelectors = [
    ["h1", "heading"],
    ["h2", "second-level heading"],
    [".mn-tiptap-code-block, pre", "code block"],
    [".mn-tiptap-table, table", "table"],
    [".mn-tiptap-task-list, ul[data-type='taskList']", "task list"],
    [".mn-tiptap-callout, aside[data-mn-callout='block']", "callout"],
    [".mn-tiptap-math-block, div[data-mn-math='block']", "math block"],
    [".mn-tiptap-mermaid-block, div[data-mn-mermaid='block']", "Mermaid block"],
    [".mn-tiptap-image, img", "image"],
  ];

  for (const [selector, label] of expectedSelectors) {
    if (!dom.querySelector?.(selector)) {
      failures.push(`rendered DOM is missing ${label}`);
    }
  }
}

function checkRoundTrip(failures, editor, markdownManager) {
  const serialized = markdownManager.serialize(editor.getJSON());
  const reparsed = markdownManager.parse(serialized);
  const editorJson = editor.getJSON();

  if (stableStringify(reparsed) !== stableStringify(editorJson)) {
    failures.push("mounted editor JSON changed after Markdown round-trip");
  }

  const codeBlock = findNode(editorJson, "codeBlock");
  if (codeBlock?.attrs?.language !== "rust") {
    failures.push("code block language did not survive mounted parse");
  }

  const table = findNode(editorJson, "table");
  if (!table) {
    failures.push("table did not survive mounted parse");
  }
}

function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;

  const entries = Object.keys(value)
      .sort()
      .flatMap((key) => {
        if (key === "rel" && value[key] === "noopener noreferrer nofollow") return [];
        if (key === "target" && (value[key] === null || value[key] === "_blank")) return [];
        if (key === "class" && value[key] === null) return [];
        if (key === "start" && value[key] === 1) return [];
        if ((key === "colspan" || key === "rowspan") && value[key] === 1) return [];
        if (value[key] === null || value[key] === undefined) return [];
        const sortedValue = sortJson(value[key]);
        if (
          sortedValue &&
          typeof sortedValue === "object" &&
          !Array.isArray(sortedValue) &&
          Object.keys(sortedValue).length === 0
        ) {
          return [];
        }
        return [[key, sortedValue]];
      });

  return Object.fromEntries(entries);
}

function findNode(node, type) {
  if (!node || typeof node !== "object") return null;
  if (node.type === type) return node;
  for (const child of node.content ?? []) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return null;
}
