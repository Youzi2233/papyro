import {
  createElement,
  defaultDocument,
  defaultWindow,
  mountFloatingRoot,
  positionFloatingElement,
  setHidden,
  viewportSize,
} from "./tiptap-ui-primitives.js";

export const TABLE_COMMANDS = Object.freeze([
  {
    id: "add-column-before",
    group: "Columns",
    title: "Insert column left",
    label: "Left",
    command: "addColumnBefore",
  },
  {
    id: "add-column-after",
    group: "Columns",
    title: "Insert column right",
    label: "Right",
    command: "addColumnAfter",
  },
  {
    id: "delete-column",
    group: "Columns",
    title: "Delete current column",
    label: "Delete",
    command: "deleteColumn",
    tone: "danger",
  },
  {
    id: "add-row-before",
    group: "Rows",
    title: "Insert row above",
    label: "Above",
    command: "addRowBefore",
  },
  {
    id: "add-row-after",
    group: "Rows",
    title: "Insert row below",
    label: "Below",
    command: "addRowAfter",
  },
  {
    id: "delete-row",
    group: "Rows",
    title: "Delete current row",
    label: "Delete",
    command: "deleteRow",
    tone: "danger",
  },
  {
    id: "merge-cells",
    group: "Cells",
    title: "Merge selected cells",
    label: "Merge",
    command: "mergeCells",
  },
  {
    id: "split-cell",
    group: "Cells",
    title: "Split current cell",
    label: "Split",
    command: "splitCell",
  },
  {
    id: "merge-or-split",
    group: "Cells",
    title: "Merge or split cells",
    label: "Auto",
    command: "mergeOrSplit",
  },
  {
    id: "toggle-header-row",
    group: "Headers",
    title: "Toggle header row",
    label: "Row",
    command: "toggleHeaderRow",
  },
  {
    id: "toggle-header-column",
    group: "Headers",
    title: "Toggle header column",
    label: "Column",
    command: "toggleHeaderColumn",
  },
  {
    id: "toggle-header-cell",
    group: "Headers",
    title: "Toggle header cell",
    label: "Cell",
    command: "toggleHeaderCell",
  },
  {
    id: "previous-cell",
    group: "Navigate",
    title: "Move to previous cell",
    label: "Prev",
    command: "goToPreviousCell",
  },
  {
    id: "next-cell",
    group: "Navigate",
    title: "Move to next cell",
    label: "Next",
    command: "goToNextCell",
  },
  {
    id: "fix-table",
    group: "Table",
    title: "Repair table structure",
    label: "Repair",
    command: "fixTables",
  },
  {
    id: "delete-table",
    group: "Table",
    title: "Delete table",
    label: "Delete",
    command: "deleteTable",
    tone: "danger",
  },
]);

const TABLE_AXIS_HANDLE_SIZE = 22;

function closestTableElement(target, editorDom) {
  if (!target?.closest || !editorDom?.contains) return null;
  const table = target.closest(".mn-tiptap-table, table");
  return table && editorDom.contains(table) ? table : null;
}

function tableRows(table) {
  return Array.from(table?.querySelectorAll?.("tr") ?? []);
}

function tableCells(row) {
  return Array.from(row?.querySelectorAll?.("th,td") ?? []);
}

function tableSelectionGrid(table, view) {
  if (!table || typeof view?.posAtDOM !== "function") return [];

  return tableRows(table)
    .map((row, rowIndex) => ({
      row,
      rowIndex,
      cells: tableCells(row)
        .map((cell, columnIndex) => {
          try {
            const pos = view.posAtDOM(cell, 0);
            return Number.isFinite(pos)
              ? {
                  cell,
                  columnIndex,
                  pos,
                  rect: cell.getBoundingClientRect?.(),
                }
              : null;
          } catch (_error) {
            return null;
          }
        })
        .filter(Boolean),
      rect: row.getBoundingClientRect?.(),
    }))
    .filter((row) => row.cells.length > 0);
}

function firstRowCells(grid) {
  return grid.find((row) => row.cells.length > 0)?.cells ?? [];
}

function activeTableContext(editor) {
  const selection = editor?.state?.selection;
  const view = editor?.view;
  const domAtPos = typeof view?.domAtPos === "function" && Number.isFinite(selection?.from)
    ? view.domAtPos(selection.from)
    : null;
  const node = domAtPos?.node?.nodeType === 1 ? domAtPos.node : domAtPos?.node?.parentElement;
  const table = closestTableElement(node, view?.dom);
  if (!table) return null;

  return {
    table,
    rect: table.getBoundingClientRect?.(),
    grid: tableSelectionGrid(table, view),
  };
}

function runEditorCommand(editor, commandName) {
  const command = editor?.commands?.[commandName];
  if (typeof command !== "function") return false;
  const ok = command() !== false;
  if (ok) editor?.commands?.focus?.();
  return ok;
}

export function selectTableAxis(editor, grid, axis, index) {
  if (!editor || typeof editor.commands?.setCellSelection !== "function") return false;
  const axisIndex = Number(index);
  if (!Number.isInteger(axisIndex) || axisIndex < 0) return false;

  let positions = [];
  if (axis === "row") {
    positions = grid?.[axisIndex]?.cells?.map((cell) => cell.pos) ?? [];
  } else if (axis === "column") {
    positions = (grid ?? [])
      .map((row) => row.cells.find((cell) => cell.columnIndex === axisIndex)?.pos)
      .filter(Number.isFinite);
  }

  if (positions.length === 0) return false;
  const ok =
    editor.commands.setCellSelection({
      anchorCell: positions[0],
      headCell: positions[positions.length - 1],
    }) !== false;
  if (ok) editor.commands?.focus?.();
  return ok;
}

class TiptapTableToolbarView {
  #document;
  #window;
  #root = null;
  #list = null;
  #addRowButton = null;
  #addColumnButton = null;
  #rowHandles = [];
  #columnHandles = [];

  constructor({ document = defaultDocument(), window = defaultWindow(document) } = {}) {
    this.#document = document;
    this.#window = window;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = createElement(this.#document, "div", "mn-tiptap-table-toolbar hidden");
    const list = createElement(this.#document, "div", "mn-tiptap-table-toolbar-list");
    const addRowButton = createElement(
      this.#document,
      "button",
      "mn-tiptap-table-quick-add mn-tiptap-table-add-row hidden",
    );
    const addColumnButton = createElement(
      this.#document,
      "button",
      "mn-tiptap-table-quick-add mn-tiptap-table-add-column hidden",
    );
    if (!root || !list || !addRowButton || !addColumnButton) return;

    root.role = "toolbar";
    root.setAttribute("aria-label", "Table tools");
    addRowButton.type = "button";
    addRowButton.textContent = "+";
    addRowButton.title = "Add row below";
    addRowButton.setAttribute("aria-label", "Add row below");
    addColumnButton.type = "button";
    addColumnButton.textContent = "+";
    addColumnButton.title = "Add column right";
    addColumnButton.setAttribute("aria-label", "Add column right");
    root.appendChild(list);
    mountFloatingRoot(root, container, this.#document);
    mountFloatingRoot(addRowButton, container, this.#document);
    mountFloatingRoot(addColumnButton, container, this.#document);
    this.#root = root;
    this.#list = list;
    this.#addRowButton = addRowButton;
    this.#addColumnButton = addColumnButton;
    setHidden(root, true);
    setHidden(addRowButton, true);
    setHidden(addColumnButton, true);
  }

  update(state) {
    if (!this.#root || !this.#list || !state.open) return;

    this.#list.replaceChildren();
    let lastGroup = null;
    state.commands.forEach((command) => {
      if (lastGroup && lastGroup !== command.group) {
        const divider = createElement(this.#document, "span", "mn-tiptap-table-toolbar-divider");
        divider?.setAttribute?.("aria-hidden", "true");
        if (divider) this.#list.appendChild(divider);
      }
      lastGroup = command.group;

      const button = createElement(this.#document, "button", "mn-tiptap-table-toolbar-button");
      if (!button) return;

      button.type = "button";
      button.title = command.title;
      button.setAttribute("aria-label", command.title);
      button.textContent = command.label;
      button.dataset.commandId = command.id;
      button.dataset.group = command.group;
      button.dataset.tone = command.tone ?? "default";
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        state.run(command.id);
      });
      this.#list.appendChild(button);
    });

    setHidden(this.#root, false);
    this.#updateQuickAdd(state);
    this.#updateAxisHandles(state);
    positionFloatingElement(this.#root, state.rect, {
      viewport: viewportSize(state.table, this.#window),
      size: {
        width: 520,
        height: 42,
        margin: 10,
      },
      placement: "top",
    });
  }

  #updateQuickAdd(state) {
    const rect = state.rect;
    if (!rect || !this.#addRowButton || !this.#addColumnButton) return;

    const addRow = state.commands.some((command) => command.id === "add-row-after");
    const addColumn = state.commands.some((command) => command.id === "add-column-after");
    this.#addRowButton.style.left = `${rect.left + Math.max(0, rect.width ?? rect.right - rect.left) / 2 - 12}px`;
    this.#addRowButton.style.top = `${rect.bottom + 6}px`;
    this.#addColumnButton.style.left = `${rect.right + 6}px`;
    this.#addColumnButton.style.top = `${rect.top + Math.max(0, rect.height ?? rect.bottom - rect.top) / 2 - 12}px`;

    this.#addRowButton.onpointerdown = (event) => {
      event.preventDefault();
      event.stopPropagation?.();
      state.run("add-row-after");
    };
    this.#addColumnButton.onpointerdown = (event) => {
      event.preventDefault();
      event.stopPropagation?.();
      state.run("add-column-after");
    };
    setHidden(this.#addRowButton, !addRow);
    setHidden(this.#addColumnButton, !addColumn);
  }

  #updateAxisHandles(state) {
    this.#clearAxisHandles();
    const tableRect = state.rect;
    const grid = state.grid ?? [];
    if (!tableRect || grid.length === 0) return;

    grid.forEach((row, index) => {
      const rect = row.rect;
      if (!rect) return;
      const button = createElement(this.#document, "button", "mn-tiptap-table-axis-handle row");
      if (!button) return;
      button.type = "button";
      button.title = `Select row ${index + 1}`;
      button.setAttribute("aria-label", `Select row ${index + 1}`);
      button.style.left = `${tableRect.left - TABLE_AXIS_HANDLE_SIZE - 6}px`;
      button.style.top = `${rect.top + Math.max(0, rect.height - TABLE_AXIS_HANDLE_SIZE) / 2}px`;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        state.selectAxis("row", index);
      });
      button.addEventListener("mousedown", (event) => event.preventDefault());
      mountFloatingRoot(button, state.table, this.#document);
      this.#rowHandles.push(button);
    });

    firstRowCells(grid).forEach((cell, index) => {
      const rect = cell.rect;
      if (!rect) return;
      const button = createElement(this.#document, "button", "mn-tiptap-table-axis-handle column");
      if (!button) return;
      button.type = "button";
      button.title = `Select column ${index + 1}`;
      button.setAttribute("aria-label", `Select column ${index + 1}`);
      button.style.left = `${rect.left + Math.max(0, rect.width - TABLE_AXIS_HANDLE_SIZE) / 2}px`;
      button.style.top = `${tableRect.top - TABLE_AXIS_HANDLE_SIZE - 6}px`;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        state.selectAxis("column", index);
      });
      button.addEventListener("mousedown", (event) => event.preventDefault());
      mountFloatingRoot(button, state.table, this.#document);
      this.#columnHandles.push(button);
    });
  }

  #clearAxisHandles() {
    this.#rowHandles.forEach((button) => button.remove?.());
    this.#columnHandles.forEach((button) => button.remove?.());
    this.#rowHandles = [];
    this.#columnHandles = [];
  }

  hide() {
    setHidden(this.#root, true);
    setHidden(this.#addRowButton, true);
    setHidden(this.#addColumnButton, true);
    this.#clearAxisHandles();
  }

  contains(target) {
    return (
      this.#root?.contains?.(target) ||
      this.#addRowButton?.contains?.(target) ||
      this.#addColumnButton?.contains?.(target) ||
      this.#rowHandles.some((button) => button.contains?.(target)) ||
      this.#columnHandles.some((button) => button.contains?.(target)) ||
      false
    );
  }

  destroy() {
    this.#root?.remove?.();
    this.#addRowButton?.remove?.();
    this.#addColumnButton?.remove?.();
    this.#clearAxisHandles();
    this.#root = null;
    this.#list = null;
    this.#addRowButton = null;
    this.#addColumnButton = null;
  }
}

export class TiptapTableToolbarController {
  #view;
  #editor = null;
  #entry = null;
  #state = {
    open: false,
    table: null,
    rect: null,
    grid: [],
    commands: [],
  };

  constructor({ view = null, dom = {} } = {}) {
    this.#view =
      view ??
      new TiptapTableToolbarView({
        document: dom.document ?? defaultDocument(),
        window: dom.window,
      });
  }

  get state() {
    return {
      ...this.#state,
      commands: this.#state.commands.map((command) => ({ ...command })),
    };
  }

  attach({ editor, root, entry } = {}) {
    this.#editor = editor ?? null;
    this.#entry = entry ?? null;
    this.#view.mount?.(root);
    this.refresh(editor);
  }

  refresh(editor = this.#editor) {
    if (!editor || this.#entry?.viewMode !== "hybrid") {
      this.close();
      return this.state;
    }

    const context = activeTableContext(editor);
    if (!context?.rect) {
      this.close();
      return this.state;
    }

    this.#state = {
      open: true,
      table: context.table,
      rect: context.rect,
      grid: context.grid,
      commands: TABLE_COMMANDS.filter(
        (command) => typeof editor.commands?.[command.command] === "function",
      ),
    };
    this.#view.update?.({
      ...this.#state,
      run: (commandId) => this.run(commandId),
      selectAxis: (axis, index) => this.selectAxis(axis, index),
    });
    return this.state;
  }

  run(commandId) {
    const command = TABLE_COMMANDS.find((item) => item.id === commandId);
    if (!command || !this.#editor) return false;
    const ok = runEditorCommand(this.#editor, command.command);
    this.refresh(this.#editor);
    return ok;
  }

  selectAxis(axis, index) {
    const ok = selectTableAxis(this.#editor, this.#state.grid, axis, index);
    this.refresh(this.#editor);
    return ok;
  }

  close() {
    if (!this.#state.open) return;
    this.#state = {
      open: false,
      table: null,
      rect: null,
      grid: [],
      commands: [],
    };
    this.#view.hide?.();
  }

  contains(target) {
    return this.#view.contains?.(target) ?? false;
  }

  destroy() {
    this.close();
    this.#view.destroy?.();
    this.#editor = null;
    this.#entry = null;
  }
}

export function createTiptapTableToolbarController(options) {
  return new TiptapTableToolbarController(options);
}
