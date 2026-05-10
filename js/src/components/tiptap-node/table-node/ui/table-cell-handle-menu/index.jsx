import { forwardRef, useCallback, useEffect, useState } from "react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Lib ---
import { cn, SR_ONLY } from "@/lib/tiptap-utils"

// --- UI ---
import { ColorMenu } from "@/components/tiptap-ui/color-menu"
import { TableAlignMenu } from "@/components/tiptap-node/table-node/ui/table-alignment-menu"
import { useTableClearRowColumnContent } from "@/components/tiptap-node/table-node/ui/table-clear-row-column-content-button"
import { useTableMergeSplitCell } from "@/components/tiptap-node/table-node/ui/table-merge-split-cell-button"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Combobox, ComboboxList } from "@/components/tiptap-ui-primitive/combobox"
import {
  Menu,
  MenuButton,
  MenuContent,
  MenuGroup,
  MenuItem,
} from "@/components/tiptap-ui-primitive/menu"
import { Separator } from "@/components/tiptap-ui-primitive/separator"

// --- Icons ---
import { Grip4Icon } from "@/components/tiptap-icons/grip-4-icon"

import "./table-cell-handle-menu.scss"

/**
 * Hook to manage all table actions and their availability
 */
function useTableActions() {
  const mergeCellAction = useTableMergeSplitCell({ action: "merge" })
  const splitCellAction = useTableMergeSplitCell({ action: "split" })
  const clearContentAction = useTableClearRowColumnContent({ resetAttrs: true })

  const mergeAction = {
    icon: mergeCellAction.Icon,
    label: mergeCellAction.label,
    onClick: mergeCellAction.handleExecute,
    isAvailable: mergeCellAction.canExecute,
  }

  const splitAction = {
    icon: splitCellAction.Icon,
    label: splitCellAction.label,
    onClick: splitCellAction.handleExecute,
    isAvailable: splitCellAction.canExecute,
  }

  const clearAction = {
    icon: clearContentAction.Icon,
    label: clearContentAction.label,
    onClick: clearContentAction.handleClear,
    isAvailable: clearContentAction.canClearRowColumnContent,
  }

  return {
    mergeAction,
    splitAction,
    clearAction,
  }
}

/**
 * Hook to manage table handle menu state and interactions
 */
function useTableCellHandleMenu({
  editor
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false)
    editor?.commands.unfreezeHandles()
  }, [editor])

  const handleMenuToggle = useCallback((isOpen) => {
    setIsMenuOpen(isOpen)

    if (!editor) return

    if (isOpen) {
      editor.commands.freezeHandles()
    } else {
      editor.commands.unfreezeHandles()
    }
  }, [editor])

  return {
    isMenuOpen,
    handleMenuToggle,
    closeMenu,
  }
}

const TableActionItem = ({
  action
}) => {
  const { icon: Icon, label, onClick, isActive = false, shortcutBadge } = action

  return (
    <MenuItem
      render={
        <Button variant="ghost" data-active-state={isActive ? "on" : "off"} />
      }
      onClick={onClick}>
      <Icon className="tiptap-button-icon" />
      <span className="tiptap-button-text">{label}</span>
      {shortcutBadge}
    </MenuItem>
  );
}

const TableActionMenu = ({
  onClose
}) => {
  const { mergeAction, splitAction, clearAction } = useTableActions()

  const hasMergeOrSplit = mergeAction.isAvailable || splitAction.isAvailable

  return (
    <MenuContent autoFocusOnShow modal onClose={onClose}>
      <Combobox style={SR_ONLY} />
      <ComboboxList style={{ minWidth: "15rem" }}>
        {hasMergeOrSplit && (
          <MenuGroup>
            {mergeAction.isAvailable && (
              <TableActionItem action={mergeAction} />
            )}
            {splitAction.isAvailable && (
              <TableActionItem action={splitAction} />
            )}
            <Separator orientation="horizontal" />
          </MenuGroup>
        )}

        <MenuGroup>
          <ColorMenu />
          <TableAlignMenu />
          {clearAction.isAvailable && <TableActionItem action={clearAction} />}
        </MenuGroup>
      </ComboboxList>
    </MenuContent>
  );
}

export const TableCellHandleMenu = forwardRef(({ editor: providedEditor, onOpenChange, className, ...props }, ref) => {
  const { editor } = useTiptapEditor(providedEditor)
  const { isMenuOpen, handleMenuToggle, closeMenu } = useTableCellHandleMenu({
    editor,
  })

  useEffect(() => {
    onOpenChange?.(isMenuOpen)
  }, [isMenuOpen, onOpenChange])

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={handleMenuToggle}
      placement="bottom-start"
      trigger={
        <MenuButton
          ref={ref}
          className={cn("expandable-menu-button", isMenuOpen && "menu-opened", className)}
          aria-label="Table cells option"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          {...props}>
          <Grip4Icon className="tiptap-button-icon" />
        </MenuButton>
      }>
      <TableActionMenu onClose={closeMenu} />
    </Menu>
  );
})

TableCellHandleMenu.displayName = "TableCellHandleMenu"

export { TableActionMenu }
