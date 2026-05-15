import {
  Table,
  TableKit,
  TableView,
  renderTableToMarkdown,
} from "@tiptap/extension-table";
import { Extension } from "@tiptap/core";
import type {
  Extension as TiptapExtension,
  JSONContent,
  MarkdownRendererHelpers,
} from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import {
  columnResizingPluginKey,
  deleteCellSelection,
  selectedRect,
  type TableMap,
  type TableRect,
} from "@tiptap/pm/tables";
import { TableHandleExtension } from "./components/tiptap-node/table-node/extensions/table-handle/index.ts";

export { TableKit };

type TableCellResetAttribute = "align" | "backgroundColor";
type TableCellAlign = "left" | "center" | "right";
type AttributeValue = string | number | boolean | readonly number[] | null | undefined;
type HtmlAttributes = Record<string, AttributeValue>;
type ClipboardTextWriter = (text: string) => Promise<unknown> | unknown;

interface PapyroTableJSONNode extends JSONContent {
  type?: string;
  attrs?: {
    align?: string | null;
    backgroundColor?: string | null;
    colspan?: number | null;
    rowspan?: number | null;
    colwidth?: readonly number[] | null;
    [key: string]: unknown;
  };
  content?: PapyroTableJSONNode[];
}

interface TableSelectionLike {
  forEachCell?: (
    callback: (node: ProseMirrorNode, pos: number) => void,
  ) => void;
}

interface TextStyleMarkType {
  create: (attrs?: Record<string, unknown>) => unknown;
}

interface TableCellContentActionOptions {
  resetAttrs?: boolean;
}

interface PapyroTableCellContentActionsOptions {
  writeText: ClipboardTextWriter | null;
}

export interface PapyroTableExtensionOptions {
  writeText?: ClipboardTextWriter | null;
}

export const PAPYRO_TABLE_CELL_RESET_ATTRS = Object.freeze([
  "align",
  "backgroundColor",
] as const satisfies readonly TableCellResetAttribute[]);

function escapeHtmlAttribute(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeCellAlign(value: unknown): TableCellAlign | null {
  const align = String(value ?? "").trim().toLowerCase();
  return align === "left" || align === "center" || align === "right"
    ? align
    : null;
}

function tableCellNodes(rowNode: PapyroTableJSONNode): PapyroTableJSONNode[] {
  return Array.isArray(rowNode?.content) ? rowNode.content : [];
}

function isDefaultSpan(value: unknown): boolean {
  return value === null || value === undefined || value === 1;
}

function hasColumnWidth(cellNode: PapyroTableJSONNode): boolean {
  return Array.isArray(cellNode?.attrs?.colwidth) &&
    cellNode.attrs.colwidth.some((width) => Number.isFinite(Number(width)));
}

function tableNeedsHtmlMarkdown(node: PapyroTableJSONNode): boolean {
  const rows = Array.isArray(node?.content) ? node.content : [];
  if (rows.length === 0) return false;

  const firstRowCells = tableCellNodes(rows[0]);
  const firstRowIsHeader = firstRowCells.length > 0 &&
    firstRowCells.every((cell) => cell?.type === "tableHeader");
  if (!firstRowIsHeader) return true;

  const columnAlignments: Array<TableCellAlign | null | undefined> = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const cells = tableCellNodes(rows[rowIndex]);
    for (let columnIndex = 0; columnIndex < cells.length; columnIndex += 1) {
      const cell = cells[columnIndex];
      const attrs = cell?.attrs ?? {};
      const isHeader = cell?.type === "tableHeader";

      if (rowIndex > 0 && isHeader) return true;
      if (!isDefaultSpan(attrs.colspan) || !isDefaultSpan(attrs.rowspan)) return true;
      if (hasColumnWidth(cell)) return true;
      if (attrs.backgroundColor) return true;

      const align = normalizeCellAlign(attrs.align);
      if (columnAlignments[columnIndex] === undefined) {
        columnAlignments[columnIndex] = align;
      } else if (columnAlignments[columnIndex] !== align) {
        return true;
      }
    }
  }

  return false;
}

function htmlAttributes(attributes: HtmlAttributes): string {
  const rendered = Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([name, value]) => `${name}="${escapeHtmlAttribute(value)}"`);
  return rendered.length > 0 ? ` ${rendered.join(" ")}` : "";
}

function renderHtmlTableCell(
  cellNode: PapyroTableJSONNode,
  helpers: MarkdownRendererHelpers,
): string {
  const attrs = cellNode?.attrs ?? {};
  const tag = cellNode?.type === "tableHeader" ? "th" : "td";
  const style: string[] = [];
  const align = normalizeCellAlign(attrs.align);
  const backgroundColor = attrs.backgroundColor ?? null;
  const htmlAttrs: HtmlAttributes = {};

  if (align) style.push(`text-align: ${align}`);
  if (backgroundColor) {
    style.push(`background-color: ${backgroundColor}`);
    htmlAttrs["data-cell-background"] = backgroundColor;
  }
  if (!isDefaultSpan(attrs.colspan)) htmlAttrs.colspan = attrs.colspan;
  if (!isDefaultSpan(attrs.rowspan)) htmlAttrs.rowspan = attrs.rowspan;
  if (hasColumnWidth(cellNode)) htmlAttrs.colwidth = attrs.colwidth.join(",");
  if (style.length > 0) htmlAttrs.style = style.join("; ");

  const content = Array.isArray(cellNode.content)
    ? helpers.renderChildren(cellNode.content, "<br>")
    : "";
  return `<${tag}${htmlAttributes(htmlAttrs)}>${content}</${tag}>`;
}

function renderHtmlTableMarkdown(
  node: PapyroTableJSONNode,
  helpers: MarkdownRendererHelpers,
): string {
  const rows = Array.isArray(node?.content) ? node.content : [];
  const body = rows
    .map((rowNode) =>
      `<tr>${tableCellNodes(rowNode)
        .map((cellNode) => renderHtmlTableCell(cellNode, helpers))
        .join("")}</tr>`,
    )
    .join("");
  return `<table><tbody>${body}</tbody></table>`;
}

function parseCellBackgroundColor(element: HTMLElement): string | null {
  return (
    element.getAttribute("data-cell-background") ||
    element.style.backgroundColor ||
    null
  );
}

function renderCellBackgroundColor(attributes: {
  backgroundColor?: string | null;
}): Record<string, string> {
  if (!attributes.backgroundColor) return {};
  return {
    "data-cell-background": attributes.backgroundColor,
    style: `background-color: ${attributes.backgroundColor}`,
  };
}

function createPapyroCellAttributes() {
  return {
    backgroundColor: {
      default: null,
      parseHTML: parseCellBackgroundColor,
      renderHTML: renderCellBackgroundColor,
    },
  };
}

function resetTableCellAttrs(
  attrs: ProseMirrorNode["attrs"] | null | undefined,
  names: readonly TableCellResetAttribute[] = PAPYRO_TABLE_CELL_RESET_ATTRS,
): ProseMirrorNode["attrs"] | null {
  const nextAttrs = { ...(attrs ?? {}) };
  let changed = false;

  names.forEach((name) => {
    if (nextAttrs[name] !== null && nextAttrs[name] !== undefined) {
      nextAttrs[name] = null;
      changed = true;
    }
  });

  return changed ? nextAttrs : null;
}

function isTextNode(node: ProseMirrorNode | null | undefined): boolean {
  const nodeType = node?.type as ProseMirrorNode["type"] | string | undefined;
  return node?.isText === true ||
    (typeof nodeType === "string" ? nodeType === "text" : nodeType?.name === "text");
}

function clipboardApi(): Clipboard | null {
  if (typeof globalThis === "undefined") return null;
  return globalThis.navigator?.clipboard ?? null;
}

function tableCellClipboardText(cell: ProseMirrorNode | null | undefined): string {
  if (!cell) return "";
  const text =
    typeof cell.textBetween === "function"
      ? cell.textBetween(0, cell.content?.size ?? cell.nodeSize ?? 0, "\n", "\n")
      : cell.textContent ?? "";
  return String(text ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function currentSelectedTableRect(state: EditorState): TableRect | null {
  try {
    return selectedRect(state);
  } catch (_error) {
    return null;
  }
}

function selectedTableCellTextRanges(selection: TableSelectionLike) {
  if (typeof selection?.forEachCell !== "function") return [];

  const ranges: Array<{ from: number; to: number }> = [];
  selection.forEachCell((cell, cellPos) => {
    if (!cell || !Number.isFinite(cellPos)) return;
    if (isTextNode(cell)) {
      ranges.push({ from: cellPos, to: cellPos + Math.max(0, cell.nodeSize ?? 0) });
      return;
    }

    cell.descendants?.((node: ProseMirrorNode, offset: number) => {
      if (!isTextNode(node)) return true;

      const from = cellPos + 1 + offset;
      const to = from + Math.max(0, node.nodeSize ?? node.text?.length ?? 0);
      if (to > from) {
        ranges.push({ from, to });
      }
      return false;
    });
  });

  return ranges;
}

export function selectedTableCellsPlainText(state: EditorState): string {
  const rect = currentSelectedTableRect(state);

  const table = rect?.table;
  const map: TableMap | undefined = rect?.map;
  if (!table || !map || !Number.isInteger(map.width) || map.width <= 0) {
    return "";
  }

  const used = new Set<number>();
  const rows: string[] = [];
  for (let row = rect.top; row < rect.bottom; row += 1) {
    const cells: string[] = [];
    for (let column = rect.left; column < rect.right; column += 1) {
      const relativePos = map.map[row * map.width + column];
      if (!Number.isFinite(relativePos) || used.has(relativePos)) {
        cells.push("");
        continue;
      }

      let cellRect = null;
      try {
        cellRect = map.findCell(relativePos);
      } catch (_error) {
        cells.push("");
        continue;
      }

      if (cellRect.top !== row || cellRect.left !== column) {
        cells.push("");
        continue;
      }

      used.add(relativePos);
      cells.push(tableCellClipboardText(table.nodeAt(relativePos)));
    }
    rows.push(cells.join("\t"));
  }

  return rows.join("\n");
}

export async function writeTableTextToClipboard(
  text: unknown,
  writeText: ClipboardTextWriter | null = null,
): Promise<boolean> {
  const value = String(text ?? "");
  if (!value) return false;
  const clipboard = clipboardApi();
  const writer =
    typeof writeText === "function" ? writeText : clipboard?.writeText?.bind?.(clipboard);
  if (typeof writer !== "function") return false;
  await writer(value);
  return true;
}

export function resetSelectedTableCellAttrs(
  selection: TableSelectionLike | null | undefined,
  tr: Transaction | null | undefined,
  names: readonly TableCellResetAttribute[] = PAPYRO_TABLE_CELL_RESET_ATTRS,
): boolean {
  if (typeof selection?.forEachCell !== "function" || !tr) return false;

  let changed = false;
  selection.forEachCell((node, pos) => {
    const nextAttrs = resetTableCellAttrs(node?.attrs, names);
    if (!nextAttrs) return;
    const mappedPos = typeof tr.mapping?.map === "function" ? tr.mapping.map(pos) : pos;
    tr.setNodeMarkup(mappedPos, null, nextAttrs);
    changed = true;
  });
  return changed;
}

export function setSelectedTableCellTextColor(
  selection: TableSelectionLike | null | undefined,
  tr: Transaction | null | undefined,
  markType: TextStyleMarkType | null | undefined,
  color: string | null = null,
): boolean {
  if (typeof selection?.forEachCell !== "function" || !tr || !markType) return false;

  const ranges = selectedTableCellTextRanges(selection);
  ranges.forEach(({ from, to }) => {
    tr.removeMark(from, to, markType);
    if (color) {
      tr.addMark(from, to, markType.create({ color }));
    }
  });

  return ranges.length > 0;
}

export const PapyroTableCellBackground = Extension.create({
  name: "papyroTableCellBackground",

  addGlobalAttributes() {
    return [
      {
        types: ["tableCell", "tableHeader"],
        attributes: createPapyroCellAttributes(),
      },
    ];
  },
});

export const PapyroTableCellContentActions = Extension.create({
  name: "papyroTableCellContentActions",

  addOptions() {
    return {
      writeText: null,
    } satisfies PapyroTableCellContentActionsOptions;
  },

  addCommands() {
    return {
      clearSelectedTableCells:
        (options: TableCellContentActionOptions = {}) =>
        ({ state, dispatch }) => {
          const resetAttrs = Boolean(options?.resetAttrs);
          if (!resetAttrs) return deleteCellSelection(state, dispatch);
          if (!deleteCellSelection(state)) return false;
          if (!dispatch) return true;

          let clearTransaction = null;
          deleteCellSelection(state, (tr) => {
            clearTransaction = tr;
          });
          const tr = clearTransaction ?? state.tr;
          resetSelectedTableCellAttrs(state.selection, tr);
          if (tr.docChanged) dispatch(tr);
          return true;
        },
      resetSelectedTableCellAttrs:
        () =>
        ({ state, dispatch }) => {
          if (typeof state?.selection?.forEachCell !== "function") return false;
          if (!dispatch) return true;

          const markType = state.schema?.marks?.textStyle ?? null;
          const tr = state.tr;
          resetSelectedTableCellAttrs(state.selection, tr);
          setSelectedTableCellTextColor(state.selection, tr, markType, null);
          if (tr.docChanged) dispatch(tr);
          return true;
        },
      setSelectedTableCellTextColor:
        (color: string | null = null) =>
        ({ state, dispatch }) => {
          if (typeof state?.selection?.forEachCell !== "function") return false;
          const markType = state.schema?.marks?.textStyle as TextStyleMarkType | undefined;
          if (!markType) return false;
          if (dispatch) {
            const tr = state.tr;
            setSelectedTableCellTextColor(state.selection, tr, markType, color);
            if (tr.docChanged) dispatch(tr);
          }
          return true;
        },
      copySelectedTableCells:
        () =>
        ({ state, dispatch }) => {
          const text = selectedTableCellsPlainText(state);
          if (!text) return false;
          if (!dispatch) return true;
          writeTableTextToClipboard(text, this.options.writeText).catch(() => {});
          return true;
        },
    };
  },
});

const papyroTableResizeEdgeBridgeKey = new PluginKey("papyroTableResizeEdgeBridge");

function domTableCellAround(target: EventTarget | null): HTMLTableCellElement | null {
  let element = target instanceof Element ? target : null;
  while (element && element.nodeName !== "TD" && element.nodeName !== "TH") {
    if (element.classList?.contains("ProseMirror")) return null;
    element = element.parentElement;
  }
  return element instanceof HTMLTableCellElement ? element : null;
}

function getEdgeCellPosition(
  view: Parameters<NonNullable<Plugin["props"]["handleDOMEvents"]>["mousemove"]>[0],
  event: MouseEvent,
  handleWidth: number,
): number | null {
  const targetCell = domTableCellAround(event.target);
  if (!targetCell) return null;

  const rect = targetCell.getBoundingClientRect();
  const isNearLeft = event.clientX - rect.left <= handleWidth;
  const isNearRight = rect.right - event.clientX <= handleWidth;

  if (!isNearLeft && !isNearRight) return -1;

  const edgeCell = isNearLeft
    ? targetCell.previousElementSibling
    : targetCell;
  if (!(edgeCell instanceof HTMLTableCellElement)) return -1;

  try {
    const domPos = view.posAtDOM(edgeCell, 0);
    const $pos = view.state.doc.resolve(domPos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth);
      if (node.type.spec.tableRole === "cell" || node.type.spec.tableRole === "header_cell") {
        return $pos.before(depth);
      }
    }
    return -1;
  } catch (_error) {
    return -1;
  }
}

export const PapyroTableResizeEdgeBridge = Extension.create({
  name: "papyroTableResizeEdgeBridge",

  addProseMirrorPlugins() {
    const handleWidth = 8;

    return [
      new Plugin({
        key: papyroTableResizeEdgeBridgeKey,
        props: {
          handleDOMEvents: {
            mousemove: (view, event) => {
              if (!view.editable) return false;

              const pluginState = columnResizingPluginKey.getState(view.state);
              if (!pluginState || pluginState.dragging) return false;

              const cellPos = getEdgeCellPosition(view, event, handleWidth);
              if (cellPos == null) return false;

              if (cellPos !== pluginState.activeHandle) {
                view.dispatch(
                  view.state.tr.setMeta(columnResizingPluginKey, {
                    setHandle: cellPos,
                  }),
                );
              }

              return false;
            },
          },
        },
      }),
    ];
  },
});

export const PapyroTable = Table.extend({
  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) => {
    const tableNode = node as PapyroTableJSONNode;
    return tableNeedsHtmlMarkdown(tableNode)
      ? renderHtmlTableMarkdown(tableNode, helpers)
      : renderTableToMarkdown(tableNode, helpers);
  },
});

class PapyroTableView extends TableView {
  constructor(node: ProseMirrorNode, cellMinWidth: number) {
    super(node, cellMinWidth);
    this.#mountOfficialTableContainers();
  }

  update(node: ProseMirrorNode): boolean {
    const updated = super.update(node);
    if (updated) {
      this.#mountOfficialTableContainers();
    }
    return updated;
  }

  #mountOfficialTableContainers(): void {
    this.dom.dataset.contentType = "table";
    if (!this.dom.querySelector?.(":scope > .table-controls")) {
      const controls = document.createElement("div");
      controls.className = "table-controls";
      this.dom.appendChild(controls);
    }
    if (!this.dom.querySelector?.(":scope > .table-selection-overlay-container")) {
      const overlay = document.createElement("div");
      overlay.className = "table-selection-overlay-container";
      this.dom.appendChild(overlay);
    }
  }
}

export function createPapyroTableExtensions({
  writeText = null,
}: PapyroTableExtensionOptions = {}): TiptapExtension[] {
  return [
    PapyroTableResizeEdgeBridge,
    PapyroTable.configure({
      resizable: true,
      handleWidth: 6,
      cellMinWidth: 96,
      lastColumnResizable: true,
      allowTableNodeSelection: false,
      View: PapyroTableView,
    }),
    TableKit.configure({
      table: false,
    }),
    TableHandleExtension,
    PapyroTableCellBackground,
    PapyroTableCellContentActions.configure({ writeText }),
  ];
}
