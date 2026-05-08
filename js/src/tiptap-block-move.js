export function targetEndPos(target) {
  const nodeSize = target?.node?.nodeSize ?? target?.block?.pmViewDesc?.node?.nodeSize ?? 0;
  return Number.isFinite(target?.pos) ? target.pos + Math.max(1, nodeSize) : null;
}

function targetNode(editor, target) {
  const from = target?.pos;
  return target?.node ?? (Number.isFinite(from) ? editor?.state?.doc?.nodeAt?.(from) : null);
}

function resolvedTargetPosition(editor, target) {
  const from = target?.pos;
  const doc = editor?.state?.doc;
  if (!Number.isFinite(from) || typeof doc?.resolve !== "function") {
    return null;
  }

  try {
    return doc.resolve(from);
  } catch (_error) {
    return null;
  }
}

export function blockSiblingDrop(editor, target, direction) {
  const from = target?.pos;
  const node = targetNode(editor, target);
  const resolved = resolvedTargetPosition(editor, target);
  const parent = resolved?.parent;
  const index =
    typeof resolved?.index === "function"
      ? resolved.index(resolved.depth)
      : null;
  const siblingDirection = direction === "up" ? -1 : direction === "down" ? 1 : 0;

  if (
    !Number.isFinite(from) ||
    !node ||
    !parent ||
    !Number.isInteger(index) ||
    siblingDirection === 0
  ) {
    return null;
  }

  const childCount = Number(parent.childCount);
  if (!Number.isFinite(childCount) || childCount <= 1) {
    return null;
  }

  if (siblingDirection < 0) {
    if (index <= 0 || typeof parent.child !== "function") return null;
    const previousNode = parent.child(index - 1);
    const previousSize = Number(previousNode?.nodeSize);
    if (!Number.isFinite(previousSize) || previousSize <= 0) return null;
    const previousPos = from - previousSize;
    return Number.isFinite(previousPos) && previousPos >= 0
      ? { pos: previousPos, placement: "before" }
      : null;
  }

  if (index >= childCount - 1 || typeof parent.child !== "function") return null;
  const currentSize = Math.max(1, Number(node.nodeSize) || 0);
  const nextNode = parent.child(index + 1);
  const nextSize = Number(nextNode?.nodeSize);
  if (!Number.isFinite(nextSize) || nextSize <= 0) return null;
  const nextEndPos = from + currentSize + nextSize;
  return Number.isFinite(nextEndPos) ? { pos: nextEndPos, placement: "after" } : null;
}

export function canMoveTiptapBlock(editor, target, direction) {
  return blockSiblingDrop(editor, target, direction) !== null;
}

export function createTiptapBlockMove(editor, source, drop) {
  const state = editor?.state;
  const doc = state?.doc;
  const from = source?.pos;
  const node = targetNode(editor, source);
  const nodeSize = node?.nodeSize ?? 0;
  const to = Number.isFinite(from) ? from + Math.max(1, nodeSize) : null;
  const dropPos = drop?.pos;

  if (
    !state?.tr ||
    !doc ||
    !node ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    !Number.isFinite(dropPos) ||
    to <= from
  ) {
    return null;
  }

  if (dropPos >= from && dropPos <= to) {
    return null;
  }

  const insertPos = dropPos > to ? dropPos - (to - from) : dropPos;
  if (!Number.isFinite(insertPos) || insertPos < 0) {
    return null;
  }

  try {
    let tr = state.tr.delete(from, to);
    const resolved = tr.doc?.resolve?.(insertPos);
    if (
      node.type &&
      typeof resolved?.parent?.canReplaceWith === "function" &&
      resolved.parent.canReplaceWith(resolved.index(), resolved.index(), node.type) === false
    ) {
      return null;
    }

    tr = tr.insert(insertPos, node);
    tr = typeof tr.scrollIntoView === "function" ? tr.scrollIntoView() : tr;
    return { tr, pos: insertPos };
  } catch (_error) {
    return null;
  }
}

export function moveTiptapBlock(editor, source, drop) {
  const move = createTiptapBlockMove(editor, source, drop);
  if (!move) return false;

  editor?.view?.dispatch?.(move.tr);
  if (typeof editor?.commands?.setNodeSelection === "function") {
    editor.commands.setNodeSelection(move.pos);
  } else {
    editor?.commands?.setTextSelection?.(move.pos);
  }
  editor?.commands?.focus?.();
  return true;
}
