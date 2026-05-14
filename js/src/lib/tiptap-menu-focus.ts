import type { Editor } from "@tiptap/react"

const RESTORE_DELAYS_MS = [0, 16, 48, 120, 240]

function activeElementFor(editor: Editor): Element | null {
  const root = editor.view.root
  return "activeElement" in root ? root.activeElement : null
}

function focusEditorView(editor: Editor): boolean {
  const view = editor.view
  const dom = view.dom
  const win = dom.ownerDocument.defaultView
  if (!win || !dom.isConnected) return false

  const selection = editor.state.selection

  try {
    dom.focus({ preventScroll: true })
  } catch {
    dom.focus()
  }

  if (dom.ownerDocument.activeElement !== dom && typeof dom.click === "function") {
    dom.click()
  }

  if (dom.ownerDocument.activeElement !== dom && typeof dom.dispatchEvent === "function") {
    dom.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    dom.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, cancelable: true }))
  }

  if (dom.ownerDocument.activeElement !== dom) {
    editor.commands.focus(selection.from, { scrollIntoView: false })
  }

  view.focus()
  return activeElementFor(editor) === dom
}

export function restoreEditorFocusAfterFloatingMenu(
  editor: Editor | null | undefined
) {
  if (!editor) return

  const win = editor.view.dom.ownerDocument.defaultView
  let attempt = 0

  const run = () => {
    if (editor.isDestroyed) return
    if (focusEditorView(editor)) return

    attempt += 1
    const delay = RESTORE_DELAYS_MS[attempt]
    if (delay === undefined) return

    win?.setTimeout(run, delay)
  }

  if (typeof win?.requestAnimationFrame === "function") {
    win.requestAnimationFrame(run)
  } else {
    win?.setTimeout(run, 0)
  }
}
