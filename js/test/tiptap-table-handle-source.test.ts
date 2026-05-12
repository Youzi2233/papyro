import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tableHandlePluginSource = readFileSync(
  new URL(
    "../src/components/tiptap-node/table-node/extensions/table-handle/table-handle-plugin.ts",
    import.meta.url,
  ),
  "utf8",
);

test("official table handles stay hover-driven while the pointer is down in a cell", () => {
  assert.match(tableHandlePluginSource, /mouseMoveHandler = \(event\) => \{/u);
  assert.match(tableHandlePluginSource, /if \(this\.menuFrozen\) return/u);
  assert.doesNotMatch(tableHandlePluginSource, /mouseState/u);
  assert.equal(
    tableHandlePluginSource.includes("Hide handles while selecting inside a cell"),
    false,
  );
  assert.doesNotMatch(tableHandlePluginSource, /Hide handles while selecting inside a cell/u);
});

test("official table handle mousedown restores a caret instead of selecting a whole paragraph", () => {
  assert.match(
    tableHandlePluginSource,
    /TextSelection\.create\(state\.doc,\s*posInfo\.pos,\s*posInfo\.pos\)/u,
  );
  assert.match(tableHandlePluginSource, /TextSelection\.near\(\$pos,\s*1\)/u);
  assert.doesNotMatch(tableHandlePluginSource, /const from = \$pos\.start/u);
  assert.doesNotMatch(tableHandlePluginSource, /const to = \$pos\.end/u);
  assert.doesNotMatch(tableHandlePluginSource, /TextSelection\.create\(state\.doc,\s*from,\s*to\)/u);
});
