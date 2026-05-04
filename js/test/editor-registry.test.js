import test from "node:test";
import assert from "node:assert/strict";

import {
  EditorRuntimeRegistry,
  createEditorRuntimeRegistry,
} from "../src/editor-registry.js";

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

  assert.equal(registry.register("tab-a", entry), entry);
  assert.equal(registry.unregister("missing-tab"), null);
  assert.equal(registry.unregister("tab-a"), entry);
  assert.equal(registry.has("tab-a"), false);
});

test("editor runtime registry can wrap an existing map", () => {
  const map = new Map([["tab-a", { view: "view-a" }]]);
  const registry = createEditorRuntimeRegistry(map);

  registry.register("tab-b", { view: "view-b" });

  assert.equal(map.has("tab-b"), true);
  registry.clear();
  assert.equal(map.size, 0);
});
