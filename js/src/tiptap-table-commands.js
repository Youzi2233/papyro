export const TABLE_CELL_MENU_COMMAND_IDS = new Set([
  "split-cell",
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

export const TABLE_COMMANDS = Object.freeze([
  {
    id: "add-column-before",
    group: "Columns",
    title: "Insert column left",
    label: "Left",
    command: "addColumnBefore",
    icon: "column-left",
  },
  {
    id: "add-column-after",
    group: "Columns",
    title: "Insert column right",
    label: "Right",
    command: "addColumnAfter",
    icon: "column-right",
  },
  {
    id: "delete-column",
    group: "Columns",
    title: "Delete current column",
    label: "Delete",
    command: "deleteColumn",
    icon: "delete-column",
    tone: "danger",
  },
  {
    id: "add-row-before",
    group: "Rows",
    title: "Insert row above",
    label: "Above",
    command: "addRowBefore",
    icon: "row-above",
  },
  {
    id: "add-row-after",
    group: "Rows",
    title: "Insert row below",
    label: "Below",
    command: "addRowAfter",
    icon: "row-below",
  },
  {
    id: "delete-row",
    group: "Rows",
    title: "Delete current row",
    label: "Delete",
    command: "deleteRow",
    icon: "delete-row",
    tone: "danger",
  },
  {
    id: "merge-cells",
    group: "Cells",
    title: "Merge selected cells",
    label: "Merge",
    command: "mergeCells",
    icon: "merge",
  },
  {
    id: "split-cell",
    group: "Cells",
    title: "Split current cell",
    label: "Split",
    command: "splitCell",
    icon: "split",
  },
  {
    id: "clear-cell-content",
    group: "Cells",
    title: "Clear cell content",
    label: "Clear content",
    command: "clearSelectedTableCells",
    icon: "clear-content",
  },
  {
    id: "clear-cell-style",
    group: "Cells",
    title: "Clear cell style",
    label: "Clear style",
    command: "resetSelectedTableCellAttrs",
    icon: "clear-style",
  },
  {
    id: "merge-or-split",
    group: "Cells",
    title: "Merge or split cells",
    label: "Auto",
    command: "mergeOrSplit",
    icon: "merge",
  },
  {
    id: "toggle-header-row",
    group: "Headers",
    title: "Toggle header row",
    label: "Row",
    command: "toggleHeaderRow",
    icon: "header-row",
  },
  {
    id: "toggle-header-column",
    group: "Headers",
    title: "Toggle header column",
    label: "Column",
    command: "toggleHeaderColumn",
    icon: "header-column",
  },
  {
    id: "toggle-header-cell",
    group: "Headers",
    title: "Toggle header cell",
    label: "Cell",
    command: "toggleHeaderCell",
    icon: "header-cell",
  },
  {
    id: "align-left",
    group: "Align",
    title: "Align current cells left",
    label: "Left",
    command: "setCellAttribute",
    args: ["align", null],
    icon: "align-left",
    variant: "icon",
  },
  {
    id: "align-center",
    group: "Align",
    title: "Align current cells center",
    label: "Center",
    command: "setCellAttribute",
    args: ["align", "center"],
    icon: "align-center",
    variant: "icon",
  },
  {
    id: "align-right",
    group: "Align",
    title: "Align current cells right",
    label: "Right",
    command: "setCellAttribute",
    args: ["align", "right"],
    icon: "align-right",
    variant: "icon",
  },
  {
    id: "cell-bg-clear",
    group: "Cell color",
    title: "Clear cell background",
    label: "Clear",
    command: "setCellAttribute",
    args: ["backgroundColor", null],
    icon: "color-clear",
    variant: "swatch",
  },
  {
    id: "cell-bg-yellow",
    group: "Cell color",
    title: "Use a soft yellow cell background",
    label: "Yellow",
    command: "setCellAttribute",
    args: ["backgroundColor", "rgba(245, 158, 11, 0.16)"],
    icon: "color-yellow",
    variant: "swatch",
  },
  {
    id: "cell-bg-blue",
    group: "Cell color",
    title: "Use a soft blue cell background",
    label: "Blue",
    command: "setCellAttribute",
    args: ["backgroundColor", "rgba(59, 130, 246, 0.14)"],
    icon: "color-blue",
    variant: "swatch",
  },
  {
    id: "cell-bg-green",
    group: "Cell color",
    title: "Use a soft green cell background",
    label: "Green",
    command: "setCellAttribute",
    args: ["backgroundColor", "rgba(16, 185, 129, 0.14)"],
    icon: "color-green",
    variant: "swatch",
  },
  {
    id: "previous-cell",
    group: "Navigate",
    title: "Move to previous cell",
    label: "Prev",
    command: "goToPreviousCell",
    icon: "previous",
  },
  {
    id: "next-cell",
    group: "Navigate",
    title: "Move to next cell",
    label: "Next",
    command: "goToNextCell",
    icon: "next",
  },
  {
    id: "fix-table",
    group: "Table",
    title: "Repair table structure",
    label: "Repair",
    command: "fixTables",
    icon: "repair",
  },
  {
    id: "delete-table",
    group: "Table",
    title: "Delete table",
    label: "Delete",
    command: "deleteTable",
    icon: "delete-table",
    tone: "danger",
  },
]);

export const TABLE_MENU_COMMAND_SCOPE = Object.freeze({
  cell: TABLE_CELL_MENU_COMMAND_IDS,
  cells: new Set([
    "merge-cells",
    "align-left",
    "align-center",
    "align-right",
    "clear-cell-content",
    "clear-cell-style",
    "cell-bg-clear",
    "cell-bg-yellow",
    "cell-bg-blue",
    "cell-bg-green",
  ]),
  row: new Set([
    "add-row-before",
    "add-row-after",
    "clear-cell-content",
    "clear-cell-style",
    "delete-row",
    "toggle-header-row",
  ]),
  column: new Set([
    "add-column-before",
    "add-column-after",
    "clear-cell-content",
    "clear-cell-style",
    "delete-column",
    "toggle-header-column",
  ]),
  table: new Set([
    "toggle-header-row",
    "toggle-header-column",
    "fix-table",
    "delete-table",
  ]),
});

export const TABLE_COMMAND_CONTEXT_ORDER = Object.freeze({
  row: [
    "add-row-after",
    "add-row-before",
    "clear-cell-content",
    "clear-cell-style",
    "toggle-header-row",
    "delete-row",
  ],
  column: [
    "add-column-after",
    "add-column-before",
    "clear-cell-content",
    "clear-cell-style",
    "toggle-header-column",
    "delete-column",
  ],
  table: [
    "toggle-header-row",
    "toggle-header-column",
    "fix-table",
    "delete-table",
  ],
});

export const TABLE_CONTEXT_HEADER_COMMAND_IDS = new Set([
  "toggle-header-row",
  "toggle-header-column",
  "toggle-header-cell",
]);

export const SELECTION_TABLE_COMMAND_IDS = new Set([
  "merge-cells",
  "split-cell",
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

export const KEYBOARD_TABLE_COMMAND_IDS = new Set([
  "add-column-before",
  "add-column-after",
  "delete-column",
  "add-row-before",
  "add-row-after",
  "delete-row",
  "merge-cells",
  "split-cell",
  "clear-cell-content",
  "clear-cell-style",
  "toggle-header-row",
  "toggle-header-column",
  "toggle-header-cell",
  "align-left",
  "align-center",
  "align-right",
  "cell-bg-clear",
  "cell-bg-yellow",
  "cell-bg-blue",
  "cell-bg-green",
  "fix-table",
  "delete-table",
]);

export function enabledTableCommandIds(commands) {
  return (commands ?? [])
    .filter((command) => !command.disabled)
    .map((command) => command.id);
}

export function runTableEditorCommand(editor, commandName, args = []) {
  const command = editor?.commands?.[commandName];
  if (typeof command !== "function") return false;
  const ok = command(...args) !== false;
  if (ok) editor?.commands?.focus?.();
  return ok;
}

export function canRunTableEditorCommand(editor, commandName, args = []) {
  if (typeof editor?.commands?.[commandName] !== "function") return false;
  const canCommands = typeof editor?.can === "function" ? editor.can() : null;
  const canCommand = canCommands?.[commandName];
  if (commandName === "splitCell" && typeof canCommand !== "function") {
    return false;
  }
  if (typeof canCommand !== "function") return true;

  try {
    return canCommand(...args) !== false;
  } catch (_error) {
    return false;
  }
}

export function tableCellAttributeValue(cell, name) {
  if (!cell) return null;

  if (name === "backgroundColor") {
    return cell.getAttribute?.("data-cell-background") || cell.style?.backgroundColor || null;
  }

  if (name === "align") {
    return cell.style?.textAlign || cell.getAttribute?.("align") || null;
  }

  return null;
}

export function normalizeTableCellAttributeValue(name, value) {
  if (name === "align") {
    const align = String(value ?? "").trim().toLowerCase();
    return align === "left" ? null : align || null;
  }
  return value ?? null;
}

export function tableCommandVariant(command) {
  if (command?.variant) return command.variant;
  const groupKey = command?.groupKey ?? command?.group;
  if (groupKey === "Align") return "icon";
  if (groupKey === "Cell color") return "swatch";
  return "text";
}

export function tableCommandLayoutGroup(command) {
  if (command?.id === "split-cell") return "actions";
  if (command?.id === "clear-cell-content") return "actions";
  if (command?.id === "clear-cell-style") return "actions";
  if (TABLE_CONTEXT_HEADER_COMMAND_IDS.has(command?.id)) return "actions";
  const variant = tableCommandVariant(command);
  if (variant === "icon") return "align";
  if (variant === "swatch") return "cell-color";
  if (command?.tone === "danger") return "danger";
  return "actions";
}

export function visibleTableCommands(commands, mode = "context", selectionKind = "cell") {
  const allowed = mode === "keyboard"
    ? KEYBOARD_TABLE_COMMAND_IDS
    : TABLE_MENU_COMMAND_SCOPE[selectionKind] ?? SELECTION_TABLE_COMMAND_IDS;
  const visible = (commands ?? []).filter((command) => {
    if (!allowed.has(command.id)) return false;
    if (mode === "context" && selectionKind === "cell" && command.id === "split-cell") {
      return !command.disabled;
    }
    return true;
  });
  const order = mode === "context" ? TABLE_COMMAND_CONTEXT_ORDER[selectionKind] : null;
  if (!order) return visible;
  return [...visible].sort((left, right) => {
    const leftIndex = order.indexOf(left.id);
    const rightIndex = order.indexOf(right.id);
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
}

export function firstEnabledTableCommandId(commands, mode = "context", selectionKind = "cell") {
  return enabledTableCommandIds(visibleTableCommands(commands, mode, selectionKind))[0] ?? null;
}

export function nextEnabledTableCommandId(commands, currentId, direction) {
  const ids = enabledTableCommandIds(commands);
  if (ids.length === 0) return null;
  const currentIndex = ids.indexOf(currentId);
  const startIndex = currentIndex < 0 ? 0 : currentIndex;
  return ids[(startIndex + direction + ids.length) % ids.length];
}
