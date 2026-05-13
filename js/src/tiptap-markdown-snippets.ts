const DEFAULT_CALLOUT_KIND = "NOTE";
const DEFAULT_CALLOUT_TEXT = "Callout text";

export type PapyroCalloutKind = "NOTE" | "TIP" | "WARNING" | "DANGER";

export type PapyroCalloutKindOption = Readonly<{
  kind: PapyroCalloutKind;
  title: string;
  description: string;
}>;

export const PAPYRO_CALLOUT_KIND_OPTIONS: readonly PapyroCalloutKindOption[] = Object.freeze([
  Object.freeze({
    kind: "NOTE",
    title: "Note",
    description: "Neutral context",
  }),
  Object.freeze({
    kind: "TIP",
    title: "Tip",
    description: "Helpful suggestion",
  }),
  Object.freeze({
    kind: "WARNING",
    title: "Warning",
    description: "Risk or caution",
  }),
  Object.freeze({
    kind: "DANGER",
    title: "Danger",
    description: "Critical issue",
  }),
]);

export function normalizeCalloutKind(
  kind: unknown = DEFAULT_CALLOUT_KIND,
): PapyroCalloutKind {
  const normalized = String(kind ?? DEFAULT_CALLOUT_KIND)
    .trim()
    .replace(/[^a-z0-9_-]/giu, "")
    .toUpperCase();

  return isPapyroCalloutKind(normalized) ? normalized : DEFAULT_CALLOUT_KIND;
}

function isPapyroCalloutKind(kind: string): kind is PapyroCalloutKind {
  return PAPYRO_CALLOUT_KIND_OPTIONS.some((option) => option.kind === kind);
}

function quoteCalloutLine(line: string): string {
  return line ? `> ${line}` : ">";
}

export function createMarkdownCallout(
  kind: unknown = DEFAULT_CALLOUT_KIND,
  text: unknown = DEFAULT_CALLOUT_TEXT,
): string {
  const calloutKind = normalizeCalloutKind(kind);
  const body = String(text ?? DEFAULT_CALLOUT_TEXT).replace(/\r\n?/g, "\n");
  const bodyLines = body.split("\n").map(quoteCalloutLine);

  return ["", `> [!${calloutKind}]`, ...bodyLines, ""].join("\n");
}

export function createMarkdownTable(rows: unknown = 3, cols: unknown = 2): string {
  const rowCount = Math.max(1, Number(rows) || 3);
  const columnCount = Math.max(1, Number(cols) || 2);
  const header = Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  const divider = Array.from({ length: columnCount }, () => "---");
  const body = Array.from({ length: Math.max(1, rowCount - 1) }, () =>
    Array.from({ length: columnCount }, () => ""),
  );
  const renderRow = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;

  return [
    "",
    renderRow(header),
    renderRow(divider),
    ...body.map(renderRow),
    "",
  ].join("\n");
}
