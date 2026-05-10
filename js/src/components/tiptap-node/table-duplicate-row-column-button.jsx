"use client";
import { forwardRef, useCallback } from "react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

import { useTableDuplicateRowColumn } from "@/components/tiptap-node/table-node/ui/table-duplicate-row-column-button"

import { Button } from "@/components/tiptap-ui-primitive/button"

export const TableDuplicateRowColumnButton = forwardRef((
  {
    editor: providedEditor,
    index,
    orientation,
    tablePos,
    hideWhenUnavailable = false,
    onDuplicated,
    text,
    onClick,
    children,
    ...buttonProps
  },
  ref
) => {
  const { editor } = useTiptapEditor(providedEditor)
  const { isVisible, handleDuplicate, label, canDuplicateRowColumn, Icon } =
    useTableDuplicateRowColumn({
      editor,
      index,
      orientation,
      tablePos,
      hideWhenUnavailable,
      onDuplicated,
    })

  const handleClick = useCallback((event) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    handleDuplicate()
  }, [handleDuplicate, onClick])

  if (!isVisible) {
    return null
  }

  return (
    <Button
      type="button"
      disabled={!canDuplicateRowColumn}
      variant="ghost"
      data-active-state="off"
      data-disabled={!canDuplicateRowColumn}
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

TableDuplicateRowColumnButton.displayName = "TableDuplicateRowColumnButton"
