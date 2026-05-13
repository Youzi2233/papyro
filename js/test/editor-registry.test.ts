import test from "node:test";
import assert from "node:assert/strict";

import {
  EditorRuntimeRegistry,
  createEditorRuntimeRegistry,
  isRuntimeEditorDestroyed,
} from "../src/editor-registry.ts";

test("editor runtime registry exposes Map-compatible entry access", () => {
  const registry = createEditorRuntimeRegistry();
  const entry = { view: "view-a" };

  assert.equal(registry.size, 0);
  assert.equal(registry.set("tab-a", entry), registry);
  assert.equal(registry.has("tab-a"), true);
  assert.equal(registry.get("tab-a"), entry);
  assert.deepEqual([...registry.keys()], ["tab-a"]);
  assert.deepEqual([...registry.values()], [entry]);
  assert.deepEqual([...registry], [["tab-a", entry]]);

  assert.equal(registry.delete("tab-a"), true);
  assert.equal(registry.get("tab-a"), undefined);
  assert.equal(registry.size, 0);
});

test("editor runtime registry register and unregister return lifecycle entries", () => {
  const registry = new EditorRuntimeRegistry();
  const entry = { view: "view-a", dioxus: null };
  const otherEntry = { view: "view-b" };

  assert.equal(registry.register("tab-a", entry), entry);
  assert.equal(registry.unregister("missing-tab"), null);
  assert.equal(registry.unregister("tab-a", otherEntry), null);
  assert.equal(registry.has("tab-a"), true);
  assert.equal(registry.unregister("tab-a"), entry);
  assert.equal(registry.has("tab-a"), false);
});

test("editor runtime registry validates current tab and editor identity", () => {
  const registry = createEditorRuntimeRegistry();
  const editor = { isDestroyed: false };
  const entry = { editor };
  const staleEditor = { isDestroyed: false };

  registry.register("tab-a", entry);

  assert.equal(registry.currentEntry("tab-a"), entry);
  assert.equal(registry.currentEntry("tab-a", { entry }), entry);
  assert.equal(registry.currentEntry("tab-a", { editor }), entry);
  assert.equal(registry.entryForEditor("tab-a", editor), entry);
  assert.equal(registry.isCurrentEntry("tab-a", entry), true);
  assert.equal(registry.isCurrentEditor("tab-a", editor), true);

  assert.equal(registry.currentEntry("tab-a", { editor: staleEditor }), null);
  assert.equal(registry.isCurrentEditor("tab-a", staleEditor), false);

  editor.isDestroyed = true;
  assert.equal(registry.currentEntry("tab-a"), null);
  assert.equal(registry.isCurrentEntry("tab-a", entry), false);
});

test("editor runtime registry releases entries through one lifecycle hook", () => {
  const registry = createEditorRuntimeRegistry();
  const disposed = [];
  const entry = { editor: { destroyed: false } };

  registry.register("tab-a", entry);

  assert.equal(registry.release("tab-a", (released) => disposed.push(released)), entry);
  assert.deepEqual(disposed, [entry]);
  assert.equal(registry.has("tab-a"), false);
  assert.equal(registry.release("tab-a", () => disposed.push("missing")), null);
  assert.deepEqual(disposed, [entry]);
});

test("editor runtime registry recognizes Tiptap destroyed editor shapes", () => {
  assert.equal(isRuntimeEditorDestroyed({ isDestroyed: true }), true);
  assert.equal(isRuntimeEditorDestroyed({ destroyed: true }), true);
  assert.equal(isRuntimeEditorDestroyed({ isDestroyed: false }), false);
  assert.equal(isRuntimeEditorDestroyed(null), false);
});

test("editor runtime registry can wrap an existing map", () => {
  const map = new Map([["tab-a", { view: "view-a" }]]);
  const registry = createEditorRuntimeRegistry(map);

  registry.register("tab-b", { view: "view-b" });

  assert.equal(map.has("tab-b"), true);
  registry.clear();
  assert.equal(map.size, 0);
});
