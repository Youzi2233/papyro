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
