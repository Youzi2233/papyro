"use client";
import { forwardRef, useCallback } from "react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

import { useTableAddRowColumn } from "@/components/tiptap-node/table-node/ui/table-add-row-column-button"

import { Button } from "@/components/tiptap-ui-primitive/button"

/**
 * Button component for adding a table row/column in a Tiptap editor.
 *
 * For custom button implementations, use the `useTableAddRowColumn` hook instead.
 */
export const TableAddRowColumnButton = forwardRef((
  {
    editor: providedEditor,
    index,
    orientation,
    side,
    tablePos,
    hideWhenUnavailable = false,
    onAdded,
    text,
    onClick,
    children,
    ...buttonProps
  },
  ref
) => {
  const { editor } = useTiptapEditor(providedEditor)
  const { isVisible, handleAdd, label, canAddRowColumn, Icon } =
    useTableAddRowColumn({
      editor,
      index,
      orientation,
      side,
      tablePos,
      hideWhenUnavailable,
      onAdded,
    })

  const handleClick = useCallback((event) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    handleAdd()
  }, [handleAdd, onClick])

  if (!isVisible) {
    return null
  }

  return (
    <Button
      type="button"
      disabled={!canAddRowColumn}
      variant="ghost"
      data-active-state="off"
      data-disabled={!canAddRowColumn}
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

TableAddRowColumnButton.displayName = "TableAddRowColumnButton"
