import { useCallback, useEffect, useState } from "react"
import { useHotkeys } from "react-hotkeys-hook"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"

// --- Lib ---
import {
  isMarkInSchema,
  isNodeTypeSelected,
  selectCurrentBlockContent,
} from "@/lib/tiptap-utils"

// --- Icons ---
import { TextColorSmallIcon } from "@/components/tiptap-icons/text-color-small-icon"

export const COLOR_TEXT_SHORTCUT_KEY = "mod+shift+t"
export const TEXT_COLORS = [
  {
    label: "Default text",
    value: "var(--tt-color-text)",
    border: "var(--tt-color-text-contrast)",
  },
  {
    label: "Gray text",
    value: "var(--tt-color-text-gray)",
    border: "var(--tt-color-text-gray-contrast)",
  },
  {
    label: "Brown text",
    value: "var(--tt-color-text-brown)",
    border: "var(--tt-color-text-brown-contrast)",
  },
  {
    label: "Orange text",
    value: "var(--tt-color-text-orange)",
    border: "var(--tt-color-text-orange-contrast)",
  },
  {
    label: "Yellow text",
    value: "var(--tt-color-text-yellow)",
    border: "var(--tt-color-text-yellow-contrast)",
  },
  {
    label: "Green text",
    value: "var(--tt-color-text-green)",
    border: "var(--tt-color-text-green-contrast)",
  },
  {
    label: "Blue text",
    value: "var(--tt-color-text-blue)",
    border: "var(--tt-color-text-blue-contrast)",
  },
  {
    label: "Purple text",
    value: "var(--tt-color-text-purple)",
    border: "var(--tt-color-text-purple-contrast)",
  },
  {
    label: "Pink text",
    value: "var(--tt-color-text-pink)",
    border: "var(--tt-color-text-pink-contrast)",
  },
  {
    label: "Red text",
    value: "var(--tt-color-text-red)",
    border: "var(--tt-color-text-red-contrast)",
  },
]

/**
 * Checks if text color can be toggled in the current editor state
 */
export function canColorText(editor) {
  if (!editor || !editor.isEditable) return false
  if (
    !isMarkInSchema("textStyle", editor) ||
    isNodeTypeSelected(editor, ["image"])
  )
    return false

  try {
    return editor.can().setMark("textStyle", { color: "currentColor" });
  } catch {
    return false
  }
}

/**
 * Checks if text color is active in the current selection
 */
export function isColorTextActive(editor, textColor) {
  if (!editor || !editor.isEditable) return false
  return editor.isActive("textStyle", { color: textColor });
}

/**
 * Determines if the color text button should be shown
 */
export function shouldShowButton(props) {
  const { editor, hideWhenUnavailable } = props

  if (!editor) return false

  if (!hideWhenUnavailable) {
    return true
  }

  if (!editor.isEditable) return false

  if (!isMarkInSchema("textStyle", editor)) return false

  if (!editor.isActive("code")) {
    return canColorText(editor);
  }

  return true
}

/**
 * Custom hook that provides color text functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * // Simple usage with required textColor
 * function MySimpleTextColorButton() {
 *   const { isVisible, handleColorText, isActive } = useColorText({
 *     textColor: "red",
 *     label: "Red Text",
 *   })
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <button
 *       onClick={handleColorText}
 *       style={{ color: isActive ? "red" : "inherit" }}
 *     >
 *       Red Text
 *     </button>
 *   )
 * }
 *
 * // Advanced usage
 * function MyAdvancedTextColorButton() {
 *   const { isVisible, handleColorText, label, isActive } = useColorText({
 *     editor: myEditor,
 *     textColor: "#ff0000",
 *     label: "Apply Red",
 *     hideWhenUnavailable: true,
 *     onApplied: ({ color }) => console.log("Applied:", color),
 *   })
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <MyButton
 *       onClick={handleColorText}
 *       aria-label={label}
 *       data-active={isActive}
 *     >
 *       Apply Text Color
 *     </MyButton>
 *   )
 * }
 * ```
 */
export function useColorText(config) {
  const {
    editor: providedEditor,
    label,
    textColor,
    hideWhenUnavailable = false,
    onApplied,
  } = config

  const { editor } = useTiptapEditor(providedEditor)
  const isMobile = useIsBreakpoint()
  const [isVisible, setIsVisible] = useState(true)
  const canColorTextState = canColorText(editor)
  const isActive = isColorTextActive(editor, textColor)

  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(shouldShowButton({ editor, hideWhenUnavailable }))
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    };
  }, [editor, hideWhenUnavailable])

  const handleColorText = useCallback(() => {
    if (!editor || !canColorTextState) return false

    if (editor.state.storedMarks) {
      const textStyleMarkType = editor.schema.marks.textStyle
      if (textStyleMarkType) {
        editor.view.dispatch(editor.state.tr.removeStoredMark(textStyleMarkType))
      }
    }

    setTimeout(() => {
      selectCurrentBlockContent(editor)

      const success = editor
        .chain()
        .focus()
        .toggleMark("textStyle", { color: textColor })
        .run()
      if (success) {
        onApplied?.({ color: textColor, label })
      }
      return success
    }, 0)
  }, [editor, canColorTextState, textColor, onApplied, label])

  useHotkeys(COLOR_TEXT_SHORTCUT_KEY, (event) => {
    event.preventDefault()
    handleColorText()
  }, {
    enabled: isVisible && canColorTextState,
    enableOnContentEditable: !isMobile,
    enableOnFormTags: true,
  })

  return {
    isVisible,
    isActive,
    handleColorText,
    canColorText: canColorTextState,
    label: label || `Color text to ${textColor}`,
    shortcutKeys: COLOR_TEXT_SHORTCUT_KEY,
    Icon: TextColorSmallIcon,
  }
}
