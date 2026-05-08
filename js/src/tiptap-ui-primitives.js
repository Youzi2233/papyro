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
  shouldDismiss = () => true,
  shouldDismissOnScroll = shouldDismiss,
  onDismiss = () => {},
  pointerDismissEvent = "pointerdown",
} = {}) {
  let removeListeners = [];
  let pointerEventHandled = false;

  const close = () => {
    removeListeners.forEach((remove) => remove());
    removeListeners = [];
    pointerEventHandled = false;
  };

  const dismissIfOutside = (event) => {
    if (contains(event?.target, event)) return;
    if (shouldDismiss(event) === false) return;
    onDismiss(event);
  };
  const dismissPointer = (event) => {
    pointerEventHandled = true;
    dismissIfOutside(event);
  };
  const dismissMouse = (event) => {
    if (pointerEventHandled) {
      pointerEventHandled = false;
      return;
    }
    dismissIfOutside(event);
  };
  const dismissScroll = (event) => {
    if (contains(event?.target, event)) return;
    if (shouldDismissOnScroll(event) === false) return;
    if (shouldDismiss(event) === false) return;
    onDismiss(event);
  };

  return {
    open() {
      close();
      if (!documentRef?.addEventListener) return;

      documentRef.addEventListener(pointerDismissEvent, dismissPointer, true);
      documentRef.addEventListener("mousedown", dismissMouse, true);
      documentRef.addEventListener("focusin", dismissIfOutside, true);
      documentRef.addEventListener("scroll", dismissScroll, true);
      windowRef?.addEventListener?.("resize", dismissIfOutside);
      removeListeners = [
        () => documentRef.removeEventListener?.(pointerDismissEvent, dismissPointer, true),
        () => documentRef.removeEventListener?.("mousedown", dismissMouse, true),
        () => documentRef.removeEventListener?.("focusin", dismissIfOutside, true),
        () => documentRef.removeEventListener?.("scroll", dismissScroll, true),
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
  } else if (placement === "right") {
    const preferredLeft = rect.right + 12;
    const fallbackLeft = rect.left - width - 12;
    left =
      preferredLeft + width + margin > viewport.width
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

function findElementById(root, id) {
  if (!root || !id) return null;
  if (root.id === id) return root;
  if (typeof root.querySelector === "function") {
    try {
      const found = root.querySelector(`#${id}`);
      if (found) return found;
    } catch (_error) {
      // Fall through to the small tree walk used by tests and non-standard DOMs.
    }
  }

  const children = Array.from(root.children ?? []);
  for (const child of children) {
    const found = findElementById(child, id);
    if (found) return found;
  }
  return null;
}

export function scrollActiveDescendantIntoView(root, ownerId, commands, selectedIndex) {
  if (!root || !commands?.length) return false;
  const active = findElementById(root, commandElementId(ownerId, selectedIndex));
  if (!active) return false;

  if (typeof active.scrollIntoView === "function") {
    active.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }

  return false;
}

export function menuCommandItems(root, { indexDataset = "commandIndex" } = {}) {
  const items = [];
  const visit = (element) => {
    if (!element) return;
    if (element.dataset?.[indexDataset] != null) {
      items.push(element);
    }
    Array.from(element.children ?? []).forEach(visit);
  };
  visit(root);
  return items;
}

export function syncMenuActiveDescendant(
  root,
  ownerId,
  commands,
  selectedIndex,
  {
    activeClass = "active",
    ariaSelected = false,
    indexDataset = "commandIndex",
    manageTabIndex = false,
    scroll = true,
  } = {},
) {
  if (!root) return false;
  menuCommandItems(root, { indexDataset }).forEach((item) => {
    const active = Number(item.dataset?.[indexDataset]) === selectedIndex;
    item.classList?.toggle?.(activeClass, active);
    if (ariaSelected) {
      item.setAttribute?.("aria-selected", String(active));
    }
    if (manageTabIndex) {
      item.tabIndex = active ? 0 : -1;
    }
  });
  updateActiveDescendant(root, ownerId, commands, selectedIndex);
  if (scroll) {
    scrollActiveDescendantIntoView(root, ownerId, commands, selectedIndex);
  }
  return true;
}

export function bindPointerActivation(element, run) {
  if (!element || typeof run !== "function") return;

  let pointerActivated = false;
  const guard = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
  };
  const execute = () => run() !== false;

  element.addEventListener("pointerdown", (event) => {
    guard(event);
    pointerActivated = true;
    execute();
  });
  element.addEventListener("click", (event) => {
    guard(event);
    if (!pointerActivated) {
      execute();
    }
    pointerActivated = false;
  });
  element.addEventListener("auxclick", (event) => {
    guard(event);
    pointerActivated = false;
  });
  element.addEventListener("contextmenu", (event) => {
    guard(event);
    pointerActivated = false;
  });
  element.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
}
