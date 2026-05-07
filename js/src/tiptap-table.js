import { TableKit } from "@tiptap/extension-table";
import { Extension } from "@tiptap/core";

function parseCellBackgroundColor(element) {
  return (
    element.getAttribute("data-cell-background") ||
    element.style.backgroundColor ||
    null
  );
}

function renderCellBackgroundColor(attributes) {
  if (!attributes.backgroundColor) return {};
  return {
    "data-cell-background": attributes.backgroundColor,
    style: `background-color: ${attributes.backgroundColor}`,
  };
}

function createPapyroCellAttributes() {
  return {
    backgroundColor: {
      default: null,
      parseHTML: parseCellBackgroundColor,
      renderHTML: renderCellBackgroundColor,
    },
  };
}

export const PapyroTableCellBackground = Extension.create({
  name: "papyroTableCellBackground",

  addGlobalAttributes() {
    return [
      {
        types: ["tableCell", "tableHeader"],
        attributes: createPapyroCellAttributes(),
      },
    ];
  },
});

export function createPapyroTableExtensions() {
  return [
    TableKit.configure({
      table: {
        HTMLAttributes: {
          class: "mn-tiptap-table",
        },
        resizable: true,
        handleWidth: 6,
        cellMinWidth: 96,
        lastColumnResizable: true,
        allowTableNodeSelection: false,
      },
      tableRow: {
        HTMLAttributes: {
          class: "mn-tiptap-table-row",
        },
      },
      tableHeader: {
        HTMLAttributes: {
          class: "mn-tiptap-table-header",
        },
      },
      tableCell: {
        HTMLAttributes: {
          class: "mn-tiptap-table-cell",
        },
      },
    }),
    PapyroTableCellBackground,
  ];
}
