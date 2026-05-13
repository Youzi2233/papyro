import {
  activeOutlineHeadingIndex,
  activePreviewHeadingIndex,
  latestModeScrollSnapshot,
  modeSupportsEditorScroll,
  nextLayoutSize,
  normalizeViewMode,
  readScrollSnapshot,
  restoreScrollSnapshot,
  saveModeScrollSnapshot,
  scrollPreviewToHeading as scrollPreviewScrollerToHeading,
} from "./editor-core.ts";
import { renderPreviewMermaid } from "./mermaid-renderer.ts";
import { renderPreviewMath } from "./tiptap-math.js";
import {
  isTiptapEntry,
  scrollTiptapEntryToLine,
  tiptapActiveMarkdownLineNumber,
  tiptapEditorScroller,
  tiptapTopMarkdownLineNumber,
} from "./tiptap-navigation.ts";

const OUTLINE_MOBILE_MEDIA_QUERY = "(max-width: 1280px)";

type DatasetLike = Record<string, string | undefined>;

type RectLike = {
  top: number;
};

type ScrollSnapshotStore = Map<string, unknown>;

type ScrollListenerRecord = {
  tabId: string;
  onScroll: () => void;
};

type ClassListLike = {
  toggle: (value: string, force?: boolean) => void;
};

type ElementLike = {
  dataset?: DatasetLike;
  classList?: ClassListLike;
  isConnected?: boolean;
  scrollTop?: number;
  scrollLeft?: number;
  scrollHeight?: number;
  clientHeight?: number;
  scrollWidth?: number;
  clientWidth?: number;
  addEventListener?: (
    type: string,
    listener: () => void,
    options?: AddEventListenerOptions,
  ) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
  getBoundingClientRect?: () => RectLike;
  querySelectorAll?: (selector: string) => ArrayLike<ElementLike>;
  scrollTo?: (options: { top: number; behavior?: ScrollBehavior }) => void;
  setAttribute?: (name: string, value: string) => void;
  removeAttribute?: (name: string) => void;
  click?: () => void;
};

type DocumentLike = {
  querySelectorAll?: (selector: string) => ArrayLike<ElementLike>;
  querySelector?: (selector: string) => ElementLike | null;
};

type WindowLike = {
  getComputedStyle?: (element: ElementLike) => {
    display?: string;
    visibility?: string;
  };
  matchMedia?: (query: string) => {
    matches?: boolean;
  };
  ResizeObserver?: new (callback: () => void) => {
    observe: (target: ElementLike) => void;
    disconnect: () => void;
  };
};

type HostRuntimeEntry = {
  dom?: {
    dataset?: DatasetLike;
  };
  view?: {
    dom?: {
      dataset?: DatasetLike;
    };
  };
  viewMode?: string;
  editorScrollScroller?: ElementLike | null;
  layoutObserver?: { disconnect?: () => void } | null;
  layoutCancel?: (() => void) | null;
  layoutFrame?: ReturnType<typeof setTimeout> | number | null;
  layoutSize?: unknown;
  onRecycle?: () => void;
  [key: string]: unknown;
};

type HostRegistry = {
  get: (tabId: string) => HostRuntimeEntry | null | undefined;
};

type CreateEditorHostRuntimeOptions = {
  registry?: HostRegistry;
  document?: DocumentLike | null;
  window?: WindowLike | null;
  isElement?: (element: unknown) => element is ElementLike;
  modeScrollSnapshots?: ScrollSnapshotStore;
  editorScrollListeners?: WeakMap<object, ScrollListenerRecord>;
  previewScrollListeners?: WeakMap<object, ScrollListenerRecord>;
};

function defaultWindow(): WindowLike | null {
  return typeof window === "undefined" ? null : window;
}

function defaultDocument(): DocumentLike | null {
  return typeof document === "undefined" ? null : document;
}

function defaultIsElement(element: unknown): element is ElementLike {
  return typeof HTMLElement !== "undefined" && element instanceof HTMLElement;
}

function isVisibleElement(
  element: unknown,
  win: WindowLike | null = defaultWindow(),
) {
  if (!defaultIsElement(element)) return false;

  const style = win?.getComputedStyle?.(element);
  return (
    style?.display !== "none" &&
    style?.visibility !== "hidden" &&
    style?.visibility !== "collapse"
  );
}

function scheduleScrollRestore(
  scroller: ElementLike | null | undefined,
  snapshot: unknown,
  afterRestore = () => {},
) {
  if (!scroller || !snapshot) return false;

  const restore = () => {
    restoreScrollSnapshot(scroller, snapshot);
    afterRestore();
  };

  queueMicrotask(restore);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(restore);
  } else {
    setTimeout(restore, 0);
  }
  return true;
}

function previewHeadingOffsets(
  scroller: ElementLike | null | undefined,
  isElement = defaultIsElement,
) {
  if (!isElement(scroller)) return [];

  const scrollerTop = scroller.getBoundingClientRect?.().top ?? 0;
  return Array.from(
    scroller.querySelectorAll?.(
      ".mn-preview h1, .mn-preview h2, .mn-preview h3, .mn-preview h4, .mn-preview h5, .mn-preview h6",
    ) ?? [],
  )
    .map((heading) => {
      if (!isElement(heading)) return null;
      return (
        (heading.getBoundingClientRect?.().top ?? 0) -
        scrollerTop +
        (scroller.scrollTop ?? 0)
      );
    })
    .filter((offset) => Number.isFinite(offset));
}

export function createEditorHostRuntime({
  registry,
  document: documentRef = defaultDocument(),
  window: windowRef = defaultWindow(),
  isElement = defaultIsElement,
  modeScrollSnapshots = new Map(),
  editorScrollListeners = new WeakMap(),
  previewScrollListeners = new WeakMap(),
}: CreateEditorHostRuntimeOptions = {}) {
  if (!registry || typeof registry !== "object") {
    throw new TypeError("Editor host runtime requires a registry");
  }

  function viewTabId(entry: HostRuntimeEntry | null | undefined) {
    return entry?.dom?.dataset?.tabId ?? entry?.view?.dom?.dataset?.tabId ?? "";
  }

  function editorScroller(entry: HostRuntimeEntry | null | undefined) {
    return isTiptapEntry(entry) ? tiptapEditorScroller(entry) : null;
  }

  function outlineItemsForTab(tabId: string) {
    return Array.from(documentRef?.querySelectorAll?.(".mn-outline-item[data-tab-id]") ?? [])
      .filter((element) => element.dataset?.tabId === tabId);
  }

  function outlineLineNumbersForTab(tabId: string) {
    return outlineItemsForTab(tabId).map((element) => Number(element.dataset?.lineNumber ?? 0));
  }

  function setActiveOutlineItem(tabId: string, headingIndex: unknown) {
    const activeIndex = Number.isSafeInteger(Number(headingIndex)) ? Number(headingIndex) : -1;

    outlineItemsForTab(tabId).forEach((element, index) => {
      const active = index === activeIndex;
      element.classList?.toggle("active", active);
      if (active) {
        element.setAttribute?.("aria-current", "location");
      } else {
        element.removeAttribute?.("aria-current");
      }
    });
  }

  function previewScrollerForTab(tabId: string) {
    return Array.from(documentRef?.querySelectorAll?.(".mn-preview-scroll[data-tab-id]") ?? [])
      .find((element) => element.dataset?.tabId === tabId) ?? null;
  }

  function saveEditorScrollSnapshot(
    entry: HostRuntimeEntry | null | undefined,
    mode = entry?.viewMode,
  ) {
    if (!modeSupportsEditorScroll(mode)) return null;

    return saveModeScrollSnapshot(
      modeScrollSnapshots,
      viewTabId(entry),
      mode,
      readScrollSnapshot(editorScroller(entry)),
    );
  }

  function restoreEditorScrollSnapshot(entry: HostRuntimeEntry | null | undefined) {
    if (!modeSupportsEditorScroll(entry?.viewMode)) return false;

    return scheduleScrollRestore(
      editorScroller(entry),
      latestModeScrollSnapshot(modeScrollSnapshots, viewTabId(entry)),
    );
  }

  function detachEditorScrollElement(scroller: ElementLike | null | undefined) {
    if (!isElement(scroller)) return false;

    const previous = editorScrollListeners.get(scroller);
    if (!previous) return false;

    scroller.removeEventListener?.("scroll", previous.onScroll);
    editorScrollListeners.delete(scroller);
    return true;
  }

  function detachEditorScroll(entry: HostRuntimeEntry | null | undefined) {
    const detached = detachEditorScrollElement(entry?.editorScrollScroller ?? editorScroller(entry));
    if (entry) {
      entry.editorScrollScroller = null;
    }
    return detached;
  }

  function editorActiveLineNumber(entry: HostRuntimeEntry | null | undefined) {
    return tiptapActiveMarkdownLineNumber(entry, outlineLineNumbersForTab(viewTabId(entry)));
  }

  function editorTopLineNumber(
    entry: HostRuntimeEntry | null | undefined,
    scroller = editorScroller(entry),
  ) {
    return tiptapTopMarkdownLineNumber(entry, outlineLineNumbersForTab(viewTabId(entry)), scroller);
  }

  function syncOutlineForEditor(tabId: string, entry = registry.get(tabId)) {
    const activeLine = editorActiveLineNumber(entry);
    if (activeLine === null) return false;

    setActiveOutlineItem(
      tabId,
      activeOutlineHeadingIndex(outlineLineNumbersForTab(tabId), activeLine),
    );
    return true;
  }

  function syncOutlineForEditorScroll(
    tabId: string,
    entry = registry.get(tabId),
    scroller = editorScroller(entry),
  ) {
    const activeLine = editorTopLineNumber(entry, scroller) ?? editorActiveLineNumber(entry);
    if (activeLine === null) return false;

    setActiveOutlineItem(
      tabId,
      activeOutlineHeadingIndex(outlineLineNumbersForTab(tabId), activeLine),
    );
    return true;
  }

  function syncOutlineForPreview(tabId: string, scroller = previewScrollerForTab(tabId)) {
    if (!isElement(scroller)) return false;

    setActiveOutlineItem(
      tabId,
      activePreviewHeadingIndex(previewHeadingOffsets(scroller, isElement), scroller.scrollTop ?? 0),
    );
    return true;
  }

  function syncOutline(tabId: string, mode: unknown) {
    const normalizedMode = normalizeViewMode(mode);
    return normalizedMode === "preview"
      ? syncOutlineForPreview(tabId)
      : syncOutlineForEditor(tabId);
  }

  function attachEditorScroll(tabId: string, entry = registry.get(tabId)) {
    if (!modeSupportsEditorScroll(entry?.viewMode)) {
      detachEditorScroll(entry);
      return false;
    }

    const scroller = editorScroller(entry);
    if (!isElement(scroller)) {
      detachEditorScroll(entry);
      return false;
    }

    if (entry?.editorScrollScroller && entry.editorScrollScroller !== scroller) {
      detachEditorScrollElement(entry.editorScrollScroller);
    }
    if (entry) {
      entry.editorScrollScroller = scroller;
    }

    const previous = editorScrollListeners.get(scroller);
    if (previous?.tabId === tabId) {
      scheduleScrollRestore(
        scroller,
        latestModeScrollSnapshot(modeScrollSnapshots, tabId),
        () => {
          saveModeScrollSnapshot(
            modeScrollSnapshots,
            tabId,
            entry.viewMode,
            readScrollSnapshot(scroller),
          );
          syncOutlineForEditorScroll(tabId, entry, scroller);
        },
      );
      return true;
    }
    if (previous) {
      scroller.removeEventListener?.("scroll", previous.onScroll);
    }

    const save = () => {
      saveModeScrollSnapshot(
        modeScrollSnapshots,
        tabId,
        entry.viewMode,
        readScrollSnapshot(scroller),
      );
      syncOutlineForEditorScroll(tabId, entry, scroller);
    };
    const onScroll = () => save();
    scroller.addEventListener?.("scroll", onScroll, { passive: true });
    editorScrollListeners.set(scroller, { tabId, onScroll });

    const snapshot = latestModeScrollSnapshot(modeScrollSnapshots, tabId);
    if (!scheduleScrollRestore(scroller, snapshot, save)) {
      save();
    }
    return true;
  }

  function attachPreviewScroll(tabId: string, scroller: ElementLike | null | undefined) {
    if (!isElement(scroller)) return false;

    const previous = previewScrollListeners.get(scroller);
    if (previous?.tabId === tabId) {
      scheduleScrollRestore(
        scroller,
        latestModeScrollSnapshot(modeScrollSnapshots, tabId),
        () => {
          saveModeScrollSnapshot(
            modeScrollSnapshots,
            tabId,
            "preview",
            readScrollSnapshot(scroller),
          );
          syncOutlineForPreview(tabId, scroller);
        },
      );
      return true;
    }
    if (previous) {
      scroller.removeEventListener?.("scroll", previous.onScroll);
    }

    const save = () => {
      saveModeScrollSnapshot(
        modeScrollSnapshots,
        tabId,
        "preview",
        readScrollSnapshot(scroller),
      );
      syncOutlineForPreview(tabId, scroller);
    };
    const onScroll = () => save();
    scroller.addEventListener?.("scroll", onScroll, { passive: true });
    previewScrollListeners.set(scroller, { tabId, onScroll });

    const snapshot = latestModeScrollSnapshot(modeScrollSnapshots, tabId);
    if (!scheduleScrollRestore(scroller, snapshot, save)) {
      save();
    }
    return true;
  }

  function collapseOutlineOverlayIfNeeded() {
    const media = windowRef?.matchMedia?.(OUTLINE_MOBILE_MEDIA_QUERY);
    if (!media?.matches) return false;

    const toggle = documentRef?.querySelector?.(".mn-editor-outline-toggle");
    if (!isElement(toggle)) return false;

    toggle.click?.();
    return true;
  }

  function scrollEditorToLine(
    tabId: string,
    lineNumber: unknown,
    options: { headingIndex?: unknown } = {},
  ) {
    const entry = registry.get(tabId);
    return scrollTiptapEntryToLine(entry, lineNumber, {
      headingIndex: options.headingIndex,
    });
  }

  function scrollPreviewToHeading(tabId: string, headingIndex: unknown) {
    return scrollPreviewToHeadingImpl(tabId, headingIndex);
  }

  function scrollPreviewToHeadingImpl(tabId: string, headingIndex: unknown) {
    return scrollPreviewScrollerToHeading(previewScrollerForTab(tabId), headingIndex, {
      behavior: "auto",
    });
  }

  function navigateOutline(
    tabId: string,
    mode: unknown,
    lineNumber: unknown,
    headingIndex: unknown,
  ) {
    const normalizedMode = normalizeViewMode(mode);
    const navigated = normalizedMode === "preview"
      ? scrollPreviewToHeadingImpl(tabId, headingIndex)
      : scrollEditorToLine(tabId, lineNumber, { headingIndex: Number(headingIndex) });

    setActiveOutlineItem(tabId, Number(headingIndex));
    syncOutline(tabId, normalizedMode);
    if (navigated) {
      collapseOutlineOverlayIfNeeded();
    }
    return navigated;
  }

  function disconnectLayoutObserver(entry: HostRuntimeEntry | null | undefined) {
    entry.layoutObserver?.disconnect?.();
    entry.layoutCancel?.();
    entry.layoutObserver = null;
    entry.layoutFrame = 0;
    entry.layoutCancel = null;
    entry.layoutSize = null;
  }

  function attachLayoutObserver(tabId: string, container: ElementLike) {
    const entry = registry.get(tabId);
    if (!entry || !("ResizeObserver" in (windowRef ?? {}))) return;

    disconnectLayoutObserver(entry);
    entry.onRecycle = () => disconnectLayoutObserver(entry);

    const sendSizeChange = (rect: unknown) => {
      const nextSize = nextLayoutSize(entry.layoutSize, rect);
      if (!nextSize) {
        const rectLike = rect as { width?: unknown; height?: unknown } | null | undefined;
        const width = Number(rectLike?.width ?? 0);
        const height = Number(rectLike?.height ?? 0);
        if (width <= 0 || height <= 0) {
          entry.layoutSize = null;
        }
        return;
      }

      entry.layoutSize = nextSize;
    };

    const measure = () => {
      entry.layoutFrame = 0;
      entry.layoutCancel = null;
      if (!container.isConnected || !isVisibleElement(container, windowRef)) {
        entry.layoutSize = null;
        return;
      }
      sendSizeChange(container.getBoundingClientRect?.());
    };

    const scheduleMeasure = () => {
      if (entry.layoutFrame) return;

      if (typeof requestAnimationFrame === "function") {
        const frame = requestAnimationFrame(measure);
        entry.layoutFrame = frame;
        entry.layoutCancel = () => cancelAnimationFrame(frame);
      } else {
        const timer = setTimeout(measure, 0);
        entry.layoutFrame = timer;
        entry.layoutCancel = () => clearTimeout(timer);
      }
    };

    entry.layoutObserver = new windowRef.ResizeObserver(scheduleMeasure);
    entry.layoutObserver.observe(container);
    scheduleMeasure();
  }

  return {
    attachEditorScroll,
    detachEditorScroll,
    attachLayoutObserver,
    detachLayoutObserver: disconnectLayoutObserver,
    restoreEditorScrollSnapshot,
    navigation: {
      attachPreviewScroll,
      navigateOutline,
      syncOutline,
      scrollEditorToLine,
      scrollPreviewToHeading: scrollPreviewToHeadingImpl,
      renderPreviewMermaid,
      renderPreviewMath,
    },
  };
}
