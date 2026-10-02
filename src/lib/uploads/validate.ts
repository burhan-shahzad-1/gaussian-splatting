import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_VIDEO_TYPES,
  MAX_UPLOAD_BYTES,
  MIN_UPLOAD_BYTES,
} from "@/lib/uploads/types";
import { formatBytes } from "@/lib/format";

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

function extensionOf(filename: string) {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index).toLowerCase();
}

export function validateWalkthroughFile(file: { name: string; type: string; size: number }) {
  const extension = extensionOf(file.name);
  const typeOk =
    ACCEPTED_VIDEO_TYPES.includes(file.type as (typeof ACCEPTED_VIDEO_TYPES)[number]) ||
    (file.type === "" && ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number]));

  if (!typeOk || !ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
    throw new UploadValidationError("Use an MP4 or MOV walkthrough.");
  }

  if (file.size < MIN_UPLOAD_BYTES) {
    throw new UploadValidationError("That file is too small to be a room walkthrough.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(
      `Keep the walkthrough under ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    );
  }

  return {
    contentType: file.type || (extension === ".mov" ? "video/quicktime" : "video/mp4"),
    extension,
  };
}

export function sanitizeFilename(filename: string) {
  const base = filename.replace(/[/\\]/g, "").replace(/\s+/g, "-");
  return base.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80) || "walkthrough.mp4";
}
