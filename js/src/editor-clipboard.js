export const SUPPORTED_EDITOR_IMAGE_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const IMAGE_MIME_TYPES_BY_EXTENSION = Object.freeze({
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
});

function normalizeImageMimeType(mimeType) {
  const normalized = String(mimeType ?? "")
    .split(";")
    .at(0)
    ?.trim()
    .toLowerCase();

  if (!normalized) return "";
  if (normalized === "image/jpg") return "image/jpeg";
  return SUPPORTED_EDITOR_IMAGE_MIME_TYPES.includes(normalized) ? normalized : "";
}

function imageMimeTypeFromName(fileName) {
  const extension = String(fileName ?? "")
    .trim()
    .split(/[\\/]/u)
    .pop()
    ?.split(".")
    .pop()
    ?.toLowerCase();

  return IMAGE_MIME_TYPES_BY_EXTENSION[extension] ?? "";
}

export function supportedImageMimeType(mimeType, fileName) {
  const normalized = normalizeImageMimeType(mimeType);
  if (normalized) return normalized;

  if (String(mimeType ?? "").trim()) {
    return "";
  }

  return imageMimeTypeFromName(fileName);
}

export function dataUrlPayload(dataUrl) {
  const value = String(dataUrl ?? "");
  const comma = value.indexOf(",");
  return comma >= 0 ? value.slice(comma + 1) : value;
}

export function blobToBase64(blob, FileReaderCtor = globalThis.FileReader) {
  return new Promise((resolve, reject) => {
    if (typeof FileReaderCtor !== "function") {
      reject(new Error("FileReader is unavailable"));
      return;
    }

    const reader = new FileReaderCtor();
    reader.onload = () => resolve(dataUrlPayload(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

export function imageFileFromFile(file, fallbackMimeType = "") {
  if (!file) return null;

  const mimeType = supportedImageMimeType(file.type || fallbackMimeType, file.name);
  return mimeType ? { file, mimeType } : null;
}

export function imageFileFromFiles(files) {
  for (const file of Array.from(files ?? [])) {
    const image = imageFileFromFile(file);
    if (image) return image;
  }

  return null;
}

export function imageFileFromTransfer(transfer) {
  const items = Array.from(transfer?.items ?? []);
  for (const item of items) {
    if (item.kind !== "file") {
      continue;
    }

    const file = item.getAsFile?.();
    const image = imageFileFromFile(file, item.type);
    if (image) {
      return image;
    }
  }

  return imageFileFromFiles(transfer?.files);
}

export async function sendEditorImageRequest({
  tabId,
  image,
  getEntry,
  readBlobAsBase64 = blobToBase64,
} = {}) {
  if (!tabId || !image?.file || typeof getEntry !== "function") {
    return false;
  }

  const entry = getEntry();
  if (typeof entry?.dioxus?.send !== "function") {
    return false;
  }

  const mimeType = supportedImageMimeType(
    image.mimeType || image.file.type,
    image.file.name,
  );
  if (!mimeType) {
    return false;
  }

  const data = await readBlobAsBase64(image.file);
  if (!String(data ?? "").trim()) {
    throw new Error("Pasted image data is empty");
  }

  entry.dioxus.send({
    type: "paste_image_requested",
    tab_id: tabId,
    mime_type: mimeType,
    data,
  });
  return true;
}
