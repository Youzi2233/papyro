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
    },
    isActive: (name) => activeMarks.has(name),
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

function createViewSpy() {
  const calls = [];
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
  };
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
      ["strike", false],
      ["code", false],
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
