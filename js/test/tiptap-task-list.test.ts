import test from "node:test";
import assert from "node:assert/strict";

import { taskItemCheckboxLabel } from "../src/tiptap-task-list.ts";

test("Tiptap task item checkbox labels describe the next action", () => {
  assert.equal(
    taskItemCheckboxLabel({ textContent: "Ship source pane" }, false),
    "Mark task complete: Ship source pane",
  );
  assert.equal(
    taskItemCheckboxLabel({ textContent: "Ship source pane" }, true),
    "Mark task incomplete: Ship source pane",
  );
  assert.equal(taskItemCheckboxLabel({ textContent: "" }, false), "Mark task complete");
});
