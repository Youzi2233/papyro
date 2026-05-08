import test from "node:test";
import assert from "node:assert/strict";

import {
  blockActionHomeEndIndex,
  blockActionShortcutCommandIdFromEvent,
  blockActionSubmenuGroups,
  blockActionSubmenuPanelWidth,
  commandSubmenuId,
  firstSubmenuChildIndex,
  groupBlockActionCommands,
  nextCommandIndexInSubmenu,
  prepareBlockActionMenuCommands,
  submenuCommandIndex,
  submenuParentIndex,
} from "../src/tiptap-react/commands/block-action-menu-model.js";

test("React block action menu model groups top-level commands", () => {
  assert.deepEqual(
    groupBlockActionCommands([
      { id: "copy-block", group: "Actions" },
      { id: "delete", group: "Actions", tone: "danger" },
      { id: "text-color-accent", group: "Color" },
      { id: "heading-1", group: "Text", submenu: "turn-into" },
    ]),
    [
      {
        key: "Actions",
        name: "Actions",
        layout: "list",
        tone: "danger",
        commands: [
          { id: "copy-block", group: "Actions", index: 0 },
          { id: "delete", group: "Actions", tone: "danger", index: 1 },
        ],
      },
      {
        key: "Color",
        name: "Color",
        layout: "swatch",
        tone: "default",
        commands: [{ id: "text-color-accent", group: "Color", index: 2 }],
      },
    ],
  );
});

test("React block action menu model extracts ordered submenu groups", () => {
  const groups = blockActionSubmenuGroups([
    {
      id: "code-language",
      title: "Code language",
      description: "Change language",
      submenu: "code-language",
      children: [{ id: "code-language-rust", title: "Rust" }],
    },
    {
      id: "turn-into",
      title: "Turn into",
      description: "Change block type",
      submenu: "turn-into",
      children: [{ id: "heading-1", title: "Heading 1" }],
    },
  ]);

  assert.deepEqual(groups.map((group) => group.id), ["turn-into", "code-language"]);
  assert.deepEqual(groups[0].commands, [{ id: "heading-1", title: "Heading 1" }]);
});

test("React block action menu model exposes submenu contracts", () => {
  assert.equal(commandSubmenuId({ submenu: "turn-into", children: [] }), "turn-into");
  assert.equal(commandSubmenuId({ submenu: "turn-into" }), "turn-into");
  assert.equal(commandSubmenuId(null), "");
  assert.equal(blockActionSubmenuPanelWidth(), 160);
});

test("React block action menu model prepares top-level and submenu commands", () => {
  const commands = prepareBlockActionMenuCommands([
    { id: "copy-block", group: "Actions" },
    {
      id: "turn-into",
      submenu: "turn-into",
      children: [{ id: "heading-1", title: "Heading 1" }],
    },
    { id: "heading-1", submenu: "turn-into", title: "Heading 1" },
    { id: "delete", group: "Danger" },
  ]);

  assert.deepEqual(commands.map((command) => [command.id, command.index]), [
    ["copy-block", 0],
    ["turn-into", 1],
    ["delete", 2],
    ["heading-1", 3],
  ]);
  assert.deepEqual(commands[1].children, [{ id: "heading-1", title: "Heading 1" }]);
  assert.equal(commands[3].submenu, "turn-into");
});

test("React block action menu model computes submenu keyboard targets", () => {
  const commands = prepareBlockActionMenuCommands([
    { id: "copy-block" },
    {
      id: "turn-into",
      submenu: "turn-into",
      children: [
        { id: "paragraph" },
        { id: "heading-1" },
        { id: "code-block" },
      ],
    },
    { id: "delete" },
  ]);
  const parentIndex = commands.findIndex((command) => command.id === "turn-into");
  const firstChildIndex = commands.findIndex((command) => command.id === "paragraph");
  const secondChildIndex = commands.findIndex((command) => command.id === "heading-1");
  const lastChildIndex = commands.findIndex((command) => command.id === "code-block");

  assert.equal(firstSubmenuChildIndex(commands, "turn-into"), firstChildIndex);
  assert.equal(submenuParentIndex(commands, "turn-into"), parentIndex);
  assert.equal(submenuCommandIndex(commands, "turn-into", "code-block"), lastChildIndex);
  assert.equal(nextCommandIndexInSubmenu(commands, parentIndex, 1), firstChildIndex);
  assert.equal(nextCommandIndexInSubmenu(commands, firstChildIndex, 1), secondChildIndex);
  assert.equal(nextCommandIndexInSubmenu(commands, firstChildIndex, -1), lastChildIndex);
  assert.equal(blockActionHomeEndIndex(commands, secondChildIndex, "Home"), firstChildIndex);
  assert.equal(blockActionHomeEndIndex(commands, secondChildIndex, "End"), lastChildIndex);
  assert.equal(blockActionHomeEndIndex(commands, 0, "End"), parentIndex + 1);
});

test("React block action menu model maps keyboard shortcuts", () => {
  assert.equal(
    blockActionShortcutCommandIdFromEvent({ key: "ArrowUp", altKey: true }),
    "move-block-up",
  );
  assert.equal(
    blockActionShortcutCommandIdFromEvent({ key: "ArrowDown", altKey: true }),
    "move-block-down",
  );
  assert.equal(
    blockActionShortcutCommandIdFromEvent({ key: "c", ctrlKey: true }),
    "copy-block",
  );
  assert.equal(
    blockActionShortcutCommandIdFromEvent({ key: "d", metaKey: true }),
    "duplicate-block",
  );
  assert.equal(blockActionShortcutCommandIdFromEvent({ key: "Backspace" }), "delete");
  assert.equal(
    blockActionShortcutCommandIdFromEvent({ key: "ArrowUp", altKey: true, ctrlKey: true }),
    null,
  );
});
