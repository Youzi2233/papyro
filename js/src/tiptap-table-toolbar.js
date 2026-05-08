import { localizeTableCommand } from "./tiptap-i18n.js";
import {
  activeCellFromEditor,
  activeTableContext,
  cellPosition,
  closestComplexBlockElement,
  closestTableCellElement,
  closestTableElement,
  complexBlockTarget,
  complexBlockHoverContext,
  hoverIsNearComplexBlockBottom,
  insertParagraphAfterComplexBlock,
  normalizedRect,
  pointerAnchorRect,
  sameTableHover,
  tableCellAtPoint,
  tableHoverContext,
  tableHoverWithIntent,
  tableSelectionGrid,
  tableSelectionState,
} from "./tiptap-table-geometry.js";
import {
  TABLE_COMMANDS,
  canRunTableEditorCommand,
  createTableCommandMenuState,
  firstEnabledTableCommandId,
  nextEnabledTableCommandId,
  normalizeTableCellAttributeValue,
  runTableEditorCommand,
  tableCellAttributeValue,
  tableCommandLayoutGroup,
  tableCommandVariant,
  visibleTableCommands,
} from "./tiptap-table-commands.js";
import {
  createFloatingDismissController,
  defaultDocument,
  defaultWindow,
  isComposingKeyboardEvent,
} from "./tiptap-ui-primitives.js";
import {
  TABLE_COLUMN_HANDLE_HEIGHT,
  TABLE_ROW_HANDLE_WIDTH,
  TiptapTableToolbarView,
} from "./tiptap-table-toolbar-view.js";

function emptyTableToolbarState(language = "english") {
  return {
    open: false,
    menuOpen: false,
    mode: "context",
    table: null,
    rect: null,
    cell: null,
    cellRect: null,
    selectionRect: null,
    menuRect: null,
    menuAnchorRect: null,
    grid: [],
    selection: tableSelectionState(null, []),
    commands: [],
    activeCommandId: null,
    keyboardActive: false,
    hover: null,
    complexBlock: null,
    complexRect: null,
    language,
  };
}

function isTableToolbarActivation(event) {
  const key = String(event?.key ?? "").toLowerCase();
  if (event?.altKey || event?.ctrlKey || event?.metaKey) return false;
  if (key === "f10") return !!event?.shiftKey;
  return key === "contextmenu" || key === "apps";
}

function entryLanguage(entry) {
  return entry?.preferences?.language ?? "english";
}

function isDirectTableCellTarget(target, cell) {
  if (!target || !cell) return false;
  if (target === cell) return true;
  const tagName = String(target?.tagName ?? "").toLowerCase();
  return (tagName === "td" || tagName === "th") && target === cell;
}

function elementFromTarget(target) {
  if (!target) return null;
  if (target.nodeType === 1 || typeof target.closest === "function") return target;
  return target.parentElement ?? (target.parentNode?.nodeType === 1 ? target.parentNode : null);
}

function isInteractiveCellContent(target, cell) {
  const element = elementFromTarget(target);
  if (!element || !cell || element?.closest?.("th,td") !== cell) return false;

  const interactive = element.closest?.(
    "a,button,input,textarea,select,summary,[role=\"button\"],[contenteditable=\"false\"]",
  );
  return Boolean(interactive && interactive !== cell);
}

function isEditableTableCellSurfaceTarget(target, cell) {
  if (isDirectTableCellTarget(target, cell)) return true;
  const element = elementFromTarget(target);
  if (!element || !cell || element?.closest?.("th,td") !== cell) return false;

  return !isInteractiveCellContent(element, cell);
}

function isEmptyParagraphSurfaceTarget(target, cell) {
  const element = elementFromTarget(target);
  if (!element || !cell || element?.closest?.("th,td") !== cell) return false;
  const tagName = String(element?.tagName ?? "").toLowerCase();
  return tagName === "p" && String(element.textContent ?? "").trim().length === 0;
}

function shouldStartTableCellRangeDrag(target, cell) {
  if (isDirectTableCellTarget(target, cell)) return true;
  if (isInteractiveCellContent(target, cell)) return false;
  return isEmptyParagraphSurfaceTarget(target, cell);
}

function tableContextFromElement(editor, table) {
  if (!editor?.view || !table) return null;
  const grid = tableSelectionGrid(table, editor.view);
  const rect = normalizedRect(table.getBoundingClientRect?.());
  if (!rect || grid.length === 0) return null;

  return {
    table,
    rect,
    grid,
    selection: tableSelectionState(editor.state?.selection, grid),
  };
}

function hoverFromTableCell(cell, event, table) {
  if (!cell?.cell) return null;
  const cellRect = normalizedRect(cell.rect ?? cell.cell.getBoundingClientRect?.());
  return {
    table: true,
    rowIndex: cell.rowIndex,
    columnIndex: cell.columnIndex,
    cell: cell.cell,
    cellRect,
    edge: "cell",
    block: table,
    clientX: Number.isFinite(Number(event?.clientX)) ? Number(event.clientX) : null,
    clientY: Number.isFinite(Number(event?.clientY)) ? Number(event.clientY) : null,
  };
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
  } else if (axis === "table") {
    positions = (grid ?? [])
      .flatMap((row) => row.cells.map((cell) => cell.pos))
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
export class TiptapTableToolbarController {
  #view;
  #dismiss;
  #document = null;
  #editor = null;
  #entry = null;
  #insertMenu = null;
  #visualCellSelection = null;
  #removeListeners = [];
  #cellDrag = null;
  #state = {
    ...emptyTableToolbarState(),
  };

  constructor({
    view = null,
    insertMenu = null,
    dom = {},
    menuRendererFactory = null,
    chromeRendererFactory = null,
  } = {}) {
    const documentRef = dom.document ?? defaultDocument();
    const windowRef = dom.window ?? defaultWindow(documentRef);
    this.#document = documentRef;
    this.#insertMenu = insertMenu ?? null;
    this.#view =
      view ??
      new TiptapTableToolbarView({
        document: documentRef,
        window: windowRef,
        menuRendererFactory,
        chromeRendererFactory,
      });
    this.#dismiss = createFloatingDismissController({
      document: documentRef,
      window: windowRef,
      contains: (target) =>
        this.contains(target) || this.#state.table?.contains?.(target),
      shouldDismiss: (event) => this.#shouldDismiss(event),
      shouldDismissOnScroll: (event) => this.#shouldDismissOnScroll(event),
      onDismiss: () => this.close(),
      pointerDismissEvent: "pointerup",
    });
  }

  get state() {
    return {
      ...this.#state,
      commands: this.#state.commands.map((command) => ({ ...command })),
      selection: {
        ...this.#state.selection,
        positions: new Set(this.#state.selection?.positions ?? []),
        rows: [...(this.#state.selection?.rows ?? [])],
        columns: [...(this.#state.selection?.columns ?? [])],
      },
    };
  }

  attach({ editor, root, entry } = {}) {
    this.#editor = editor ?? null;
    this.#entry = entry ?? null;
    this.#view.mount?.(root);
    this.#bind(editor?.view?.dom ?? root);
    this.refresh(editor);
  }

  shouldKeepOpenOnEditorBlur(activeElement = null) {
    return Boolean(
      this.#state.open &&
        (this.contains(activeElement) ||
          this.#insertMenu?.contains?.(activeElement) ||
          this.#state.table?.contains?.(activeElement) ||
          activeElement == null ||
          activeElement === this.#document?.body),
    );
  }

  #shouldDismiss(event) {
    if (event?.type !== "focusin") return true;
    const target = event?.target;
    return !(
      target == null ||
      target === this.#document?.body ||
      this.#editor?.view?.dom?.contains?.(target)
    );
  }

  #shouldDismissOnScroll(event) {
    const target = event?.target;
    return !(
      this.#state.menuOpen &&
      (target == null ||
        target === this.#document?.body ||
        target === this.#editor?.view?.dom ||
        this.#editor?.view?.dom?.contains?.(target))
    );
  }

  #render() {
    this.#view.update?.({
      ...this.#state,
      run: (commandId) => this.run(commandId),
      selectAxis: (axis, index) => this.selectAxis(axis, index),
      insertParagraphAfterBlock: (block) => this.insertParagraphAfterBlock(block),
      toggleMenu: (mode, options) => this.toggleMenu(mode, options),
      openCellMenu: (mode, options) => this.openCellMenu(mode, options),
      setActiveCommand: (commandId, options) => this.setActiveCommand(commandId, options),
      handleKeyDown: (event) => this.handleKeyDown(event),
    });
  }

  #bind(target) {
    this.#unbind();
    if (!target?.addEventListener) return;

    const onContextMenu = (event) => this.handleContextMenu(event);
    const onPointerMove = (event) => this.handlePointerMove(event);
    const onPointerDown = (event) => this.handlePointerDown(event);
    const onPointerLeave = (event) => this.handlePointerLeave(event);
    const onDblClick = (event) => this.handleDoubleClick(event);
    target.addEventListener("contextmenu", onContextMenu, true);
    target.addEventListener("pointermove", onPointerMove, true);
    target.addEventListener("pointerdown", onPointerDown, true);
    target.addEventListener("pointerleave", onPointerLeave, true);
    target.addEventListener("dblclick", onDblClick, true);
    this.#removeListeners = [
      () => target.removeEventListener?.("contextmenu", onContextMenu, true),
      () => target.removeEventListener?.("pointermove", onPointerMove, true),
      () => target.removeEventListener?.("pointerdown", onPointerDown, true),
      () => target.removeEventListener?.("pointerleave", onPointerLeave, true),
      () => target.removeEventListener?.("dblclick", onDblClick, true),
    ];
  }

  #unbind() {
    this.#removeListeners.forEach((remove) => remove());
    this.#removeListeners = [];
  }

  refresh(editor = this.#editor) {
    if (!editor || this.#entry?.viewMode !== "hybrid") {
      this.close();
      return this.state;
    }

    const language = entryLanguage(this.#entry);
    const previousTable = this.#state.table;
    const previousKind = this.#state.selection.kind;
    const previousPositions = this.#state.selection.positions ?? new Set();
    const context = activeTableContext(editor);
    const visualCellSelection = this.#visualCellSelectionForContext(context);
    const previousMenuAnchorRect =
      this.#state.open && this.#state.menuOpen && previousTable === context?.table
        ? this.#state.menuAnchorRect
        : null;
    if (!context?.rect) {
      this.#visualCellSelection = null;
      if (this.#state.open) {
        this.#state = emptyTableToolbarState(language);
        this.#render();
        this.#dismiss.close();
      }
      return this.state;
    }
    const selectionChanged =
      this.#state.open &&
      previousTable === context.table &&
      (previousKind !== context.selection.kind ||
        previousPositions.size !== (context.selection.positions?.size ?? 0) ||
        [...previousPositions].some((pos) => !context.selection.positions.has(pos)));

    const commands = TABLE_COMMANDS.filter(
      (command) => typeof editor.commands?.[command.command] === "function",
    ).map((command) => {
      const disabled = !canRunTableEditorCommand(editor, command.command, command.args);
      const activeCell = activeCellFromEditor(editor, context.grid);
      return localizeTableCommand({
        ...command,
        disabled,
        variant: tableCommandVariant(command),
        layoutGroup: tableCommandLayoutGroup(command),
        active:
          command.command === "setCellAttribute" &&
          command.args?.length >= 2 &&
          normalizeTableCellAttributeValue(
            command.args[0],
            tableCellAttributeValue(activeCell, command.args[0]),
          ) ===
            normalizeTableCellAttributeValue(command.args[0], command.args[1]),
      }, language);
    });
    const currentMenuState = createTableCommandMenuState(commands, {
      mode: this.#state.menuOpen ? this.#state.mode : "context",
      selectionKind: context.selection.kind,
      activeCommandId: this.#state.activeCommandId,
    });
    const currentHover = this.#state.hover;
    let nextHover = null;
    if (previousTable === context.table && currentHover) {
      const refreshedHover = tableHoverContext(currentHover.cell, context.table, context.grid);
      if (refreshedHover) {
        nextHover = {
          ...refreshedHover,
          edge: currentHover.edge,
          clientX: currentHover.clientX ?? null,
          clientY: currentHover.clientY ?? null,
        };
      }
    }
    const activeCommandId = currentMenuState.activeCommandId;
    const selection = visualCellSelection
      ? {
          ...context.selection,
          positions: new Set([visualCellSelection.pos]),
          rows: [],
          columns: [],
          table: false,
          kind: "cell",
        }
      : context.selection;

    this.#state = {
      open: true,
      menuOpen: this.#state.menuOpen,
      mode: this.#state.mode,
      table: context.table,
      rect: context.rect,
      cell: context.cell,
      cellRect: context.cell?.getBoundingClientRect?.() ?? null,
      selectionRect: context.selectionRect,
      menuRect: context.menuRect,
      menuAnchorRect: previousMenuAnchorRect,
      grid: context.grid,
      selection,
      commands,
      activeCommandId,
      keyboardActive: this.#state.keyboardActive,
      hover: nextHover,
      complexBlock: context.table,
      complexRect: context.rect,
      language,
    };
    if (selectionChanged) {
      this.#state.menuOpen = false;
      this.#state.mode = "context";
      this.#state.keyboardActive = false;
      this.#state.menuAnchorRect = null;
      this.#state.hover = null;
    }
    this.#render();
    this.#dismiss.open();
    return this.state;
  }

  #visualCellSelectionForContext(context) {
    const visual = this.#visualCellSelection;
    if (!context?.table || !visual) return null;
    if (visual.table !== context.table) {
      this.#visualCellSelection = null;
      return null;
    }

    if ((context.selection?.positions?.size ?? 0) > 0) {
      this.#visualCellSelection = null;
      return null;
    }

    const match = (context.grid ?? [])
      .flatMap((row) => row.cells ?? [])
      .find((cell) => cell.pos === visual.pos);
    if (!match?.cell || (context.cell && context.cell !== match.cell)) {
      this.#visualCellSelection = null;
      return null;
    }

    this.#visualCellSelection = {
      table: context.table,
      pos: match.pos,
      cell: match.cell,
    };
    return this.#visualCellSelection;
  }

  setActiveCommand(commandId, { focus = false, keyboardActive = true } = {}) {
    if (!this.#state.open) return false;
    const command = visibleTableCommands(this.#state.commands, this.#state.mode, this.#state.selection.kind).find(
      (item) => item.id === commandId && !item.disabled,
    );
    if (!command) return false;

    this.#state = {
      ...this.#state,
      activeCommandId: command.id,
      keyboardActive,
    };
    this.#view.setActiveCommand?.(command.id, keyboardActive);
    if (focus) this.#view.focusCommand?.(command.id);
    return true;
  }

  #moveActiveCommand(direction, event) {
    const nextId = nextEnabledTableCommandId(
      visibleTableCommands(this.#state.commands, this.#state.mode, this.#state.selection.kind),
      this.#state.activeCommandId,
      direction,
    );
    if (!nextId) return false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return this.setActiveCommand(nextId, { focus: true, keyboardActive: true });
  }

  handleKeyDown(event) {
    if (isComposingKeyboardEvent(event)) return false;

    if (!this.#state.open && isTableToolbarActivation(event)) {
      this.refresh(this.#editor);
    }

    if (!this.#state.open) return false;

    if (isTableToolbarActivation(event)) {
      this.#state = {
        ...this.#state,
        menuOpen: true,
        mode: "keyboard",
        menuAnchorRect: null,
        keyboardActive: true,
      };
      this.#render();
      const firstId = createTableCommandMenuState(this.#state.commands, {
        mode: "keyboard",
        selectionKind: this.#state.selection.kind,
        activeCommandId: this.#state.activeCommandId,
      }).activeCommandId;
      if (!firstId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.setActiveCommand(firstId, { focus: true, keyboardActive: true });
    }

    const key = String(event?.key ?? "");
    if (key === "Escape") {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (this.#state.menuOpen) {
        this.toggleMenu(this.#state.mode, { open: false });
      } else {
        this.close();
      }
      return true;
    }

    if (
      key === "Enter" &&
      event?.ctrlKey &&
      !event?.altKey &&
      !event?.shiftKey &&
      !event?.metaKey
    ) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.insertParagraphAfterTable();
    }

    if (
      key === "Enter" &&
      event?.altKey &&
      !event?.ctrlKey &&
      !event?.shiftKey &&
      !event?.metaKey
    ) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.insertParagraphAfterTable();
    }

    const targetInsideToolbar = this.contains(event?.target);
    if (!targetInsideToolbar && !this.#state.keyboardActive) return false;

    if (key === "ArrowRight" || key === "ArrowDown") {
      return this.#moveActiveCommand(1, event);
    }
    if (key === "ArrowLeft" || key === "ArrowUp") {
      return this.#moveActiveCommand(-1, event);
    }
    if (key === "Home") {
      const firstId = createTableCommandMenuState(this.#state.commands, {
        mode: this.#state.mode,
        selectionKind: this.#state.selection.kind,
      }).activeCommandId;
      if (!firstId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.setActiveCommand(firstId, { focus: true, keyboardActive: true });
    }
    if (key === "End") {
      const ids = createTableCommandMenuState(this.#state.commands, {
        mode: this.#state.mode,
        selectionKind: this.#state.selection.kind,
      }).enabledCommandIds;
      const lastId = ids.at(-1) ?? null;
      if (!lastId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.setActiveCommand(lastId, { focus: true, keyboardActive: true });
    }

    if (key === "Enter" || key === " ") {
      const commandId = this.#state.activeCommandId;
      if (!commandId) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.run(commandId);
    }

    return false;
  }

  handlePointerMove(event) {
    if (this.#cellDrag) {
      return this.#updateCellDrag(event);
    }

    if (!this.#editor || this.#entry?.viewMode !== "hybrid") return false;

    const complexHover = complexBlockHoverContext(event?.target, this.#editor?.view?.dom);
    if (complexHover && complexHover.block !== this.#state.table) {
      const y = Number(event?.clientY);
      const hover = hoverIsNearComplexBlockBottom(complexHover.rect, y)
        ? {
            table: false,
            block: complexHover.block,
            edge: "block-after",
            clientX: Number.isFinite(Number(event?.clientX)) ? Number(event.clientX) : null,
            clientY: Number.isFinite(y) ? y : null,
          }
        : null;
      if (
        this.#state.open &&
        this.#state.table === null &&
        this.#state.complexBlock === complexHover.block &&
        sameTableHover(hover, this.#state.hover)
      ) {
        return false;
      }
      const language = entryLanguage(this.#entry);
      this.#state = {
        ...emptyTableToolbarState(language),
        open: true,
        hover,
        complexBlock: complexHover.block,
        complexRect: complexHover.rect,
      };
      this.#render();
      return true;
    }

    if (!this.#state.open || !this.#state.table) return false;
    const hover = tableHoverWithIntent({
      target: event?.target,
      table: this.#state.table,
      grid: this.#state.grid,
      tableRect: this.#state.rect,
      clientX: event?.clientX,
      clientY: event?.clientY,
      rowHandleWidth: TABLE_ROW_HANDLE_WIDTH,
      columnHandleHeight: TABLE_COLUMN_HANDLE_HEIGHT,
      allowRailTarget:
        event?.target === this.#editor?.view?.dom ||
        event?.target === this.#state.table ||
        event?.target?.classList?.contains?.("tableWrapper"),
    });
    if (sameTableHover(hover, this.#state.hover)) return false;
    this.#state = {
      ...this.#state,
      hover,
    };
    this.#render();
    return true;
  }

  handlePointerDown(event) {
    if (!this.#editor || this.#entry?.viewMode !== "hybrid") return false;
    if (event?.button != null && event.button !== 0) return false;
    if (event?.ctrlKey || event?.metaKey || event?.altKey) return false;
    if (this.contains(event?.target)) return false;
    if (event?.target?.closest?.(".column-resize-handle")) return false;

    const table = closestTableElement(event?.target, this.#editor?.view?.dom);
    if (!table) return false;
    const cell = closestTableCellElement(event?.target);
    if (!cell || !table.contains?.(cell)) return false;

    const activeContext = activeTableContext(this.#editor);
    const context =
      this.#state.table === table && this.#state.grid?.length
        ? this.#state
        : activeContext?.table === table
          ? activeContext
          : tableContextFromElement(this.#editor, table);
    const start = (context?.grid ?? [])
      .flatMap((row) => row.cells ?? [])
      .find((item) => item.cell === cell);
    if (!Number.isFinite(start?.pos)) return false;

    const selectable = typeof this.#editor?.commands?.setCellSelection === "function";
    if (!selectable) return false;

    if (isInteractiveCellContent(event?.target, cell)) return false;

    const cellSurfaceClick = isEditableTableCellSurfaceTarget(event?.target, cell);
    this.#previewActiveCellFromPointer(context, start, event);
    if (!cellSurfaceClick) return false;

    this.#cellDrag = {
      table,
      anchor: start,
      head: start,
      moved: false,
      selected: false,
      cellSurfaceClick,
      rangeSelectable: shouldStartTableCellRangeDrag(event?.target, cell),
      startX: Number(event?.clientX),
      startY: Number(event?.clientY),
      removeListeners: [],
    };

    this.#bindCellDragListeners();
    return false;
  }

  #previewActiveCellFromPointer(context, start, event) {
    if (!context?.table || !start?.cell) return false;
    this.#visualCellSelection = {
      table: context.table,
      pos: start.pos,
      cell: start.cell,
    };
    this.#state = {
      ...this.#state,
      open: true,
      menuOpen: false,
      mode: "context",
      table: context.table,
      rect: context.rect,
      cell: start.cell,
      cellRect: normalizedRect(start.rect ?? start.cell.getBoundingClientRect?.()),
      selectionRect: null,
      menuRect: null,
      menuAnchorRect: null,
      grid: context.grid ?? [],
      selection: {
        ...tableSelectionState(null, context.grid ?? []),
        positions: new Set([start.pos]),
      },
      hover: hoverFromTableCell(start, event, context.table),
      complexBlock: context.table,
      complexRect: context.rect,
    };
    this.#render();
    return true;
  }

  #selectCellRange(anchorPos, headPos) {
    if (
      !Number.isFinite(anchorPos) ||
      !Number.isFinite(headPos) ||
      typeof this.#editor?.commands?.setCellSelection !== "function"
    ) {
      return false;
    }

    const ok =
      this.#editor.commands.setCellSelection({
        anchorCell: anchorPos,
        headCell: headPos,
      }) !== false;
    if (!ok) return false;
    this.#visualCellSelection = null;
    this.#editor.commands?.focus?.();
    this.refresh(this.#editor);
    return true;
  }

  #bindCellDragListeners() {
    const drag = this.#cellDrag;
    const documentRef = this.#document ?? this.#editor?.view?.dom?.ownerDocument;
    if (!drag || !documentRef?.addEventListener) return;

    const onMove = (event) => this.#updateCellDrag(event);
    const onEnd = (event) => this.#finishCellDrag(event);
    documentRef.addEventListener("pointermove", onMove, true);
    documentRef.addEventListener("pointerup", onEnd, true);
    documentRef.addEventListener("dragstart", onEnd, true);
    drag.removeListeners = [
      () => documentRef.removeEventListener?.("pointermove", onMove, true),
      () => documentRef.removeEventListener?.("pointerup", onEnd, true),
      () => documentRef.removeEventListener?.("dragstart", onEnd, true),
    ];
  }

  #updateCellDrag(event) {
    const drag = this.#cellDrag;
    if (!drag || !this.#editor) return false;

    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    const distance =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(drag.startX) &&
      Number.isFinite(drag.startY)
        ? Math.hypot(x - drag.startX, y - drag.startY)
        : 0;
    if (distance > 3) drag.moved = true;
    if (!drag.rangeSelectable) return false;

    const context = activeTableContext(this.#editor);
    if (!context?.table || context.table !== drag.table) return false;

    const head =
      tableCellAtPoint(context.grid, event?.clientX, event?.clientY) ??
      (event?.target ? tableHoverContext(event.target, context.table, context.grid) : null);
    const nextHead = Number.isFinite(head?.pos)
      ? head
      : (context.grid ?? [])
          .flatMap((row) => row.cells ?? [])
          .find((item) => item.cell === head?.cell);
    if (!Number.isFinite(nextHead?.pos)) return false;

    if (!drag.moved) return false;
    if (!drag.selected && nextHead.pos === drag.anchor?.pos) return false;
    if (drag.selected && nextHead.pos === drag.head?.pos) return false;

    drag.head = nextHead;
    drag.selected = true;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return this.#selectCellRange(drag.anchor.pos, nextHead.pos);
  }

  #finishCellDrag(event) {
    if (!this.#cellDrag) return false;
    const drag = this.#cellDrag;
    drag.removeListeners?.forEach?.((remove) => remove());
    drag.removeListeners = [];
    this.#cellDrag = null;
    if (drag.selected) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
    } else if (drag.cellSurfaceClick && !drag.moved) {
      this.#focusCellClick(drag, event);
    }
    return true;
  }

  #focusCellClick(drag, event) {
    if (!drag?.anchor?.cell || !this.#editor) return false;
    const view = this.#editor.view;
    let targetPos = null;
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      typeof view?.posAtCoords === "function"
    ) {
      try {
        const result = view.posAtCoords({ left: x, top: y });
        if (Number.isFinite(result?.pos)) {
          targetPos = result.pos;
        }
      } catch (_error) {
        // Fall back to the cell start below.
      }
    }

    if (!Number.isFinite(targetPos) && typeof view?.posAtDOM === "function") {
      try {
        const cellStart = view.posAtDOM(drag.anchor.cell, 0);
        if (Number.isFinite(cellStart)) {
          targetPos = cellStart + 1;
        }
      } catch (_error) {
        // Keep native behavior if ProseMirror cannot resolve the cell.
      }
    }

    if (Number.isFinite(targetPos) && typeof this.#editor.commands?.setTextSelection === "function") {
      this.#editor.commands.setTextSelection(targetPos);
    }
    this.#editor.commands?.focus?.();
    this.#previewActiveCellFromPointer(
      tableContextFromElement(this.#editor, drag.table),
      drag.anchor,
      event,
    );
    return true;
  }

  handlePointerLeave(event) {
    if (!this.#state.open || !this.#state.hover) return false;
    if (
      this.contains(event?.relatedTarget) ||
      this.#state.table?.contains?.(event?.relatedTarget) ||
      this.#state.complexBlock?.contains?.(event?.relatedTarget)
    ) {
      return false;
    }
    if (this.#state.table) {
      this.#state = {
        ...this.#state,
        hover: null,
      };
      this.#render();
      return true;
    }

    this.#state = emptyTableToolbarState(entryLanguage(this.#entry));
    this.#render();
    return true;
  }

  handleContextMenu(event) {
    if (!this.#editor || this.#entry?.viewMode !== "hybrid") return false;

    const target = event?.target;
    const table = closestTableElement(target, this.#editor?.view?.dom);
    if (!table) return false;

    event?.preventDefault?.();
    event?.stopPropagation?.();

    const cell = closestTableCellElement(target);
    if (cell && table.contains?.(cell) && typeof this.#editor?.view?.posAtDOM === "function") {
      try {
        const pos = this.#editor.view.posAtDOM(cell, 0);
        if (
          Number.isFinite(pos) &&
          typeof this.#editor.commands?.setCellSelection === "function"
        ) {
          this.#editor.commands.setCellSelection({
            anchorCell: pos,
            headCell: pos,
          });
        }
      } catch (_error) {
        // Fall through to refreshing the existing table selection.
      }
    }

    this.#editor.commands?.focus?.();
    const anchorRect = pointerAnchorRect(event, cell?.getBoundingClientRect?.());
    this.refresh(this.#editor);
    return this.toggleMenu("context", { open: true, anchorRect });
  }

  handleDoubleClick(event) {
    if (!this.#editor || this.#entry?.viewMode !== "hybrid") return false;
    const block = closestComplexBlockElement(event?.target, this.#editor?.view?.dom);
    if (!block) return false;

    const rect = normalizedRect(block.getBoundingClientRect?.());
    const y = Number(event?.clientY);
    if (rect && Number.isFinite(y) && y >= rect.bottom - 18) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return this.insertParagraphAfterBlock(block, { useInsertMenu: false });
    }
    return false;
  }

  run(commandId) {
    const command = TABLE_COMMANDS.find((item) => item.id === commandId);
    if (!command || !this.#editor) return false;
    if (!canRunTableEditorCommand(this.#editor, command.command, command.args)) {
      this.refresh(this.#editor);
      return false;
    }
    const keepToolbarFocus = this.#state.keyboardActive && this.#state.menuOpen;
    const ok = runTableEditorCommand(this.#editor, command.command, command.args);
    this.refresh(this.#editor);
    if (keepToolbarFocus && this.#state.open && this.#state.activeCommandId) {
      this.#view.focusCommand?.(this.#state.activeCommandId);
    }
    return ok;
  }

  insertParagraphAfterBlock(block = null, { useInsertMenu = true } = {}) {
    const targetBlock = block ?? this.#state.table;
    const target = complexBlockTarget(this.#editor, targetBlock);
    if (useInsertMenu && target && typeof this.#insertMenu?.openAtBlock === "function") {
      this.#state = {
        ...this.#state,
        hover: null,
      };
      this.#render();
      const result = this.#insertMenu.openAtBlock(target, {
        anchorRect: targetBlock?.getBoundingClientRect?.(),
      });
      if (result?.open === true) {
        return true;
      }
    }

    const ok = insertParagraphAfterComplexBlock(this.#editor, targetBlock);
    if (!ok) return false;
    this.refresh(this.#editor);
    return true;
  }

  insertParagraphAfterTable() {
    return this.insertParagraphAfterBlock(this.#state.table, { useInsertMenu: false });
  }

  toggleMenu(mode = "context", { open = null, anchorRect = null } = {}) {
    if (!this.#state.open) return false;
    const nextMode = mode === "keyboard" ? "keyboard" : "context";
    const nextOpen = open === null ? !(this.#state.menuOpen && this.#state.mode === nextMode) : !!open;
    const scoped = createTableCommandMenuState(this.#state.commands, {
      mode: nextMode,
      selectionKind: this.#state.selection.kind,
      activeCommandId: this.#state.activeCommandId,
    });
    const scopedCommands = scoped.commands;
    if (nextOpen && scopedCommands.length === 0) return false;
    const activeCommandId = scoped.activeCommandId;

    this.#state = {
      ...this.#state,
      menuOpen: nextOpen,
      mode: nextMode,
      menuAnchorRect: nextOpen
        ? normalizedRect(anchorRect) ?? this.#state.menuAnchorRect ?? null
        : null,
      activeCommandId,
      keyboardActive: nextMode === "keyboard" && nextOpen ? this.#state.keyboardActive : false,
    };
    this.#render();
    return true;
  }

  openCellMenu(mode = "context", { open = null, anchorRect = null, cell = null } = {}) {
    if (!this.#state.open) return false;
    const isPlainCellContext =
      this.#state.selection?.kind === "cell" &&
      (this.#state.selection?.positions?.size ?? 0) <= 1;
    const pos = isPlainCellContext
      ? cellPosition(this.#state.grid, cell ?? this.#state.hover?.cell ?? this.#state.cell)
      : null;
    if (
      Number.isFinite(pos) &&
      typeof this.#editor?.commands?.setCellSelection === "function"
    ) {
      this.#visualCellSelection = null;
      const ok =
        this.#editor.commands.setCellSelection({
          anchorCell: pos,
          headCell: pos,
        }) !== false;
      if (ok) {
        this.#editor.commands?.focus?.();
        this.refresh(this.#editor);
      }
    }
    return this.toggleMenu(mode, { open, anchorRect });
  }

  selectAxis(axis, index) {
    this.#visualCellSelection = null;
    const ok = selectTableAxis(this.#editor, this.#state.grid, axis, index);
    this.refresh(this.#editor);
    this.#state = {
      ...this.#state,
      menuOpen: this.#state.menuOpen,
      mode: "context",
      activeCommandId: firstEnabledTableCommandId(this.#state.commands, "context", this.#state.selection.kind),
      keyboardActive: false,
      menuAnchorRect: this.#state.menuAnchorRect,
      hover: null,
    };
    this.#render();
    return ok;
  }

  close() {
    if (!this.#state.open) return;
    this.#visualCellSelection = null;
    this.#state = emptyTableToolbarState(entryLanguage(this.#entry));
    this.#view.hide?.();
    this.#dismiss.close();
  }

  contains(target) {
    return (
      this.#view.contains?.(target) ||
      this.#insertMenu?.contains?.(target) ||
      false
    );
  }

  destroy() {
    this.close();
    this.#unbind();
    this.#dismiss.close();
    this.#view.destroy?.();
    this.#editor = null;
    this.#entry = null;
  }
}

export function createTiptapTableToolbarController(options) {
  return new TiptapTableToolbarController(options);
}
