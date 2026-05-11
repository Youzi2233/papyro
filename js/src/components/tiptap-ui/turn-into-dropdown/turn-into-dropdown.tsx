"use client"

import { forwardRef } from "react"
import type { Editor } from "@tiptap/react"

// --- Tiptap UI ---
import type { UseTurnIntoDropdownConfig } from "@/components/tiptap-ui/turn-into-dropdown"
import {
  useTurnIntoDropdown,
  getFilteredBlockTypeOptions,
} from "@/components/tiptap-ui/turn-into-dropdown"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Tiptap UI Components ---
import { TextButton } from "@/components/tiptap-ui/text-button"
import { HeadingButton } from "@/components/tiptap-ui/heading-button"
import { ListButton } from "@/components/tiptap-ui/list-button"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"

// --- UI Primitives ---
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button } from "@/components/tiptap-ui-primitive/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from "@/components/tiptap-ui-primitive/dropdown-menu"

export interface TurnIntoDropdownContentProps {
  blockTypes?: string[]
  editor?: Editor | null
}

export function TurnIntoDropdownContent({
  blockTypes,
  editor,
}: TurnIntoDropdownContentProps) {
  const filteredOptions = getFilteredBlockTypeOptions(blockTypes)

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Turn into</DropdownMenuLabel>
      {filteredOptions.map((option, index) =>
        renderBlockTypeButton(
          option,
          `${option.type}-${option.level ?? index}`,
          editor
        )
      )}
    </DropdownMenuGroup>
  )
}

function renderBlockTypeButton(
  option: ReturnType<typeof getFilteredBlockTypeOptions>[0],
  key: string,
  editor?: Editor | null
) {
  switch (option.type) {
    case "paragraph":
      return (
        <DropdownMenuItem key={key} asChild>
          <TextButton editor={editor} showTooltip={false} text={option.label} />
        </DropdownMenuItem>
      )

    case "heading":
      if (!option.level) return null
      return (
        <DropdownMenuItem key={key} asChild>
          <HeadingButton
            editor={editor}
            level={option.level}
            showTooltip={false}
            text={option.label}
          />
        </DropdownMenuItem>
      )

    case "bulletList":
      return (
        <DropdownMenuItem key={key} asChild>
          <ListButton
            editor={editor}
            type="bulletList"
            showTooltip={false}
            text={option.label}
          />
        </DropdownMenuItem>
      )

    case "orderedList":
      return (
        <DropdownMenuItem key={key} asChild>
          <ListButton
            editor={editor}
            type="orderedList"
            showTooltip={false}
            text={option.label}
          />
        </DropdownMenuItem>
      )

    case "taskList":
      return (
        <DropdownMenuItem key={key} asChild>
          <ListButton
            editor={editor}
            type="taskList"
            showTooltip={false}
            text={option.label}
          />
        </DropdownMenuItem>
      )

    case "blockquote":
      return (
        <DropdownMenuItem key={key} asChild>
          <BlockquoteButton
            editor={editor}
            showTooltip={false}
            text={option.label}
          />
        </DropdownMenuItem>
      )

    case "codeBlock":
      return (
        <DropdownMenuItem key={key} asChild>
          <CodeBlockButton
            editor={editor}
            showTooltip={false}
            text={option.label}
          />
        </DropdownMenuItem>
      )

    default:
      return null
  }
}

export interface TurnIntoDropdownProps
  extends Omit<ButtonProps, "type">, UseTurnIntoDropdownConfig {
  modal?: boolean
}

/**
 * Dropdown component for transforming block types in a Tiptap editor.
 * For custom dropdown implementations, use the `useTurnIntoDropdown` hook instead.
 */
export const TurnIntoDropdown = forwardRef<
  HTMLButtonElement,
  TurnIntoDropdownProps
>(function TurnIntoDropdown(
  {
    editor: providedEditor,
    hideWhenUnavailable = false,
    blockTypes,
    onOpenChange,
    modal = true,
    children,
    ...buttonProps
  },
  ref
) {
  const { editor } = useTiptapEditor(providedEditor)
  const {
    isVisible,
    canToggle,
    isOpen,
    activeBlockType,
    handleOpenChange,
    label,
    Icon,
  } = useTurnIntoDropdown({
    editor,
    hideWhenUnavailable,
    blockTypes,
    onOpenChange,
  })

  if (!isVisible) return null

  return (
    <DropdownMenu modal={modal} open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={!canToggle}
          data-disabled={!canToggle}
          role="button"
          tabIndex={-1}
          aria-label={label}
          tooltip="Turn into"
          {...buttonProps}
          ref={ref}
        >
          {children ?? (
            <>
              <span className="tiptap-button-text">
                {activeBlockType?.label || "Text"}
              </span>
              <Icon className="tiptap-button-dropdown-small" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        <TurnIntoDropdownContent blockTypes={blockTypes} editor={editor} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

TurnIntoDropdown.displayName = "TurnIntoDropdown"
