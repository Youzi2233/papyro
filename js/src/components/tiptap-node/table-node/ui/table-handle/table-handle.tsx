import { useCallback, useMemo, useState } from "react"
import { FloatingPortal } from "@floating-ui/react"

import {
  colDragStart,
  rowDragStart,
} from "@/components/tiptap-node/table-node/extensions/table-handle"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useTableHandlePositioning } from "@/components/tiptap-node/table-node/ui/table-handle/use-table-handle-positioning"
import { useTableHandleState } from "@/components/tiptap-node/table-node/hooks/use-table-handle-state"

// --- Components ---
import { TableHandleMenu } from "@/components/tiptap-node/table-node/ui/table-handle-menu"

/**
 * Main table handle component that manages the positioning and rendering
 * of table row/column handles, extend buttons, and context menus.
 *
 * This component can be extended with custom row and column buttons,
 * or completely customized using the render prop pattern.
 */
export function TableHandle({
  editor: providedEditor,
  rowButton: CustomRowButton,
  columnButton: CustomColumnButton
}) {
  const { editor } = useTiptapEditor(providedEditor)
  const state = useTableHandleState({ editor })

  const [isRowVisible, setIsRowVisible] = useState(true)
  const [isColumnVisible, setIsColumnVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(null)

  const draggingState = useMemo(() => {
    if (!state?.draggingState) return undefined

    return {
      draggedCellOrientation: state.draggingState.draggedCellOrientation,
      mousePos: state.draggingState.mousePos,
      initialOffset: state.draggingState.initialOffset,
    }
  }, [state?.draggingState])

  const { rowHandle, colHandle } = useTableHandlePositioning(
    state?.show || false,
    state?.referencePosCell || null,
    state?.referencePosTable || null,
    draggingState
  )

  const toggleRowVisibility = useCallback((visible) => {
    setIsRowVisible(visible)
  }, [])

  const toggleColumnVisibility = useCallback((visible) => {
    setIsColumnVisible(visible)
  }, [])

  const handleMenuOpenChange = useCallback((type, open) => {
    setMenuOpen(open ? type : null)
  }, [])

  if (!editor || !state) return null

  const hasValidRowIndex = typeof state.rowIndex === "number"
  const hasValidColIndex = typeof state.colIndex === "number"

  const shouldShowRow =
    (isRowVisible && rowHandle.isMounted && hasValidRowIndex) ||
    menuOpen === "row"

  const shouldShowColumn =
    (isColumnVisible && colHandle.isMounted && hasValidColIndex) ||
    menuOpen === "column"

  const RowButton = CustomRowButton || TableHandleMenu
  const ColumnButton = CustomColumnButton || TableHandleMenu

  return (
    <FloatingPortal root={state.widgetContainer}>
      {shouldShowRow && (
        <div ref={rowHandle.ref} style={rowHandle.style}>
          <RowButton
            editor={editor}
            orientation="row"
            index={state.rowIndex}
            tablePos={state.blockPos}
            tableNode={state.block}
            onToggleOtherHandle={toggleColumnVisibility}
            dragStart={rowDragStart}
            onOpenChange={(open) => handleMenuOpenChange("row", open)} />
        </div>
      )}
      {shouldShowColumn && (
        <div ref={colHandle.ref} style={colHandle.style}>
          <ColumnButton
            editor={editor}
            orientation="column"
            index={state.colIndex}
            tablePos={state.blockPos}
            tableNode={state.block}
            onToggleOtherHandle={toggleRowVisibility}
            dragStart={colDragStart}
            onOpenChange={(open) => handleMenuOpenChange("column", open)} />
        </div>
      )}
    </FloatingPortal>
  );
}

TableHandle.displayName = "TableHandle"
