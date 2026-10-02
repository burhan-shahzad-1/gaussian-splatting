import type {
  CompleteUploadRequest,
  CompleteUploadResponse,
  ReconstructionUploadClient,
  StorageHealth,
  UploadIntentRequest,
  UploadIntentResponse,
} from "@/lib/uploads/types";

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

function putWithProgress(input: {
  uploadUrl: string;
  file: File;
  headers: Record<string, string>;
  onProgress: (ratio: number) => void;
  signal?: AbortSignal;
}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", input.uploadUrl);

    for (const [key, value] of Object.entries(input.headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        input.onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress(1);
        resolve();
        return;
      }
      reject(new Error(`Storage rejected the upload (${xhr.status}).`));
    };

    xhr.onerror = () => {
      reject(new Error("The browser could not reach object storage. Check S3 CORS for this origin."));
    };

    xhr.onabort = () => {
      reject(new DOMException("Upload cancelled", "AbortError"));
    };

    const onAbort = () => xhr.abort();
    input.signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(input.file);
  });
}

export function createBrowserUploadClient(): ReconstructionUploadClient {
  return {
    async health(): Promise<StorageHealth> {
      return readJson<StorageHealth>(await fetch("/api/uploads/health"));
    },

    async createIntent(input: UploadIntentRequest): Promise<UploadIntentResponse> {
      return readJson<UploadIntentResponse>(
        await fetch("/api/uploads/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      );
    },

    async upload({ intent, file, onProgress, signal }) {
      await putWithProgress({
        uploadUrl: intent.uploadUrl,
        file,
        headers: intent.headers,
        onProgress,
        signal,
      });
    },

    async complete(input: CompleteUploadRequest): Promise<CompleteUploadResponse> {
      return readJson<CompleteUploadResponse>(
        await fetch("/api/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      );
    },
  };
}
