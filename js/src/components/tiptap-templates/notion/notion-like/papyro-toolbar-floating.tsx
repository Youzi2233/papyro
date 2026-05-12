import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useUiEditorState } from "@/hooks/use-ui-editor-state"
import { useFloatingToolbarVisibility } from "@/hooks/use-floating-toolbar-visibility"

import { ColorTextPopover } from "@/components/tiptap-ui/color-text-popover"
import { LinkPopover } from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import { TurnIntoDropdown } from "@/components/tiptap-ui/turn-into-dropdown"
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"
import { ColorHighlightPopover } from "@/components/tiptap-ui/color-highlight-popover"

import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

import { FloatingElement } from "@/components/tiptap-ui-utils/floating-element"

import { isSelectionValid } from "@/lib/tiptap-collab-utils"

export function PapyroToolbarFloating() {
  const { editor } = useTiptapEditor()
  const { lockDragHandle } = useUiEditorState(editor)

  const { shouldShow } = useFloatingToolbarVisibility({
    editor,
    isSelectionValid,
  })

  if (lockDragHandle) return null

  return (
    <FloatingElement shouldShow={shouldShow}>
      <Toolbar variant="floating">
        <ToolbarGroup>
          <TurnIntoDropdown hideWhenUnavailable={true} />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup>
          <MarkButton type="bold" hideWhenUnavailable={true} />
          <MarkButton type="italic" hideWhenUnavailable={true} />
          <MarkButton type="underline" hideWhenUnavailable={true} />
          <MarkButton type="strike" hideWhenUnavailable={true} />
          <MarkButton type="code" hideWhenUnavailable={true} />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup>
          <LinkPopover autoOpenOnLinkActive={false} hideWhenUnavailable={true} />
          <ColorTextPopover hideWhenUnavailable={true} />
          <ColorHighlightPopover hideWhenUnavailable={true} />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup>
          <TextAlignButton align="left" />
          <TextAlignButton align="center" />
          <TextAlignButton align="right" />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup>
          <UndoRedoButton action="undo" />
          <UndoRedoButton action="redo" />
        </ToolbarGroup>
      </Toolbar>
    </FloatingElement>
  )
}
