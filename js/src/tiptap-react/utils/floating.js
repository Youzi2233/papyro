import {
  defaultWindow,
  positionFloatingElement,
  viewportSize,
} from "../../tiptap-ui-primitives.js";

export function usableFloatingRect(rect) {
  if (!rect) return false;
  const left = Number(rect.left);
  const top = Number(rect.top);
  const right = Number(rect.right);
  const bottom = Number(rect.bottom);
  if (![left, top, right, bottom].every(Number.isFinite)) return false;
  return Math.abs(left) + Math.abs(top) > 0 || right > left || bottom > top;
}

export function anchorRectFromEditorRange(editor, range) {
  const view = editor?.view;
  if (!view || typeof view.coordsAtPos !== "function" || !range) return null;

  try {
    const rect = view.coordsAtPos(range.to);
    return usableFloatingRect(rect) ? rect : null;
  } catch (_error) {
    return null;
  }
}

export function positionReactFloatingElement({
  element,
  rect,
  reference = null,
  fallbackWindow = null,
  size,
  placement = "bottom",
} = {}) {
  if (!element || !usableFloatingRect(rect)) return false;
  positionFloatingElement(element, rect, {
    viewport: viewportSize(reference, fallbackWindow),
    size,
    placement,
  });
  return true;
}

export function shouldFlipFloatingSidePanel({
  root,
  reference = null,
  panelWidth = 0,
  gap = 6,
  margin = 10,
  fallbackWindow = defaultWindow(reference?.ownerDocument),
} = {}) {
  const rect = root?.getBoundingClientRect?.();
  const width = Number(panelWidth);
  if (!usableFloatingRect(rect) || !Number.isFinite(width) || width <= 0) {
    return false;
  }

  const viewport = viewportSize(reference, fallbackWindow);
  const neededWidth = width + gap + margin;
  return rect.right + neededWidth > viewport.width && rect.left - neededWidth > margin;
}
