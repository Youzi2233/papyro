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
    },
    isActive: (name) => active.has(name),
  };

  return { calls, editor };
}

test("Tiptap format commands expose stable command ids", () => {
  assert.deepEqual(
    PAPYRO_TIPTAP_FORMAT_COMMANDS.map((command) => command.id),
    ["bold", "italic", "strike", "code"],
  );
});

test("Tiptap format commands report active marks", () => {
  const { editor } = createFakeEditor(["bold", "code"]);
  const controller = createTiptapFormatCommandController();

  assert.deepEqual(
    controller.states({ editor }).map((command) => [command.id, command.active]),
    [
      ["bold", true],
      ["italic", false],
      ["strike", false],
      ["code", true],
    ],
  );
  assert.deepEqual(
    controller.states({ editor }).map((command) => [command.id, command.priority]),
    [
      ["bold", 10],
      ["italic", 20],
      ["strike", 30],
      ["code", 40],
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

test("Tiptap format command controller reports unknown commands", () => {
  const controller = createTiptapFormatCommandController();

  assert.deepEqual(controller.run("unknown"), {
    ok: false,
    commandId: "unknown",
    error: "unknown_format_command",
  });
});
