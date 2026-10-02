export type ReconstructionStatus =
  | "UPLOADING"
  | "QUEUED"
  | "EXTRACTING_FRAMES"
  | "RUNNING_COLMAP"
  | "TRAINING_SPLAT"
  | "CONVERTING_SOG"
  | "UPLOADING_RESULT"
  | "COMPLETED"
  | "FAILED";

export type RoomProject = {
  id: string;
  name: string;
  status: ReconstructionStatus;
  progress: number;
  sourceVideoName: string | null;
  sourceVideoKey: string | null;
  sourceVideoUrl: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  outputSizeBytes: number | null;
  resolution: string | null;
  frameCount: number | null;
  processingMs: number | null;
  gpuType: string | null;
  thumbnailDataUrl: string | null;
  plyUrl: string | null;
  sogUrl: string | null;
  panoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
};

export type CatalogRoom = {
  id: string;
  name: string;
  location: string;
  capturedAt: string;
  durationLabel: string;
  resolution: string;
  status: ReconstructionStatus;
  mood: "amber" | "slate";
};
