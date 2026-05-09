export function createTableHarness(commandOverrides = {}) {
  const calls = [];
  const cells = [];
  const rows = Array.from({ length: 2 }, (_, rowIndex) => {
    const rowCells = Array.from({ length: 3 }, (_, columnIndex) => {
      const cell = {
        nodeType: 1,
        tagName: "TD",
        rowIndex,
        columnIndex,
        parentElement: null,
        attributes: new Map(),
        classes: new Set(),
        style: {},
        classList: {
          add(name) {
            cell.classes.add(name);
          },
          remove(name) {
            cell.classes.delete(name);
          },
          toggle(name, enabled) {
            if (enabled) {
              cell.classes.add(name);
            } else {
              cell.classes.delete(name);
            }
          },
          contains(name) {
            return cell.classes.has(name);
          },
        },
        closest(selector) {
          return selector.includes(".mn-tiptap-table") || selector.includes(", table")
            ? table
            : null;
        },
        getAttribute(name) {
          return this.attributes.get(name) ?? null;
        },
        setAttribute(name, value) {
          this.attributes.set(name, value);
        },
        getBoundingClientRect: () => ({
          left: 120 + columnIndex * 80,
          top: 90 + rowIndex * 34,
          width: 80,
          height: 34,
          right: 200 + columnIndex * 80,
          bottom: 124 + rowIndex * 34,
        }),
        contains(target) {
          let current = target;
          while (current) {
            if (current === cell) return true;
            current = current.parentElement ?? current.parentNode ?? null;
          }
          return false;
        },
      };
      cells.push(cell);
      return cell;
    });
    return {
      cells: rowCells,
      getBoundingClientRect: () => ({
        left: 120,
        top: 90 + rowIndex * 34,
        width: 240,
        height: 34,
        right: 360,
        bottom: 124 + rowIndex * 34,
      }),
      querySelectorAll(selector) {
        return selector === "th,td" ? rowCells : [];
      },
    };
  });
  const table = {
    className: "mn-tiptap-table",
    contains(target) {
      if (target === table || cells.includes(target)) return true;
      return cells.some((tableCell) => tableCell.contains?.(target));
    },
    getBoundingClientRect: () => ({ left: 120, top: 90, right: 360, bottom: 158 }),
    querySelectorAll(selector) {
      if (selector === "tr") return rows;
      if (selector === ".mn-tiptap-table-cell-selected") {
        return cells.filter((cell) => cell.classes.has("mn-tiptap-table-cell-selected"));
      }
      if (selector === ".mn-tiptap-table-cell-active") {
        return cells.filter((cell) => cell.classes.has("mn-tiptap-table-cell-active"));
      }
      return [];
    },
    ownerDocument: {
      documentElement: {
        clientWidth: 1000,
        clientHeight: 800,
      },
    },
  };
  rows.forEach((row) =>
    row.cells.forEach((cell) => {
      cell.parentElement = row;
    }),
  );
  const cell = cells[0];
  const root = {
    contains: (target) => target === table || cells.includes(target),
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (this.listeners.get(type) === listener) {
        this.listeners.delete(type);
      }
    },
  };
  const editor = {
    state: {
      selection: {
        from: 4,
      },
      doc: {
        resolve(pos) {
          const cellIndex = pos - 100;
          const cellPos = cellIndex + 10;
          return {
            depth: 2,
            node(depth) {
              return depth === 1
                ? { type: { name: "tableCell" } }
                : { type: { name: "paragraph" } };
            },
            before(depth) {
              return depth === 1 ? cellPos : pos;
            },
          };
        },
        nodeAt(pos) {
          return pos >= 10 && pos < 16 && Number.isInteger(pos) && pos - 10 < cells.length
            ? { type: { name: "tableCell" } }
            : { type: { name: "paragraph" } };
        },
      },
    },
    view: {
      dom: root,
      get state() {
        return editor.state;
      },
      domAtPos() {
        return { node: cell };
      },
      posAtDOM(target) {
        return cells.indexOf(target) + 100;
      },
    },
    commands: {
      focus: () => calls.push(["focus"]),
      setCellSelection(selection) {
        calls.push(["setCellSelection", selection.anchorCell, selection.headCell]);
        const positionedCells = cells.map((item, index) => ({ cell: item, pos: index + 10 }));
        const anchor = positionedCells.find((item) => item.pos === selection.anchorCell);
        const head = positionedCells.find((item) => item.pos === selection.headCell);
        const minRow = Math.min(anchor?.cell?.rowIndex ?? 0, head?.cell?.rowIndex ?? 0);
        const maxRow = Math.max(anchor?.cell?.rowIndex ?? 0, head?.cell?.rowIndex ?? 0);
        const minColumn = Math.min(anchor?.cell?.columnIndex ?? 0, head?.cell?.columnIndex ?? 0);
        const maxColumn = Math.max(anchor?.cell?.columnIndex ?? 0, head?.cell?.columnIndex ?? 0);
        editor.state.selection = {
          from: 4,
          $anchorCell: { pos: selection.anchorCell },
          $headCell: { pos: selection.headCell },
          forEachCell(callback) {
            positionedCells
              .filter((item) =>
                item.cell.rowIndex >= minRow &&
                item.cell.rowIndex <= maxRow &&
                item.cell.columnIndex >= minColumn &&
                item.cell.columnIndex <= maxColumn,
              )
              .forEach((item) => callback(item.cell, item.pos));
          },
        };
        return true;
      },
      ...commandOverrides,
    },
  };

  return { calls, cells, editor, table };
}

export function toolbarCommandIds(created) {
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const walk = (element) => [
    ...(element?.dataset?.commandId ? [element.dataset.commandId] : []),
    ...(element?.children ?? []).flatMap(walk),
  ];
  return walk(root).filter(Boolean);
}

export function toolbarCommandButton(created, commandId) {
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const find = (element) => {
    if (element?.dataset?.commandId === commandId) return element;
    for (const child of element?.children ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  return find(root);
}

export function toolbarCommandCopy(element) {
  const copy =
    (element?.children ?? []).find((child) =>
      String(child?.className ?? "").includes("mn-tiptap-table-toolbar-button-copy"),
    ) ?? element?.children?.[1] ?? null;
  const title =
    (copy?.children ?? []).find((child) =>
      String(child?.className ?? "").includes("mn-tiptap-table-toolbar-button-label"),
    )?.textContent ?? copy?.textContent ?? "";
  const description =
    (copy?.children ?? []).find((child) =>
      String(child?.className ?? "").includes("mn-tiptap-table-toolbar-button-description"),
    )?.textContent ?? "";
  return { copy, title, description };
}

export function latestAxisHandle(created, axis, index = null) {
  return [...created].reverse().find((element) =>
    String(element.className).includes(`mn-tiptap-table-axis-handle ${axis}`) &&
    (index == null || element.dataset.index === String(index)) &&
    !element.removed,
  );
}

export function tableToolbarList(created) {
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const find = (element) => {
    if (String(element?.className ?? "").includes("mn-tiptap-table-toolbar-list")) {
      return element;
    }
    for (const child of element?.children ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  return find(root);
}

export function tableToolbarHeader(created) {
  const root = created.find((element) =>
    String(element.className).includes("mn-tiptap-table-toolbar"),
  );
  const find = (element, className) => {
    if (String(element?.className ?? "").includes(className)) return element;
    for (const child of element?.children ?? []) {
      const found = find(child, className);
      if (found) return found;
    }
    return null;
  };
  return {
    root,
    header: find(root, "mn-tiptap-table-toolbar-header"),
    eyebrow: find(root, "mn-tiptap-table-toolbar-eyebrow"),
    title: find(root, "mn-tiptap-table-toolbar-title"),
    subtitle: find(root, "mn-tiptap-table-toolbar-subtitle"),
  };
}

export function commandSpy(calls, name, result = true) {
  return () => {
    calls.push([name]);
    return result;
  };
}

export function createViewSpy() {
  const calls = [];
  let containedTarget = null;
  return {
    calls,
    mount(root) {
      calls.push(["mount", root?.className ?? ""]);
    },
    update(state) {
      calls.push(["update", state.commands.map((command) => [command.group, command.id])]);
      this.run = state.run;
    },
    hide() {
      calls.push(["hide"]);
    },
    destroy() {
      calls.push(["destroy"]);
    },
    contains(target) {
      return target === containedTarget;
    },
    setContainedTarget(target) {
      containedTarget = target;
    },
  };
}

export function createDocument() {
  const created = [];
  const listeners = new Map();
  const documentRef = {
    activeElement: null,
    listeners,
    createElement(tagName) {
      const element = {
        tagName,
        children: [],
        className: "",
        dataset: {},
        hidden: false,
        style: {
          properties: new Map(),
          setProperty(name, value) {
            this.properties.set(name, value);
          },
        },
        classList: {
          add(name) {
            element.className = `${element.className} ${name}`.trim();
          },
          remove(name) {
            element.className = String(element.className)
              .split(/\s+/)
              .filter((item) => item && item !== name)
              .join(" ");
          },
          toggle(name, enabled) {
            element.hidden = enabled && name === "hidden";
            if (enabled) {
              this.add(name);
            } else {
              this.remove(name);
            }
          },
        },
        appendChild(child) {
          this.children.push(child);
        },
        append(...children) {
          this.children.push(...children);
        },
        replaceChildren(...children) {
          this.children = children;
        },
        setAttribute(name, value) {
          this[name] = value;
        },
        getAttribute(name) {
          return this[name] ?? null;
        },
        removeAttribute(name) {
          delete this[name];
        },
        addEventListener(name, handler) {
          this[`on${name}`] = handler;
        },
        contains(target) {
          return target === this || this.children.some((child) => child.contains?.(target));
        },
        focus() {
          documentRef.activeElement = this;
          this.focused = true;
        },
        remove() {
          this.removed = true;
        },
      };
      created.push(element);
      return element;
    },
    body: {
      children: [],
      appendChild(child) {
        this.children.push(child);
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    },
  };

  return { created, documentRef };
}

export function createDismissDocument() {
  const listeners = new Map();
  return {
    body: {
      appendChild() {},
    },
    documentElement: {
      clientWidth: 1000,
      clientHeight: 800,
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    emit(type, event = {}) {
      listeners.get(type)?.(event);
    },
  };
}
