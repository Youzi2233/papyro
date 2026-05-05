export const DEFAULT_FLOATING_MARGIN = 10;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function defaultDocument() {
  return typeof document === "undefined" ? null : document;
}

export function defaultWindow(documentRef) {
  return documentRef?.defaultView ?? (typeof window === "undefined" ? null : window);
}

export function createElement(documentRef, tagName, className) {
  const element = documentRef?.createElement?.(tagName) ?? null;
  if (element && className) {
    element.className = className;
  }
  return element;
}

export function mountFloatingRoot(root, container, documentRef = defaultDocument()) {
  if (!root) return;
  (container?.ownerDocument?.body ?? documentRef?.body)?.appendChild(root);
}

export function createFloatingDismissController({
  document: documentRef = defaultDocument(),
  window: windowRef = defaultWindow(documentRef),
  contains = () => false,
  onDismiss = () => {},
} = {}) {
  let removeListeners = [];

  const close = () => {
    removeListeners.forEach((remove) => remove());
    removeListeners = [];
  };

  const dismissIfOutside = (event) => {
    if (contains(event?.target)) return;
    onDismiss(event);
  };

  return {
    open() {
      close();
      if (!documentRef?.addEventListener) return;

      documentRef.addEventListener("pointerdown", dismissIfOutside, true);
      documentRef.addEventListener("scroll", dismissIfOutside, true);
      windowRef?.addEventListener?.("resize", dismissIfOutside);
      removeListeners = [
        () => documentRef.removeEventListener?.("pointerdown", dismissIfOutside, true),
        () => documentRef.removeEventListener?.("scroll", dismissIfOutside, true),
        () => windowRef?.removeEventListener?.("resize", dismissIfOutside),
      ];
    },
    close,
  };
}

export function setHidden(element, hidden) {
  if (!element) return;
  element.hidden = hidden;
  element.classList?.toggle?.("hidden", hidden);
}

export function commandElementId(ownerId, index) {
  return `${ownerId}-item-${index}`;
}

export function isComposingKeyboardEvent(event) {
  return Boolean(
    event?.isComposing ||
      event?.nativeEvent?.isComposing ||
      event?.keyCode === 229 ||
      event?.which === 229 ||
      event?.key === "Process",
  );
}

export function viewportSize(reference, fallbackWindow) {
  const documentElement =
    reference?.ownerDocument?.documentElement ?? reference?.dom?.ownerDocument?.documentElement;
  return {
    width: documentElement?.clientWidth ?? fallbackWindow?.innerWidth ?? 1024,
    height: documentElement?.clientHeight ?? fallbackWindow?.innerHeight ?? 768,
  };
}

export function positionFloatingElement(element, rect, { viewport, size, placement = "bottom" }) {
  if (!element || !rect || !viewport) return;

  const margin = size?.margin ?? DEFAULT_FLOATING_MARGIN;
  const width = element.offsetWidth || size?.width || 240;
  const height = element.offsetHeight || size?.height || 160;
  const anchorWidth = Math.max(0, (rect.right ?? rect.left) - rect.left);
  const center = rect.left + anchorWidth / 2;

  let left = center - width / 2;
  let top = rect.bottom + 8;

  if (placement === "top") {
    const preferredTop = rect.top - height - 8;
    top =
      preferredTop < margin
        ? clamp(rect.bottom + 8, margin, viewport.height - height - margin)
        : clamp(preferredTop, margin, viewport.height - height - margin);
  } else if (placement === "left") {
    const preferredLeft = rect.left - width - 12;
    const fallbackLeft = rect.left + 12;
    left =
      preferredLeft < margin
        ? clamp(fallbackLeft, margin, viewport.width - width - margin)
        : clamp(preferredLeft, margin, viewport.width - width - margin);
    top = clamp(rect.top, margin, Math.max(margin, viewport.height - height - margin));
  } else {
    const preferredTop = rect.bottom + 8;
    top =
      preferredTop + height + margin > viewport.height
        ? clamp(rect.top - height - 8, margin, viewport.height - height - margin)
        : clamp(preferredTop, margin, viewport.height - height - margin);
  }

  if (placement !== "left") {
    left = clamp(left, margin, Math.max(margin, viewport.width - width - margin));
  }

  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}

export function updateActiveDescendant(root, ownerId, commands, selectedIndex) {
  root?.setAttribute(
    "aria-activedescendant",
    commands?.length > 0 ? commandElementId(ownerId, selectedIndex) : "",
  );
}
