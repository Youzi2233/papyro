import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapPreferencesController } from "../src/tiptap-preferences-controller.js";

test("Tiptap preferences controller normalizes default preferences", () => {
  const controller = createTiptapPreferencesController();
  const entry = {};

  assert.deepEqual(controller.attach(entry), { autoLinkPaste: true });
  assert.deepEqual(entry.preferences, { autoLinkPaste: true });
});

test("Tiptap preferences controller applies Rust message fields idempotently", () => {
  const controller = createTiptapPreferencesController({ autoLinkPaste: true });
  const entry = {};

  assert.deepEqual(controller.apply(entry, { auto_link_paste: false }), {
    changed: true,
    preferences: { autoLinkPaste: false },
  });
  assert.deepEqual(entry.preferences, { autoLinkPaste: false });

  assert.deepEqual(controller.apply(entry, { auto_link_paste: false }), {
    changed: false,
    preferences: { autoLinkPaste: false },
  });
});

test("Tiptap preferences controller accepts camelCase preferences", () => {
  const controller = createTiptapPreferencesController({ autoLinkPaste: false });

  assert.deepEqual(controller.apply({}, { autoLinkPaste: true }), {
    changed: true,
    preferences: { autoLinkPaste: true },
  });
});
