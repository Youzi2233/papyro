import test from "node:test";
import assert from "node:assert/strict";

import {
  createTiptapSlashMenuController,
  findSlashTrigger,
} from "../src/tiptap-slash-menu.js";

function createDoc(text) {
  return {
    textBetween(from, to) {
      return text.slice(from, to);
    },
  };
}

function createEditor(text, cursor = text.length) {
  const calls = [];
  const editor = {
    state: {
      doc: createDoc(text),
      selection: {
        empty: true,
        from: cursor,
        $from: {
          start: () => 0,
        },
      },
    },
    commands: {
      deleteRange: (range) => {
        calls.push(["deleteRange", range.from, range.to]);
        return true;
      },
      focus: () => {
        calls.push(["focus"]);
        return true;
      },
      insertContent: (content, options) => {
        calls.push(["insertContent", content, options.contentType]);
        return true;
      },
      toggleHeading: (attrs) => {
        calls.push(["toggleHeading", attrs.level]);
        return true;
      },
    },
    view: {
      coordsAtPos: () => ({ left: 120, right: 120, top: 40, bottom: 60 }),
      dom: {
        ownerDocument: {
          documentElement: {
            clientWidth: 1000,
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
        state.query,
        state.commands.map((command) => command.id),
        state.selectedIndex,
        state.range,
      ]);
      this.choose = state.choose;
    },
    hide() {
      calls.push(["hide"]);
    },
    destroy() {
      calls.push(["destroy"]);
    },
  };
}

test("findSlashTrigger detects slash queries at text boundaries", () => {
  assert.deepEqual(findSlashTrigger("/h2"), { from: 0, to: 3, query: "h2" });
  assert.deepEqual(findSlashTrigger("hello /table"), {
    from: 6,
    to: 12,
    query: "table",
  });
  assert.equal(findSlashTrigger("hello/not-command"), null);
  assert.equal(findSlashTrigger("/too\nlate"), null);
});

test("Tiptap slash menu opens from editor text and ranks commands", () => {
  const { editor } = createEditor("hello /标题");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });

  controller.attach({ editor, root: { className: "root" } });

  assert.equal(controller.state.open, true);
  assert.equal(controller.state.query, "标题");
  assert.deepEqual(
    controller.state.commands.slice(0, 3).map((command) => command.id),
    ["heading-1", "heading-2", "heading-3"],
  );
  assert.deepEqual(view.calls, [
    ["mount", "root"],
    [
      "update",
      "标题",
      ["heading-1", "heading-2", "heading-3"],
      0,
      { from: 6, to: 9 },
    ],
  ]);
});

test("Tiptap slash menu keyboard selection wraps through command results", () => {
  const { editor } = createEditor("/标题");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  controller.moveSelection(1);
  assert.equal(controller.state.selectedIndex, 1);
  controller.moveSelection(-1);
  assert.equal(controller.state.selectedIndex, 0);
  controller.moveSelection(-1);
  assert.equal(controller.state.selectedIndex, 2);
});

test("Tiptap slash menu runs selected command and removes trigger text", () => {
  const { calls, editor } = createEditor("/h2");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  controller.attach({ editor, root: {} });

  assert.equal(controller.handleKeyDown({ key: "Enter", preventDefault() {} }), true);

  assert.equal(controller.state.open, false);
  assert.deepEqual(calls, [
    ["deleteRange", 0, 3],
    ["toggleHeading", 2],
    ["focus"],
  ]);
});

test("Tiptap slash menu closes on Escape", () => {
  const { editor } = createEditor("/table");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });
  let prevented = false;
  controller.attach({ editor, root: {} });

  assert.equal(
    controller.handleKeyDown({
      key: "Escape",
      preventDefault() {
        prevented = true;
      },
    }),
    true,
  );

  assert.equal(prevented, true);
  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls.at(-1), ["hide"]);
});

test("Tiptap slash menu stays closed without a slash trigger", () => {
  const { editor } = createEditor("plain text");
  const view = createViewSpy();
  const controller = createTiptapSlashMenuController({ view });

  controller.attach({ editor, root: {} });

  assert.equal(controller.state.open, false);
  assert.deepEqual(view.calls, [["mount", ""]]);
});
