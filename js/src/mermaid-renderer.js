import mermaid from "mermaid";

const MERMAID_RENDER_TIMEOUT_MS = 2500;

let mermaidInitialized = false;
let mermaidRenderCounter = 0;

function ensureMermaidInitialized() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    suppressErrorRendering: true,
    theme: "base",
    htmlLabels: false,
  });
  mermaidInitialized = true;
}

function withRenderTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]);
}

export function friendlyMermaidErrorMessage(message) {
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

function ownerDocumentFor(element) {
  if (element?.ownerDocument) return element.ownerDocument;
  return typeof document === "undefined" ? null : document;
}

function createMermaidStatus(documentRef, message, error = false, rawMessage = "") {
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

export function mermaidSvgErrorMessage(svg) {
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

async function renderMermaidSvg(source) {
  const trimmed = String(source ?? "").trim();
  if (!trimmed) throw new Error("Mermaid source is empty");

  ensureMermaidInitialized();
  const id = `papyro-mermaid-${++mermaidRenderCounter}`;
  return withRenderTimeout(
    Promise.resolve(mermaid.render(id, trimmed)),
    MERMAID_RENDER_TIMEOUT_MS,
    "Mermaid render",
  );
}

export async function renderMermaidIntoElement(element, source) {
  if (!(element instanceof HTMLElement)) return false;

  const documentRef = ownerDocumentFor(element);
  if (!documentRef) return false;
  const normalizedSource = String(source ?? "").trim();
  const token = String(++mermaidRenderCounter);
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

function mermaidSourceFromElement(element) {
  return (
    element.querySelector(".mn-mermaid-source")?.textContent ??
    element.dataset.mermaidSource ??
    ""
  );
}

export function renderPreviewMermaid(root = ownerDocumentFor(null)) {
  const documentRef = ownerDocumentFor(root);
  if (!documentRef) return 0;
  const scope = root instanceof Element || root instanceof Document ? root : documentRef;
  let count = 0;
  for (const block of scope.querySelectorAll(".mn-preview .mn-mermaid-block")) {
    if (!(block instanceof HTMLElement)) continue;

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
