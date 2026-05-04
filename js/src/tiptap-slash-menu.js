import { createTiptapSlashCommandController } from "./tiptap-slash-commands.js";

const DEFAULT_MAX_ITEMS = 8;
const DEFAULT_MAX_QUERY_LENGTH = 48;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function defaultDocument() {
  return typeof document === "undefined" ? null : document;
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

function commandElementId(ownerId, index) {
  return `${ownerId}-item-${index}`;
}

function setHidden(element, hidden) {
  if (!element) return;
  element.hidden = hidden;
  element.classList?.toggle?.("hidden", hidden);
}

function createElement(documentRef, tagName, className) {
  const element = documentRef?.createElement?.(tagName) ?? null;
  if (element && className) {
    element.className = className;
  }
  return element;
}

function placeMenu(element, editor, range) {
  const view = editor?.view;
  if (!element || !view || typeof view.coordsAtPos !== "function" || !range) {
    return;
  }

  const rect = view.coordsAtPos(range.to);
  const viewportWidth = view.dom?.ownerDocument?.documentElement?.clientWidth ?? window.innerWidth;
  const viewportHeight =
    view.dom?.ownerDocument?.documentElement?.clientHeight ?? window.innerHeight;
  const width = element.offsetWidth || 320;
  const height = element.offsetHeight || 220;
  const margin = 10;
  const left = clamp(rect.left, margin, Math.max(margin, viewportWidth - width - margin));
  const preferredTop = rect.bottom + 8;
  const top =
    preferredTop + height + margin > viewportHeight
      ? clamp(rect.top - height - 8, margin, viewportHeight - height - margin)
      : clamp(preferredTop, margin, viewportHeight - height - margin);

  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
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

  constructor({ document = defaultDocument(), ownerId = "mn-tiptap-slash-menu" } = {}) {
    this.#document = document;
    this.#ownerId = ownerId;
  }

  mount(container) {
    if (this.#root || !this.#document) return;

    const root = createElement(this.#document, "div", "mn-tiptap-slash-menu hidden");
    const list = createElement(this.#document, "div", "mn-tiptap-slash-menu-list");
    const empty = createElement(this.#document, "div", "mn-tiptap-slash-menu-empty");
    if (!root || !list || !empty) return;

    root.id = this.#ownerId;
    root.role = "listbox";
    root.setAttribute("aria-label", "Markdown block commands");
    empty.textContent = "No commands";
    root.append(list, empty);
    (container?.ownerDocument?.body ?? this.#document.body)?.appendChild(root);

    this.#root = root;
    this.#list = list;
    this.#empty = empty;
    setHidden(root, true);
  }

  update(state, editor) {
    if (!this.#root || !this.#list || !this.#empty || !state.open) return;

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
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        state.choose(command.id);
      });
      this.#list.appendChild(item);
    });

    setHidden(this.#empty, state.commands.length > 0);
    this.#root.setAttribute(
      "aria-activedescendant",
      state.commands.length > 0 ? commandElementId(this.#ownerId, state.selectedIndex) : "",
    );
    setHidden(this.#root, false);
    placeMenu(this.#root, editor, state.range);
  }

  hide() {
    setHidden(this.#root, true);
  }

  destroy() {
    this.#root?.remove?.();
    this.#root = null;
    this.#list = null;
    this.#empty = null;
  }
}

export class TiptapSlashMenuController {
  #commands;
  #maxItems;
  #view;
  #state = {
    open: false,
    query: "",
    range: null,
    commands: [],
    selectedIndex: 0,
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
    this.#view =
      view ??
      new TiptapSlashMenuView({
        document: dom.document ?? defaultDocument(),
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

    const commands = this.#commands.query(trigger.query, { limit: this.#maxItems });
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
    };
    this.#view.update?.(
      {
        ...this.#state,
        choose: (commandId) => this.choose(commandId),
      },
      editor,
    );
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
        choose: (commandId) => this.choose(commandId),
      },
      this.#editor,
    );
    return this.state;
  }

  choose(commandId = this.#state.commands[this.#state.selectedIndex]?.id) {
    if (!this.#state.open || !commandId || !this.#editor) return false;
    const range = this.#state.range;
    this.close();

    if (range && typeof this.#editor.commands?.deleteRange === "function") {
      this.#editor.commands.deleteRange(range);
    }

    const result = this.#commands.run(commandId, {
      editor: this.#editor,
      entry: this.#entry,
      source: "slash_menu",
    });
    return result.ok;
  }

  handleKeyDown(event) {
    if (!this.#state.open) return false;

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
    };
    this.#view.hide?.();
  }

  destroy() {
    this.close();
    this.#view.destroy?.();
    this.#editor = null;
    this.#entry = null;
  }
}

export function createTiptapSlashMenuController(options) {
  return new TiptapSlashMenuController(options);
}
