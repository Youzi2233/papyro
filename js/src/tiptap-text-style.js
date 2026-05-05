import { Highlight } from "@tiptap/extension-highlight";
import { Color, TextStyle } from "@tiptap/extension-text-style";

export const PAPYRO_TEXT_COLOR_OPTIONS = Object.freeze([
  Object.freeze({
    id: "ink",
    title: "Default text",
    description: "Use the current editor text color",
    color: null,
  }),
  Object.freeze({
    id: "muted",
    title: "Muted text",
    description: "De-emphasize supporting content",
    color: "var(--mn-ink-3)",
  }),
  Object.freeze({
    id: "accent",
    title: "Accent text",
    description: "Draw attention without changing structure",
    color: "var(--mn-accent)",
  }),
  Object.freeze({
    id: "danger",
    title: "Danger text",
    description: "Mark risk, warning, or destructive content",
    color: "var(--mn-danger)",
  }),
]);

export const PAPYRO_HIGHLIGHT_OPTIONS = Object.freeze([
  Object.freeze({
    id: "clear",
    title: "Clear highlight",
    description: "Remove highlight from this block",
    color: null,
  }),
  Object.freeze({
    id: "yellow",
    title: "Yellow highlight",
    description: "Soft review marker",
    color: "rgba(245, 158, 11, 0.2)",
  }),
  Object.freeze({
    id: "blue",
    title: "Blue highlight",
    description: "Reference or information marker",
    color: "rgba(59, 130, 246, 0.18)",
  }),
  Object.freeze({
    id: "green",
    title: "Green highlight",
    description: "Accepted or positive marker",
    color: "rgba(16, 185, 129, 0.18)",
  }),
]);

function isTextNode(node) {
  return node?.isText === true || node?.type?.name === "text" || node?.type === "text";
}

function isTextblockNode(node) {
  return node?.isTextblock === true || node?.type?.spec?.content === "inline*" || false;
}

export function blockTextRanges(editor, target) {
  const doc = editor?.state?.doc;
  const from = Number(target?.pos);
  const node = target?.node ?? (Number.isFinite(from) ? doc?.nodeAt?.(from) : null);
  const nodeSize = node?.nodeSize ?? 0;
  const to = Number.isFinite(from) ? from + Math.max(1, nodeSize) : null;
  if (!doc || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return [];
  }

  const ranges = [];
  const addRange = (rangeFrom, rangeTo) => {
    if (Number.isFinite(rangeFrom) && Number.isFinite(rangeTo) && rangeTo > rangeFrom) {
      ranges.push({ from: rangeFrom, to: rangeTo });
    }
  };

  if (isTextNode(node)) {
    addRange(from, to);
    return ranges;
  }

  doc.nodesBetween(from, to, (child, pos) => {
    if (isTextNode(child)) {
      addRange(pos, pos + Math.max(0, child.nodeSize ?? child.text?.length ?? 0));
      return false;
    }

    if (isTextblockNode(child) && child.content?.size === 0) {
      addRange(pos + 1, pos + 1);
      return false;
    }

    return true;
  });

  return ranges;
}

export function applyMarkToBlockText(editor, target, markName, attrs = null) {
  const state = editor?.state;
  const ranges = blockTextRanges(editor, target);
  const markType = state?.schema?.marks?.[markName];
  if (!state?.tr || !markType || ranges.length === 0) return false;

  let tr = state.tr;
  ranges.forEach(({ from, to }) => {
    tr = attrs ? tr.addMark(from, to, markType.create(attrs)) : tr.removeMark(from, to, markType);
  });
  editor?.view?.dispatch?.(tr);
  editor?.commands?.focus?.();
  return true;
}

function styleDeclaration(attrs = {}) {
  const declarations = [];
  if (attrs.color) declarations.push(`color: ${attrs.color}`);
  if (attrs.backgroundColor) declarations.push(`background-color: ${attrs.backgroundColor}`);
  return declarations.join("; ");
}

export const PapyroTextStyle = TextStyle.extend({
  renderMarkdown: (node, helpers) => {
    const style = styleDeclaration(node.attrs);
    const content = helpers.renderChildren(node);
    return style ? `<span style="${style}">${content}</span>` : content;
  },
});

export function createPapyroTextStyleExtensions() {
  return [
    PapyroTextStyle,
    Color.configure({ types: ["textStyle"] }),
    Highlight.configure({ multicolor: true }),
  ];
}
