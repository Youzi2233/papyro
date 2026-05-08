import test from "node:test";
import assert from "node:assert/strict";

import {
  TABLE_COMMANDS,
  canRunTableEditorCommand,
  enabledTableCommandIds,
  firstEnabledTableCommandId,
  nextEnabledTableCommandId,
  normalizeTableCellAttributeValue,
  runTableEditorCommand,
  tableCellAttributeValue,
  tableCommandLayoutGroup,
  tableCommandVariant,
  visibleTableCommands,
} from "../src/tiptap-table-commands.js";

function commandIds(commands) {
  return commands.map((command) => command.id);
}

test("Tiptap table commands expose stable enterprise command metadata", () => {
  assert.deepEqual(
    TABLE_COMMANDS.map((command) => [command.group, command.id, command.command]),
    [
      ["Columns", "add-column-before", "addColumnBefore"],
      ["Columns", "add-column-after", "addColumnAfter"],
      ["Columns", "delete-column", "deleteColumn"],
      ["Rows", "add-row-before", "addRowBefore"],
      ["Rows", "add-row-after", "addRowAfter"],
      ["Rows", "delete-row", "deleteRow"],
      ["Cells", "merge-cells", "mergeCells"],
      ["Cells", "split-cell", "splitCell"],
      ["Cells", "clear-cell-content", "clearSelectedTableCells"],
      ["Cells", "clear-cell-style", "resetSelectedTableCellAttrs"],
      ["Cells", "merge-or-split", "mergeOrSplit"],
      ["Headers", "toggle-header-row", "toggleHeaderRow"],
      ["Headers", "toggle-header-column", "toggleHeaderColumn"],
      ["Headers", "toggle-header-cell", "toggleHeaderCell"],
      ["Align", "align-left", "setCellAttribute"],
      ["Align", "align-center", "setCellAttribute"],
      ["Align", "align-right", "setCellAttribute"],
      ["Cell color", "cell-bg-clear", "setCellAttribute"],
      ["Cell color", "cell-bg-yellow", "setCellAttribute"],
      ["Cell color", "cell-bg-blue", "setCellAttribute"],
      ["Cell color", "cell-bg-green", "setCellAttribute"],
      ["Navigate", "previous-cell", "goToPreviousCell"],
      ["Navigate", "next-cell", "goToNextCell"],
      ["Table", "fix-table", "fixTables"],
      ["Table", "delete-table", "deleteTable"],
    ],
  );
});

test("Tiptap table command scope keeps cell menus focused", () => {
  const commands = TABLE_COMMANDS.map((command) => ({
    ...command,
    disabled: command.id === "split-cell",
  }));

  assert.deepEqual(commandIds(visibleTableCommands(commands, "context", "cell")), [
    "clear-cell-content",
    "clear-cell-style",
    "align-left",
    "align-center",
    "align-right",
    "cell-bg-clear",
    "cell-bg-yellow",
    "cell-bg-blue",
    "cell-bg-green",
  ]);
  assert.deepEqual(commandIds(visibleTableCommands(commands, "context", "cells")), [
    "merge-cells",
    "clear-cell-content",
    "clear-cell-style",
    "align-left",
    "align-center",
    "align-right",
    "cell-bg-clear",
    "cell-bg-yellow",
    "cell-bg-blue",
    "cell-bg-green",
  ]);
});

test("Tiptap table command scope orders row column and table menus by intent", () => {
  assert.deepEqual(commandIds(visibleTableCommands(TABLE_COMMANDS, "context", "row")), [
    "add-row-after",
    "add-row-before",
    "clear-cell-content",
    "clear-cell-style",
    "toggle-header-row",
    "delete-row",
  ]);
  assert.deepEqual(commandIds(visibleTableCommands(TABLE_COMMANDS, "context", "column")), [
    "add-column-after",
    "add-column-before",
    "clear-cell-content",
    "clear-cell-style",
    "toggle-header-column",
    "delete-column",
  ]);
  assert.deepEqual(commandIds(visibleTableCommands(TABLE_COMMANDS, "context", "table")), [
    "toggle-header-row",
    "toggle-header-column",
    "fix-table",
    "delete-table",
  ]);
});

test("Tiptap table commands expose layout groups and keyboard helpers", () => {
  assert.equal(tableCommandVariant({ group: "Align" }), "icon");
  assert.equal(tableCommandVariant({ group: "Cell color" }), "swatch");
  assert.equal(tableCommandVariant({ group: "Rows" }), "text");
  assert.equal(tableCommandLayoutGroup({ id: "align-center", group: "Align" }), "align");
  assert.equal(tableCommandLayoutGroup({ id: "cell-bg-blue", group: "Cell color" }), "cell-color");
  assert.equal(tableCommandLayoutGroup({ id: "delete-row", group: "Rows", tone: "danger" }), "danger");
  assert.equal(tableCommandLayoutGroup({ id: "toggle-header-row", group: "Headers" }), "actions");
  assert.equal(tableCommandLayoutGroup({ id: "clear-cell-content", group: "Cells" }), "actions");
  assert.equal(tableCommandLayoutGroup({ id: "clear-cell-style", group: "Cells" }), "actions");

  const keyboardCommands = TABLE_COMMANDS.map((command) => ({
    ...command,
    disabled: command.id === "add-column-before",
  }));
  assert.equal(firstEnabledTableCommandId(keyboardCommands, "keyboard", "cell"), "add-column-after");

  const commands = [
    { id: "alpha" },
    { id: "beta", disabled: true },
    { id: "gamma" },
  ];
  assert.deepEqual(enabledTableCommandIds(commands), ["alpha", "gamma"]);
  assert.equal(nextEnabledTableCommandId(commands, "alpha", 1), "gamma");
  assert.equal(nextEnabledTableCommandId(commands, "gamma", 1), "alpha");
  assert.equal(nextEnabledTableCommandId(commands, "alpha", -1), "gamma");
});

test("Tiptap table commands centralize editor capability and cell attribute helpers", () => {
  const calls = [];
  const editor = {
    commands: {
      focus() {
        calls.push(["focus"]);
      },
      addRowAfter() {
        calls.push(["addRowAfter"]);
        return true;
      },
      splitCell() {
        calls.push(["splitCell"]);
        return true;
      },
      deleteTable() {
        calls.push(["deleteTable"]);
        return false;
      },
    },
    can() {
      return {
        addRowAfter: () => true,
        splitCell: () => false,
      };
    },
  };
  const cell = {
    style: {
      textAlign: "center",
      backgroundColor: "rgba(1, 2, 3, 0.4)",
    },
    getAttribute(name) {
      return name === "data-cell-background" ? "rgba(4, 5, 6, 0.4)" : null;
    },
  };

  assert.equal(canRunTableEditorCommand(editor, "addRowAfter"), true);
  assert.equal(canRunTableEditorCommand(editor, "splitCell"), false);
  assert.equal(canRunTableEditorCommand(editor, "missing"), false);
  assert.equal(runTableEditorCommand(editor, "addRowAfter"), true);
  assert.equal(runTableEditorCommand(editor, "deleteTable"), false);
  assert.deepEqual(calls, [["addRowAfter"], ["focus"], ["deleteTable"]]);
  assert.equal(tableCellAttributeValue(cell, "align"), "center");
  assert.equal(tableCellAttributeValue(cell, "backgroundColor"), "rgba(4, 5, 6, 0.4)");
  assert.equal(normalizeTableCellAttributeValue("align", "left"), null);
  assert.equal(normalizeTableCellAttributeValue("align", "RIGHT"), "right");
});
