import React from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownAZ,
  ArrowDownZA,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Ban,
  Baseline,
  Columns3,
  Copy,
  Eraser,
  Highlighter,
  ListRestart,
  MoveHorizontal,
  MoveVertical,
  PaintBucket,
  Repeat2,
  Rows3,
  Table2,
  TableCellsMerge,
  TableCellsSplit,
  TableProperties,
  Trash2,
} from "lucide-react";

const TABLE_ICON_PROPS = Object.freeze({
  className: "mn-tiptap-table-command-icon-svg",
  size: 14.5,
  strokeWidth: 1.9,
  absoluteStrokeWidth: true,
  "aria-hidden": "true",
  focusable: "false",
});

function TableCommandSvg({ as: Icon }) {
  return <Icon {...TABLE_ICON_PROPS} />;
}

const TABLE_COMMAND_ICONS = Object.freeze({
  "column-left": <TableCommandSvg as={ArrowLeft} />,
  "column-right": <TableCommandSvg as={ArrowRight} />,
  "delete-column": <TableCommandSvg as={Trash2} />,
  "move-column-left": <TableCommandSvg as={MoveHorizontal} />,
  "move-column-right": <TableCommandSvg as={MoveHorizontal} />,
  "sort-rows-asc": <TableCommandSvg as={ArrowDownAZ} />,
  "sort-rows-desc": <TableCommandSvg as={ArrowDownZA} />,
  "duplicate-column": <TableCommandSvg as={Repeat2} />,
  "row-above": <TableCommandSvg as={ArrowUp} />,
  "row-below": <TableCommandSvg as={ArrowDown} />,
  "delete-row": <TableCommandSvg as={Trash2} />,
  "move-row-up": <TableCommandSvg as={MoveVertical} />,
  "move-row-down": <TableCommandSvg as={MoveVertical} />,
  "sort-columns-asc": <TableCommandSvg as={ArrowDownAZ} />,
  "sort-columns-desc": <TableCommandSvg as={ArrowDownZA} />,
  "duplicate-row": <TableCommandSvg as={Repeat2} />,
  merge: <TableCommandSvg as={TableCellsMerge} />,
  split: <TableCommandSvg as={TableCellsSplit} />,
  "copy-cell": <TableCommandSvg as={Copy} />,
  "clear-content": <TableCommandSvg as={Eraser} />,
  "clear-style": <TableCommandSvg as={ListRestart} />,
  "header-row": <TableCommandSvg as={Rows3} />,
  "header-column": <TableCommandSvg as={Columns3} />,
  "header-cell": <TableCommandSvg as={Table2} />,
  "align-left": <TableCommandSvg as={AlignLeft} />,
  "align-center": <TableCommandSvg as={AlignCenter} />,
  "align-right": <TableCommandSvg as={AlignRight} />,
  "text-color-clear": <TableCommandSvg as={Ban} />,
  "text-color-muted": <TableCommandSvg as={Baseline} />,
  "text-color-accent": <TableCommandSvg as={Baseline} />,
  "text-color-danger": <TableCommandSvg as={Baseline} />,
  "color-clear": <TableCommandSvg as={Ban} />,
  "color-yellow": <TableCommandSvg as={Highlighter} />,
  "color-blue": <TableCommandSvg as={PaintBucket} />,
  "color-green": <TableCommandSvg as={PaintBucket} />,
  repair: <TableCommandSvg as={ListRestart} />,
  "delete-table": <TableCommandSvg as={Trash2} />,
});

export function TableCommandIcon({ icon }) {
  return TABLE_COMMAND_ICONS[icon] ?? <TableCommandSvg as={TableProperties} />;
}
