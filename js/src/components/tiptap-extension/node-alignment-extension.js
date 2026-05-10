import { Extension } from "@tiptap/core"
import { getSelectedNodesOfType } from "@/lib/tiptap-utils"
import { updateNodesAttr } from "@/lib/tiptap-utils"

function getToggleValue(targets, attributeName, inputValue) {
  if (targets.length === 0) return null

  for (const target of targets) {
    const currentValue = target.node.attrs?.[attributeName] ?? null
    if (currentValue !== inputValue) {
      return inputValue
    }
  }
  return null
}

export const NodeAlignment = Extension.create({
  name: "nodeAlignment",

  addOptions() {
    return {
      types: ["paragraph", "heading", "blockquote", "tableCell", "tableHeader"],
      useStyle: true,
      textAlignValues: ["left", "center", "right", "justify"],
      verticalAlignValues: ["top", "middle", "bottom"],
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          nodeTextAlign: {
            default: null,

            parseHTML: (element) => {
              const styleAlign = element.style?.textAlign
              if (
                styleAlign &&
                this.options.textAlignValues.includes(styleAlign)
              ) {
                return styleAlign
              }

              const dataAlign = element.getAttribute("data-node-text-align")
              if (
                dataAlign &&
                this.options.textAlignValues.includes(dataAlign)
              ) {
                return dataAlign
              }
              return null
            },

            renderHTML: (attributes) => {
              const align = attributes.nodeTextAlign
              if (!align || !this.options.textAlignValues.includes(align))
                return {}

              if (this.options.useStyle) {
                return { style: `text-align: ${align}` }
              } else {
                return { "data-node-text-align": align }
              }
            },
          },

          nodeVerticalAlign: {
            default: null,

            parseHTML: (element) => {
              const styleVAlign = element.style?.verticalAlign
              if (
                styleVAlign &&
                this.options.verticalAlignValues.includes(styleVAlign)
              ) {
                return styleVAlign
              }
              const dataVAlign = element.getAttribute("data-node-vertical-align")
              if (
                dataVAlign &&
                this.options.verticalAlignValues.includes(dataVAlign)
              ) {
                return dataVAlign
              }
              return null
            },

            renderHTML: (attributes) => {
              const vAlign = attributes.nodeVerticalAlign
              if (!vAlign || !this.options.verticalAlignValues.includes(vAlign))
                return {}

              if (this.options.useStyle) {
                return { style: `vertical-align: ${vAlign}` }
              } else {
                return { "data-node-vertical-align": vAlign }
              }
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const executeAlignmentCommand = (
      attributeName,
      getTargetValue
    ) => {
      return (inputValue) =>
        ({
          state,
          tr
        }) => {
          const targets = getSelectedNodesOfType(state.selection, this.options.types)
          if (targets.length === 0) return false
          const targetValue = getTargetValue(targets, inputValue)
          return updateNodesAttr(tr, targets, attributeName, targetValue);
        };
    }

    return {
      // TEXT ALIGN
      setNodeTextAlign: executeAlignmentCommand("nodeTextAlign", (_, inputValue) => {
        if (!inputValue || !this.options.textAlignValues.includes(inputValue))
          return null
        return inputValue
      }),
      unsetNodeTextAlign: executeAlignmentCommand("nodeTextAlign", () => null),
      toggleNodeTextAlign: executeAlignmentCommand("nodeTextAlign", (targets, inputValue) => {
        if (!inputValue || !this.options.textAlignValues.includes(inputValue))
          return null
        return getToggleValue(targets, "nodeTextAlign", inputValue);
      }),

      // VERTICAL ALIGN
      setNodeVAlign: executeAlignmentCommand("nodeVerticalAlign", (_, inputValue) => {
        if (
          !inputValue ||
          !this.options.verticalAlignValues.includes(inputValue)
        )
          return null
        return inputValue
      }),
      unsetNodeVAlign: executeAlignmentCommand("nodeVerticalAlign", () => null),
      toggleNodeVAlign: executeAlignmentCommand("nodeVerticalAlign", (targets, inputValue) => {
        if (
          !inputValue ||
          !this.options.verticalAlignValues.includes(inputValue)
        )
          return null
        return getToggleValue(targets, "nodeVerticalAlign", inputValue);
      }),

      // BOTH
      setNodeAlignment:
        (textAlign, verticalAlign) =>
        ({
          state,
          tr
        }) => {
          const targets = getSelectedNodesOfType(state.selection, this.options.types)
          if (targets.length === 0) return false

          let hasChanges = false

          for (const { node, pos } of targets) {
            const newAttrs = { ...node.attrs }

            if (textAlign && this.options.textAlignValues.includes(textAlign)) {
              newAttrs.nodeTextAlign = textAlign
              hasChanges = true
            }

            if (
              verticalAlign &&
              this.options.verticalAlignValues.includes(verticalAlign)
            ) {
              newAttrs.nodeVerticalAlign = verticalAlign
              hasChanges = true
            }

            if (hasChanges) tr.setNodeMarkup(pos, undefined, newAttrs)
          }

          return hasChanges
        },

      unsetNodeAlignment:
        () =>
        ({
          state,
          tr
        }) => {
          const targets = getSelectedNodesOfType(state.selection, this.options.types)
          if (targets.length === 0) return false

          let hasChanges = false

          for (const { node, pos } of targets) {
            const hasText = node.attrs?.nodeTextAlign ?? null
            const hasV = node.attrs?.nodeVerticalAlign ?? null

            if (hasText || hasV) {
              const newAttrs = {
                ...node.attrs,
                nodeTextAlign: null,
                nodeVerticalAlign: null,
              }
              tr.setNodeMarkup(pos, undefined, newAttrs)
              hasChanges = true
            }
          }

          return hasChanges
        },
    };
  },
})
