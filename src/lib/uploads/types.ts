export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export const ACCEPTED_EXTENSIONS = [".mp4", ".mov"] as const;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;
export const MIN_UPLOAD_BYTES = 32 * 1024;
export const MAX_THUMBNAIL_CHARS = 180_000;

export type UploadIntentRequest = {
  filename: string;
  contentType: string;
  sizeBytes: number;
  name?: string;
  durationSeconds?: number | null;
  resolution?: string | null;
};

export type UploadIntentResponse = {
  projectId: string;
  objectKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  publicUrl: string;
};

export type CompleteUploadRequest = {
  projectId: string;
  objectKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  resolution: string | null;
  name: string;
  thumbnailDataUrl?: string | null;
};

export type CompleteUploadResponse = {
  projectId: string;
  objectKey: string;
  publicUrl: string;
  status: "QUEUED";
};

export type StorageHealth = {
  configured: boolean;
};

export type UploadProgressHandler = (ratio: number) => void;

export interface ObjectUploader {
  put(input: {
    uploadUrl: string;
    file: File;
    headers: Record<string, string>;
    onProgress: UploadProgressHandler;
    signal?: AbortSignal;
  }): Promise<void>;
}

export interface ReconstructionUploadClient {
  health(): Promise<StorageHealth>;
  createIntent(input: UploadIntentRequest): Promise<UploadIntentResponse>;
  upload(input: {
    intent: UploadIntentResponse;
    file: File;
    onProgress: UploadProgressHandler;
    signal?: AbortSignal;
  }): Promise<void>;
  complete(input: CompleteUploadRequest): Promise<CompleteUploadResponse>;
}
