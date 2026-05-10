import { useCurrentEditor, useEditorState } from "@tiptap/react"
import { useEffect, useState } from "react"

function getActivePageEditor(editor) {
  const storage = editor.storage
  const pages = storage.pages
  if (!pages || !("activeEditor" in pages)) return null
  return pages.activeEditor ?? null
}

export function useTiptapEditor(providedEditor) {
  const { editor: coreEditor } = useCurrentEditor()
  const mainEditor = providedEditor ?? coreEditor

  const [storageEditor, setStorageEditor] = useState(null)

  useEffect(() => {
    if (!mainEditor) {
      setStorageEditor(null)
      return
    }

    const updateHandler = () =>
      setStorageEditor(getActivePageEditor(mainEditor))

    updateHandler()

    mainEditor.on("update", updateHandler)
    mainEditor.on("selectionUpdate", updateHandler)

    return () => {
      mainEditor.off("update", updateHandler)
      mainEditor.off("selectionUpdate", updateHandler)
    };
  }, [mainEditor])

  useEffect(() => {
    if (!storageEditor) return

    const handleDestroy = () => setStorageEditor(null)

    storageEditor.on("destroy", handleDestroy)
    return () => {
      storageEditor.off("destroy", handleDestroy)
    };
  }, [storageEditor])

  const editorState = useEditorState({
    editor: storageEditor ?? mainEditor,
    selector(context) {
      if (!context.editor) {
        return { editor: null, editorState: undefined, canCommand: undefined }
      }

      return {
        editor: context.editor,
        editorState: context.editor.state,
        canCommand: context.editor.can,
      }
    },
  })

  return editorState ?? { editor: null }
}
