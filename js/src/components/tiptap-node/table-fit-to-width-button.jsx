import { forwardRef, useCallback } from "react"

// --- Hooks ---
import { useTableFitToWidth } from "@/components/tiptap-node/table-node/ui/table-fit-to-width-button/use-table-fit-to-width"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

import { Button } from "@/components/tiptap-ui-primitive/button"

/**
 * Button component for fitting table to container width.
 *
 * This component provides a user interface for toggling table width between
 * fixed column widths and container-fitting behavior. It integrates with the
 * Tiptap table extension to modify table layout properties.
 *
 * @example
 * ```tsx
 * <TableFitToWidthButton
 *   editor={editor}
 *   onWidthAdjusted={() => console.log('Width changed')}
 * />
 * ```
 */
export const TableFitToWidthButton = forwardRef((
  {
    editor: providedEditor,
    hideWhenUnavailable = false,
    onWidthAdjusted,
    text,
    onClick,
    children,
    ...buttonProps
  },
  ref
) => {
  const { editor } = useTiptapEditor(providedEditor)
  const { isVisible, canFitToWidth, label, Icon, handleFitToWidth } =
    useTableFitToWidth({
      editor,
      hideWhenUnavailable,
      onWidthAdjusted,
    })

  const handleClick = useCallback((event) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    handleFitToWidth()
  }, [handleFitToWidth, onClick])

  if (!isVisible) {
    return null
  }

  return (
    <Button
      type="button"
      disabled={!canFitToWidth}
      variant="ghost"
      data-active-state="off"
      data-disabled={!canFitToWidth}
      role="button"
      tabIndex={-1}
      aria-label={label}
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

TableFitToWidthButton.displayName = "TableFitToWidthButton"
