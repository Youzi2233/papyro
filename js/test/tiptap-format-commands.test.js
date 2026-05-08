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
    isActive: (name) => active.has(name),
    getAttributes: (name) => (name === "textStyle" ? { color: active.get?.("color") ?? null } : {}),
  };

  return { calls, editor };
}

test("Tiptap format commands expose stable command ids", () => {
  assert.deepEqual(
    PAPYRO_TIPTAP_FORMAT_COMMANDS.map((command) => command.id),
    [
      "bold",
      "italic",
      "underline",
      "strike",
      "code",
      "link",
      "text-color-ink",
      "text-color-muted",
      "text-color-accent",
      "text-color-danger",
      "highlight",
      "clear-formatting",
    ],
  );
});

test("Tiptap format commands report active marks", () => {
  const { editor } = createFakeEditor(["bold", "underline", "code", "link", "highlight"]);
  const controller = createTiptapFormatCommandController();

  assert.deepEqual(
    controller.states({ editor }).map((command) => [command.id, command.active]),
    [
      ["bold", true],
      ["italic", false],
      ["underline", true],
      ["strike", false],
      ["code", true],
      ["link", true],
      ["text-color-ink", true],
      ["text-color-muted", false],
      ["text-color-accent", false],
      ["text-color-danger", false],
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
      ["link", 45],
      ["text-color-ink", 46],
      ["text-color-muted", 47],
      ["text-color-accent", 48],
      ["text-color-danger", 49],
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

test("Tiptap format command controller opens the custom link editor", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapFormatCommandController();
  const linkCalls = [];

  assert.deepEqual(
    controller.run("link", {
      editor,
      openLinkEditor: () => {
        linkCalls.push(["openLinkEditor"]);
        return true;
      },
    }),
    {
      ok: true,
      commandId: "link",
      error: null,
    },
  );

  assert.deepEqual(linkCalls, [["openLinkEditor"]]);
  assert.deepEqual(calls, []);
});

test("Tiptap format command controller runs official text color commands", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapFormatCommandController();

  assert.equal(controller.run("text-color-accent", { editor }).ok, true);
  assert.equal(controller.run("text-color-ink", { editor }).ok, true);

  assert.deepEqual(calls, [
    ["setColor", "var(--mn-accent)"],
    ["focus"],
    ["unsetColor"],
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
      ["link", "链接", "编辑链接"],
      ["text-color-ink", "默认文字", "使用当前编辑器文字颜色"],
      ["text-color-muted", "弱化文字", "弱化辅助文字"],
      ["text-color-accent", "强调文字", "应用强调文字颜色"],
      ["text-color-danger", "危险文字", "应用危险文字颜色"],
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
