export const TABLE_CELL_MENU_COMMAND_IDS = new Set([
  "split-cell",
  "copy-cell-content",
  "clear-cell-content",
  "clear-cell-style",
  "align-left",
  "align-center",
  "align-right",
  "cell-text-clear",
  "cell-text-muted",
  "cell-text-accent",
  "cell-text-danger",
  "cell-bg-clear",
  "cell-bg-yellow",
  "cell-bg-blue",
  "cell-bg-green",
]);

const TABLE_AXIS_STYLE_COMMAND_IDS = Object.freeze([
  "align-left",
  "align-center",
  "align-right",
  "cell-text-clear",
  "cell-text-muted",
  "cell-text-accent",
  "cell-text-danger",
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
    id: "move-column-left",
    group: "Arrange",
    title: "Move column left",
    label: "Left",
    command: "moveSelectedTableColumn",
    args: ["left"],
    icon: "move-column-left",
  },
  {
    id: "move-column-right",
    group: "Arrange",
    title: "Move column right",
    label: "Right",
    command: "moveSelectedTableColumn",
    args: ["right"],
    icon: "move-column-right",
  },
  {
    id: "sort-rows-asc",
    group: "Arrange",
    title: "Sort rows A to Z",
    label: "A to Z",
    command: "sortSelectedTableRows",
    args: ["asc"],
    icon: "sort-asc",
  },
  {
    id: "sort-rows-desc",
    group: "Arrange",
    title: "Sort rows Z to A",
    label: "Z to A",
    command: "sortSelectedTableRows",
    args: ["desc"],
    icon: "sort-desc",
  },
  {
    id: "duplicate-column",
    group: "Columns",
    title: "Duplicate current column",
    label: "Duplicate",
    command: "duplicateSelectedTableColumn",
    icon: "duplicate-column",
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
    id: "move-row-up",
    group: "Arrange",
    title: "Move row up",
    label: "Up",
    command: "moveSelectedTableRow",
    args: ["up"],
    icon: "move-row-up",
  },
  {
    id: "move-row-down",
    group: "Arrange",
    title: "Move row down",
    label: "Down",
    command: "moveSelectedTableRow",
    args: ["down"],
    icon: "move-row-down",
  },
  {
    id: "sort-columns-asc",
    group: "Arrange",
    title: "Sort columns A to Z",
    label: "A to Z",
    command: "sortSelectedTableColumns",
    args: ["asc"],
    icon: "sort-asc",
  },
  {
    id: "sort-columns-desc",
    group: "Arrange",
    title: "Sort columns Z to A",
    label: "Z to A",
    command: "sortSelectedTableColumns",
    args: ["desc"],
    icon: "sort-desc",
  },
  {
    id: "duplicate-row",
    group: "Rows",
    title: "Duplicate current row",
    label: "Duplicate",
    command: "duplicateSelectedTableRow",
    icon: "duplicate-row",
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
    title: "Split merged cell",
    label: "Split",
    command: "splitCell",
    icon: "split",
  },
  {
    id: "copy-cell-content",
    group: "Cells",
    title: "Copy cell content",
    label: "Copy",
    command: "copySelectedTableCells",
    icon: "copy-cell",
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
    id: "cell-text-clear",
    group: "Text color",
    title: "Clear cell text color",
    label: "Default",
    command: "setSelectedTableCellTextColor",
    args: [null],
    icon: "text-color-clear",
    variant: "text-swatch",
  },
  {
    id: "cell-text-muted",
    group: "Text color",
    title: "Use muted cell text",
    label: "Muted",
    command: "setSelectedTableCellTextColor",
    args: ["var(--mn-ink-3)"],
    icon: "text-color-muted",
    variant: "text-swatch",
  },
  {
    id: "cell-text-accent",
    group: "Text color",
    title: "Use accent cell text",
    label: "Accent",
    command: "setSelectedTableCellTextColor",
    args: ["var(--mn-accent)"],
    icon: "text-color-accent",
    variant: "text-swatch",
  },
  {
    id: "cell-text-danger",
    group: "Text color",
    title: "Use danger cell text",
    label: "Danger",
    command: "setSelectedTableCellTextColor",
    args: ["var(--mn-danger)"],
    icon: "text-color-danger",
    variant: "text-swatch",
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
    "copy-cell-content",
    "align-left",
    "align-center",
    "align-right",
    "clear-cell-content",
    "clear-cell-style",
    "cell-text-clear",
    "cell-text-muted",
    "cell-text-accent",
    "cell-text-danger",
    "cell-bg-clear",
    "cell-bg-yellow",
    "cell-bg-blue",
    "cell-bg-green",
  ]),
  row: new Set([
    "move-row-up",
    "move-row-down",
    "add-row-before",
    "add-row-after",
    "duplicate-row",
    "sort-columns-asc",
    "sort-columns-desc",
    "copy-cell-content",
    "clear-cell-content",
    "clear-cell-style",
    ...TABLE_AXIS_STYLE_COMMAND_IDS,
    "delete-row",
    "toggle-header-row",
  ]),
  column: new Set([
    "move-column-left",
    "move-column-right",
    "add-column-before",
    "add-column-after",
    "duplicate-column",
    "sort-rows-asc",
    "sort-rows-desc",
    "copy-cell-content",
    "clear-cell-content",
    "clear-cell-style",
    ...TABLE_AXIS_STYLE_COMMAND_IDS,
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
    "move-row-up",
    "move-row-down",
    "sort-columns-asc",
    "sort-columns-desc",
    "add-row-after",
    "add-row-before",
    "duplicate-row",
    "copy-cell-content",
    "clear-cell-content",
    "clear-cell-style",
    ...TABLE_AXIS_STYLE_COMMAND_IDS,
    "toggle-header-row",
    "delete-row",
  ],
  column: [
    "move-column-left",
    "move-column-right",
    "sort-rows-asc",
    "sort-rows-desc",
    "add-column-after",
    "add-column-before",
    "duplicate-column",
    "copy-cell-content",
    "clear-cell-content",
    "clear-cell-style",
    ...TABLE_AXIS_STYLE_COMMAND_IDS,
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
  "copy-cell-content",
  "clear-cell-content",
  "clear-cell-style",
  "align-left",
  "align-center",
  "align-right",
  "cell-text-clear",
  "cell-text-muted",
  "cell-text-accent",
  "cell-text-danger",
  "cell-bg-clear",
  "cell-bg-yellow",
  "cell-bg-blue",
  "cell-bg-green",
]);

export const KEYBOARD_TABLE_COMMAND_IDS = new Set([
  "add-column-before",
  "add-column-after",
  "move-column-left",
  "move-column-right",
  "duplicate-column",
  "sort-rows-asc",
  "sort-rows-desc",
  "delete-column",
  "add-row-before",
  "add-row-after",
  "move-row-up",
  "move-row-down",
  "duplicate-row",
  "sort-columns-asc",
  "sort-columns-desc",
  "delete-row",
  "merge-cells",
  "split-cell",
  "copy-cell-content",
  "clear-cell-content",
  "clear-cell-style",
  "toggle-header-row",
  "toggle-header-column",
  "toggle-header-cell",
  "align-left",
  "align-center",
  "align-right",
  "cell-text-clear",
  "cell-text-muted",
  "cell-text-accent",
  "cell-text-danger",
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
  if (groupKey === "Text color") return "text-swatch";
  if (groupKey === "Cell color") return "swatch";
  return "text";
}

export function tableCommandLayoutGroup(command) {
  if (command?.id === "split-cell") return "actions";
  if (command?.id === "copy-cell-content") return "actions";
  if (command?.id === "clear-cell-content") return "actions";
  if (command?.id === "clear-cell-style") return "actions";
  if (command?.id === "duplicate-row") return "actions";
  if (command?.id === "duplicate-column") return "actions";
  if (command?.id === "sort-rows-asc") return "sort";
  if (command?.id === "sort-rows-desc") return "sort";
  if (command?.id === "sort-columns-asc") return "sort";
  if (command?.id === "sort-columns-desc") return "sort";
  if (TABLE_CONTEXT_HEADER_COMMAND_IDS.has(command?.id)) return "actions";
  const variant = tableCommandVariant(command);
  if (variant === "icon") return "align";
  if (variant === "text-swatch") return "text-color";
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

export function normalizeTableMenuMode(mode) {
  return mode === "keyboard" ? "keyboard" : "context";
}

export function createTableCommandMenuState(
  commands,
  { mode = "context", selectionKind = "cell", activeCommandId = null } = {},
) {
  const normalizedMode = normalizeTableMenuMode(mode);
  const normalizedSelectionKind = selectionKind ?? "cell";
  const visibleCommands = visibleTableCommands(
    commands,
    normalizedMode,
    normalizedSelectionKind,
  );
  const enabledCommandIds = enabledTableCommandIds(visibleCommands);
  const activeCommandStillValid = visibleCommands.some(
    (command) => command.id === activeCommandId && !command.disabled,
  );

  return {
    mode: normalizedMode,
    selectionKind: normalizedSelectionKind,
    commands: visibleCommands,
    enabledCommandIds,
    activeCommandId: activeCommandStillValid
      ? activeCommandId
      : enabledCommandIds[0] ?? null,
  };
}
