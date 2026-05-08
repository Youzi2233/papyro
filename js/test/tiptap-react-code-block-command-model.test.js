import test from "node:test";
import assert from "node:assert/strict";

import {
  codeBlockLanguagePickerLabel,
  createCodeBlockChromeCommands,
  createCodeBlockLanguageChrome,
  createCodeBlockLanguageCommands,
} from "../src/tiptap-react/commands/code-block-command-model.js";

test("React code block command model exposes stable language commands", () => {
  const commands = createCodeBlockLanguageCommands({
    language: "english",
    currentLanguage: "Rust",
  });

  assert.deepEqual(
    commands.slice(0, 5).map((command) => command.id),
    [
      "code-language-auto",
      "code-language-plaintext",
      "code-language-javascript",
      "code-language-typescript",
      "code-language-rust",
    ],
  );
  assert.equal(commands.find((command) => command.id === "code-language-rust").active, true);
  assert.equal(commands.find((command) => command.id === "code-language-auto").active, false);
  assert.deepEqual(commands.find((command) => command.id === "code-language-javascript"), {
    id: "code-language-javascript",
    optionId: "javascript",
    language: "javascript",
    title: "JavaScript",
    description: "Highlight this block as JavaScript",
    group: "Code language",
    groupKey: "Code language",
    icon: "code-language",
    token: "JS",
    active: false,
    disabled: false,
    meta: {
      codeLanguage: "javascript",
    },
  });
});

test("React code block command model marks auto and custom languages", () => {
  const autoCommands = createCodeBlockLanguageCommands({
    language: "english",
    currentLanguage: null,
  });
  assert.equal(autoCommands.find((command) => command.id === "code-language-auto").active, true);

  const customCommands = createCodeBlockLanguageCommands({
    language: "english",
    currentLanguage: "ts-node",
  });
  assert.deepEqual(customCommands.at(-1), {
    id: "code-language-custom-ts-node",
    optionId: "ts-node",
    language: "ts-node",
    title: "ts-node",
    description: "Custom language detected from Markdown",
    group: "Code language",
    groupKey: "Code language",
    icon: "code-language",
    token: "TS-",
    active: true,
    disabled: true,
    meta: {
      codeLanguage: "ts-node",
      custom: true,
    },
  });

  assert.equal(
    createCodeBlockLanguageCommands({
      currentLanguage: "ts-node",
      includeCustom: false,
    }).some((command) => command.id === "code-language-custom-ts-node"),
    false,
  );
});

test("React code block language chrome exposes explicit and auto-detected states", () => {
  assert.deepEqual(createCodeBlockLanguageChrome({
    language: "english",
    currentLanguage: "Rust",
  }), {
    command: createCodeBlockLanguageCommands({
      language: "english",
      currentLanguage: "rust",
    }).find((command) => command.id === "code-language-rust"),
    label: "Rust",
    title: "Change code language: Rust",
    ariaLabel: "Change code language: Rust",
    token: "RS",
    language: "rust",
    value: "rust",
    mode: "explicit",
    detectedLanguage: "",
    optionId: "rust",
  });

  const autoChrome = createCodeBlockLanguageChrome({
    language: "english",
    currentLanguage: null,
    detectedLanguage: "javascript",
  });

  assert.equal(autoChrome.command.id, "code-language-auto");
  assert.equal(autoChrome.label, "Auto \u00b7 JavaScript");
  assert.equal(autoChrome.title, "Change code language: Auto \u00b7 JavaScript");
  assert.equal(autoChrome.token, "AU");
  assert.equal(autoChrome.language, null);
  assert.equal(autoChrome.value, "javascript");
  assert.equal(autoChrome.mode, "auto");
  assert.equal(autoChrome.detectedLanguage, "javascript");
  assert.equal(autoChrome.optionId, "auto");
});

test("React code block command model localizes language and chrome commands", () => {
  const languageCommands = createCodeBlockLanguageCommands({
    language: "Chinese",
    currentLanguage: "plaintext",
  });
  const plaintext = languageCommands.find((command) => command.id === "code-language-plaintext");

  assert.equal(codeBlockLanguagePickerLabel("Chinese"), "\u4ee3\u7801\u8bed\u8a00");
  assert.equal(plaintext.title, "\u7eaf\u6587\u672c");
  assert.equal(plaintext.active, true);
  assert.equal(plaintext.token, "TXT");

  const chrome = createCodeBlockChromeCommands({
    language: "Chinese",
    wrapped: true,
    copyState: "copied",
  });
  assert.deepEqual(
    chrome.map((command) => ({
      id: command.id,
      title: command.title,
      group: command.group,
      active: command.active,
      pressed: command.pressed,
      state: command.state,
    })),
    [
      {
        id: "copy-code",
        title: "\u5df2\u590d\u5236",
        group: "\u4ee3\u7801\u5757",
        active: true,
        pressed: undefined,
        state: "copied",
      },
      {
        id: "toggle-code-wrap",
        title: "\u5173\u95ed\u81ea\u52a8\u6362\u884c",
        group: "\u4ee3\u7801\u5757",
        active: true,
        pressed: true,
        state: undefined,
      },
    ],
  );
});

test("React code block chrome commands normalize copy and wrap state", () => {
  const commands = createCodeBlockChromeCommands({
    language: "english",
    wrapped: false,
    copyState: "unknown",
  });

  assert.deepEqual(commands.map((command) => command.id), [
    "copy-code",
    "toggle-code-wrap",
  ]);
  assert.equal(commands[0].title, "Copy code");
  assert.equal(commands[0].state, "idle");
  assert.equal(commands[0].meta.action, "copy");
  assert.equal(commands[1].title, "Wrap lines");
  assert.equal(commands[1].active, false);
  assert.equal(commands[1].pressed, false);
  assert.equal(commands[1].meta.action, "wrap");
});
