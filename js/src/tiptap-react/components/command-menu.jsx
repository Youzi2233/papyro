import React, { useMemo, useRef, useState } from "react";

import { PAPYRO_CALLOUT_KIND_OPTIONS } from "../../tiptap-markdown-snippets.js";
import {
  calloutOptionLabel,
  insertBlockMenuTitleLabel,
  insertTableLabel,
  localizeCalloutKindOption,
  markdownCommandsLabel,
  noCommandsLabel,
  slashQueryMenuTitleLabel,
  tableSizeLabel,
} from "../../tiptap-i18n.js";
import {
  commandElementId,
} from "../../tiptap-ui-primitives.js";
import {
  commandMenuSidePanel,
  groupCommandsForMenu,
} from "../commands/command-menu-model.js";

const TABLE_GRID_ROWS = 6;
const TABLE_GRID_COLS = 6;

function preventMenuPointer(event) {
  event.preventDefault();
  event.stopPropagation();
}

function usePointerActivation(run) {
  const pointerHandled = useRef(false);

  return {
    onPointerDown(event) {
      preventMenuPointer(event);
      pointerHandled.current = run() !== false;
    },
    onClick(event) {
      preventMenuPointer(event);
      if (!pointerHandled.current) {
        run();
      }
      pointerHandled.current = false;
    },
    onMouseDown(event) {
      event.preventDefault();
    },
    onAuxClick(event) {
      preventMenuPointer(event);
      pointerHandled.current = false;
    },
    onContextMenu(event) {
      preventMenuPointer(event);
      pointerHandled.current = false;
    },
  };
}

function CommandIcon({ icon }) {
  return (
    <span
      className={`mn-tiptap-slash-menu-icon ${icon ?? "paragraph"}`}
      aria-hidden="true"
      data-icon={icon ?? "paragraph"}
    />
  );
}

function CommandItem({ command, ownerId, selected, activate, choose }) {
  const activation = usePointerActivation(() => choose(command.id));

  return (
    <button
      type="button"
      id={commandElementId(ownerId, command.index)}
      className={`mn-tiptap-slash-menu-item${selected ? " active" : ""}`}
      role="option"
      aria-selected={String(selected)}
      data-command-id={command.id}
      data-command-index={String(command.index)}
      data-group={command.group ?? ""}
      tabIndex={-1}
      onPointerEnter={() => activate(command.index, { scroll: false })}
      onFocus={() => activate(command.index, { scroll: true })}
      {...activation}
    >
      <CommandIcon icon={command.icon} />
      <span className="mn-tiptap-slash-menu-copy">
        <span className="mn-tiptap-slash-menu-title">{command.title}</span>
        <span className="mn-tiptap-slash-menu-description">
          {command.description ?? ""}
        </span>
      </span>
    </button>
  );
}

function TableSizePicker({ language, choose }) {
  const [size, setSize] = useState({ rows: 3, cols: 2 });

  return (
    <div className="mn-tiptap-table-size-picker">
      <div className="mn-tiptap-table-size-picker-label">
        {tableSizeLabel(language, size.rows, size.cols)}
      </div>
      <div className="mn-tiptap-table-size-picker-grid">
        {Array.from({ length: TABLE_GRID_ROWS }, (_, rowIndex) =>
          Array.from({ length: TABLE_GRID_COLS }, (_, colIndex) => (
            <TableSizePickerCell
              key={`${rowIndex + 1}-${colIndex + 1}`}
              rows={rowIndex + 1}
              cols={colIndex + 1}
              active={rowIndex + 1 <= size.rows && colIndex + 1 <= size.cols}
              language={language}
              choose={choose}
              setSize={setSize}
            />
          )),
        )}
      </div>
    </div>
  );
}

function TableSizePickerCell({
  rows,
  cols,
  active,
  language,
  choose,
  setSize,
}) {
  const activation = usePointerActivation(() =>
    choose("table", { tableSize: { rows, cols } }),
  );

  return (
    <button
      type="button"
      className={`mn-tiptap-table-size-picker-cell${active ? " active" : ""}`}
      data-row={String(rows)}
      data-col={String(cols)}
      aria-label={insertTableLabel(language, rows, cols)}
      onPointerEnter={() => setSize({ rows, cols })}
      {...activation}
    />
  );
}

function CalloutKindPicker({ language, choose }) {
  return (
    <div className="mn-tiptap-callout-kind-picker">
      {PAPYRO_CALLOUT_KIND_OPTIONS.map((option) => (
        <CalloutKindOption
          key={option.kind}
          option={option}
          language={language}
          choose={choose}
        />
      ))}
    </div>
  );
}

function CalloutKindOption({ option, language, choose }) {
  const localizedOption = localizeCalloutKindOption(option, language);
  const activation = usePointerActivation(() =>
    choose("callout", { calloutKind: option.kind }),
  );

  return (
    <button
      type="button"
      className="mn-tiptap-callout-kind-option"
      data-callout-kind={option.kind}
      aria-label={calloutOptionLabel(language, localizedOption.title)}
      {...activation}
    >
      <span className="mn-tiptap-callout-kind-tone" aria-hidden="true" />
      <span className="mn-tiptap-callout-kind-copy">
        <span className="mn-tiptap-callout-kind-title">
          {localizedOption.title}
        </span>
        <span className="mn-tiptap-callout-kind-description">
          {localizedOption.description}
        </span>
      </span>
    </button>
  );
}

export function PapyroSlashCommandMenu({
  ownerId,
  state,
  language = "english",
}) {
  const commands = state?.commands ?? [];
  const selectedIndex = state?.selectedIndex ?? 0;
  const selectedCommand = commands[selectedIndex] ?? null;
  const sidePanel = commandMenuSidePanel(selectedCommand);
  const groups = useMemo(() => groupCommandsForMenu(commands), [commands]);
  const title = state?.cleanupRangeOnClose
    ? insertBlockMenuTitleLabel(language)
    : slashQueryMenuTitleLabel(language, state?.query ?? "");

  return (
    <>
      <div className="mn-tiptap-slash-menu-header">
        <div className="mn-tiptap-slash-menu-eyebrow">
          {markdownCommandsLabel(language)}
        </div>
        <div className="mn-tiptap-slash-menu-heading">{title}</div>
      </div>
      <div className="mn-tiptap-slash-menu-list">
        {groups.map((group) => (
          <section
            key={group.name}
            className="mn-tiptap-slash-menu-section"
            role="group"
            aria-label={group.name}
          >
            <div className="mn-tiptap-slash-menu-section-title">
              {group.name}
            </div>
            {group.commands.map((command) => (
              <CommandItem
                key={command.id}
                command={command}
                ownerId={ownerId}
                selected={command.index === selectedIndex}
                activate={state.activate}
                choose={state.choose}
              />
            ))}
          </section>
        ))}
      </div>
      <div
        className={`mn-tiptap-slash-menu-empty${commands.length > 0 ? " hidden" : ""}`}
      >
        {noCommandsLabel(language)}
      </div>
      {sidePanel === "table" ? (
        <TableSizePicker language={language} choose={state.choose} />
      ) : null}
      {sidePanel === "callout" ? (
        <CalloutKindPicker language={language} choose={state.choose} />
      ) : null}
    </>
  );
}
