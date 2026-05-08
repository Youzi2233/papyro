import React from "react";

import {
  addColumnRightLabel,
  addRowBelowLabel,
  insertBlockAfterLabel,
  selectTableColumnLabel,
  selectTableRowLabel,
  tableCellActionsLabel,
  tableSelectionActionsLabel,
} from "../../tiptap-i18n.js";
import {
  createComplexBlockInsertChromeState,
  createTableAxisHandleChromeState,
  createTableCellMenuTriggerChromeState,
  createTableQuickAddChromeState,
  createTableSelectionBackdropChromeState,
} from "../../tiptap-table-chrome-model.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";

const TABLE_AXIS_HANDLE_SIZE = 12;
export const REACT_TABLE_ROW_HANDLE_WIDTH = 20;
export const REACT_TABLE_COLUMN_HANDLE_HEIGHT = 20;
const TABLE_ADD_ROW_HEIGHT = 14;
const TABLE_ADD_COLUMN_WIDTH = 14;

function px(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number}px` : undefined;
}

function fixedRectStyle(rect) {
  return {
    left: px(rect?.left),
    top: px(rect?.top),
    width: px(rect?.width),
    height: px(rect?.height),
  };
}

function tableQuickAddStyle(chrome) {
  const style = fixedRectStyle(chrome);
  style["--mn-table-quick-add-rail"] = px(chrome?.rail);
  return style;
}

function chromeVisibilityProps(visible) {
  const isVisible = Boolean(visible);
  return {
    "aria-hidden": isVisible ? undefined : "true",
    "data-visible": isVisible ? "true" : "false",
    tabIndex: isVisible ? undefined : -1,
  };
}

function TableQuickAddButton({ chrome, label, onRun }) {
  const activation = usePointerActivation(() => {
    if (!chrome || chrome.disabled) return false;
    return onRun?.(chrome.commandId) !== false;
  });
  if (!chrome) return null;

  const className = [
    "mn-tiptap-table-quick-add",
    chrome.edge === "row" ? "mn-tiptap-table-add-row" : "mn-tiptap-table-add-column",
    chrome.visible ? null : "hidden",
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={className}
      title={label}
      aria-label={label}
      disabled={chrome.disabled}
      aria-disabled={chrome.disabled ? "true" : "false"}
      data-edge={chrome.edge}
      data-disabled={chrome.disabled ? "true" : "false"}
      {...chromeVisibilityProps(chrome.visible)}
      style={tableQuickAddStyle(chrome)}
      {...activation}
    />
  );
}

function TableCellMenuTrigger({ state, onOpenCellMenu }) {
  const triggerState = createTableCellMenuTriggerChromeState(state);
  const trigger = triggerState.trigger;
  const selectionKind = state?.selection?.kind ?? "cell";
  const label =
    selectionKind === "cells"
      ? tableSelectionActionsLabel(state?.language)
      : tableCellActionsLabel(state?.language);
  const activation = usePointerActivation(() =>
    onOpenCellMenu?.("context", {
      anchorRect: trigger,
      cell: state?.hover?.cell ?? state?.cell ?? null,
    }) !== false,
  );

  if (!trigger) return null;

  return (
    <button
      type="button"
      className={[
        "mn-tiptap-table-cell-menu-trigger",
        triggerState.visible ? null : "hidden",
      ].filter(Boolean).join(" ")}
      title={label}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={state?.menuOpen ? "true" : "false"}
      data-open={state?.menuOpen ? "true" : "false"}
      data-placement={trigger.placement}
      data-edge-intent={triggerState.edgeIntent ? "true" : "false"}
      data-selection-kind={selectionKind}
      data-selected-count={String(triggerState.selectedCount)}
      {...chromeVisibilityProps(triggerState.visible)}
      style={{
        left: px(trigger.left),
        top: px(trigger.top),
      }}
      {...activation}
    />
  );
}

function TableComplexBlockInsert({ chrome, label, onInsert }) {
  const activation = usePointerActivation(() =>
    onInsert?.(chrome?.block) !== false,
  );
  if (!chrome?.block || !chrome.rect) return null;

  return (
    <button
      type="button"
      className={[
        "mn-tiptap-complex-block-insert",
        chrome.visible ? null : "hidden",
      ].filter(Boolean).join(" ")}
      title={label}
      aria-label={label}
      data-edge="after-block"
      data-block-kind={chrome.blockKind}
      {...chromeVisibilityProps(chrome.visible)}
      style={{
        left: px(chrome.rect.left),
        top: px(chrome.rect.top),
        width: px(chrome.rect.width),
      }}
      {...activation}
    />
  );
}

function TableSelectionBackdrop({ chrome }) {
  if (!chrome?.rect) return null;

  return (
    <div
      className={[
        "mn-tiptap-table-selection-backdrop",
        chrome.visible ? null : "hidden",
      ].filter(Boolean).join(" ")}
      aria-hidden="true"
      data-visible={chrome.visible ? "true" : "false"}
      style={fixedRectStyle(chrome.rect)}
    />
  );
}

function TableAxisHandle({ handle, label, onSelectAxis }) {
  const activation = usePointerActivation(() => {
    const anchorRect = {
      left: handle.left,
      top: handle.top,
      right: handle.left + handle.width,
      bottom: handle.top + handle.height,
      width: handle.width,
      height: handle.height,
    };
    const selected = onSelectAxis?.(handle.axis, handle.index) === true;
    if (!selected) return false;
    return onSelectAxis?.("menu", handle.index, anchorRect) !== false;
  });

  return (
    <button
      type="button"
      className={`mn-tiptap-table-axis-handle ${handle.axis}`}
      title={label}
      aria-label={label}
      data-active={handle.active ? "true" : "false"}
      data-axis={handle.axis}
      data-index={String(handle.index)}
      {...chromeVisibilityProps(handle.visible)}
      style={fixedRectStyle(handle)}
      {...activation}
    />
  );
}

export function PapyroTableChrome({ state }) {
  const quickAdd = createTableQuickAddChromeState(state, {
    rowHeight: TABLE_ADD_ROW_HEIGHT,
    columnWidth: TABLE_ADD_COLUMN_WIDTH,
  });
  const insert = createComplexBlockInsertChromeState(state);
  const backdrop = createTableSelectionBackdropChromeState(state);
  const axis = createTableAxisHandleChromeState(state, {
    handleSize: TABLE_AXIS_HANDLE_SIZE,
    rowHandleWidth: REACT_TABLE_ROW_HANDLE_WIDTH,
    columnHandleHeight: REACT_TABLE_COLUMN_HANDLE_HEIGHT,
  });
  const language = state?.language;
  const run = (commandId) => state?.run?.(commandId);
  const selectAxis = (axisKind, index, anchorRect) => {
    if (axisKind === "menu") {
      return state?.toggleMenu?.("context", { open: true, anchorRect });
    }
    return state?.selectAxis?.(axisKind, index);
  };

  return (
    <>
      <TableSelectionBackdrop chrome={backdrop} />
      <TableQuickAddButton
        chrome={quickAdd.row}
        label={addRowBelowLabel(language)}
        onRun={run}
      />
      <TableQuickAddButton
        chrome={quickAdd.column}
        label={addColumnRightLabel(language)}
        onRun={run}
      />
      <TableCellMenuTrigger
        state={state}
        onOpenCellMenu={state?.openCellMenu}
      />
      <TableComplexBlockInsert
        chrome={insert}
        label={insertBlockAfterLabel(language)}
        onInsert={state?.insertParagraphAfterBlock}
      />
      {axis.rows.map((handle) => (
        <TableAxisHandle
          key={`row-${handle.index}`}
          handle={handle}
          label={selectTableRowLabel(language, handle.index)}
          onSelectAxis={selectAxis}
        />
      ))}
      {axis.columns.map((handle) => (
        <TableAxisHandle
          key={`column-${handle.index}`}
          handle={handle}
          label={selectTableColumnLabel(language, handle.index)}
          onSelectAxis={selectAxis}
        />
      ))}
    </>
  );
}
