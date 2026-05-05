import { createTiptapSlashCommandController } from "./tiptap-slash-commands.js";
import { PAPYRO_CALLOUT_KIND_OPTIONS } from "./tiptap-markdown-snippets.js";
import {
  calloutOptionLabel,
  insertTableLabel,
  markdownCommandsLabel,
  noCommandsLabel,
  tableSizeLabel,
} from "./tiptap-i18n.js";
import { insertSlashParagraphAfterBlock } from "./tiptap-block-handle.js";
import {
  clamp,
  commandElementId,
  createElement,
  createFloatingDismissController,
  defaultDocument,
  defaultWindow,
  isComposingKeyboardEvent,
  mountFloatingRoot,
  positionFloatingElement,
  scrollActiveDescendantIntoView,
  setHidden,
  updateActiveDescendant,
  viewportSize,
} from "./tiptap-ui-primitives.js";

const DEFAULT_MAX_ITEMS = 12;
const DEFAULT_MAX_QUERY_LENGTH = 48;
const TABLE_GRID_ROWS = 6;
const TABLE_GRID_COLS = 6;

function chooseTableSize(tablePicker, rows, cols) {
  tablePicker?._choose?.(rows, cols);
}

function chooseCalloutKind(calloutPicker, kind) {
  calloutPicker?._choose?.(kind);
}

function entryLanguage(entry) {
  return entry?.preferences?.language ?? "english";
}

function isTriggerBoundary(character) {
  return !character || /\s/.test(character);
}

function textSelectionContext(editor) {
  const state = editor?.state ?? editor?.view?.state;
  const selection = state?.selection;
  const doc = state?.doc;
  if (!selection?.empty || !doc || typeof doc.textBetween !== "function") {
    return null;
  }

  const cursor = selection.from;
  const blockStart = selection.$from?.start?.() ?? Math.max(0, cursor - DEFAULT_MAX_QUERY_LENGTH);
  const text = doc.textBetween(blockStart, cursor, "\n", "\uFFFC");

  return {
    blockStart,
    cursor,
    text,
  };
}

function coordsRectAtPos(editor, pos) {
  if (!Number.isFinite(pos) || typeof editor?.view?.coordsAtPos !== "function") {
    return null;
  }

  try {
    return editor.view.coordsAtPos(pos);
  } catch (_error) {
    return null;
  }
}

function placeMenu(element, editor, range, anchorRect = null, placement = "bottom") {
  if (element && usableAnchorRect(anchorRect)) {
    positionFloatingElement(element, anchorRect, {
      viewport: viewportSize(editor?.view?.dom, defaultWindow(editor?.view?.dom?.ownerDocument)),
      size: {
        width: 320,
        height: 220,
        margin: 10,
      },
      placement,
    });
    return;
  }

  const view = editor?.view;
  if (!element || !view || typeof view.coordsAtPos !== "function" || !range) {
    return;
  }

  const rect = view.coordsAtPos(range.to);
  const fallbackRect = usableAnchorRect(rect) ? rect : anchorRect;
  if (!usableAnchorRect(fallbackRect)) return;

  positionFloatingElement(element, fallbackRect, {
    viewport: viewportSize(view.dom, defaultWindow(view.dom?.ownerDocument)),
    size: {
      width: 320,
      height: 220,
      margin: 10,
    },
    placement: "bottom",
  });
}

function usableAnchorRect(rect) {
  if (!rect) return false;
  const left = Number(rect.left);
  const top = Number(rect.top);
  const right = Number(rect.right);
  const bottom = Number(rect.bottom);
  if (![left, top, right, bottom].every(Number.isFinite)) return false;
  return Math.abs(left) + Math.abs(top) > 0 || right > left || bottom > top;
}

export function findSlashTrigger(
  text,
  cursorOffset = String(text ?? "").length,
  { maxQueryLength = DEFAULT_MAX_QUERY_LENGTH } = {},
) {
  const source = String(text ?? "");
  const cursor = clamp(Number(cursorOffset) || 0, 0, source.length);
  const beforeCursor = source.slice(0, cursor);
  const slashIndex = beforeCursor.lastIndexOf("/");
  if (slashIndex < 0) return null;

  const query = beforeCursor.slice(slashIndex + 1);
  if (query.length > maxQueryLength || /[\r\n]/.test(query)) return null;

  const beforeSlash = beforeCursor.charAt(slashIndex - 1);
  if (!isTriggerBoundary(beforeSlash)) return null;

  return {
    from: slashIndex,
    to: cursor,
    query,
  };
}

class TiptapSlashMenuView {
  #document;
  #ownerId;
  #root = null;
  #list = null;
  #empty = null;
  #tablePicker = null;
  #tablePickerLabel = null;
  #calloutPicker = null;
  #language = "english";

  constructor({ document = defaultDocument(), ownerId = "mn-tiptap-slash-menu" } = {}) {
    this.#document = document;
    this.#ownerId = ownerId;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = createElement(this.#document, "div", "mn-tiptap-slash-menu hidden");
    const list = createElement(this.#document, "div", "mn-tiptap-slash-menu-list");
    const empty = createElement(this.#document, "div", "mn-tiptap-slash-menu-empty");
    const tablePicker = createElement(this.#document, "div", "mn-tiptap-table-size-picker hidden");
    const tablePickerLabel = createElement(this.#document, "div", "mn-tiptap-table-size-picker-label");
    const tablePickerGrid = createElement(this.#document, "div", "mn-tiptap-table-size-picker-grid");
    const calloutPicker = createElement(this.#document, "div", "mn-tiptap-callout-kind-picker hidden");
    if (!root || !list || !empty || !tablePicker || !tablePickerLabel || !tablePickerGrid || !calloutPicker) return;

    root.id = this.#ownerId;
    root.role = "listbox";
    root.setAttribute("aria-label", markdownCommandsLabel(this.#language));
    empty.textContent = noCommandsLabel(this.#language);
    tablePickerLabel.textContent = tableSizeLabel(this.#language, 3, 2);
    for (let row = 1; row <= TABLE_GRID_ROWS; row += 1) {
      for (let col = 1; col <= TABLE_GRID_COLS; col += 1) {
        const cell = createElement(this.#document, "button", "mn-tiptap-table-size-picker-cell");
        if (!cell) continue;
        cell.type = "button";
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.setAttribute("aria-label", insertTableLabel(this.#language, row, col));
        cell.addEventListener("pointerenter", () => {
          this.#updateTablePickerSize(row, col);
        });
        cell.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation?.();
          chooseTableSize(tablePicker, row, col);
        });
        cell.addEventListener("mousedown", (event) => {
          event.preventDefault();
        });
        tablePickerGrid.appendChild(cell);
      }
    }
    tablePicker.append(tablePickerLabel, tablePickerGrid);
    PAPYRO_CALLOUT_KIND_OPTIONS.forEach((option) => {
      const item = createElement(this.#document, "button", "mn-tiptap-callout-kind-option");
      const tone = createElement(this.#document, "span", "mn-tiptap-callout-kind-tone");
      const copy = createElement(this.#document, "span", "mn-tiptap-callout-kind-copy");
      const title = createElement(this.#document, "span", "mn-tiptap-callout-kind-title");
      const description = createElement(
        this.#document,
        "span",
        "mn-tiptap-callout-kind-description",
      );
      if (!item || !tone || !copy || !title || !description) return;

      item.type = "button";
      item.dataset.calloutKind = option.kind;
      item.setAttribute("aria-label", calloutOptionLabel(this.#language, option.title));
      title.textContent = option.title;
      description.textContent = option.description;
      copy.append(title, description);
      item.append(tone, copy);
      item.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        chooseCalloutKind(calloutPicker, option.kind);
      });
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      calloutPicker.appendChild(item);
    });
    root.append(list, empty, tablePicker, calloutPicker);
    mountFloatingRoot(root, container, this.#document);

    this.#root = root;
    this.#list = list;
    this.#empty = empty;
    this.#tablePicker = tablePicker;
    this.#tablePickerLabel = tablePickerLabel;
    this.#calloutPicker = calloutPicker;
    setHidden(root, true);
  }

  update(state, editor) {
    if (!this.#root || !this.#list || !this.#empty || !state.open) return;

    this.#language = state.language ?? "english";
    this.#root.setAttribute("aria-label", markdownCommandsLabel(this.#language));
    this.#empty.textContent = noCommandsLabel(this.#language);
    this.#root
      .querySelectorAll?.(".mn-tiptap-table-size-picker-cell")
      ?.forEach?.((cell) => {
        cell.setAttribute(
          "aria-label",
          insertTableLabel(this.#language, cell.dataset?.row, cell.dataset?.col),
        );
      });

    this.#list.replaceChildren();
    state.commands.forEach((command, index) => {
      const item = createElement(this.#document, "button", "mn-tiptap-slash-menu-item");
      const title = createElement(this.#document, "span", "mn-tiptap-slash-menu-title");
      const description = createElement(
        this.#document,
        "span",
        "mn-tiptap-slash-menu-description",
      );
      const group = createElement(this.#document, "span", "mn-tiptap-slash-menu-group");
      if (!item || !title || !description || !group) return;

      item.type = "button";
      item.id = commandElementId(this.#ownerId, index);
      item.role = "option";
      item.setAttribute("aria-selected", String(index === state.selectedIndex));
      item.classList.toggle("active", index === state.selectedIndex);
      item.dataset.commandId = command.id;
      item.tabIndex = -1;
      title.textContent = command.title;
      description.textContent = command.description ?? "";
      group.textContent = command.group ?? "";

      item.append(title, group, description);
      item.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        state.choose(command.id);
      });
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      this.#list.appendChild(item);
    });

    this.#updateTablePicker(state);
    setHidden(this.#empty, state.commands.length > 0);
    updateActiveDescendant(this.#root, this.#ownerId, state.commands, state.selectedIndex);
    scrollActiveDescendantIntoView(this.#root, this.#ownerId, state.commands, state.selectedIndex);
    setHidden(this.#root, false);
    placeMenu(this.#root, editor, state.range, state.anchorRect, state.placement);
  }

  hide() {
    setHidden(this.#root, true);
  }

  contains(target) {
    return this.#root?.contains?.(target) ?? false;
  }

  destroy() {
    this.#root?.remove?.();
    this.#root = null;
    this.#list = null;
    this.#empty = null;
    this.#tablePicker = null;
    this.#tablePickerLabel = null;
    this.#calloutPicker = null;
  }

  #updateTablePicker(state) {
    if (!this.#tablePicker) return;
    const selectedCommand = state.commands[state.selectedIndex];
    const showPicker = selectedCommand?.id === "table";
    const showCalloutPicker = selectedCommand?.id === "callout";
    setHidden(this.#tablePicker, !showPicker);
    setHidden(this.#calloutPicker, !showCalloutPicker);
    if (showPicker) {
      this.#tablePicker._choose = (rows, cols) => state.choose("table", { tableSize: { rows, cols } });
      this.#updateTablePickerSize(3, 2);
    } else {
      this.#tablePicker._choose = null;
    }
    if (this.#calloutPicker) {
      this.#calloutPicker._choose = showCalloutPicker
        ? (kind) => state.choose("callout", { calloutKind: kind })
        : null;
    }
  }

  #updateTablePickerSize(rows, cols) {
    if (!this.#tablePicker || !this.#tablePickerLabel) return;
    this.#tablePickerLabel.textContent = tableSizeLabel(this.#language, rows, cols);
    this.#tablePicker
      .querySelectorAll?.(".mn-tiptap-table-size-picker-cell")
      ?.forEach?.((cell) => {
        const cellRow = Number(cell.dataset?.row);
        const cellCol = Number(cell.dataset?.col);
        cell.classList?.toggle?.("active", cellRow <= rows && cellCol <= cols);
      });
  }
}

export class TiptapSlashMenuController {
  #commands;
  #maxItems;
  #view;
  #dismiss;
  #state = {
    open: false,
    query: "",
    range: null,
    commands: [],
    selectedIndex: 0,
    deleteRangeBeforeRun: true,
    anchorRect: null,
    placement: "bottom",
  };
  #editor = null;
  #entry = null;

  constructor({
    commandController = createTiptapSlashCommandController(),
    maxItems = DEFAULT_MAX_ITEMS,
    view = null,
    dom = {},
  } = {}) {
    this.#commands = commandController;
    this.#maxItems = maxItems;
    const documentRef = dom.document ?? defaultDocument();
    const windowRef = dom.window ?? defaultWindow(documentRef);
    this.#view =
      view ??
      new TiptapSlashMenuView({
        document: documentRef,
      });
    this.#dismiss = createFloatingDismissController({
      document: documentRef,
      window: windowRef,
      contains: (target) => this.contains(target),
      onDismiss: () => this.close(),
    });
  }

  get state() {
    return {
      ...this.#state,
      commands: [...this.#state.commands],
      range: this.#state.range ? { ...this.#state.range } : null,
    };
  }

  attach({ editor, root, entry } = {}) {
    this.#editor = editor ?? null;
    this.#entry = entry ?? null;
    this.#view.mount?.(root);
    this.refresh(editor);
  }

  refresh(editor = this.#editor) {
    if (!editor) {
      this.close();
      return this.state;
    }

    const context = textSelectionContext(editor);
    if (!context) {
      this.close();
      return this.state;
    }

    const trigger = findSlashTrigger(context.text);
    if (!trigger) {
      this.close();
      return this.state;
    }

    const commands = this.#commands.query(trigger.query, {
      limit: this.#maxItems,
      language: entryLanguage(this.#entry),
    });
    const previousCommandId = this.#state.commands[this.#state.selectedIndex]?.id;
    const nextSelectedIndex = clamp(
      commands.findIndex((command) => command.id === previousCommandId),
      0,
      Math.max(0, commands.length - 1),
    );

    this.#state = {
      open: true,
      query: trigger.query,
      range: {
        from: context.blockStart + trigger.from,
        to: context.blockStart + trigger.to,
      },
      commands,
      selectedIndex: nextSelectedIndex < 0 ? 0 : nextSelectedIndex,
      deleteRangeBeforeRun: true,
      anchorRect: null,
      placement: "bottom",
    };
    this.#view.update?.(
      {
        ...this.#state,
        language: entryLanguage(this.#entry),
        choose: (commandId, options) => this.choose(commandId, options),
      },
      editor,
    );
    this.#dismiss.open();
    return this.state;
  }

  openAtBlock(target, { anchorRect = null } = {}) {
    if (!this.#editor || (this.#entry && this.#entry.viewMode !== "hybrid")) {
      this.close();
      return this.state;
    }

    const range = insertSlashParagraphAfterBlock(this.#editor, target);
    if (!range) {
      this.close();
      return this.state;
    }

    this.#editor.commands?.focus?.();
    const slashRect = coordsRectAtPos(this.#editor, range.to);

    const commands = this.#commands.query("", {
      limit: this.#maxItems,
      language: entryLanguage(this.#entry),
    });
    this.#state = {
      open: true,
      query: "",
      range,
      commands,
      selectedIndex: 0,
      deleteRangeBeforeRun: true,
      anchorRect: usableAnchorRect(slashRect) ? slashRect : anchorRect,
      placement: "bottom",
    };
    this.#view.update?.(
      {
        ...this.#state,
        language: entryLanguage(this.#entry),
        choose: (commandId, options) => this.choose(commandId, options),
      },
      this.#editor,
    );
    this.#dismiss.open();
    return this.state;
  }

  moveSelection(delta) {
    if (!this.#state.open || this.#state.commands.length === 0) return this.state;
    const count = this.#state.commands.length;
    this.#state = {
      ...this.#state,
      selectedIndex: (this.#state.selectedIndex + delta + count) % count,
    };
    this.#view.update?.(
      {
        ...this.#state,
        language: entryLanguage(this.#entry),
        choose: (commandId, options) => this.choose(commandId, options),
      },
      this.#editor,
    );
    return this.state;
  }

  choose(commandId = this.#state.commands[this.#state.selectedIndex]?.id, options = {}) {
    if (!this.#state.open || !commandId || !this.#editor) return false;
    const range = this.#state.range;
    const shouldDeleteRange = this.#state.deleteRangeBeforeRun;
    this.close();

    if (shouldDeleteRange && range && typeof this.#editor.commands?.deleteRange === "function") {
      this.#editor.commands.deleteRange(range);
    }

    const result = this.#commands.run(commandId, {
      editor: this.#editor,
      entry: this.#entry,
      source: "slash_menu",
      ...options,
    });
    return result.ok;
  }

  handleKeyDown(event) {
    if (!this.#state.open) return false;
    if (isComposingKeyboardEvent(event)) return false;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveSelection(1);
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveSelection(-1);
      return true;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      if (this.#state.commands.length === 0) return false;
      event.preventDefault();
      return this.choose();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return true;
    }

    return false;
  }

  close() {
    if (!this.#state.open) return;
    this.#state = {
      open: false,
      query: "",
      range: null,
      commands: [],
      selectedIndex: 0,
      deleteRangeBeforeRun: true,
      anchorRect: null,
      placement: "bottom",
    };
    this.#view.hide?.();
    this.#dismiss.close();
  }

  destroy() {
    this.close();
    this.#dismiss.close();
    this.#view.destroy?.();
    this.#editor = null;
    this.#entry = null;
  }

  contains(target) {
    return this.#view.contains?.(target) ?? false;
  }
}

export function createTiptapSlashMenuController(options) {
  return new TiptapSlashMenuController(options);
}
