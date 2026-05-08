import test from "node:test";
import assert from "node:assert/strict";

import {
  commandMenuGroupTone,
  commandMenuSidePanelId,
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

test("React command menu model applies the canonical command group order", () => {
  assert.deepEqual(
    groupCommandsForMenu([
      { id: "math-block", group: "Advanced", index: 12 },
      { id: "paragraph", group: "Text", index: 0 },
      { id: "image", group: "Media", index: 13 },
      { id: "table", group: "Data", index: 11 },
    ]).map((group) => group.name),
    ["Text", "Data", "Media", "Advanced"],
  );
});

test("React command menu model exposes side panel contracts", () => {
  assert.equal(commandMenuSidePanel({ id: "table" }), "table");
  assert.equal(commandMenuSidePanel({ id: "callout" }), "callout");
  assert.equal(commandMenuSidePanel({ id: "code-block" }), "code-language");
  assert.equal(commandMenuSidePanel({ id: "paragraph" }), "none");
  assert.equal(commandMenuSidePanel(null), "none");

  assert.equal(commandMenuSidePanelWidth("table"), 148);
  assert.equal(commandMenuSidePanelWidth("callout"), 166);
  assert.equal(commandMenuSidePanelWidth("code-language"), 176);
  assert.equal(commandMenuSidePanelWidth("none"), 0);
  assert.equal(commandMenuSidePanelId("menu", "table"), "menu-table-panel");
  assert.equal(commandMenuSidePanelId("menu", "callout"), "menu-callout-panel");
  assert.equal(commandMenuSidePanelId("menu", "code-language"), "menu-code-language-panel");
  assert.equal(commandMenuSidePanelId("menu", "none"), undefined);
});

test("React command menu model exposes semantic icon group tones", () => {
  assert.equal(commandMenuGroupTone({ id: "paragraph", group: "Text" }), "text");
  assert.equal(commandMenuGroupTone({ id: "task-list", group: "Lists" }), "lists");
  assert.equal(commandMenuGroupTone({ id: "code-block", group: "Blocks" }), "blocks");
  assert.equal(commandMenuGroupTone({ id: "table", group: "Data" }), "data");
  assert.equal(commandMenuGroupTone({ id: "image", group: "Media" }), "media");
  assert.equal(commandMenuGroupTone({ id: "mermaid", group: "Advanced" }), "advanced");
  assert.equal(commandMenuGroupTone({ id: "table", group: "鏁版嵁" }), "data");
});

test("React command menu model keeps command indexes stable across grouped full menus", () => {
  const groups = groupCommandsForMenu([
    { id: "paragraph", group: "Text", index: 0 },
    { id: "heading-1", group: "Text", index: 1 },
    { id: "table", group: "Advanced", index: 11 },
    { id: "math-block", group: "Advanced", index: 12 },
    { id: "image", group: "Advanced", index: 14 },
  ]);

  assert.deepEqual(
    groups.flatMap((group) => group.commands.map((command) => command.index)),
    [0, 1, 11, 12, 14],
  );
});
