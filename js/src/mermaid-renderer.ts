import mermaid from "mermaid";
import type { Mermaid, MermaidConfig, RenderResult } from "mermaid";

const MERMAID_RENDER_TIMEOUT_MS = 2500;
const PAPYRO_MERMAID_SECURE_KEYS = [
  "secure",
  "securityLevel",
  "startOnLoad",
  "maxTextSize",
  "suppressErrorRendering",
  "htmlLabels",
  "dompurifyConfig",
] as const;

type MermaidSecureKey = (typeof PAPYRO_MERMAID_SECURE_KEYS)[number];

export const PAPYRO_MERMAID_CONFIG = Object.freeze({
  startOnLoad: false,
  securityLevel: "strict",
  suppressErrorRendering: true,
  theme: "base",
  htmlLabels: false,
  secure: [...PAPYRO_MERMAID_SECURE_KEYS] satisfies MermaidSecureKey[],
}) satisfies Readonly<MermaidConfig>;

type TimerId = ReturnType<typeof globalThis.setTimeout>;

type MermaidRendererOptions = {
  mermaidApi?: Pick<Mermaid, "initialize" | "render">;
  config?: MermaidConfig;
  timeoutMs?: number;
  setTimeoutFn?: typeof globalThis.setTimeout;
  clearTimeoutFn?: typeof globalThis.clearTimeout;
};

type MermaidRenderer = {
  renderMermaidIntoElement: (element: unknown, source: unknown) => Promise<boolean>;
  renderPreviewMermaid: (root?: unknown) => number;
};

export function friendlyMermaidErrorMessage(message: unknown): string {
  const text = String(message ?? "").trim();
  if (!text) return "Mermaid diagram could not be rendered.";
  if (/syntax error in text/i.test(text)) return "Mermaid syntax error.";
  if (/parse error|lexical error/i.test(text)) return "Mermaid syntax error.";
  if (/dompurify\.sanitize is not a function|purify\.sanitize is not a function/i.test(text)) {
    return "Mermaid render is unavailable in this runtime.";
  }
  if (/timed out/i.test(text)) return "Mermaid render timed out.";
  return text;
}

function ownerDocumentFor(element: unknown): Document | null {
  const maybeNode = element as Node | null | undefined;
  const maybeElement = element as Element | null | undefined;
  if (maybeNode?.nodeType === 9) return maybeNode as Document;
  if (maybeElement?.ownerDocument) return maybeElement.ownerDocument;
  return typeof document === "undefined" ? null : document;
}

function isHTMLElement(element: unknown): element is HTMLElement {
  const maybeElement = element as Element | null | undefined;
  const elementWindow = maybeElement?.ownerDocument?.defaultView;
  const HTMLElementConstructor = elementWindow?.HTMLElement ?? globalThis.HTMLElement;
  return typeof HTMLElementConstructor === "function" && element instanceof HTMLElementConstructor;
}

function createMermaidStatus(
  documentRef: Document,
  message: string,
  error = false,
  rawMessage = "",
): HTMLElement {
  const wrapper = documentRef.createElement("div");
  wrapper.className = error
    ? "mn-mermaid-status mn-mermaid-status-error"
    : "mn-mermaid-status";
  if (rawMessage) {
    wrapper.title = rawMessage;
    wrapper.dataset.mermaidError = rawMessage;
  }
  const label = documentRef.createElement("div");
  label.className = "mn-mermaid-label";
  label.textContent = error ? "Mermaid render failed" : message;
  wrapper.append(label);
  if (error && message) {
    const detail = documentRef.createElement("div");
    detail.className = "mn-mermaid-detail";
    detail.textContent = friendlyMermaidErrorMessage(message);
    wrapper.append(detail);
  }
  return wrapper;
}

export function mermaidSvgErrorMessage(svg: unknown): string {
  const markup = String(svg ?? "").trim();
  if (!markup) return "Mermaid diagram could not be rendered.";

  const directMatch = markup.match(/syntax error in text|parse error|lexical error/i);
  if (directMatch) {
    return directMatch[0];
  }

  if (/class=(['"])[^'"]*error-(?:text|icon)\1/i.test(markup)) {
    if (typeof DOMParser !== "function") {
      return "Mermaid diagram could not be rendered.";
    }
  }

  if (typeof DOMParser !== "function") return "";

  try {
    const document = new DOMParser().parseFromString(markup, "image/svg+xml");
    const explicitErrorText = Array.from(document.querySelectorAll(".error-text"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .find(Boolean);
    if (explicitErrorText) {
      return explicitErrorText;
    }

    if (document.querySelector(".error-icon")) {
      return "Mermaid diagram could not be rendered.";
    }

    const text = document.documentElement?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const textMatch = text.match(/syntax error in text|parse error|lexical error/i);
    return textMatch ? textMatch[0] : "";
  } catch {
    return "";
  }
}

function mermaidSourceFromElement(element: HTMLElement): string {
  return (
    element.querySelector(".mn-mermaid-source")?.textContent ??
    element.dataset.mermaidSource ??
    ""
  );
}

export function createMermaidRenderer({
  mermaidApi = mermaid,
  config = PAPYRO_MERMAID_CONFIG,
  timeoutMs = MERMAID_RENDER_TIMEOUT_MS,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
}: MermaidRendererOptions = {}): MermaidRenderer {
  let initialized = false;
  let renderCounter = 0;

  function ensureMermaidInitialized() {
    if (initialized) return;
    mermaidApi.initialize(config);
    initialized = true;
  }

  function withRenderTimeout<T>(promise: Promise<T> | T, label: string): Promise<T> {
    if (typeof setTimeoutFn !== "function" || typeof clearTimeoutFn !== "function") {
      return Promise.resolve(promise);
    }

    let timer: TimerId;
    return new Promise((resolve, reject) => {
      timer = setTimeoutFn(() => reject(new Error(`${label} timed out`)), timeoutMs);
      Promise.resolve(promise).then(
        (value) => {
          clearTimeoutFn(timer);
          resolve(value);
        },
        (error) => {
          clearTimeoutFn(timer);
          reject(error);
        },
      );
    });
  }

  async function renderMermaidSvg(source: unknown): Promise<RenderResult> {
    const trimmed = String(source ?? "").trim();
    if (!trimmed) throw new Error("Mermaid source is empty");

    ensureMermaidInitialized();
    const id = `papyro-mermaid-${++renderCounter}`;
    return withRenderTimeout(mermaidApi.render(id, trimmed), "Mermaid render");
  }

  async function renderMermaidIntoElement(element: unknown, source: unknown): Promise<boolean> {
    if (!isHTMLElement(element)) return false;

    const documentRef = ownerDocumentFor(element);
    if (!documentRef) return false;
    const normalizedSource = String(source ?? "").trim();
    const token = String(++renderCounter);
    element.dataset.mermaidRenderToken = token;
    element.dataset.mermaidSource = normalizedSource;
    element.dataset.mermaidState = "pending";
    element.replaceChildren(createMermaidStatus(documentRef, "Rendering Mermaid diagram..."));

    try {
      const result = await renderMermaidSvg(normalizedSource);
      if (element.dataset.mermaidRenderToken !== token) return false;
      const renderError = mermaidSvgErrorMessage(result.svg);
      if (renderError) {
        throw new Error(renderError);
      }

      const svgWrapper = documentRef.createElement("div");
      svgWrapper.className = "mn-mermaid-svg";
      svgWrapper.innerHTML = result.svg ?? "";
      result.bindFunctions?.(svgWrapper);

      element.dataset.mermaidState = "rendered";
      element.replaceChildren(svgWrapper);
      return true;
    } catch (error) {
      if (element.dataset.mermaidRenderToken !== token) return false;

      const message = error instanceof Error ? error.message : String(error);
      element.dataset.mermaidState = "error";
      element.replaceChildren(createMermaidStatus(documentRef, message, true, message));
      return false;
    }
  }

  function renderPreviewMermaid(root: unknown = ownerDocumentFor(null)): number {
    const documentRef = ownerDocumentFor(root);
    if (!documentRef) return 0;
    const scope =
      typeof (root as ParentNode | null | undefined)?.querySelectorAll === "function"
        ? (root as ParentNode)
        : documentRef;
    let count = 0;
    for (const block of scope.querySelectorAll(".mn-preview .mn-mermaid-block")) {
      if (!isHTMLElement(block)) continue;

      const source = mermaidSourceFromElement(block);
      if (!source.trim()) continue;
      if (
        block.dataset.mermaidState === "rendered" &&
        block.dataset.mermaidSource === source.trim()
      ) {
        continue;
      }

      count += 1;
      void renderMermaidIntoElement(block, source);
    }
    return count;
  }

  return {
    renderMermaidIntoElement,
    renderPreviewMermaid,
  };
}

const defaultMermaidRenderer = createMermaidRenderer();

export const renderMermaidIntoElement = defaultMermaidRenderer.renderMermaidIntoElement;
export const renderPreviewMermaid = defaultMermaidRenderer.renderPreviewMermaid;
