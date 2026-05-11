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
          class: "mn-tiptap-editor tiptap",
        },
      },
    });

    checkMountedEditor(failures, editor);
    checkRenderedDom(failures, editor.view?.dom);
    checkCodeBlockChrome(failures, editor.view?.dom);
    checkRoundTrip(failures, editor, markdownManager);
    checkComplexTableRuntime(failures, root);
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

  if (!editor.view.dom?.classList?.contains("tiptap")) {
    failures.push("editor view DOM is missing the official Tiptap root class");
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

function checkCodeBlockChrome(failures, dom) {
  if (!dom) return;

  const codeBlock = dom.querySelector?.(".mn-tiptap-code-block, pre");
  if (!codeBlock) return;

  const languageButton = codeBlock.querySelector?.(".mn-tiptap-code-language-button");
  if (!languageButton) {
    failures.push("code block language control did not mount");
  }

  if (codeBlock.dataset?.codeLanguage !== "rust") {
    failures.push("code block language chrome did not expose rust");
  }

  if (codeBlock.dataset?.codeLanguageHighlighted !== "rust") {
    failures.push("code block highlighted language did not expose rust");
  }

  const code = codeBlock.querySelector?.("code");
  const className = String(code?.className ?? "");
  if (!className.includes("hljs") || !className.includes("language-rust")) {
    failures.push("code block DOM is missing lowlight language classes");
  }

  if ((codeBlock.querySelectorAll?.("[class*='hljs-']")?.length ?? 0) === 0) {
    failures.push("code block DOM is missing highlighted token spans");
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

function findComplexTable(node) {
  let found = null;
  walkJson(node, (child) => {
    if (found || child?.type !== "table") return;
    const rows = child.content ?? [];
    const complex = rows.some((row) =>
      (row.content ?? []).some((cell) => {
        const attrs = cell.attrs ?? {};
        return attrs.backgroundColor || Number(attrs.colspan ?? 1) > 1;
      }),
    );
    if (complex) found = child;
  });
  return found;
}

function checkComplexTableRuntime(failures, root) {
  let editor = null;

  try {
    editor = new Editor({
      element: root.ownerDocument.createElement("div"),
      extensions: createPapyroTiptapExtensions(),
      content:
        '<table><tbody><tr><th data-cell-background="rgba(245, 158, 11, 0.16)" style="text-align: center; background-color: rgba(245, 158, 11, 0.16)">Feature</th><th>Status</th></tr><tr><td style="text-align: right">Source</td><td data-cell-background="rgba(59, 130, 246, 0.14)" colspan="2" style="background-color: rgba(59, 130, 246, 0.14)">Done</td></tr></tbody></table>',
      injectCSS: false,
    });
    const complexTable = findComplexTable(editor.getJSON());
    if (!complexTable) {
      failures.push("complex table attributes did not survive mounted HTML parse");
    }
  } catch (error) {
    failures.push(`complex table runtime smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    editor?.destroy?.();
  }
}

function walkJson(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const child of node.content ?? []) {
    walkJson(child, visit);
  }
}
