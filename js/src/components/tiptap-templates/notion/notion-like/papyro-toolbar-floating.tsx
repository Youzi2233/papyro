import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useState,
} from "react"
import { type Editor } from "@tiptap/react"

import { useFloatingToolbarVisibility } from "@/hooks/use-floating-toolbar-visibility"
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useUiEditorState } from "@/hooks/use-ui-editor-state"

import { ImageNodeFloating } from "@/components/tiptap-node/image-node/image-node-floating"
import { MoreVerticalIcon } from "@/components/tiptap-icons/more-vertical-icon"
import { ColorTextPopover } from "@/components/tiptap-ui/color-text-popover"
import { IndentButton } from "@/components/tiptap-ui/indent-button"
import { LinkPopover } from "@/components/tiptap-ui/link-popover"
import type { Mark } from "@/components/tiptap-ui/mark-button"
import { canToggleMark, MarkButton } from "@/components/tiptap-ui/mark-button"
import { formatToolbarLabel, moreOptionsLabel } from "@/tiptap-i18n"
import type { TextAlign } from "@/components/tiptap-ui/text-align-button"
import {
  canSetTextAlign,
  TextAlignButton,
} from "@/components/tiptap-ui/text-align-button"
import { TurnIntoDropdown } from "@/components/tiptap-ui/turn-into-dropdown"

import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button } from "@/components/tiptap-ui-primitive/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/tiptap-ui-primitive/popover"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

import { FloatingElement } from "@/components/tiptap-ui-utils/floating-element"

import { isSelectionValid } from "@/lib/tiptap-ui-utils"
import { usePapyroTiptapLanguage } from "@/tiptap-react/runtime-context"

export function PapyroToolbarFloating() {
  const { editor } = useTiptapEditor()
  const language = usePapyroTiptapLanguage()
  const isMobile = useIsBreakpoint("max", 480)
  const { lockDragHandle, aiGenerationActive, commentInputVisible } =
    useUiEditorState(editor)

  const { shouldShow } = useFloatingToolbarVisibility({
    editor,
    isSelectionValid,
    extraHideWhen: Boolean(aiGenerationActive || commentInputVisible),
  })

  if (lockDragHandle || isMobile) return null

  return (
    <FloatingElement
      shouldShow={shouldShow}
      className="tiptap-selection-floating-layer"
    >
      <Toolbar
        variant="floating"
        aria-label={formatToolbarLabel(language)}
        className="tiptap-selection-toolbar"
        onMouseDown={preserveEditorSelectionOnMouseDown}
        onPointerDown={preserveEditorSelectionOnPointerDown}
      >
        <ToolbarGroup>
          <TurnIntoDropdown hideWhenUnavailable={true} />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup>
          <MarkButton type="bold" hideWhenUnavailable={true} />
          <MarkButton type="italic" hideWhenUnavailable={true} />
          <MarkButton type="strike" hideWhenUnavailable={true} />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup>
          <ImageNodeFloating />
        </ToolbarGroup>

        <ToolbarGroup>
          <LinkPopover
            autoOpenOnLinkActive={false}
            hideWhenUnavailable={true}
          />
          <ColorTextPopover hideWhenUnavailable={true} />
        </ToolbarGroup>

        <MoreOptions hideWhenUnavailable={true} />
      </Toolbar>
    </FloatingElement>
  )
}

function canMoreOptions(editor: Editor | null): boolean {
  if (!editor) {
    return false
  }

  const canTextAlignAny = ["left", "center", "right", "justify"].some((align) =>
    canSetTextAlign(editor, align as TextAlign)
  )

  const canMarkAny = ["underline", "code", "superscript", "subscript"].some(
    (type) => canToggleMark(editor, type as Mark)
  )

  return canMarkAny || canTextAlignAny
}

function preserveEditorSelectionOnPointerDown(
  event: ReactPointerEvent<HTMLDivElement>
) {
  preserveEditorSelectionForButtonTarget(event)
}

function preserveEditorSelectionOnMouseDown(
  event: ReactMouseEvent<HTMLDivElement>
) {
  preserveEditorSelectionForButtonTarget(event)
}

function preserveEditorSelectionForButtonTarget(
  event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>
) {
  if (event.button !== 0) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest("button, [role='button']")) {
    event.preventDefault()
  }
}

function shouldShowMoreOptions(params: {
  editor: Editor | null
  hideWhenUnavailable: boolean
}): boolean {
  const { editor, hideWhenUnavailable } = params

  if (!editor) {
    return false
  }

  if (hideWhenUnavailable && !editor.isActive("code")) {
    return canMoreOptions(editor)
  }

  return Boolean(editor?.isEditable)
}

export interface MoreOptionsProps extends Omit<ButtonProps, "type"> {
  editor?: Editor | null
  hideWhenUnavailable?: boolean
}

export function MoreOptions({
  editor: providedEditor,
  hideWhenUnavailable = false,
  ...props
}: MoreOptionsProps) {
  const { editor } = useTiptapEditor(providedEditor)
  const language = usePapyroTiptapLanguage()
  const [show, setShow] = useState(false)
  const label = moreOptionsLabel(language)

  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setShow(
        shouldShowMoreOptions({
          editor,
          hideWhenUnavailable,
        })
      )
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)
    editor.on("transaction", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
      editor.off("transaction", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable])

  if (!show || !editor || !editor.isEditable) {
    return null
  }

  return (
    <>
      <ToolbarSeparator />
      <ToolbarGroup>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              role="button"
              tabIndex={-1}
              aria-label={label}
              tooltip={label}
              {...props}
            >
              <MoreVerticalIcon className="tiptap-button-icon" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            side="top"
            align="end"
            alignOffset={4}
            sideOffset={4}
            className="tiptap-floating-toolbar-popover"
          >
            <Toolbar
              variant="floating"
              data-plain="true"
              aria-label={label}
              className="tiptap-floating-toolbar-popover-toolbar"
              tabIndex={0}
              onMouseDown={preserveEditorSelectionOnMouseDown}
              onPointerDown={preserveEditorSelectionOnPointerDown}
            >
              <ToolbarGroup>
                <MarkButton type="underline" />
                <MarkButton type="code" />
              </ToolbarGroup>

              <ToolbarSeparator />

              <ToolbarGroup>
                <MarkButton type="superscript" />
                <MarkButton type="subscript" />
              </ToolbarGroup>

              <ToolbarSeparator />

              <ToolbarGroup>
                <TextAlignButton align="left" />
                <TextAlignButton align="center" />
                <TextAlignButton align="right" />
                <TextAlignButton align="justify" />
              </ToolbarGroup>

              <ToolbarSeparator />

              <ToolbarGroup>
                <IndentButton action="outdent" />
                <IndentButton action="indent" />
              </ToolbarGroup>
            </Toolbar>
          </PopoverContent>
        </Popover>
      </ToolbarGroup>
    </>
  )
}
