import { useEffect, useState, useCallback, useRef } from "react"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

export function useTableHandleState(config = {}) {
  const {
    editor: providedEditor,
    initialState = null,
    watchFields,
    onStateChange,
  } = config

  const { editor } = useTiptapEditor(providedEditor)
  const [state, setState] = useState(initialState)
  const prevStateRef = useRef(initialState)

  const updateState = useCallback((newState) => {
    if (watchFields && prevStateRef.current) {
      const shouldUpdate = watchFields.some((field) => prevStateRef.current[field] !== newState[field])
      if (!shouldUpdate) return
    }

    setState(newState)
    prevStateRef.current = newState
    onStateChange?.(newState)
  }, [watchFields, onStateChange])

  useEffect(() => {
    if (!editor) {
      setState(null)
      prevStateRef.current = null
      onStateChange?.(null)
      return
    }

    editor.on("tableHandleState", updateState)

    return () => {
      editor.off("tableHandleState", updateState)
    };
  }, [editor, onStateChange, updateState])

  return state
}
