import test from "node:test";
import assert from "node:assert/strict";

import { createTiptapPreferencesController } from "../src/tiptap-preferences-controller.js";

test("Tiptap preferences controller normalizes default preferences", () => {
  const controller = createTiptapPreferencesController();
  const entry = {};

  assert.deepEqual(controller.attach(entry), {
    autoLinkPaste: true,
    language: "english",
  });
  assert.deepEqual(entry.preferences, {
    autoLinkPaste: true,
    language: "english",
  });
});

test("Tiptap preferences controller applies Rust message fields idempotently", () => {
  const controller = createTiptapPreferencesController({ autoLinkPaste: true });
  const entry = {};

  assert.deepEqual(controller.apply(entry, { auto_link_paste: false }), {
    changed: true,
    preferences: { autoLinkPaste: false, language: "english" },
  });
  assert.deepEqual(entry.preferences, { autoLinkPaste: false, language: "english" });

  assert.deepEqual(controller.apply(entry, { auto_link_paste: false }), {
    changed: false,
    preferences: { autoLinkPaste: false, language: "english" },
  });
});

test("Tiptap preferences controller accepts camelCase preferences", () => {
  const controller = createTiptapPreferencesController({ autoLinkPaste: false });

  assert.deepEqual(controller.apply({}, { autoLinkPaste: true }), {
    changed: true,
    preferences: { autoLinkPaste: true, language: "english" },
  });
});

test("Tiptap preferences controller applies language without resetting paste settings", () => {
  const controller = createTiptapPreferencesController({ autoLinkPaste: false });
  const entry = {};

  assert.deepEqual(controller.apply(entry, { language: "Chinese" }), {
    changed: true,
    preferences: { autoLinkPaste: false, language: "Chinese" },
  });
  assert.deepEqual(entry.preferences, { autoLinkPaste: false, language: "Chinese" });
});

test("Tiptap preferences controller lets React chrome observe localized preferences", () => {
  const controller = createTiptapPreferencesController({ language: "english" });
  const entry = {};

  controller.apply(entry, { language: "Chinese" });

  assert.deepEqual(entry.preferences, {
    autoLinkPaste: true,
    language: "Chinese",
  });
});
