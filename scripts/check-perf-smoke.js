#!/usr/bin/env node

const fs = require("node:fs");

const TRACE_NAMES = [
  "perf app dispatch action",
  "perf editor pane render prep",
  "perf editor open markdown",
  "perf editor switch tab",
  "perf editor view mode change",
  "perf editor outline extract",
  "perf editor command set_view_mode",
  "perf editor command set_preferences",
  "perf editor input change",
  "perf editor preview render",
  "perf editor host lifecycle",
  "perf editor host destroy",
  "perf editor stale bridge cleanup",
  "perf chrome toggle sidebar",
  "perf chrome resize sidebar",
  "perf chrome toggle theme",
  "perf chrome open modal",
  "perf workspace search",
  "perf tab close trigger",
  "perf runtime close_tab handler",
];

const REQUIRED_SMOKE_TRACES = [
  "perf app dispatch action",
  "perf editor pane render prep",
  "perf editor open markdown",
  "perf editor switch tab",
  "perf editor view mode change",
  "perf editor command set_view_mode",
  "perf editor input change",
  "perf editor preview render",
  "perf chrome toggle sidebar",
  "perf chrome resize sidebar",
  "perf chrome toggle theme",
  "perf chrome open modal",
  "perf workspace search",
  "perf tab close trigger",
  "perf runtime close_tab handler",
];

const REQUIRED_CONTEXT_FIELDS = [
  "window_id",
  "interaction_path",
  "tab_id",
  "revision",
  "view_mode",
  "content_bytes",
  "trigger_reason",
];

const REQUIRED_INPUT_HYBRID_FIELDS = [
  "hybrid_block_kind",
  "hybrid_block_state",
  "hybrid_block_tier",
  "hybrid_fallback_reason",
];

const STATIC_BUDGETS_MS = new Map([
  ["perf app dispatch action", 50],
  ["perf editor pane render prep", 50],
  ["perf editor view mode change", 100],
  ["perf editor command set_view_mode", 100],
  ["perf editor command set_preferences", 50],
  ["perf editor host lifecycle", 50],
  ["perf editor stale bridge cleanup", 80],
  ["perf chrome toggle sidebar", 50],
  ["perf chrome resize sidebar", 50],
  ["perf chrome toggle theme", 50],
  ["perf chrome open modal", 50],
  ["perf workspace search", 500],
  ["perf tab close trigger", 80],
  ["perf runtime close_tab handler", 80],
]);

const OPEN_BUDGETS_MS = [
  { maxBytes: 128 * 1024, budgetMs: 250 },
  { maxBytes: 1280 * 1024, budgetMs: 800 },
  { maxBytes: Number.POSITIVE_INFINITY, budgetMs: 2500 },
];

const SWITCH_BUDGETS_MS = [
  { maxBytes: 128 * 1024, budgetMs: 80 },
  { maxBytes: 1280 * 1024, budgetMs: 150 },
  { maxBytes: Number.POSITIVE_INFINITY, budgetMs: 300 },
];

const INPUT_BUDGETS_MS = [
  { maxBytes: 128 * 1024, budgetMs: 16 },
  { maxBytes: 1280 * 1024, budgetMs: 32 },
  { maxBytes: Number.POSITIVE_INFINITY, budgetMs: 50 },
];

const PREVIEW_BUDGETS_MS = [
  { maxBytes: 128 * 1024, budgetMs: 200 },
  { maxBytes: 1280 * 1024, budgetMs: 1000 },
  { maxBytes: Number.POSITIVE_INFINITY, budgetMs: 150 },
];

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  if (args.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const logPath = args[0];
  if (!logPath) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const log = fs.readFileSync(logPath, "utf8");
  const records = parseRecords(log);
  const result = validateRecords(records, { requireSmokeTraces: true });

  printSummary(records, result);
  process.exitCode = result.errors.length > 0 ? 1 : 0;
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-perf-smoke.js --self-test
  node scripts/check-perf-smoke.js <perf-trace.log>

Capture a manual smoke log with PAPYRO_PERF=1, then pass the log file here.
The checker validates required trace context fields and the interaction budgets
from docs/performance-budget.md.`);
}

function parseRecords(log) {
  return log
    .split(/\r?\n/)
    .map((line, index) => parseRecordLine(line, index + 1))
    .filter(Boolean);
}

function parseRecordLine(line, lineNumber) {
  const traceName = TRACE_NAMES.find((name) => line.includes(name));
  if (!traceName) {
    return null;
  }

  return {
    line,
    lineNumber,
    traceName,
    fields: parseFields(line),
  };
}

function parseFields(line) {
  const fields = new Map();
  const fieldPattern = /([A-Za-z_][A-Za-z0-9_]*)=("(?:\\.|[^"])*"|[^\s,}]+)/g;
  let match;

  while ((match = fieldPattern.exec(line)) !== null) {
    fields.set(match[1], normalizeFieldValue(match[2]));
  }

  return fields;
}

function normalizeFieldValue(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  return value;
}

function validateRecords(records, options) {
  const errors = [];
  const warnings = [];

  if (records.length === 0) {
    errors.push("No Papyro perf trace records were found.");
    return { errors, warnings };
  }

  for (const traceName of options.requireSmokeTraces ? REQUIRED_SMOKE_TRACES : []) {
    if (!records.some((record) => record.traceName === traceName)) {
      errors.push(`Missing required smoke trace: ${traceName}`);
    }
  }

  for (const record of records) {
    for (const field of REQUIRED_CONTEXT_FIELDS) {
      if (!record.fields.has(field)) {
        errors.push(
          `Line ${record.lineNumber} (${record.traceName}) is missing ${field}`,
        );
      }
    }
    if (record.traceName === "perf editor input change") {
      for (const field of REQUIRED_INPUT_HYBRID_FIELDS) {
        if (!record.fields.has(field)) {
          errors.push(
            `Line ${record.lineNumber} (${record.traceName}) is missing ${field}`,
          );
        }
      }
    }
    if (
      record.traceName === "perf editor view mode change" &&
      !record.fields.has("hybrid_render_gate")
    ) {
      errors.push(
        `Line ${record.lineNumber} (${record.traceName}) is missing hybrid_render_gate`,
      );
    }

    const budget = budgetForRecord(record);
    if (budget === null) {
      continue;
    }

    const elapsedMs = numberField(record, "elapsed_ms");
    if (elapsedMs === null) {
      errors.push(
        `Line ${record.lineNumber} (${record.traceName}) is missing elapsed_ms`,
      );
      continue;
    }

    if (elapsedMs > budget) {
      errors.push(
        `Line ${record.lineNumber} (${record.traceName}) took ${elapsedMs}ms, budget ${budget}ms`,
      );
    }
  }

  const largePreviewViolations = records.filter(
    (record) =>
      record.traceName === "perf editor preview render" &&
      numberField(record, "content_bytes") > 1280 * 1024 &&
      record.fields.get("live_preview") !== "false",
  );

  for (const record of largePreviewViolations) {
    errors.push(
      `Line ${record.lineNumber} renders live preview for a large document; expected degraded preview`,
    );
  }

  if (options.requireSmokeTraces) {
    validateHybridCoverage(records, errors);
  }

  return { errors, warnings };
}

function validateHybridCoverage(records, errors) {
  const hybridInputs = records.filter(
    (record) =>
      record.traceName === "perf editor input change" &&
      record.fields.get("view_mode") === "hybrid",
  );
  const hasBlockEditingInput = hybridInputs.some((record) => {
    const kind = record.fields.get("hybrid_block_kind");
    return (
      record.fields.get("hybrid_block_state") === "editing" &&
      kind !== "none" &&
      kind !== "source_fallback"
    );
  });
  const hasSourceFallbackInput = hybridInputs.some(
    (record) =>
      record.fields.get("hybrid_block_state") === "source_fallback" ||
      record.fields.get("hybrid_fallback_reason") !== "none",
  );

  if (!hasBlockEditingInput) {
    errors.push("Missing Hybrid block editing input trace.");
  }
  if (!hasSourceFallbackInput) {
    errors.push("Missing Hybrid source_fallback input trace.");
  }

  const hybridModeChanges = records.filter(
    (record) =>
      record.traceName === "perf editor view mode change" &&
      record.fields.get("to") === "hybrid",
  );
  if (
    !hybridModeChanges.some(
      (record) => record.fields.get("hybrid_render_gate") === "block_hints",
    )
  ) {
    errors.push("Missing Hybrid view mode trace with block_hints gate.");
  }
  if (
    !hybridModeChanges.some(
      (record) => record.fields.get("hybrid_render_gate") === "source_fallback",
    )
  ) {
    errors.push("Missing Hybrid view mode trace with source_fallback gate.");
  }
}

function budgetForRecord(record) {
  if (record.traceName === "perf editor open markdown") {
    return sizeBudget(numberField(record, "content_bytes"), OPEN_BUDGETS_MS);
  }

  if (record.traceName === "perf editor switch tab") {
    return sizeBudget(numberField(record, "content_bytes"), SWITCH_BUDGETS_MS);
  }

  if (record.traceName === "perf editor input change") {
    return sizeBudget(numberField(record, "content_bytes"), INPUT_BUDGETS_MS);
  }

  if (record.traceName === "perf editor preview render") {
    return sizeBudget(numberField(record, "content_bytes"), PREVIEW_BUDGETS_MS);
  }

  return STATIC_BUDGETS_MS.get(record.traceName) ?? null;
}

function sizeBudget(contentBytes, budgetTable) {
  if (contentBytes === null || contentBytes < 0) {
    return budgetTable[0].budgetMs;
  }

  return budgetTable.find((entry) => contentBytes <= entry.maxBytes).budgetMs;
}

function numberField(record, fieldName) {
  if (!record.fields.has(fieldName)) {
    return null;
  }

  const value = Number(record.fields.get(fieldName));
  return Number.isFinite(value) ? value : null;
}

function printSummary(records, result) {
  const grouped = new Map();
  for (const record of records) {
    const elapsedMs = numberField(record, "elapsed_ms");
    const current = grouped.get(record.traceName) ?? {
      count: 0,
      maxElapsedMs: null,
    };

    current.count += 1;
    if (elapsedMs !== null) {
      current.maxElapsedMs =
        current.maxElapsedMs === null
          ? elapsedMs
          : Math.max(current.maxElapsedMs, elapsedMs);
    }
    grouped.set(record.traceName, current);
  }

  console.log("Performance smoke trace summary:");
  for (const [traceName, stats] of grouped.entries()) {
    const elapsed =
      stats.maxElapsedMs === null ? "n/a" : `${stats.maxElapsedMs}ms max`;
    console.log(`- ${traceName}: ${stats.count} record(s), ${elapsed}`);
  }

  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (result.errors.length > 0) {
    console.error("\nPerformance smoke failed:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    return;
  }

  console.log("\nPerformance smoke passed.");
}

function runSelfTest() {
  const records = parseRecords(selfTestLog());
  const result = validateRecords(records, { requireSmokeTraces: true });

  if (result.errors.length > 0) {
    printSummary(records, result);
    process.exitCode = 1;
    return;
  }

  assertSelfTestError(
    validateRecords(parseRecords(selfTestMissingFieldLog()), {
      requireSmokeTraces: false,
    }),
    "is missing tab_id",
  );
  assertSelfTestError(
    validateRecords(parseRecords(selfTestOverBudgetLog()), {
      requireSmokeTraces: false,
    }),
    "took 99ms, budget 50ms",
  );
  assertSelfTestError(
    validateRecords(parseRecords(selfTestSizedOpenOverBudgetLog()), {
      requireSmokeTraces: false,
    }),
    "took 801ms, budget 800ms",
  );
  assertSelfTestError(
    validateRecords(parseRecords(selfTestSearchOverBudgetLog()), {
      requireSmokeTraces: false,
    }),
    "took 501ms, budget 500ms",
  );
  assertSelfTestError(
    validateRecords(parseRecords(selfTestLargeLivePreviewLog()), {
      requireSmokeTraces: false,
    }),
    "expected degraded preview",
  );
  assertSelfTestError(
    validateRecords(parseRecords(selfTestMissingHybridInputContextLog()), {
      requireSmokeTraces: false,
    }),
    "is missing hybrid_block_kind",
  );

  console.log("Performance smoke checker self-test passed.");
}

function assertSelfTestError(result, expectedMessage) {
  if (result.errors.some((error) => error.includes(expectedMessage))) {
    return;
  }

  console.error("Performance smoke checker self-test failed:");
  console.error(`- Expected error containing: ${expectedMessage}`);
  if (result.errors.length === 0) {
    console.error("- No errors were reported.");
  } else {
    for (const error of result.errors) {
      console.error(`- Actual error: ${error}`);
    }
  }
  process.exitCode = 1;
  throw new Error("performance smoke checker self-test failed");
}

function selfTestLog() {
  const baseFields =
    'window_id="main" interaction_path="editor.test" tab_id="tab-a" revision=1 view_mode="hybrid" content_bytes=102400 trigger_reason="self_test"';
  const oneMbFields =
    'window_id="main" interaction_path="editor.test" tab_id="tab-1mb" revision=1 view_mode="hybrid" content_bytes=1048576 trigger_reason="self_test"';
  const fiveMbFields =
    'window_id="main" interaction_path="editor.test" tab_id="tab-5mb" revision=1 view_mode="hybrid" content_bytes=5242880 trigger_reason="self_test"';

  return [
    `INFO papyro_app::perf: ${baseFields} action="open_markdown" elapsed_ms=1 perf app dispatch action`,
    `INFO papyro_ui::perf: ${baseFields} tab_count=2 host_count=1 elapsed_ms=2 perf editor pane render prep`,
    `INFO papyro_app::perf: ${baseFields} path="target/perf-fixtures/papyro-100kb.md" elapsed_ms=120 perf editor open markdown`,
    `INFO papyro_app::perf: ${oneMbFields} path="target/perf-fixtures/papyro-1mb.md" elapsed_ms=800 perf editor open markdown`,
    `INFO papyro_app::perf: ${fiveMbFields} path="target/perf-fixtures/papyro-5mb.md" elapsed_ms=2500 perf editor open markdown`,
    `INFO papyro_app::perf: ${baseFields} elapsed_ms=20 perf editor switch tab`,
    `INFO papyro_app::perf: ${oneMbFields} elapsed_ms=150 perf editor switch tab`,
    `INFO papyro_app::perf: ${fiveMbFields} elapsed_ms=300 perf editor switch tab`,
    `INFO papyro_ui::perf: ${baseFields} from="source" to="hybrid" hybrid_render_gate="block_hints" elapsed_ms=10 perf editor view mode change`,
    `INFO papyro_ui::perf: ${oneMbFields} from="source" to="hybrid" hybrid_render_gate="source_fallback" elapsed_ms=10 perf editor view mode change`,
    `INFO papyro_ui::perf: ${baseFields} mode="hybrid" elapsed_ms=8 perf editor command set_view_mode`,
    `INFO papyro_app::perf: ${baseFields} changed=true hybrid_block_kind="table" hybrid_block_state="editing" hybrid_block_tier="current" hybrid_fallback_reason="none" elapsed_ms=5 perf editor input change`,
    `INFO papyro_app::perf: ${oneMbFields} changed=true hybrid_block_kind="source_fallback" hybrid_block_state="source_fallback" hybrid_block_tier="source_fallback" hybrid_fallback_reason="document_too_large" elapsed_ms=32 perf editor input change`,
    `INFO papyro_app::perf: ${fiveMbFields} changed=true hybrid_block_kind="source_fallback" hybrid_block_state="source_fallback" hybrid_block_tier="source_fallback" hybrid_fallback_reason="document_too_large" elapsed_ms=50 perf editor input change`,
    `INFO papyro_ui::perf: ${baseFields} code_highlighting=false live_preview=true elapsed_ms=120 perf editor preview render`,
    `INFO papyro_ui::perf: ${oneMbFields} code_highlighting=false live_preview=true elapsed_ms=1000 perf editor preview render`,
    `INFO papyro_ui::perf: ${fiveMbFields} code_highlighting=false live_preview=false elapsed_ms=150 perf editor preview render`,
    `INFO papyro_ui::perf: window_id="main" interaction_path="chrome.sidebar" tab_id="none" revision=-1 view_mode="none" content_bytes=-1 trigger_reason="click" collapsed=true elapsed_ms=3 perf chrome toggle sidebar`,
    `INFO papyro_ui::perf: window_id="main" interaction_path="chrome.sidebar" tab_id="none" revision=-1 view_mode="none" content_bytes=-1 trigger_reason="drag_commit" start_width=280 end_width=320 delta_px=40 elapsed_ms=4 perf chrome resize sidebar`,
    `INFO papyro_ui::perf: window_id="main" interaction_path="chrome.theme" tab_id="none" revision=-1 view_mode="none" content_bytes=-1 trigger_reason="toggle_theme" from="light" to="dark" elapsed_ms=3 perf chrome toggle theme`,
    `INFO papyro_ui::perf: window_id="main" interaction_path="chrome.modal" tab_id="none" revision=-1 view_mode="none" content_bytes=-1 trigger_reason="shortcut" modal="settings" elapsed_ms=2 perf chrome open modal`,
    `INFO papyro_app::perf: window_id="main" interaction_path="workspace.search" tab_id="none" revision=-1 view_mode="none" content_bytes=-1 trigger_reason="search_use_case" query_bytes=7 limit=50 result_count=12 elapsed_ms=250 perf workspace search`,
    `INFO papyro_ui::perf: ${baseFields} elapsed_ms=2 perf tab close trigger`,
    `INFO papyro_app::perf: ${baseFields} close_intent="clean" closed=true elapsed_ms=12 perf runtime close_tab handler`,
  ].join("\n");
}

function selfTestMissingFieldLog() {
  return `INFO papyro_app::perf: window_id="main" interaction_path="editor.test" revision=1 view_mode="hybrid" content_bytes=102400 trigger_reason="self_test" action="open_markdown" elapsed_ms=1 perf app dispatch action`;
}

function selfTestOverBudgetLog() {
  return `INFO papyro_app::perf: window_id="main" interaction_path="editor.test" tab_id="tab-a" revision=1 view_mode="hybrid" content_bytes=102400 trigger_reason="self_test" action="open_markdown" elapsed_ms=99 perf app dispatch action`;
}

function selfTestSizedOpenOverBudgetLog() {
  return `INFO papyro_app::perf: window_id="main" interaction_path="editor.test" tab_id="tab-1mb" revision=1 view_mode="hybrid" content_bytes=1048576 trigger_reason="self_test" path="target/perf-fixtures/papyro-1mb.md" elapsed_ms=801 perf editor open markdown`;
}

function selfTestSearchOverBudgetLog() {
  return `INFO papyro_app::perf: window_id="main" interaction_path="workspace.search" tab_id="none" revision=-1 view_mode="none" content_bytes=-1 trigger_reason="search_use_case" query_bytes=7 limit=50 result_count=12 elapsed_ms=501 perf workspace search`;
}

function selfTestLargeLivePreviewLog() {
  return `INFO papyro_ui::perf: window_id="main" interaction_path="editor.preview" tab_id="tab-a" revision=1 view_mode="hybrid" content_bytes=2097152 trigger_reason="self_test" code_highlighting=false live_preview=true elapsed_ms=120 perf editor preview render`;
}

function selfTestMissingHybridInputContextLog() {
  return `INFO papyro_app::perf: window_id="main" interaction_path="editor.input" tab_id="tab-a" revision=1 view_mode="hybrid" content_bytes=102400 trigger_reason="editor_event" changed=true elapsed_ms=5 perf editor input change`;
}

main();
