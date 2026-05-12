import { offset, size, useFloating, useTransitionStyles } from "@floating-ui/react";
import { useEffect, useMemo, useCallback } from "react"

const ORIENTATION_CONFIG = {
  row: {
    placement: "bottom",
    sizeProperty: "width",
  },

  column: {
    placement: "right",
    sizeProperty: "height",
  }
}

/**
 * Custom hook for positioning extend buttons using Floating UI
 */
function useTableExtendRowColumnButtonPosition(orientation, show, referencePosTable) {
  const config = ORIENTATION_CONFIG[orientation]

  const { refs, update, context, floatingStyles } = useFloating({
    open: show,
    placement: config.placement,
    middleware: [
      offset(4),
      size({
        apply({ rects, elements }) {
          const floating = elements.floating
          if (!floating) return

          // Apply size based on orientation
          const sizeValue = `${rects.reference[config.sizeProperty]}px`
          floating.style[config.sizeProperty] = sizeValue
        },
      }),
    ],
  })

  const { isMounted, styles } = useTransitionStyles(context)

  const createVirtualReference = useCallback((rect) => ({
    getBoundingClientRect: () => rect,
  }), [])

  useEffect(() => {
    if (!referencePosTable) return

    refs.setReference(createVirtualReference(referencePosTable))
    update()
  }, [referencePosTable, refs, update, createVirtualReference])

  return useMemo(() => ({
    isMounted,
    ref: refs.setFloating,
    style: {
      display: "flex",
      ...styles,
      ...floatingStyles
    },
  }), [floatingStyles, isMounted, refs.setFloating, styles]);
}

/**
 * Hook for managing positioning of both row and column extend buttons
 */
export function useTableExtendRowColumnButtonsPositioning(showAddOrRemoveColumnsButton, showAddOrRemoveRowsButton, referencePosTable) {
  const rowButton = useTableExtendRowColumnButtonPosition("row", showAddOrRemoveRowsButton, referencePosTable)

  const columnButton = useTableExtendRowColumnButtonPosition("column", showAddOrRemoveColumnsButton, referencePosTable)

  return useMemo(() => ({
    rowButton,
    columnButton,
  }), [rowButton, columnButton]);
}
