import test from "node:test";
import assert from "node:assert/strict";

import {
  commandMenuSidePanel,
  commandMenuSidePanelWidth,
  groupCommandsForMenu,
} from "../src/tiptap-react/commands/command-menu-model.js";

test("React command menu model groups commands in first-seen order", () => {
  assert.deepEqual(
    groupCommandsForMenu([
      { id: "paragraph", group: "Text" },
      { id: "heading-1", group: "Text" },
      { id: "table", group: "Advanced" },
      { id: "image", group: "Advanced", index: 7 },
    ]),
    [
      {
        name: "Text",
        commands: [
          { id: "paragraph", group: "Text", index: 0 },
          { id: "heading-1", group: "Text", index: 1 },
        ],
      },
      {
        name: "Advanced",
        commands: [
          { id: "table", group: "Advanced", index: 2 },
          { id: "image", group: "Advanced", index: 7 },
        ],
      },
    ],
  );
});

test("React command menu model exposes side panel contracts", () => {
  assert.equal(commandMenuSidePanel({ id: "table" }), "table");
  assert.equal(commandMenuSidePanel({ id: "callout" }), "callout");
  assert.equal(commandMenuSidePanel({ id: "paragraph" }), "none");
  assert.equal(commandMenuSidePanel(null), "none");

  assert.equal(commandMenuSidePanelWidth("table"), 158);
  assert.equal(commandMenuSidePanelWidth("callout"), 164);
  assert.equal(commandMenuSidePanelWidth("none"), 0);
});
