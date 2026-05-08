export function normalizeOfficialDragHandleViewMode(entryOrMode) {
  const mode =
    typeof entryOrMode === "string" ? entryOrMode : entryOrMode?.viewMode;
  if (mode === "source" || mode === "preview") return mode;
  return "hybrid";
}

export function officialDragHandleBridgeState({ editor = null, entry = null } = {}) {
  const viewMode = normalizeOfficialDragHandleViewMode(entry);

  if (!editor) {
    return { active: false, viewMode, reason: "missing-editor" };
  }

  if (editor.isDestroyed === true) {
    return { active: false, viewMode, reason: "destroyed-editor" };
  }

  if (!entry?.blockHandle) {
    return { active: false, viewMode, reason: "missing-block-handle" };
  }

  if (viewMode !== "hybrid") {
    return { active: false, viewMode, reason: "inactive-view-mode" };
  }

  if (editor.isEditable === false) {
    return { active: false, viewMode, reason: "read-only-editor" };
  }

  return { active: true, viewMode, reason: "active" };
}

export function officialDragHandleControlsHidden(handleState = null) {
  return !handleState?.open || !handleState?.target;
}

export function consumeOfficialDragHandleNativeMenu(event = {}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return true;
}

export function isOfficialDragHandlePrimaryPointer(event = {}) {
  return Number(event?.button ?? 0) === 0;
}

export function createOfficialDragHandleClickTracker({
  threshold = 4,
} = {}) {
  let start = null;
  let suppressNextClick = false;

  return {
    begin(event = {}) {
      const button = Number(event?.button ?? 0);
      if (button !== 0) {
        start = null;
        suppressNextClick = false;
        return false;
      }

      const clientX = Number(event?.clientX);
      const clientY = Number(event?.clientY);
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        start = null;
        return false;
      }

      start = { clientX, clientY };
      return true;
    },

    end(event = {}) {
      if (!start) return false;

      const current = start;
      start = null;
      const button = Number(event?.button ?? 0);
      const clientX = Number(event?.clientX);
      const clientY = Number(event?.clientY);
      if (
        button !== 0 ||
        !Number.isFinite(clientX) ||
        !Number.isFinite(clientY)
      ) {
        suppressNextClick = false;
        return false;
      }

      const shortClick =
        Math.hypot(clientX - current.clientX, clientY - current.clientY) <= threshold;
      suppressNextClick = true;
      return shortClick;
    },

    click() {
      if (suppressNextClick) {
        suppressNextClick = false;
        return false;
      }
      return true;
    },

    cancel() {
      start = null;
      suppressNextClick = true;
    },
  };
}
