import type { Editor } from "@tiptap/react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Lib ---
import { isNodeTypeSelected } from "@/lib/tiptap-utils"

// --- Tiptap UI ---
import { DeleteNodeButton } from "@/components/tiptap-ui/delete-node-button"
import { ImageDownloadButton } from "@/components/tiptap-ui/image-download-button"
import { ImageAlignButton } from "@/components/tiptap-ui/image-align-button"

// --- UI Primitive ---
import { Separator } from "@/components/tiptap-ui-primitive/separator"
import { ImageCaptionButton } from "@/components/tiptap-ui/image-caption-button"
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button"
import { RefreshCcwIcon } from "@/components/tiptap-icons/refresh-ccw-icon"
import { imageReplaceLabel } from "@/tiptap-i18n"
import { usePapyroTiptapLanguage } from "@/tiptap-react/runtime-context"

export function ImageNodeFloating({
  editor: providedEditor,
}: {
  editor?: Editor | null
}) {
  const { editor } = useTiptapEditor(providedEditor)
  const language = usePapyroTiptapLanguage()
  const visible = isNodeTypeSelected(editor, ["image"])
  const replaceLabel = imageReplaceLabel(language)

  if (!editor || !visible) {
    return null
  }

  return (
    <>
      <ImageAlignButton align="left" />
      <ImageAlignButton align="center" />
      <ImageAlignButton align="right" />
      <Separator />
      <ImageCaptionButton />
      <Separator />
      <ImageDownloadButton />
      <ImageUploadButton
        icon={RefreshCcwIcon}
        aria-label={replaceLabel}
        tooltip={replaceLabel}
      />
      <Separator />
      <DeleteNodeButton />
    </>
  )
}
