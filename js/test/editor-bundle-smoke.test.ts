import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";

const EDITOR_BUNDLE_URL = new URL("../../assets/editor.js", import.meta.url);

function installBundleDomGlobals(windowRef) {
  const previous = new Map();
  const install = {
    window: windowRef,
    self: windowRef,
    document: windowRef.document,
    navigator: windowRef.navigator,
    HTMLElement: windowRef.HTMLElement,
    HTMLDivElement: windowRef.HTMLDivElement,
    HTMLButtonElement: windowRef.HTMLButtonElement,
    HTMLTableElement: windowRef.HTMLTableElement,
    HTMLTableRowElement: windowRef.HTMLTableRowElement,
    HTMLTableCellElement: windowRef.HTMLTableCellElement,
    Element: windowRef.Element,
    Document: windowRef.Document,
    Node: windowRef.Node,
    DOMParser: windowRef.DOMParser,
    MutationObserver: windowRef.MutationObserver,
    getComputedStyle: windowRef.getComputedStyle.bind(windowRef),
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    innerHeight: 900,
    innerWidth: 1200,
  };

  if (!windowRef.ResizeObserver) {
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    windowRef.ResizeObserver = ResizeObserver;
    install.ResizeObserver = ResizeObserver;
  }

  if (!windowRef.DOMRect) {
    class DOMRect {
      constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.top = y;
        this.left = x;
        this.right = x + width;
        this.bottom = y + height;
      }

      static fromRect(rect = {}) {
        return new DOMRect(
          rect.x ?? 0,
          rect.y ?? 0,
          rect.width ?? 0,
          rect.height ?? 0,
        );
      }
    }
    windowRef.DOMRect = DOMRect;
    install.DOMRect = DOMRect;
  }

  for (const [name, value] of Object.entries(install)) {
    previous.set(name, {
      exists: Object.prototype.hasOwnProperty.call(globalThis, name),
      value: globalThis[name],
    });
    globalThis[name] = value;
  }

  return previous;
}

function restoreBundleDomGlobals(previous) {
  for (const [name, record] of previous.entries()) {
    if (record.exists) {
      globalThis[name] = record.value;
    } else {
      delete globalThis[name];
    }
  }
}

test("editor bundle mounts the full Tiptap runtime without a React island crash", async () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previousGlobals = installBundleDomGlobals(windowRef);
  const runtimeErrors = [];
  const consoleErrors = [];

  windowRef.console.error = (...args) => {
    consoleErrors.push(args.map((arg) => arg?.stack || String(arg)).join(" "));
  };
  windowRef.addEventListener("error", (event) => {
    runtimeErrors.push(event.error?.stack || event.message || String(event.error));
  });
  windowRef.addEventListener("unhandledrejection", (event) => {
    runtimeErrors.push(event.reason?.stack || String(event.reason));
  });

  try {
    const container = windowRef.document.createElement("div");
    container.id = "editor-root";
    windowRef.document.body.appendChild(container);

    windowRef.eval(readFileSync(EDITOR_BUNDLE_URL, "utf8"));
    const facade = windowRef.papyroEditor;
    const descriptor = facade.describe();

    assert.equal(Object.isFrozen(facade), true);
    assert.equal(descriptor.name, "papyro.editor");
    assert.equal(descriptor.version, "1.0.0");
    assert.equal(descriptor.protocolVersion, 1);
    assert.equal(descriptor.runtimeKind, "tiptap");
    assert.deepEqual(Array.from(descriptor.methods), [
      "ensureEditor",
      "attachChannel",
      "handleRustMessage",
      "attachPreviewScroll",
      "navigateOutline",
      "syncOutline",
      "scrollEditorToLine",
      "scrollPreviewToHeading",
      "renderPreviewMermaid",
      "renderPreviewMath",
    ]);

    const editor = windowRef.papyroEditor.ensureEditor({
      tabId: "tab-a",
      containerId: "editor-root",
      instanceId: "bundle-smoke",
      initialContent: "| A | B |\n| - | - |\n| 1 | 2 |",
      viewMode: "Hybrid",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.ok(editor?.view, "editor view should be available");
    assert.equal(editor.isDestroyed, false);
    assert.ok(windowRef.document.querySelector(".ProseMirror"));
    assert.ok(windowRef.document.querySelector(".mn-tiptap-react-root"));
    assert.equal(
      runtimeErrors.join("\n"),
      "",
      "bundle should not emit window runtime errors",
    );
    assert.equal(
      consoleErrors.join("\n"),
      "",
      "bundle should not emit console errors during mount",
    );

    editor.destroy();
  } finally {
    restoreBundleDomGlobals(previousGlobals);
    windowRef.close?.();
  }
});
