"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/panel";
import { Eyebrow } from "@/components/ui/reveal";
import { HairlineProgress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { formatBytes, formatDuration, titleFromFilename } from "@/lib/format";
import { abandonReconstruction } from "@/lib/projects/api";
import { refreshProject } from "@/lib/projects/cache";
import { createBrowserUploadClient } from "@/lib/uploads/client";
import { readVideoMetadata } from "@/lib/uploads/media";
import { ACCEPTED_EXTENSIONS } from "@/lib/uploads/types";
import { UploadValidationError, validateWalkthroughFile } from "@/lib/uploads/validate";
const ACCEPT = ".mp4,.mov,video/mp4,video/quicktime";

type Phase = "idle" | "reading" | "uploading" | "finishing";

export function ReconstructionUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string | null>(null);
  const uploader = useMemo(() => createBrowserUploadClient(), []);

  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [storageReady, setStorageReady] = useState<boolean | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    void uploader
      .health()
      .then((health) => setStorageReady(health.configured))
      .catch(() => setStorageReady(false));
    return () => {
      abortRef.current?.abort();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, [uploader]);

  function clearFile() {
    abortRef.current?.abort();
    abortRef.current = null;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setFile(null);
    setPreviewUrl(null);
    setName("");
    setDurationSeconds(null);
    setResolution(null);
    setThumbnailDataUrl(null);
    setError(null);
    setPhase("idle");
    setProgress(0);
    if (projectId) {
      void abandonReconstruction(projectId, "Upload cancelled.").catch(() => undefined);
      setProjectId(null);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFile(next: File | null) {
    if (!next) return;
    setError(null);
    try {
      validateWalkthroughFile(next);
    } catch (caught) {
      setError(caught instanceof UploadValidationError ? caught.message : "That file cannot be used.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(next);
    previewRef.current = url;
    setFile(next);
    setPreviewUrl(url);
    setName(titleFromFilename(next.name));
    setPhase("reading");

    try {
      const meta = await readVideoMetadata(next);
      setDurationSeconds(meta.durationSeconds);
      setResolution(meta.resolution);
      setThumbnailDataUrl(meta.thumbnailDataUrl);
      setPhase("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The video could not be read.");
      setPhase("idle");
    }
  }

  async function createReconstruction() {
    if (!file) return;
    setError(null);
    let createdId = projectId;

    try {
      const { contentType } = validateWalkthroughFile(file);
      setPhase("uploading");
      setProgress(0.02);

      const roomName = name.trim() || titleFromFilename(file.name);
      const intent = await uploader.createIntent({
        filename: file.name,
        contentType,
        sizeBytes: file.size,
        name: roomName,
        durationSeconds,
        resolution,
      });
      createdId = intent.projectId;
      setProjectId(intent.projectId);
      void refreshProject(intent.projectId);

      const controller = new AbortController();
      abortRef.current = controller;

      await uploader.upload({
        intent,
        file,
        signal: controller.signal,
        onProgress: (ratio) => setProgress(0.05 + ratio * 0.85),
      });

      setPhase("finishing");
      setProgress(0.94);

      await uploader.complete({
        projectId: intent.projectId,
        objectKey: intent.objectKey,
        filename: file.name,
        contentType,
        sizeBytes: file.size,
        durationSeconds,
        resolution,
        name: roomName,
        thumbnailDataUrl,
      });

      await refreshProject(intent.projectId);
      setProgress(1);
      router.push(`/projects/${intent.projectId}`);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setPhase("idle");
        setProgress(0);
        return;
      }
      const message = caught instanceof Error ? caught.message : "Upload failed.";
      setError(message);
      setPhase("idle");
      if (createdId) {
        void abandonReconstruction(createdId, message).catch(() => undefined);
      }
    } finally {
      abortRef.current = null;
    }
  }

  const busy = phase === "reading" || phase === "uploading" || phase === "finishing";

  return (
    <div className="grid gap-5">
      {storageReady === false ? (
        <p className="upload-error">
          Direct-to-S3 upload is not configured yet. Add the bucket name in
          <code> .env.local</code>. Videos never pass through a Next.js API body.
        </p>
      ) : null}

      {!file ? (
        <label
          data-active={dragging}
          className={cn("drop-well grid cursor-pointer gap-4 px-6 py-16 text-center sm:px-10")}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void onFile(event.dataTransfer.files[0] ?? null);
          }}
        >
          <input
            id="walkthrough-file"
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label="Room capture video"
            onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
          />
          <Eyebrow>Room capture</Eyebrow>
          <p className="type-title">Drop an MP4 or MOV</p>
          <p className="type-body mx-auto max-w-md">
            Prefer a 360 clip of one room. The file goes straight to object
            storage. Frames are extracted later on the reconstructor.
          </p>
          <p className="type-mono">{ACCEPTED_EXTENSIONS.join(" · ").toUpperCase()}</p>
        </label>
      ) : (
        <GlassPanel className="overflow-hidden rounded-[var(--radius-lg)]">
          {previewUrl ? (
            <video
              src={previewUrl}
              className="upload-preview"
              controls
              playsInline
              preload="metadata"
            />
          ) : null}
          <div className="grid gap-5 px-5 py-5 sm:px-6">
            <label className="grid gap-2">
              <span className="type-mono">Room name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="upload-input"
                placeholder="Untitled room"
                maxLength={80}
              />
            </label>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="type-mono">File</dt>
                <dd className="mt-1 text-paper-soft">{file.name}</dd>
              </div>
              <div>
                <dt className="type-mono">Size</dt>
                <dd className="mt-1 text-paper-soft">{formatBytes(file.size)}</dd>
              </div>
              <div>
                <dt className="type-mono">Duration</dt>
                <dd className="mt-1 text-paper-soft">
                  {phase === "reading" ? "Reading…" : formatDuration(durationSeconds)}
                </dd>
              </div>
            </dl>
            {resolution ? <p className="type-caption">{resolution}</p> : null}
          </div>
        </GlassPanel>
      )}

      {error ? <p className="upload-error" role="alert">{error}</p> : null}

      <p className="sr-only" aria-live="polite">
        {phase === "reading"
          ? "Reading video metadata"
          : phase === "uploading"
            ? `Uploading, ${Math.round(progress * 100)} percent`
            : phase === "finishing"
              ? "Confirming storage"
              : ""}
      </p>

      {phase === "uploading" || phase === "finishing" ? (
        <div className="grid gap-2">
          <div className="flex justify-between gap-3">
            <p className="type-mono">
              {phase === "finishing" ? "Confirming storage" : "Uploading to storage"}
            </p>
            <p className="type-mono">{Math.round(progress * 100)}%</p>
          </div>
          <HairlineProgress value={progress} label="Upload progress" />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="copper"
          disabled={!file || busy || storageReady !== true}
          onClick={() => void createReconstruction()}
        >
          Create reconstruction
        </Button>
        {file ? (
          <Button type="button" variant="secondary" onClick={clearFile}>
            {phase === "uploading" ? "Cancel upload" : "Remove video"}
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
            Browse files
          </Button>
        )}
      </div>
    </div>
  );
}
