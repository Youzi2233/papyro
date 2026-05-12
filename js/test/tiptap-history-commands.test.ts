import test from "node:test";
import assert from "node:assert/strict";

import {
  createTiptapHistoryCommandController,
  PAPYRO_TIPTAP_HISTORY_COMMANDS,
} from "../src/tiptap-history-commands.js";

function createFakeEditor(commandResults = {}) {
  const calls = [];
  const editor = {
    commands: {
      focus: () => calls.push(["focus"]),
      undo: () => {
        calls.push(["undo"]);
        return commandResults.undo ?? true;
      },
      redo: () => {
        calls.push(["redo"]);
        return commandResults.redo ?? true;
      },
    },
  };

  return { calls, editor };
}

test("Tiptap history commands expose stable command ids", () => {
  assert.deepEqual(
    PAPYRO_TIPTAP_HISTORY_COMMANDS.map((command) => command.id),
    ["undo", "redo"],
  );
});

test("Tiptap history command controller runs undo and redo", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapHistoryCommandController();

  assert.deepEqual(controller.run("undo", { editor }), {
    ok: true,
    commandId: "undo",
    error: null,
  });
  assert.deepEqual(controller.run("redo", { editor }), {
    ok: true,
    commandId: "redo",
    error: null,
  });

  assert.deepEqual(calls, [
    ["undo"],
    ["focus"],
    ["redo"],
    ["focus"],
  ]);
});

test("Tiptap history command controller reports unavailable commands", () => {
  const { calls, editor } = createFakeEditor({ undo: false });
  const controller = createTiptapHistoryCommandController();

  assert.deepEqual(controller.run("undo", { editor }), {
    ok: false,
    commandId: "undo",
    error: "history_command_failed",
  });
  assert.deepEqual(controller.run("unknown", { editor }), {
    ok: false,
    commandId: "unknown",
    error: "unknown_history_command",
  });
  assert.deepEqual(calls, [["undo"]]);
});
