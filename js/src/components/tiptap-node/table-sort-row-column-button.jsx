import { forwardRef, useCallback } from "react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

import { useTableSortRowColumn } from "@/components/tiptap-node/table-node/ui/table-sort-row-column-button"

import { Button } from "@/components/tiptap-ui-primitive/button"

/**
 * Button component for sorting a table row/column in a Tiptap editor.
 *
 * For custom button implementations, use the `useTableSortRowColumn` hook instead.
 */
export const TableSortRowColumnButton = forwardRef((
  {
    editor: providedEditor,
    index,
    orientation,
    direction,
    hideWhenUnavailable = false,
    onSorted,
    text,
    onClick,
    children,
    ...buttonProps
  },
  ref
) => {
  const { editor } = useTiptapEditor(providedEditor)
  const { isVisible, handleSort, label, canSortRowColumn, Icon } =
    useTableSortRowColumn({
      editor,
      index,
      orientation,
      direction,
      hideWhenUnavailable,
      onSorted,
    })

  const handleClick = useCallback((event) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    handleSort()
  }, [handleSort, onClick])

  if (!isVisible) {
    return null
  }

  return (
    <Button
      type="button"
      disabled={!canSortRowColumn}
      variant="ghost"
      data-active-state="off"
      data-disabled={!canSortRowColumn}
      role="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={false}
      tooltip={label}
      onClick={handleClick}
      {...buttonProps}
      ref={ref}>
      {children ?? (
        <>
          <Icon className="tiptap-button-icon" />
          {text && <span className="tiptap-button-text">{text}</span>}
        </>
      )}
    </Button>
  );
})

TableSortRowColumnButton.displayName = "TableSortRowColumnButton"
