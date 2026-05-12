import { Extension } from "@tiptap/core"
import {
  TableHandlePlugin,
  tableHandlePluginKey,
} from "./table-handle-plugin"

export {
  colDragStart,
  rowDragStart,
  dragEnd,
} from "./table-handle-plugin"

export const TableHandleExtension = Extension.create({
  name: "tableHandleExtension",

  addCommands() {
    return {
      freezeHandles:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(tableHandlePluginKey, true)
          return true
        },

      unfreezeHandles:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(tableHandlePluginKey, false)
          return true
        },
    };
  },

  addProseMirrorPlugins() {
    const { editor } = this
    return [
      TableHandlePlugin(editor, (state) => {
        this.editor.emit("tableHandleState", state)
      }),
    ];
  },
})
