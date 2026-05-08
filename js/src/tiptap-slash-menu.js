import { createTiptapSlashCommandController } from "./tiptap-slash-commands.js";
import {
  PAPYRO_CODE_LANGUAGE_OPTIONS,
  codeBlockLanguageOptionToken,
  codeBlockLanguageUiLabel,
} from "./tiptap-code-block.js";
import { PAPYRO_CALLOUT_KIND_OPTIONS } from "./tiptap-markdown-snippets.js";
import {
  calloutOptionLabel,
  insertBlockMenuTitleLabel,
  insertTableLabel,
  localizeCalloutKindOption,
  markdownCommandsLabel,
  noCommandsLabel,
  slashQueryMenuTitleLabel,
  tableSizeLabel,
} from "./tiptap-i18n.js";
import { insertSlashParagraphAfterBlock } from "./tiptap-block-handle.js";
import {
  commandMenuGroupTone,
  commandMenuSidePanel,
  commandMenuSidePanelId,
  commandMenuSidePanelSize,
} from "./tiptap-react/commands/command-menu-model.js";
import {
  clamp,
  bindPointerActivation,
  commandElementId,
  createElement,
  createFloatingDismissController,
  defaultDocument,
  defaultWindow,
  isComposingKeyboardEvent,
  mountFloatingRoot,
  positionFloatingElement,
  setHidden,
  menuCommandItems,
  syncMenuActiveDescendant,
  viewportSize,
} from "./tiptap-ui-primitives.js";

const DEFAULT_MAX_ITEMS = 15;
const DEFAULT_MAX_QUERY_LENGTH = 48;
const TABLE_GRID_ROWS = 6;
const TABLE_GRID_COLS = 6;

function chooseTableSize(tablePicker, rows, cols) {
  tablePicker?._choose?.(rows, cols);
}

function chooseCalloutKind(calloutPicker, kind) {
  calloutPicker?._choose?.(kind);
}

function chooseCodeLanguage(codeLanguagePicker, language) {
  codeLanguagePicker?._choose?.(language);
}

function groupedCommands(commands) {
  const groups = [];
  const byName = new Map();
  commands.forEach((command, index) => {
    const groupName = command.group || "Text";
    let group = byName.get(groupName);
    if (!group) {
      group = {
        name: groupName,
        commands: [],
      };
      byName.set(groupName, group);
      groups.push(group);
    }
    group.commands.push({ ...command, index });
  });
  return groups;
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

function blockInsertAnchorRect(target) {
  const rect = target?.block?.getBoundingClientRect?.();
  if (!rect) return null;

  const left = Number(rect.left);
  const top = Number(rect.top);
  const height = Number(rect.height ?? 0);
  const bottom = Number(rect.bottom ?? (Number.isFinite(top) ? top + height : NaN));
  if (![left, bottom].every(Number.isFinite)) return null;

  return {
    left,
    right: left,
    top: bottom,
    bottom,
    width: 0,
    height: 0,
  };
}

function isSuspiciousOriginCaretRect(rect) {
  if (!usableAnchorRect(rect)) return false;
  const left = Math.abs(Number(rect.left));
  const top = Math.abs(Number(rect.top));
  const width = Math.abs(Number(rect.right ?? rect.left) - Number(rect.left));
  return left <= 1 && top <= 1 && width <= 2;
}

function blockInsertMenuAnchorRect(slashRect, target, fallbackRect = null) {
  const blockAnchor = blockInsertAnchorRect(target);
  const fallback = usableAnchorRect(blockAnchor) ? blockAnchor : fallbackRect;
  if (
    usableAnchorRect(slashRect) &&
    !(usableAnchorRect(fallback) && isSuspiciousOriginCaretRect(slashRect))
  ) {
    return slashRect;
  }
  return fallback;
}

const MAIN_MENU_WIDTH = 224;
const MAIN_MENU_HEIGHT = 360;
const SIDE_PANEL_GAP = 8;
const SIDE_PANEL_INTENT_DELAY_MS = 80;

function placeMenu(element, editor, range, anchorRect = null, placement = "bottom") {
  if (element && usableAnchorRect(anchorRect)) {
    positionFloatingElement(element, anchorRect, {
      viewport: viewportSize(editor?.view?.dom, defaultWindow(editor?.view?.dom?.ownerDocument)),
      size: {
        width: MAIN_MENU_WIDTH,
        height: MAIN_MENU_HEIGHT,
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
      width: MAIN_MENU_WIDTH,
      height: MAIN_MENU_HEIGHT,
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

function triggerRange(context, trigger) {
  if (!context || !trigger) return null;
  return {
    from: context.blockStart + trigger.from,
    to: context.blockStart + trigger.to,
  };
}

function rangeEquals(left, right) {
  return Number.isFinite(left?.from) &&
    Number.isFinite(left?.to) &&
    left.from === right?.from &&
    left.to === right?.to;
}

function syncActiveCommand(root, ownerId, commands, selectedIndex, { scroll = true } = {}) {
  const didSync = syncMenuActiveDescendant(root, ownerId, commands, selectedIndex, {
    ariaSelected: true,
    scroll,
  });
  menuCommandItems(root).forEach((item) => {
    const itemIndex = Number(item.dataset?.commandIndex);
    const command = commands[itemIndex];
    const panel = commandMenuSidePanel(command);
    if (panel !== "none") {
      item.setAttribute?.("aria-expanded", String(command?.index === selectedIndex));
      item.setAttribute?.("aria-controls", commandMenuSidePanelId(ownerId, panel));
    }
  });
  return didSync;
}

function commandItemByIndex(root, index) {
  if (!root || !Number.isInteger(index)) return null;
  const selector = `[data-command-index="${index}"]`;
  if (typeof root.querySelector === "function") {
    try {
      const found = root.querySelector(selector);
      if (found) return found;
    } catch (_error) {
      // Fall through to the small tree walk used by tests and non-standard DOMs.
    }
  }

  const children = Array.from(root.children ?? []);
  for (const child of children) {
    if (Number(child?.dataset?.commandIndex) === index) return child;
    const found = commandItemByIndex(child, index);
    if (found) return found;
  }
  return null;
}

class TiptapSlashMenuView {
  #document;
  #ownerId;
  #root = null;
  #header = null;
  #eyebrow = null;
  #title = null;
  #list = null;
  #empty = null;
  #tablePicker = null;
  #tablePickerLabel = null;
  #tablePickerTitle = null;
  #calloutPicker = null;
  #codeLanguagePicker = null;
  #language = "english";
  #hoverTimer = null;

  constructor({ document = defaultDocument(), ownerId = "mn-tiptap-slash-menu" } = {}) {
    this.#document = document;
    this.#ownerId = ownerId;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = createElement(this.#document, "div", "mn-tiptap-slash-menu hidden");
    const header = createElement(this.#document, "div", "mn-tiptap-slash-menu-header");
    const eyebrow = createElement(this.#document, "div", "mn-tiptap-slash-menu-eyebrow");
    const title = createElement(this.#document, "div", "mn-tiptap-slash-menu-heading");
    const list = createElement(this.#document, "div", "mn-tiptap-slash-menu-list");
    const empty = createElement(this.#document, "div", "mn-tiptap-slash-menu-empty");
    const tablePicker = createElement(this.#document, "div", "mn-tiptap-table-size-picker hidden");
    const tablePickerHeader = createElement(this.#document, "div", "mn-tiptap-table-size-picker-header");
    const tablePickerTitle = createElement(this.#document, "span", "mn-tiptap-table-size-picker-title");
    const tablePickerLabel = createElement(this.#document, "div", "mn-tiptap-table-size-picker-label");
    const tablePickerGridShell = createElement(this.#document, "div", "mn-tiptap-table-size-picker-grid-shell");
    const tablePickerGrid = createElement(this.#document, "div", "mn-tiptap-table-size-picker-grid");
    const calloutPicker = createElement(this.#document, "div", "mn-tiptap-callout-kind-picker hidden");
    const codeLanguagePicker = createElement(this.#document, "div", "mn-tiptap-code-language-picker hidden");
    if (!root || !header || !eyebrow || !title || !list || !empty || !tablePicker || !tablePickerHeader || !tablePickerTitle || !tablePickerLabel || !tablePickerGridShell || !tablePickerGrid || !calloutPicker || !codeLanguagePicker) return;

    root.id = this.#ownerId;
    root.role = "listbox";
    root.setAttribute("aria-label", markdownCommandsLabel(this.#language));
    tablePicker.id = commandMenuSidePanelId(this.#ownerId, "table");
    tablePicker.role = "menu";
    tablePicker.setAttribute("aria-label", tableSizeLabel(this.#language, 3, 2));
    calloutPicker.id = commandMenuSidePanelId(this.#ownerId, "callout");
    calloutPicker.role = "menu";
    codeLanguagePicker.id = commandMenuSidePanelId(this.#ownerId, "code-language");
    codeLanguagePicker.role = "menu";
    codeLanguagePicker.setAttribute("aria-label", codeBlockLanguageUiLabel(this.#language, null));
    eyebrow.textContent = markdownCommandsLabel(this.#language);
    title.textContent = insertBlockMenuTitleLabel(this.#language);
    empty.textContent = noCommandsLabel(this.#language);
    tablePickerTitle.textContent = insertTableLabel(this.#language, 3, 2);
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
        bindPointerActivation(cell, () => chooseTableSize(tablePicker, row, col));
        tablePickerGrid.appendChild(cell);
      }
    }
    tablePickerHeader.append(tablePickerTitle, tablePickerLabel);
    tablePickerGridShell.appendChild(tablePickerGrid);
    tablePicker.append(tablePickerHeader, tablePickerGridShell);
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
      const localizedOption = localizeCalloutKindOption(option, this.#language);
      item.setAttribute("aria-label", calloutOptionLabel(this.#language, localizedOption.title));
      title.textContent = localizedOption.title;
      description.textContent = localizedOption.description;
      copy.append(title, description);
      item.append(tone, copy);
      bindPointerActivation(item, () => chooseCalloutKind(calloutPicker, option.kind));
      calloutPicker.appendChild(item);
    });
    PAPYRO_CODE_LANGUAGE_OPTIONS.forEach((option) => {
      const item = createElement(this.#document, "button", "mn-tiptap-code-language-option");
      const token = createElement(this.#document, "span", "mn-tiptap-code-language-option-token");
      const title = createElement(this.#document, "span", "mn-tiptap-code-language-option-title");
      if (!item || !token || !title) return;

      item.type = "button";
      item.role = "menuitem";
      item.dataset.languageId = option.id;
      item.dataset.languageValue = option.language ?? "";
      token.setAttribute("aria-hidden", "true");
      token.textContent = codeBlockLanguageOptionToken(option);
      title.textContent = codeBlockLanguageUiLabel(this.#language, option.language);
      item.setAttribute("aria-label", title.textContent);
      item.append(token, title);
      bindPointerActivation(item, () => chooseCodeLanguage(codeLanguagePicker, option.language));
      codeLanguagePicker.appendChild(item);
    });
    header.append(eyebrow, title);
    root.append(header, list, empty, tablePicker, calloutPicker, codeLanguagePicker);
    mountFloatingRoot(root, container, this.#document);

    this.#root = root;
    this.#header = header;
    this.#eyebrow = eyebrow;
    this.#title = title;
    this.#list = list;
    this.#empty = empty;
    this.#tablePicker = tablePicker;
    this.#tablePickerTitle = tablePickerTitle;
    this.#tablePickerLabel = tablePickerLabel;
    this.#calloutPicker = calloutPicker;
    this.#codeLanguagePicker = codeLanguagePicker;
    setHidden(root, true);
  }

  update(state, editor) {
    if (!this.#root || !this.#list || !this.#empty || !state.open) return;

    this.#language = state.language ?? "english";
    this.#root.setAttribute("aria-label", markdownCommandsLabel(this.#language));
    if (this.#eyebrow) {
      this.#eyebrow.textContent = markdownCommandsLabel(this.#language);
    }
    if (this.#title) {
      this.#title.textContent = state.cleanupRangeOnClose
        ? insertBlockMenuTitleLabel(this.#language)
        : slashQueryMenuTitleLabel(this.#language, state.query);
    }
    this.#empty.textContent = noCommandsLabel(this.#language);
    this.#root
      .querySelectorAll?.(".mn-tiptap-table-size-picker-cell")
      ?.forEach?.((cell) => {
        cell.setAttribute(
          "aria-label",
          insertTableLabel(this.#language, cell.dataset?.row, cell.dataset?.col),
        );
      });
    this.#updateCalloutOptionLabels();
    this.#updateCodeLanguageOptionLabels();

    this.#list.replaceChildren();
    groupedCommands(state.commands).forEach((commandGroup) => {
      const section = createElement(this.#document, "section", "mn-tiptap-slash-menu-section");
      const heading = createElement(this.#document, "div", "mn-tiptap-slash-menu-section-title");
      if (!section || !heading) return;

      section.role = "group";
      section.setAttribute("aria-label", commandGroup.name);
      heading.textContent = commandGroup.name;
      section.appendChild(heading);

      commandGroup.commands.forEach((command) => {
        const item = createElement(this.#document, "button", "mn-tiptap-slash-menu-item");
        const icon = createElement(
          this.#document,
          "span",
          `mn-tiptap-slash-menu-icon ${command.icon ?? "paragraph"}`,
        );
        const copy = createElement(this.#document, "span", "mn-tiptap-slash-menu-copy");
        const title = createElement(this.#document, "span", "mn-tiptap-slash-menu-title");
        const description = createElement(
          this.#document,
          "span",
          "mn-tiptap-slash-menu-description",
        );
        if (!item || !icon || !copy || !title || !description) return;

        item.type = "button";
        item.id = commandElementId(this.#ownerId, command.index);
        item.role = "option";
        item.setAttribute("aria-selected", String(command.index === state.selectedIndex));
        item.classList.toggle("active", command.index === state.selectedIndex);
        const sidePanel = commandMenuSidePanel(command);
        const hasSidePanel = sidePanel !== "none";
        if (hasSidePanel) {
          item.setAttribute("aria-haspopup", "menu");
          item.setAttribute(
            "aria-expanded",
            String(command.index === state.selectedIndex),
          );
          item.setAttribute("aria-controls", commandMenuSidePanelId(this.#ownerId, sidePanel));
        }
        item.dataset.commandId = command.id;
        item.dataset.commandIndex = String(command.index);
        if (command.recent) {
          item.dataset.recent = "true";
        }
        item.dataset.group = command.group ?? "";
        item.dataset.sidePanel = sidePanel;
        item.tabIndex = -1;
        icon.setAttribute("aria-hidden", "true");
        icon.dataset.icon = command.icon ?? "paragraph";
        icon.dataset.commandGroup = commandMenuGroupTone(command);
        icon.dataset.iconSource = "fallback";
        title.textContent = command.title;
        description.textContent = command.description ?? "";
        copy.append(title, description);

        item.append(icon, copy);
        item.addEventListener("pointerenter", () =>
          this.#activateWithIntent(() => state.activate(command.index, { scroll: false })),
        );
        item.addEventListener("focus", () =>
          state.activate(command.index, { scroll: true }),
        );
        bindPointerActivation(item, () => state.choose(command.id));
        section.appendChild(item);
      });

      this.#list.appendChild(section);
    });

    this.#updateTablePicker(state);
    setHidden(this.#empty, state.commands.length > 0);
    syncActiveCommand(this.#root, this.#ownerId, state.commands, state.selectedIndex);
    setHidden(this.#root, false);
    placeMenu(this.#root, editor, state.range, state.anchorRect, state.placement);
    this.#syncSidePanelPlacement(state, editor);
  }

  updateSelection(state, options = {}, editor = null) {
    if (!this.#root || !state.open) return false;
    syncActiveCommand(this.#root, this.#ownerId, state.commands, state.selectedIndex, options);
    this.#updateTablePicker(state);
    this.#syncSidePanelPlacement(state, editor);
    return true;
  }

  #activateWithIntent(run) {
    defaultWindow(this.#document)?.clearTimeout?.(this.#hoverTimer);
    const windowRef = defaultWindow(this.#document);
    this.#hoverTimer = windowRef?.setTimeout
      ? windowRef.setTimeout(run, SIDE_PANEL_INTENT_DELAY_MS)
      : null;
    if (this.#hoverTimer == null) {
      run();
    }
  }

  hide() {
    defaultWindow(this.#document)?.clearTimeout?.(this.#hoverTimer);
    this.#hoverTimer = null;
    setHidden(this.#root, true);
  }

  contains(target) {
    return this.#root?.contains?.(target) ?? false;
  }

  destroy() {
    defaultWindow(this.#document)?.clearTimeout?.(this.#hoverTimer);
    this.#root?.remove?.();
    this.#root = null;
    this.#header = null;
    this.#eyebrow = null;
    this.#title = null;
    this.#list = null;
    this.#empty = null;
    this.#tablePicker = null;
    this.#tablePickerTitle = null;
    this.#tablePickerLabel = null;
    this.#calloutPicker = null;
    this.#codeLanguagePicker = null;
  }

  #updateTablePicker(state) {
    if (!this.#tablePicker) return;
    const selectedCommand = state.commands[state.selectedIndex];
    const showPicker = selectedCommand?.id === "table";
    const showCalloutPicker = selectedCommand?.id === "callout";
    const showCodeLanguagePicker = selectedCommand?.id === "code-block";
    if (this.#root) {
      this.#root.dataset.sidePanel = showPicker
        ? "table"
        : showCalloutPicker
          ? "callout"
          : showCodeLanguagePicker
            ? "code-language"
            : "none";
    }
    setHidden(this.#tablePicker, !showPicker);
    setHidden(this.#calloutPicker, !showCalloutPicker);
    setHidden(this.#codeLanguagePicker, !showCodeLanguagePicker);
    if (showPicker) {
      this.#tablePicker._choose = (rows, cols) => state.choose("table", { tableSize: { rows, cols } });
      this.#updateTablePickerSize(3, 2);
    } else {
      this.#tablePicker._choose = null;
    }
    if (this.#calloutPicker) {
      this.#calloutPicker.setAttribute(
        "aria-label",
        showCalloutPicker ? selectedCommand.title : "",
      );
      this.#calloutPicker._choose = showCalloutPicker
        ? (kind) => state.choose("callout", { calloutKind: kind })
        : null;
    }
    if (this.#codeLanguagePicker) {
      this.#codeLanguagePicker.setAttribute(
        "aria-label",
        showCodeLanguagePicker ? selectedCommand.title : "",
      );
      this.#codeLanguagePicker._choose = showCodeLanguagePicker
        ? (language) => state.choose("code-block", { codeLanguage: language })
        : null;
    }
  }

  #syncSidePanelPlacement(state, editor) {
    if (!this.#root) return;
    const selectedCommand = state.commands[state.selectedIndex];
    const panel = commandMenuSidePanel(selectedCommand);
    const panelSize = commandMenuSidePanelSize(panel);
    if (!panelSize.width) {
      this.#root.dataset.sidePlacement = "right";
      return;
    }

    const selectedItem = commandItemByIndex(this.#root, state.selectedIndex);
    const rootRect = this.#root.getBoundingClientRect?.();
    const itemRect = selectedItem?.getBoundingClientRect?.();
    if (rootRect && itemRect) {
      const top = clamp(
        itemRect.top - rootRect.top - 6,
        4,
        Math.max(4, rootRect.height - panelSize.height - 4),
      );
      if (typeof this.#root.style?.setProperty === "function") {
        this.#root.style.setProperty("--mn-slash-side-panel-top", `${top}px`);
      } else if (this.#root.style) {
        this.#root.style["--mn-slash-side-panel-top"] = `${top}px`;
      }
    }

    const rect = this.#root.getBoundingClientRect?.();
    const viewport = viewportSize(
      editor?.view?.dom,
      defaultWindow(editor?.view?.dom?.ownerDocument),
    );
    const neededWidth = panelSize.width + SIDE_PANEL_GAP + 10;
    const shouldFlip =
      rect &&
      rect.right + neededWidth > viewport.width &&
      rect.left - neededWidth > 10;
    this.#root.dataset.sidePlacement = shouldFlip ? "left" : "right";
  }

  #updateCalloutOptionLabels() {
    this.#calloutPicker
      ?.querySelectorAll?.(".mn-tiptap-callout-kind-option")
      ?.forEach?.((item) => {
        const option = PAPYRO_CALLOUT_KIND_OPTIONS.find(
          (candidate) => candidate.kind === item.dataset?.calloutKind,
        );
        if (!option) return;
        const localizedOption = localizeCalloutKindOption(option, this.#language);
        const title = item.querySelector?.(".mn-tiptap-callout-kind-title");
        const description = item.querySelector?.(".mn-tiptap-callout-kind-description");
        item.setAttribute("aria-label", calloutOptionLabel(this.#language, localizedOption.title));
        if (title) title.textContent = localizedOption.title;
        if (description) description.textContent = localizedOption.description;
      });
  }

  #updateCodeLanguageOptionLabels() {
    this.#codeLanguagePicker
      ?.querySelectorAll?.(".mn-tiptap-code-language-option")
      ?.forEach?.((item) => {
        const option = PAPYRO_CODE_LANGUAGE_OPTIONS.find(
          (candidate) => candidate.id === item.dataset?.languageId,
        );
        if (!option) return;
        const title = codeBlockLanguageUiLabel(this.#language, option.language);
        const titleElement = item.querySelector?.(".mn-tiptap-code-language-option-title");
        item.setAttribute("aria-label", title);
        if (titleElement) titleElement.textContent = title;
      });
  }

  #updateTablePickerSize(rows, cols) {
    if (!this.#tablePicker || !this.#tablePickerLabel) return;
    const label = tableSizeLabel(this.#language, rows, cols);
    this.#tablePicker.setAttribute("aria-label", label);
    if (this.#tablePickerTitle) {
      this.#tablePickerTitle.textContent = insertTableLabel(this.#language, rows, cols);
    }
    this.#tablePickerLabel.textContent = label;
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
  #document = null;
  #externalContains = () => false;
  #openStateListener = () => {};
  #state = {
    open: false,
    query: "",
    range: null,
    commands: [],
    selectedIndex: 0,
    deleteRangeBeforeRun: true,
    cleanupRangeOnClose: false,
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
    this.#document = documentRef;
    this.#view =
      view ??
      new TiptapSlashMenuView({
        document: documentRef,
      });
    this.#dismiss = createFloatingDismissController({
      document: documentRef,
      window: windowRef,
      contains: (target) => this.contains(target) || this.#externalContains(target),
      shouldDismiss: (event) => this.#shouldDismiss(event),
      shouldDismissOnScroll: (event) => this.#shouldDismissOnScroll(event),
      onDismiss: () => this.close(),
      pointerDismissEvent: "pointerup",
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

  setExternalContains(contains) {
    this.#externalContains = typeof contains === "function" ? contains : () => false;
  }

  setOpenStateListener(listener) {
    this.#openStateListener = typeof listener === "function" ? listener : () => {};
  }

  #viewState() {
    return {
      ...this.#state,
      language: entryLanguage(this.#entry),
      choose: (commandId, options) => this.choose(commandId, options),
      activate: (nextIndex, options) => this.setSelection(nextIndex, options),
    };
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
      this.#state.cleanupRangeOnClose &&
      (target == null ||
        target === this.#document?.body ||
        target === this.#editor?.view?.dom ||
        this.#editor?.view?.dom?.contains?.(target))
    );
  }

  shouldKeepOpenOnEditorBlur(activeElement = null) {
    return Boolean(
      this.#state.open &&
        (this.contains(activeElement) ||
          this.#externalContains(activeElement) ||
          activeElement == null ||
          activeElement === this.#document?.body),
    );
  }

  refresh(editor = this.#editor) {
    if (!editor) {
      this.close();
      return this.state;
    }

    const context = textSelectionContext(editor);
    if (!context) {
      if (this.#state.open && this.#state.cleanupRangeOnClose) {
        this.#view.update?.(
          this.#viewState(),
          editor,
        );
        this.#dismiss.open();
        this.#openStateListener(this.state);
        return this.state;
      }
      this.close();
      return this.state;
    }

    const trigger = findSlashTrigger(context.text);
    if (!trigger) {
      if (this.#state.open && this.#state.cleanupRangeOnClose) {
        this.#view.update?.(
          this.#viewState(),
          editor,
        );
        this.#dismiss.open();
        this.#openStateListener(this.state);
        return this.state;
      }
      this.close();
      return this.state;
    }

    if (
      this.#state.open &&
      this.#state.cleanupRangeOnClose &&
      rangeEquals(this.#state.range, triggerRange(context, trigger))
    ) {
      const previousCommandId = this.#state.commands[this.#state.selectedIndex]?.id;
      const commands = this.#commands.query("", {
        limit: this.#maxItems,
        language: entryLanguage(this.#entry),
      });
      const retainedIndex = commands.findIndex((command) => command.id === previousCommandId);
      this.#state = {
        ...this.#state,
        commands,
        selectedIndex:
          retainedIndex >= 0
            ? retainedIndex
            : Math.min(this.#state.selectedIndex, Math.max(0, commands.length - 1)),
        query: "",
      };
      this.#view.update?.(
        this.#viewState(),
        editor,
      );
      this.#dismiss.open();
      this.#openStateListener(this.state);
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
      range: triggerRange(context, trigger),
      commands,
      selectedIndex: nextSelectedIndex < 0 ? 0 : nextSelectedIndex,
      deleteRangeBeforeRun: true,
      cleanupRangeOnClose: false,
      anchorRect: null,
      placement: "bottom",
    };
    this.#view.update?.(
      this.#viewState(),
      editor,
    );
    this.#dismiss.open();
    this.#openStateListener(this.state);
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
      cleanupRangeOnClose: true,
      anchorRect: blockInsertMenuAnchorRect(slashRect, target, anchorRect),
      placement: "bottom",
    };
    this.#view.update?.(
      this.#viewState(),
      this.#editor,
    );
    this.#dismiss.open();
    this.#openStateListener(this.state);
    return this.state;
  }

  moveSelection(delta) {
    if (!this.#state.open || this.#state.commands.length === 0) return this.state;
    const count = this.#state.commands.length;
    const selectedIndex = clamp(this.#state.selectedIndex + delta, 0, count - 1);
    if (selectedIndex === this.#state.selectedIndex) return this.state;
    this.#state = {
      ...this.#state,
      selectedIndex,
    };
    this.#updateViewSelection({ scroll: true });
    return this.state;
  }

  setSelection(index, { scroll = true } = {}) {
    const selectedIndex = Number(index);
    if (
      !this.#state.open ||
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= this.#state.commands.length ||
      selectedIndex === this.#state.selectedIndex
    ) {
      return this.state;
    }

    this.#state = {
      ...this.#state,
      selectedIndex,
    };
    this.#updateViewSelection({ scroll });
    return this.state;
  }

  #updateViewSelection({ scroll = true } = {}) {
    const viewState = this.#viewState();
    if (this.#view.updateSelection?.(viewState, { scroll }, this.#editor) !== true) {
      this.#view.update?.(
        viewState,
        this.#editor,
      );
    }
  }

  choose(commandId = this.#state.commands[this.#state.selectedIndex]?.id, options = {}) {
    if (!this.#state.open || !commandId || !this.#editor) return false;
    const range = this.#state.range;
    const shouldDeleteRange = this.#state.deleteRangeBeforeRun;
    this.close({ cleanupRange: false });

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

    if (event.key === "Home") {
      event.preventDefault();
      this.setSelection(0);
      return true;
    }

    if (event.key === "End") {
      event.preventDefault();
      this.setSelection(this.#state.commands.length - 1);
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

  close({ cleanupRange = true } = {}) {
    if (!this.#state.open) return;
    const range = this.#state.range;
    const shouldCleanupRange =
      cleanupRange &&
      this.#state.cleanupRangeOnClose &&
      this.#state.query === "" &&
      range &&
      typeof this.#editor?.commands?.deleteRange === "function";
    this.#state = {
      open: false,
      query: "",
      range: null,
      commands: [],
      selectedIndex: 0,
      deleteRangeBeforeRun: true,
      cleanupRangeOnClose: false,
      anchorRect: null,
      placement: "bottom",
    };
    this.#view.hide?.();
    this.#dismiss.close();
    if (shouldCleanupRange) {
      this.#editor.commands.deleteRange(range);
    }
    this.#openStateListener(this.state);
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
