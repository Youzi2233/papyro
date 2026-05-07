import React, { useMemo, useState } from "react";

import {
  PAPYRO_CODE_LANGUAGE_OPTIONS,
  codeBlockLanguageUiLabel,
} from "../../tiptap-code-block.js";
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
  commandMenuSidePanelId,
  commandMenuSidePanel,
  commandMenuGroupTone,
  groupCommandsForMenu,
} from "../commands/command-menu-model.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";
import { CommandMenuIcon } from "./command-icons.jsx";
import { CommandIconFrame, CommandRow, CommandText } from "./primitives.jsx";

const TABLE_GRID_ROWS = 6;
const TABLE_GRID_COLS = 6;

function CommandIcon({ command }) {
  const icon = command?.icon ?? "paragraph";
  const groupTone = commandMenuGroupTone(command);
  return (
    <CommandIconFrame
      className="mn-tiptap-slash-menu-icon"
      icon={icon}
      dataIcon={icon}
      data={{
        "command-group": groupTone,
      }}
    >
      <CommandMenuIcon icon={icon} />
    </CommandIconFrame>
  );
}

function CommandItem({ command, ownerId, selected, activePanel, activate, choose }) {
  const activation = usePointerActivation(() => choose(command.id));
  const panel = commandMenuSidePanel(command);
  const hasSidePanel = panel !== "none";
  const panelId = commandMenuSidePanelId(ownerId, panel);

  return (
    <CommandRow
      ownerId={ownerId}
      index={command.index}
      selected={selected}
      className="mn-tiptap-slash-menu-item"
      role="option"
      tabIndex={-1}
      aria={{
        "aria-selected": String(selected),
        "aria-haspopup": hasSidePanel ? "menu" : undefined,
        "aria-expanded": hasSidePanel ? String(activePanel === panel) : undefined,
        "aria-controls": hasSidePanel ? panelId : undefined,
      }}
      data={{
        "command-id": command.id,
        "command-index": command.index,
        group: command.group ?? "",
        "side-panel": panel,
      }}
      onPointerMove={() => activate(command.index, { scroll: false })}
      onFocus={() => activate(command.index, { scroll: true })}
      activation={activation}
    >
      <CommandIcon command={command} />
      <CommandText
        className="mn-tiptap-slash-menu-copy"
        titleClassName="mn-tiptap-slash-menu-title"
        descriptionClassName="mn-tiptap-slash-menu-description"
        title={command.title}
        description={command.description}
      />
    </CommandRow>
  );
}

function TableSizePicker({ id, language, choose }) {
  const [size, setSize] = useState({ rows: 3, cols: 2 });

  return (
    <div
      id={id}
      className="mn-tiptap-table-size-picker"
      role="menu"
      aria-label={tableSizeLabel(language, size.rows, size.cols)}
    >
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

function CalloutKindPicker({ id, language, choose }) {
  return (
    <div
      id={id}
      className="mn-tiptap-callout-kind-picker"
      role="menu"
    >
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

function CodeLanguagePicker({ id, language, choose }) {
  return (
    <div
      id={id}
      className="mn-tiptap-code-language-picker"
      role="menu"
      aria-label={codeBlockLanguageUiLabel(language, null)}
    >
      {PAPYRO_CODE_LANGUAGE_OPTIONS.map((option) => (
        <CodeLanguageOption
          key={option.id}
          option={option}
          language={language}
          choose={choose}
        />
      ))}
    </div>
  );
}

function CodeLanguageOption({ option, language, choose }) {
  const title = codeBlockLanguageUiLabel(language, option.language);
  const activation = usePointerActivation(() =>
    choose("code-block", { codeLanguage: option.language }),
  );

  return (
    <button
      type="button"
      className="mn-tiptap-code-language-option"
      data-language-id={option.id}
      data-language-value={option.language ?? ""}
      role="menuitem"
      aria-label={title}
      {...activation}
    >
      <span className="mn-tiptap-code-language-option-token" aria-hidden="true">
        {(option.language ?? "auto").slice(0, 2).toUpperCase()}
      </span>
      <span className="mn-tiptap-code-language-option-title">{title}</span>
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
  const sidePanelId = commandMenuSidePanelId(ownerId, sidePanel);
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
                activePanel={sidePanel}
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
        <TableSizePicker id={sidePanelId} language={language} choose={state.choose} />
      ) : null}
      {sidePanel === "callout" ? (
        <CalloutKindPicker id={sidePanelId} language={language} choose={state.choose} />
      ) : null}
      {sidePanel === "code-language" ? (
        <CodeLanguagePicker id={sidePanelId} language={language} choose={state.choose} />
      ) : null}
    </>
  );
}
