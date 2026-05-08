import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapFormatToolbarController } from "../src/tiptap-format-toolbar.js";

function createEditor({ selected = true, active = [], viewportWidth = 1000 } = {}) {
  const calls = [];
  const activeMarks = new Set(active);
  const editor = {
    state: {
      selection: {
        empty: !selected,
        from: 4,
        to: 12,
      },
    },
    commands: {
      focus: () => calls.push(["focus"]),
      toggleBold: () => {
        calls.push(["toggleBold"]);
        return true;
      },
      toggleCode: () => {
        calls.push(["toggleCode"]);
        return true;
      },
      toggleItalic: () => {
        calls.push(["toggleItalic"]);
        return true;
      },
      toggleStrike: () => {
        calls.push(["toggleStrike"]);
        return true;
      },
      toggleUnderline: () => {
        calls.push(["toggleUnderline"]);
        return true;
      },
      toggleHighlight: () => {
        calls.push(["toggleHighlight"]);
        return true;
      },
      setColor: (color) => {
        calls.push(["setColor", color]);
        return true;
      },
      unsetColor: () => {
        calls.push(["unsetColor"]);
        return true;
      },
      unsetAllMarks: () => {
        calls.push(["unsetAllMarks"]);
        return true;
      },
    },
    isActive: (name) => activeMarks.has(name),
    getAttributes: (name) => (name === "textStyle" ? { color: null } : {}),
    view: {
      coordsAtPos: (pos) => ({
        left: pos * 10,
        right: pos * 10 + 2,
        top: 80,
        bottom: 100,
      }),
      dom: {
        ownerDocument: {
          documentElement: {
            clientWidth: viewportWidth,
            clientHeight: 800,
          },
        },
      },
    },
  };

  return { calls, editor };
}

function createLinkEditorSpy() {
  const calls = [];
  let containedTarget = null;
  return {
    calls,
    open(payload) {
      calls.push(["open", payload?.range, payload?.entry?.viewMode]);
      return true;
    },
    contains(target) {
      return target === containedTarget;
    },
    setContainedTarget(target) {
      containedTarget = target;
    },
  };
}

function createViewSpy() {
  const calls = [];
  let containedTarget = null;
  return {
    calls,
    mount(root) {
      calls.push(["mount", root?.className ?? ""]);
    },
    update(state) {
      calls.push([
        "update",
        state.range,
        state.density,
        state.commands.map((command) => [command.id, command.active]),
      ]);
      this.run = state.run;
    },
    hide() {
      calls.push(["hide"]);
    },
    destroy() {
      calls.push(["destroy"]);
    },
    contains(target) {
      return target === containedTarget;
    },
    setContainedTarget(target) {
      containedTarget = target;
    },
  };
}

function createDismissDocument() {
  const listeners = new Map();
  return {
    body: {
      appendChild() {},
    },
    documentElement: {
      clientWidth: 1000,
      clientHeight: 800,
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    emit(type, event = {}) {
      listeners.get(type)?.(event);
    },
  };
}

function createDocument() {
  const created = [];
  const documentRef = {
    createElement(tagName) {
      const element = {
        tagName,
        children: [],
        className: "",
        dataset: {},
        style: {},
        classList: {
          toggle(name, enabled) {
            element[name] = enabled;
          },
        },
        append(...children) {
          this.children.push(...children);
        },
        appendChild(child) {
          this.children.push(child);
        },
        replaceChildren(...children) {
          this.children = children;
        },
        setAttribute(name, value) {
          this[name] = value;
        },
        addEventListener(name, handler) {
          this[`on${name}`] = handler;
        },
        contains(target) {
          return target === this;
        },
        remove() {
          this.removed = true;
        },
      };
      created.push(element);
      return element;
    },
    body: {
      appendChild(child) {
        this.child = child;
      },
    },
  };
  return { created, documentRef };
}

test("Tiptap format toolbar opens for non-empty Hybrid selections", () => {
  const { editor } = createEditor({ active: ["bold"] });
  const view = createViewSpy();
  const controller = createTiptapFormatToolbarController({ view });

  controller.attach({ editor, root: { className: "root" }, entry: { viewMode: "hybrid" } });

  assert.equal(controller.state.open, true);
  assert.deepEqual(controller.state.range, { from: 4, to: 12 });
  assert.deepEqual(
    controller.state.commands.map((command) => [command.id, command.active]),
    [
      ["bold", true],
      ["italic", false],
      ["underline", false],
      ["strike", false],
      ["code", false],
      ["link", false],
      ["text-color-ink", true],
      ["text-color-muted", false],
      ["text-color-accent", false],
      ["text-color-danger", false],
      ["highlight", false],
      ["clear-formatting", false],
    ],
  );
  assert.equal(controller.state.density, "regular");
  assert.deepEqual(view.calls[0], ["mount", "root"]);
  assert.equal(view.calls[1][0], "update");
});

test("Tiptap format toolbar switches to compact density in narrow viewports", () => {
  const { editor } = createEditor({ viewportWidth: 420 });
  const view = createViewSpy();
  const controller = createTiptapFormatToolbarController({ view });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(controller.state.density, "compact");
  assert.equal(view.calls[1][2], "compact");
});

test("Tiptap format toolbar stays closed for collapsed selections", () => {
  const { editor } = createEditor({ selected: false });
  const view = createViewSpy();
  const controller = createTiptapFormatToolbarController({ view });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls, [["mount", ""]]);
});

test("Tiptap format toolbar stays closed outside Hybrid mode", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapFormatToolbarController({ view });

  controller.attach({ editor, root: {}, entry: { viewMode: "preview" } });

  assert.equal(controller.state.open, false);
});

test("Tiptap format toolbar runs selected commands", () => {
  const { calls, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapFormatToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  view.calls.length = 0;

  assert.equal(controller.run("bold"), true);

  assert.deepEqual(calls, [["toggleBold"], ["focus"]]);
  assert.equal(view.calls[0][0], "update");
});

test("Tiptap format toolbar opens the injected link editor", () => {
  const { calls, editor } = createEditor();
  const view = createViewSpy();
  const linkEditor = createLinkEditorSpy();
  const controller = createTiptapFormatToolbarController({ view, linkEditor });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  view.calls.length = 0;

  assert.equal(controller.run("link"), true);

  assert.deepEqual(calls, []);
  assert.deepEqual(linkEditor.calls, [["open", { from: 4, to: 12 }, "hybrid"]]);
  assert.equal(view.calls[0][0], "update");
});

test("Tiptap format toolbar contains the link editor overlay", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const linkEditor = createLinkEditorSpy();
  const linkTarget = { id: "link-editor" };
  linkEditor.setContainedTarget(linkTarget);
  const controller = createTiptapFormatToolbarController({ view, linkEditor });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.equal(controller.contains(linkTarget), true);
});

test("Tiptap format toolbar exposes official mark commands and clear formatting", () => {
  const { calls, editor } = createEditor({ active: ["underline", "highlight"] });
  const view = createViewSpy();
  const controller = createTiptapFormatToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  assert.deepEqual(
    controller.state.commands.map((command) => [command.id, command.active]),
    [
      ["bold", false],
      ["italic", false],
      ["underline", true],
      ["strike", false],
      ["code", false],
      ["link", false],
      ["text-color-ink", true],
      ["text-color-muted", false],
      ["text-color-accent", false],
      ["text-color-danger", false],
      ["highlight", true],
      ["clear-formatting", false],
    ],
  );

  calls.length = 0;
  assert.equal(controller.run("clear-formatting"), true);

  assert.deepEqual(calls, [["unsetAllMarks"], ["focus"]]);
});

test("Tiptap format toolbar exposes official text color commands", () => {
  const { calls, editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapFormatToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  calls.length = 0;
  assert.equal(controller.run("text-color-danger"), true);

  assert.deepEqual(calls, [["setColor", "var(--mn-danger)"], ["focus"]]);
});

test("Tiptap format toolbar buttons run commands from pointerdown", () => {
  const { created, documentRef } = createDocument();
  const { calls, editor } = createEditor();
  const controller = createTiptapFormatToolbarController({
    dom: { document: documentRef },
  });

  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });
  const button = created.find((element) => element.dataset.commandId === "bold");
  const clear = created.find((element) => element.dataset.commandId === "clear-formatting");
  const events = [];

  button.onpointerdown({
    preventDefault() {
      events.push("preventDefault");
    },
    stopPropagation() {
      events.push("stopPropagation");
    },
  });

  assert.deepEqual(events, ["preventDefault", "stopPropagation"]);
  assert.deepEqual(calls, [["toggleBold"], ["focus"]]);
  assert.equal(clear.children.at(-1).textContent, "Tx");
});

test("Tiptap format toolbar closes and destroys view state", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const controller = createTiptapFormatToolbarController({ view });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  controller.close();
  controller.destroy();

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.slice(-2), [["hide"], ["destroy"]]);
});

test("Tiptap format toolbar closes on outside pointer events", () => {
  const { editor } = createEditor();
  const view = createViewSpy();
  const documentRef = createDismissDocument();
  const controller = createTiptapFormatToolbarController({
    dom: { document: documentRef },
    view,
  });
  controller.attach({ editor, root: {}, entry: { viewMode: "hybrid" } });

  documentRef.emit("pointerdown", { target: { id: "outside" } });

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});
