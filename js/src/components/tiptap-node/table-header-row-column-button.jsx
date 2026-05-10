import { forwardRef, useCallback } from "react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

import { useTableHeaderRowColumn } from "@/components/tiptap-node/table-node/ui/table-header-row-column-button"

import { Button } from "@/components/tiptap-ui-primitive/button"

/**
 * Button component for toggling table header row/column in a Tiptap editor.
 * Only works for the first row (index 0) or first column (index 0).
 *
 * For custom button implementations, use the `useTableHeaderRowColumn` hook instead.
 */
export const TableHeaderRowColumnButton = forwardRef((
  {
    editor: providedEditor,
    index,
    orientation,
    hideWhenUnavailable = false,
    onToggled,
    text,
    onClick,
    children,
    ...buttonProps
  },
  ref
) => {
  const { editor } = useTiptapEditor(providedEditor)
  const { isVisible, handleToggle, label, canToggleHeader, Icon, isActive } =
    useTableHeaderRowColumn({
      editor,
      index,
      orientation,
      hideWhenUnavailable,
      onToggled,
    })

  const handleClick = useCallback((event) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    handleToggle()
  }, [handleToggle, onClick])

  if (!isVisible) {
    return null
  }

  return (
    <Button
      type="button"
      disabled={!canToggleHeader}
      variant="ghost"
      data-active-state={isActive ? "on" : "off"}
      data-disabled={!canToggleHeader}
      role="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={isActive}
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

TableHeaderRowColumnButton.displayName = "TableHeaderRowColumnButton"
