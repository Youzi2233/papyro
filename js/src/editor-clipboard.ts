export const SUPPORTED_EDITOR_IMAGE_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

type SupportedEditorImageMimeType =
  (typeof SUPPORTED_EDITOR_IMAGE_MIME_TYPES)[number];

const IMAGE_MIME_TYPES_BY_EXTENSION = Object.freeze({
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
});

type EditorImageFile = {
  type?: string;
  name?: string;
  [key: string]: unknown;
};

type EditorImage = {
  file: EditorImageFile;
  mimeType: string;
};

type EditorTransferItem = {
  kind?: string;
  type?: string;
  getAsFile?: () => EditorImageFile | null | undefined;
};

type EditorTransfer = {
  items?: Iterable<EditorTransferItem> | ArrayLike<EditorTransferItem>;
  files?: Iterable<EditorImageFile> | ArrayLike<EditorImageFile>;
};

type FileReaderLike = {
  result?: unknown;
  error?: unknown;
  onload?: ((event?: unknown) => void) | null;
  onerror?: ((event?: unknown) => void) | null;
  readAsDataURL: (blob: unknown) => void;
};

type FileReaderConstructor = new () => FileReader | FileReaderLike;

type SendEditorImageRequestOptions = {
  tabId?: string | null;
  image?: Partial<EditorImage> | null;
  getEntry?: () =>
    | {
        dioxus?: {
          send?: (message: Record<string, unknown>) => void;
        };
      }
    | null
    | undefined;
  readBlobAsBase64?: (blob: EditorImageFile) => Promise<unknown>;
};

function normalizeImageMimeType(mimeType: unknown): string {
  const normalized = String(mimeType ?? "")
    .split(";")
    [0]
    ?.trim()
    .toLowerCase();

  if (!normalized) return "";
  if (normalized === "image/jpg") return "image/jpeg";
  return SUPPORTED_EDITOR_IMAGE_MIME_TYPES.includes(
    normalized as SupportedEditorImageMimeType,
  )
    ? normalized
    : "";
}

function imageMimeTypeFromName(fileName: unknown): string {
  const extension = String(fileName ?? "")
    .trim()
    .split(/[\\/]/u)
    .pop()
    ?.split(".")
    .pop()
    ?.toLowerCase();

  return extension
    ? IMAGE_MIME_TYPES_BY_EXTENSION[
        extension as keyof typeof IMAGE_MIME_TYPES_BY_EXTENSION
      ] ?? ""
    : "";
}

export function supportedImageMimeType(
  mimeType: unknown,
  fileName?: unknown,
): string {
  const normalized = normalizeImageMimeType(mimeType);
  if (normalized) return normalized;

  if (String(mimeType ?? "").trim()) {
    return "";
  }

  return imageMimeTypeFromName(fileName);
}

export function dataUrlPayload(dataUrl: unknown): string {
  const value = String(dataUrl ?? "");
  const comma = value.indexOf(",");
  return comma >= 0 ? value.slice(comma + 1) : value;
}

export function blobToBase64(
  blob: unknown,
  FileReaderCtor: FileReaderConstructor | undefined = globalThis.FileReader,
) {
  return new Promise((resolve, reject) => {
    if (typeof FileReaderCtor !== "function") {
      reject(new Error("FileReader is unavailable"));
      return;
    }

    const reader = new FileReaderCtor() as FileReaderLike;
    reader.onload = () => resolve(dataUrlPayload(reader.result));
    reader.onerror = () =>
      reject(
        reader.error instanceof Error
          ? reader.error
          : new Error("Failed to read image"),
      );
    reader.readAsDataURL(blob);
  });
}

export function imageFileFromFile(
  file: EditorImageFile | null | undefined,
  fallbackMimeType = "",
): EditorImage | null {
  if (!file) return null;

  const mimeType = supportedImageMimeType(file.type || fallbackMimeType, file.name);
  return mimeType ? { file, mimeType } : null;
}

export function imageFileFromFiles(
  files: EditorTransfer["files"],
): EditorImage | null {
  for (const file of Array.from(files ?? [])) {
    const image = imageFileFromFile(file);
    if (image) return image;
  }

  return null;
}

export function imageFileFromTransfer(
  transfer: EditorTransfer | null | undefined,
): EditorImage | null {
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
}: SendEditorImageRequestOptions = {}) {
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
