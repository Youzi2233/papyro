import { useCallback, useEffect, useState } from "react"
import { type Editor } from "@tiptap/react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Lib ---
import { isExtensionAvailable } from "@/lib/tiptap-utils"

// --- Icons ---
import { IndentIncreaseIcon } from "@/components/tiptap-icons/indent-increase-icon"
import { IndentDecreaseIcon } from "@/components/tiptap-icons/indent-decrease-icon"

export type IndentAction = "indent" | "outdent"

/**
 * Configuration for the indent functionality
 */
export interface UseIndentConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * The indent action to perform.
   */
  action: IndentAction
  /**
   * Whether the button should hide when indent is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean
  /**
   * Callback function called after a successful indent change.
   */
  onIndented?: () => void
}

export const INDENT_SHORTCUT_KEYS: Record<IndentAction, string> = {
  indent: "Tab",
  outdent: "Shift-Tab",
}

export const indentIcons = {
  indent: IndentIncreaseIcon,
  outdent: IndentDecreaseIcon,
}

export const indentLabels: Record<IndentAction, string> = {
  indent: "Increase indent",
  outdent: "Decrease indent",
}

/**
 * Checks if indent action can be performed in the current editor state
 */
export function canPerformIndent(
  editor: Editor | null,
  action: IndentAction
): boolean {
  if (!editor || !editor.isEditable) return false
  if (!isExtensionAvailable(editor, "indent")) return false

  if (action === "indent") {
    return editor.can().indent()
  }

  return editor.can().outdent()
}

/**
 * Performs the indent action in the editor
 */
export function performIndent(
  editor: Editor | null,
  action: IndentAction
): boolean {
  if (!editor || !editor.isEditable) return false
  if (!canPerformIndent(editor, action)) return false

  if (action === "indent") {
    return editor.chain().focus().indent().run()
  }

  return editor.chain().focus().outdent().run()
}

/**
 * Determines if the indent button should be shown
 */
export function shouldShowIndentButton(props: {
  editor: Editor | null
  hideWhenUnavailable: boolean
  action: IndentAction
}): boolean {
  const { editor, hideWhenUnavailable, action } = props

  if (!editor) return false

  if (!hideWhenUnavailable) {
    return true
  }

  if (!editor.isEditable) return false

  if (!isExtensionAvailable(editor, "indent")) return false

  return canPerformIndent(editor, action)
}

/**
 * Custom hook that provides indent functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * // Simple usage
 * function MyIndentButton() {
 *   const { isVisible, handleIndent } = useIndent({ action: "indent" })
 *
 *   if (!isVisible) return null
 *
 *   return <button onClick={handleIndent}>Indent</button>
 * }
 *
 * // Advanced usage with configuration
 * function MyOutdentButton() {
 *   const { isVisible, handleIndent, label, canIndent } = useIndent({
 *     editor: myEditor,
 *     action: "outdent",
 *     hideWhenUnavailable: true,
 *     onIndented: () => console.log('Outdented!')
 *   })
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <MyButton
 *       onClick={handleIndent}
 *       disabled={!canIndent}
 *       aria-label={label}
 *     >
 *       Outdent
 *     </MyButton>
 *   )
 * }
 * ```
 */
export function useIndent(config: UseIndentConfig) {
  const {
    editor: providedEditor,
    action,
    hideWhenUnavailable = false,
    onIndented,
  } = config

  const { editor } = useTiptapEditor(providedEditor)
  const [isVisible, setIsVisible] = useState<boolean>(true)
  const canIndent = canPerformIndent(editor, action)

  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      setIsVisible(
        shouldShowIndentButton({ editor, action, hideWhenUnavailable })
      )
    }

    handleUpdate()

    editor.on("selectionUpdate", handleUpdate)
    editor.on("transaction", handleUpdate)

    return () => {
      editor.off("selectionUpdate", handleUpdate)
      editor.off("transaction", handleUpdate)
    }
  }, [editor, hideWhenUnavailable, action])

  const handleIndent = useCallback(() => {
    if (!editor) return false

    const success = performIndent(editor, action)
    if (success) {
      onIndented?.()
    }
    return success
  }, [editor, action, onIndented])

  return {
    isVisible,
    canIndent,
    handleIndent,
    label: indentLabels[action],
    shortcutKeys: INDENT_SHORTCUT_KEYS[action],
    Icon: indentIcons[action],
  }
}
