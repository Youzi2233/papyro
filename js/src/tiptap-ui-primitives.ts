export const DEFAULT_FLOATING_MARGIN = 10;

type DocumentLike = {
  body?: ElementLike;
  defaultView?: WindowLike | null;
  documentElement?: {
    clientWidth?: number;
    clientHeight?: number;
  };
  createElement?: (tagName: string) => ElementLike;
  addEventListener?: (
    type: string,
    listener: EventLikeListener,
    options?: boolean | AddEventListenerOptions,
  ) => void;
  removeEventListener?: (
    type: string,
    listener: EventLikeListener,
    options?: boolean | EventListenerOptions,
  ) => void;
};

type WindowLike = {
  innerWidth?: number;
  innerHeight?: number;
  addEventListener?: (type: string, listener: EventLikeListener) => void;
  removeEventListener?: (type: string, listener: EventLikeListener) => void;
};

type ClassListLike = {
  toggle?: (name: string, force?: boolean) => void;
};

type ElementLike = {
  id?: string;
  className?: string;
  hidden?: boolean;
  tabIndex?: number;
  offsetWidth?: number;
  offsetHeight?: number;
  ownerDocument?: DocumentLike;
  dom?: {
    ownerDocument?: DocumentLike;
  };
  dataset?: Record<string, string | undefined>;
  attributes?: Map<string, string>;
  classList?: ClassListLike;
  children?: Iterable<ElementLike> | ArrayLike<ElementLike>;
  style?: {
    left?: string;
    top?: string;
  };
  appendChild?: (child: ElementLike) => void;
  addEventListener?: (type: string, listener: EventLikeListener) => void;
  setAttribute?: (name: string, value: string) => void;
  getAttribute?: (name: string) => string | null;
  removeAttribute?: (name: string) => void;
  querySelector?: (selector: string) => ElementLike | null;
  scrollIntoView?: (options: { block: string; inline: string }) => void;
  [key: string]: unknown;
};

type EventLike = {
  target?: unknown;
  type?: string;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
  keyCode?: number;
  which?: number;
  key?: string;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  stopImmediatePropagation?: () => void;
};

type EventLikeListener = (event: EventLike) => void;

type FloatingRect = {
  left: number;
  right?: number;
  top: number;
  bottom: number;
};

type FloatingViewport = {
  width: number;
  height: number;
};

type FloatingSize = {
  width?: number;
  height?: number;
  margin?: number;
};

type FloatingPlacement = "bottom" | "top" | "left" | "right";

type CommandLike = unknown;

type FloatingDismissControllerConfig = {
  document?: DocumentLike | null;
  window?: WindowLike | null;
  contains?: (target: unknown, event: EventLike) => boolean;
  shouldDismiss?: (event: EventLike) => boolean;
  shouldDismissOnScroll?: (event: EventLike) => boolean;
  onDismiss?: (event: EventLike) => void;
  pointerDismissEvent?: string;
};

type SetHiddenOptions = {
  visibilityAttributes?: boolean;
  inertFocus?: boolean;
};

type PositionFloatingOptions = {
  viewport?: FloatingViewport;
  size?: FloatingSize;
  placement?: FloatingPlacement;
};

type MenuCommandItemsOptions = {
  indexDataset?: string;
};

type SyncMenuActiveDescendantOptions = MenuCommandItemsOptions & {
  activeClass?: string;
  ariaSelected?: boolean;
  manageTabIndex?: boolean;
  scroll?: boolean;
};

function hasMapAttributes(element: ElementLike | null | undefined): element is ElementLike & {
  attributes: Map<string, string>;
} {
  return element?.attributes instanceof Map;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function defaultDocument(): DocumentLike | null {
  return typeof document === "undefined" ? null : (document as unknown as DocumentLike);
}

export function defaultWindow(documentRef?: DocumentLike | null): WindowLike | null {
  return documentRef?.defaultView ?? (typeof window === "undefined" ? null : (window as WindowLike));
}

export function createElement(
  documentRef: DocumentLike | null | undefined,
  tagName: string,
  className?: string,
) {
  const element = documentRef?.createElement?.(tagName) ?? null;
  if (element && className) {
    element.className = className;
  }
  return element;
}

export function mountFloatingRoot(
  root: ElementLike | null | undefined,
  container: ElementLike | null | undefined,
  documentRef = defaultDocument(),
) {
  if (!root) return;
  const target = container?.ownerDocument?.body ?? documentRef?.body;
  target?.appendChild?.(root);
}

export function createFloatingDismissController({
  document: documentRef = defaultDocument(),
  window: windowRef = defaultWindow(documentRef),
  contains = () => false,
  shouldDismiss = () => true,
  shouldDismissOnScroll = shouldDismiss,
  onDismiss = () => {},
  pointerDismissEvent = "pointerdown",
}: FloatingDismissControllerConfig = {}) {
  let removeListeners: Array<() => void> = [];
  let pointerEventHandled = false;
  const shouldDismissScroll = shouldDismissOnScroll ?? shouldDismiss;

  const close = () => {
    removeListeners.forEach((remove) => remove());
    removeListeners = [];
    pointerEventHandled = false;
  };

  const dismissIfOutside = (event: EventLike) => {
    if (contains(event?.target, event)) return;
    if (shouldDismiss(event) === false) return;
    onDismiss(event);
  };
  const dismissPointer = (event: EventLike) => {
    pointerEventHandled = true;
    dismissIfOutside(event);
  };
  const dismissMouse = (event: EventLike) => {
    if (pointerEventHandled) {
      pointerEventHandled = false;
      return;
    }
    dismissIfOutside(event);
  };
  const dismissScroll = (event: EventLike) => {
    if (contains(event?.target, event)) return;
    if (shouldDismissScroll(event) === false) return;
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

function getAttributeValue(element: ElementLike | null | undefined, name: string) {
  if (typeof element?.getAttribute === "function") {
    return element.getAttribute(name);
  }
  if (hasMapAttributes(element)) {
    return element.attributes.get(name) ?? null;
  }
  return element?.[name] ?? null;
}

function removeAttributeValue(element: ElementLike | null | undefined, name: string) {
  if (typeof element?.removeAttribute === "function") {
    element.removeAttribute(name);
    return;
  }
  if (hasMapAttributes(element)) {
    element.attributes.delete(name);
  }
  delete element?.[name];
}

function setVisibilityDataset(element: ElementLike, hidden: boolean) {
  const value = hidden ? "false" : "true";
  if (element?.dataset) {
    element.dataset.visible = value;
    return;
  }
  element?.setAttribute?.("data-visible", value);
}

function setHiddenFocusState(element: ElementLike | null | undefined, hidden: boolean) {
  if (!element) return;
  const attributeKey = "__mnPreviousTabIndexAttribute";
  const propertyKey = "__mnPreviousTabIndexProperty";

  if (hidden) {
    if (!Object.prototype.hasOwnProperty.call(element, attributeKey)) {
      element[attributeKey] = getAttributeValue(element, "tabindex");
      element[propertyKey] = element.tabIndex;
    }
    element.tabIndex = -1;
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(element, attributeKey)) return;
  const previous = element[attributeKey];
  const previousProperty = element[propertyKey];
  if (previous == null) {
    removeAttributeValue(element, "tabindex");
    if (previousProperty == null) {
      delete element.tabIndex;
    } else {
      element.tabIndex = Number(previousProperty);
    }
  } else {
    element.setAttribute?.("tabindex", String(previous));
    element.tabIndex = Number(previous);
  }
  delete element[attributeKey];
  delete element[propertyKey];
}

export function setHidden(
  element: ElementLike | null | undefined,
  hidden: boolean,
  { visibilityAttributes = false, inertFocus = false }: SetHiddenOptions = {},
) {
  if (!element) return;
  element.hidden = hidden;
  element.classList?.toggle?.("hidden", hidden);
  if (visibilityAttributes) {
    setVisibilityDataset(element, hidden);
    if (hidden) {
      element.setAttribute?.("aria-hidden", "true");
    } else {
      removeAttributeValue(element, "aria-hidden");
    }
  }
  if (inertFocus) {
    setHiddenFocusState(element, hidden);
  }
}

export function commandElementId(ownerId: string, index: number) {
  return `${ownerId}-item-${index}`;
}

export function isComposingKeyboardEvent(event: EventLike | null | undefined) {
  return Boolean(
    event?.isComposing ||
      event?.nativeEvent?.isComposing ||
      event?.keyCode === 229 ||
      event?.which === 229 ||
      event?.key === "Process",
  );
}

export function viewportSize(reference: ElementLike, fallbackWindow?: WindowLike | null) {
  const documentElement =
    reference?.ownerDocument?.documentElement ?? reference?.dom?.ownerDocument?.documentElement;
  return {
    width: documentElement?.clientWidth ?? fallbackWindow?.innerWidth ?? 1024,
    height: documentElement?.clientHeight ?? fallbackWindow?.innerHeight ?? 768,
  };
}

export function positionFloatingElement(
  element: ElementLike | null | undefined,
  rect: FloatingRect | null | undefined,
  {
    viewport,
    size,
    placement = "bottom",
  }: PositionFloatingOptions,
) {
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
    const rectRight = rect.right ?? rect.left;
    const preferredLeft = rectRight + 12;
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

  if (!element.style) element.style = {};
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}

export function updateActiveDescendant(
  root: ElementLike | null | undefined,
  ownerId: string,
  commands: CommandLike[] | null | undefined,
  selectedIndex: number,
) {
  root?.setAttribute?.(
    "aria-activedescendant",
    (commands?.length ?? 0) > 0 ? commandElementId(ownerId, selectedIndex) : "",
  );
}

function findElementById(
  root: ElementLike | null | undefined,
  id: string,
): ElementLike | null {
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

export function scrollActiveDescendantIntoView(
  root: ElementLike | null | undefined,
  ownerId: string,
  commands: CommandLike[] | null | undefined,
  selectedIndex: number,
) {
  if (!root || !commands?.length) return false;
  const active = findElementById(root, commandElementId(ownerId, selectedIndex));
  if (!active) return false;

  if (typeof active.scrollIntoView === "function") {
    active.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }

  return false;
}

export function menuCommandItems(
  root: ElementLike | null | undefined,
  { indexDataset = "commandIndex" }: MenuCommandItemsOptions = {},
) {
  const items: ElementLike[] = [];
  const visit = (element: ElementLike | null | undefined) => {
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
  root: ElementLike | null | undefined,
  ownerId: string,
  commands: CommandLike[] | null | undefined,
  selectedIndex: number,
  {
    activeClass = "active",
    ariaSelected = false,
    indexDataset = "commandIndex",
    manageTabIndex = false,
    scroll = true,
  }: SyncMenuActiveDescendantOptions = {},
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

export function bindPointerActivation(
  element: ElementLike | null | undefined,
  run: (() => boolean | void) | null | undefined,
) {
  if (!element || typeof run !== "function") return;

  let pointerActivated = false;
  const guard = (event: EventLike) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  };
  const execute = () => run() !== false;

  element.addEventListener?.("pointerdown", (event) => {
    guard(event);
    pointerActivated = true;
    execute();
  });
  element.addEventListener?.("click", (event) => {
    guard(event);
    if (!pointerActivated) {
      execute();
    }
    pointerActivated = false;
  });
  element.addEventListener?.("auxclick", (event) => {
    guard(event);
    pointerActivated = false;
  });
  element.addEventListener?.("contextmenu", (event) => {
    guard(event);
    pointerActivated = false;
  });
  element.addEventListener?.("mousedown", (event) => {
    guard(event);
  });
}
