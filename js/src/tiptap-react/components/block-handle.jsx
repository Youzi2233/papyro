import React from "react";

export function PapyroBlockHandle({ state = {} }) {
  const labels = state.labels ?? {};
  const insertLabel = labels.insert ?? "Insert block below";
  const actionLabel = labels.actions ?? "Block actions";

  return (
    <>
      <button
        type="button"
        className="mn-tiptap-block-handle-button mn-tiptap-block-handle-insert"
        title={insertLabel}
        aria-label={insertLabel}
        onPointerDown={state.onInsertPointerDown}
        onClick={state.onInsertClick}
        onAuxClick={state.onAuxClick}
        onContextMenu={state.onInsertContextMenu}
      >
        <span className="mn-tiptap-block-insert-icon" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="mn-tiptap-block-handle-button mn-tiptap-block-handle-action"
        title={actionLabel}
        aria-label={actionLabel}
        style={{ cursor: state.dragging ? "grabbing" : "grab" }}
        onPointerDown={state.onActionPointerDown}
        onPointerUp={state.onActionPointerUp}
        onClick={state.onActionClick}
        onAuxClick={state.onAuxClick}
        onContextMenu={state.onActionContextMenu}
      >
        <span className="mn-tiptap-block-handle-icon" aria-hidden="true" />
      </button>
    </>
  );
}
