import React, { useCallback, useState } from "react";

import { TableExtendRowColumnButtons } from "../components/tiptap-node/table-node/ui/table-extend-row-column-button";
import { TableHandle } from "../components/tiptap-node/table-node/ui/table-handle/table-handle";
import { TableCellHandleMenu } from "../components/tiptap-node/table-node/ui/table-cell-handle-menu";
import { TableSelectionOverlay } from "../components/tiptap-node/table-node/ui/table-selection-overlay";
import "../components/tiptap-node/table-node/styles/prosemirror-table.scss";
import "../components/tiptap-node/table-node/styles/table-node.scss";
import "../components/tiptap-node/table-node/ui/table-extend-row-column-button/table-extend-row-column-button.scss";
import "../components/tiptap-node/table-node/ui/table-cell-handle-menu/table-cell-handle-menu.scss";
import "../components/tiptap-node/table-node/ui/table-handle-menu/table-handle-menu.scss";
import "../styles/_variables.scss";
import "../styles/_keyframe-animations.scss";

export function PapyroOfficialTableNodeLayer({ editor, entry = null }) {
  const [cellMenuOpen, setCellMenuOpen] = useState(false);
  const language = entry?.preferences?.language ?? entry?.dom?.dataset?.language ?? "english";

  const renderCellMenu = useCallback((props) => (
    <TableCellHandleMenu
      editor={props.editor}
      onOpenChange={props.onOpenChange}
      onMouseDown={(event) => props.onResizeStart?.("br")?.(event)}
    />
  ), []);

  if (!editor) return null;

  return (
    <>
      <TableHandle editor={editor} language={language} />
      <TableSelectionOverlay
        editor={editor}
        showResizeHandles={!cellMenuOpen}
        onMenuOpenChange={setCellMenuOpen}
        cellMenu={renderCellMenu}
      />
      <TableExtendRowColumnButtons editor={editor} />
    </>
  );
}
