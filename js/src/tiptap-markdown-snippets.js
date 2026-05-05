const DEFAULT_CALLOUT_KIND = "NOTE";
const DEFAULT_CALLOUT_TEXT = "Callout text";

export function normalizeCalloutKind(kind = DEFAULT_CALLOUT_KIND) {
  const normalized = String(kind ?? DEFAULT_CALLOUT_KIND)
    .trim()
    .replace(/[^a-z0-9_-]/giu, "")
    .toUpperCase();

  return normalized || DEFAULT_CALLOUT_KIND;
}

function quoteCalloutLine(line) {
  return line ? `> ${line}` : ">";
}

export function createMarkdownCallout(kind = DEFAULT_CALLOUT_KIND, text = DEFAULT_CALLOUT_TEXT) {
  const calloutKind = normalizeCalloutKind(kind);
  const body = String(text ?? DEFAULT_CALLOUT_TEXT).replace(/\r\n?/g, "\n");
  const bodyLines = body.split("\n").map(quoteCalloutLine);

  return ["", `> [!${calloutKind}]`, ...bodyLines, ""].join("\n");
}

export function createMarkdownTable(rows = 3, cols = 2) {
  const rowCount = Math.max(1, Number(rows) || 3);
  const columnCount = Math.max(1, Number(cols) || 2);
  const header = Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  const divider = Array.from({ length: columnCount }, () => "---");
  const body = Array.from({ length: Math.max(1, rowCount - 1) }, () =>
    Array.from({ length: columnCount }, () => ""),
  );
  const renderRow = (cells) => `| ${cells.join(" | ")} |`;

  return [
    "",
    renderRow(header),
    renderRow(divider),
    ...body.map(renderRow),
    "",
  ].join("\n");
}
