import test from "node:test";
import assert from "node:assert/strict";

import {
  createTiptapFormatCommandController,
  PAPYRO_TIPTAP_FORMAT_COMMANDS,
} from "../src/tiptap-format-commands.js";

function createFakeEditor(activeIds = []) {
  const calls = [];
  const active = new Set(activeIds);
  const editor = {
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
      unsetAllMarks: () => {
        calls.push(["unsetAllMarks"]);
        return true;
      },
    },
    isActive: (name) => active.has(name),
  };

  return { calls, editor };
}

test("Tiptap format commands expose stable command ids", () => {
  assert.deepEqual(
    PAPYRO_TIPTAP_FORMAT_COMMANDS.map((command) => command.id),
    ["bold", "italic", "underline", "strike", "code", "highlight", "clear-formatting"],
  );
});

test("Tiptap format commands report active marks", () => {
  const { editor } = createFakeEditor(["bold", "underline", "code", "highlight"]);
  const controller = createTiptapFormatCommandController();

  assert.deepEqual(
    controller.states({ editor }).map((command) => [command.id, command.active]),
    [
      ["bold", true],
      ["italic", false],
      ["underline", true],
      ["strike", false],
      ["code", true],
      ["highlight", true],
      ["clear-formatting", false],
    ],
  );
  assert.deepEqual(
    controller.states({ editor }).map((command) => [command.id, command.priority]),
    [
      ["bold", 10],
      ["italic", 20],
      ["underline", 25],
      ["strike", 30],
      ["code", 40],
      ["highlight", 50],
      ["clear-formatting", 90],
    ],
  );
});

test("Tiptap format command controller runs editor mark commands", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapFormatCommandController();

  assert.deepEqual(controller.run("italic", { editor }), {
    ok: true,
    commandId: "italic",
    error: null,
  });
  assert.deepEqual(calls, [["toggleItalic"], ["focus"]]);
});

test("Tiptap format command controller runs underline, highlight, and clear formatting", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapFormatCommandController();

  assert.equal(controller.run("underline", { editor }).ok, true);
  assert.equal(controller.run("highlight", { editor }).ok, true);
  assert.equal(controller.run("clear-formatting", { editor }).ok, true);

  assert.deepEqual(calls, [
    ["toggleUnderline"],
    ["focus"],
    ["toggleHighlight"],
    ["focus"],
    ["unsetAllMarks"],
    ["focus"],
  ]);
});

test("Tiptap format command states localize labels and tooltips", () => {
  const { editor } = createFakeEditor();
  const controller = createTiptapFormatCommandController();

  const chinese = controller.states({
    editor,
    entry: { preferences: { language: "zh-CN" } },
  });

  assert.deepEqual(
    chinese.map((command) => [command.id, command.title, command.ariaLabel]),
    [
      ["bold", "加粗", "切换加粗"],
      ["italic", "斜体", "切换斜体"],
      ["underline", "下划线", "切换下划线"],
      ["strike", "删除线", "切换删除线"],
      ["code", "行内代码", "切换行内代码"],
      ["highlight", "高亮", "切换高亮"],
      ["clear-formatting", "清除格式", "清除所选文本格式"],
    ],
  );
});

test("Tiptap format command controller reports unknown commands", () => {
  const controller = createTiptapFormatCommandController();

  assert.deepEqual(controller.run("unknown"), {
    ok: false,
    commandId: "unknown",
    error: "unknown_format_command",
  });
});
