"use client";
import { forwardRef, useCallback } from "react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

import { useTableClearRowColumnContent } from "@/components/tiptap-node/table-node/ui/table-clear-row-column-content-button"

import { Button } from "@/components/tiptap-ui-primitive/button"

/**
 * Button component for clearing table row/column content in a Tiptap editor.
 *
 * For custom button implementations, use the `useTableClearRowColumnContent` hook instead.
 */
export const TableClearRowColumnContentButton = forwardRef((
  {
    editor: providedEditor,
    index,
    orientation,
    hideWhenUnavailable = false,
    resetAttrs = false,
    onCleared,
    text,
    onClick,
    children,
    ...buttonProps
  },
  ref
) => {
  const { editor } = useTiptapEditor(providedEditor)
  const { isVisible, handleClear, label, canClearRowColumnContent, Icon } =
    useTableClearRowColumnContent({
      editor,
      index,
      orientation,
      hideWhenUnavailable,
      resetAttrs,
      onCleared,
    })

  const handleClick = useCallback((event) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    handleClear()
  }, [handleClear, onClick])

  if (!isVisible) {
    return null
  }

  return (
    <Button
      type="button"
      disabled={!canClearRowColumnContent}
      variant="ghost"
      data-active-state="off"
      data-disabled={!canClearRowColumnContent}
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

TableClearRowColumnContentButton.displayName =
  "TableClearRowColumnContentButton"
