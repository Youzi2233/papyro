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
  commandElementId,
} from "../../tiptap-ui-primitives.js";
import {
  commandMenuSidePanelId,
  commandMenuSidePanel,
  groupCommandsForMenu,
} from "../commands/command-menu-model.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";
import { CommandMenuIcon } from "./command-icons.jsx";

const TABLE_GRID_ROWS = 6;
const TABLE_GRID_COLS = 6;

function CommandIcon({ icon }) {
  return (
    <span
      className={`mn-tiptap-slash-menu-icon ${icon ?? "paragraph"}`}
      aria-hidden="true"
      data-icon={icon ?? "paragraph"}
    >
      <CommandMenuIcon icon={icon ?? "paragraph"} />
    </span>
  );
}

function CommandItem({ command, ownerId, selected, activePanel, activate, choose }) {
  const activation = usePointerActivation(() => choose(command.id));
  const panel = commandMenuSidePanel(command);
  const hasSidePanel = panel !== "none";
  const panelId = commandMenuSidePanelId(ownerId, panel);

  return (
    <button
      type="button"
      id={commandElementId(ownerId, command.index)}
      className={`mn-tiptap-slash-menu-item${selected ? " active" : ""}`}
      role="option"
      aria-selected={String(selected)}
      aria-haspopup={hasSidePanel ? "menu" : undefined}
      aria-expanded={hasSidePanel ? String(activePanel === panel) : undefined}
      aria-controls={hasSidePanel ? panelId : undefined}
      data-command-id={command.id}
      data-command-index={String(command.index)}
      data-group={command.group ?? ""}
      data-side-panel={panel}
      tabIndex={-1}
      onPointerMove={() => activate(command.index, { scroll: false })}
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
