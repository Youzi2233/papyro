import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapBlockHintsController } from "../src/tiptap-block-hints-controller.js";

function hints(revision = 1) {
  return {
    revision,
    fallback: { type: "none" },
    blocks: [{ kind: "heading", from_line: 1, to_line: 1 }],
  };
}

test("Tiptap block hints controller stores revisioned hints on the entry", () => {
  const controller = createTiptapBlockHintsController();
  const entry = {};

  assert.deepEqual(controller.apply(entry, hints(2)), {
    changed: true,
    error: null,
    hints: hints(2),
  });
  assert.deepEqual(entry.blockHints, hints(2));
});

test("Tiptap block hints controller treats repeated revisions as unchanged", () => {
  const controller = createTiptapBlockHintsController();
  const entry = {};

  controller.apply(entry, hints(3));

  assert.deepEqual(controller.apply(entry, hints(3)), {
    changed: false,
    error: null,
    hints: hints(3),
  });
});

test("Tiptap block hints controller rejects invalid hints without clearing state", () => {
  const controller = createTiptapBlockHintsController();
  const entry = {};

  controller.apply(entry, hints(4));

  assert.deepEqual(controller.apply(entry, { revision: -1, blocks: [] }), {
    changed: false,
    error: "invalid_block_hints",
    hints: hints(4),
  });
  assert.deepEqual(entry.blockHints, hints(4));
});
