import type { ReconstructionStatus } from "@/lib/types";

export type StatusTone = "default" | "copper" | "live" | "muted" | "signal";

export type StatusCopy = {
  label: string;
  summary: string;
  tone: StatusTone;
};

export const STATUS_COPY: Record<ReconstructionStatus, StatusCopy> = {
  UPLOADING: {
    label: "Uploading",
    summary: "Sending the walkthrough to storage.",
    tone: "live",
  },
  QUEUED: {
    label: "Queued",
    summary: "Waiting for the local reconstructor to claim this room.",
    tone: "muted",
  },
  EXTRACTING_FRAMES: {
    label: "Reading video",
    summary: "Pulling stills from the capture to build the environment.",
    tone: "live",
  },
  RUNNING_COLMAP: {
    label: "Estimating cameras",
    summary: "A feed-forward pose model is mapping the camera path.",
    tone: "live",
  },
  TRAINING_SPLAT: {
    label: "Building the scene",
    summary: "Short Gaussian training is reconstructing the volume.",
    tone: "live",
  },
  CONVERTING_SOG: {
    label: "Optimizing",
    summary: "Packing the scene so it loads in a browser.",
    tone: "live",
  },
  UPLOADING_RESULT: {
    label: "Publishing",
    summary: "Sending the finished room to object storage.",
    tone: "live",
  },
  COMPLETED: {
    label: "Ready",
    summary: "The 3D environment can be opened in the viewer.",
    tone: "copper",
  },
  FAILED: {
    label: "Failed",
    summary: "This reconstruction could not be completed.",
    tone: "signal",
  },
};

export const PIPELINE_ORDER: Exclude<ReconstructionStatus, "FAILED">[] = [
  "UPLOADING",
  "QUEUED",
  "EXTRACTING_FRAMES",
  "RUNNING_COLMAP",
  "TRAINING_SPLAT",
  "CONVERTING_SOG",
  "UPLOADING_RESULT",
  "COMPLETED",
];

export const PIPELINE_DETAIL: Record<Exclude<ReconstructionStatus, "FAILED">, string> = {
  UPLOADING: "The walkthrough is stored in object storage, not on the Next.js server.",
  QUEUED: "The host reconstructor claims this job. Next.js never runs poses or training.",
  EXTRACTING_FRAMES: "FFmpeg on the reconstructor pulls a small set of overlapping frames.",
  RUNNING_COLMAP: "VGGT estimates camera poses in a short pass (status id kept for compatibility).",
  TRAINING_SPLAT: "gsplat trains a draft Gaussian field with a short step budget.",
  CONVERTING_SOG: "PlayCanvas SplatTransform packs the splat for the browser.",
  UPLOADING_RESULT: "room.ply / room.sog are published beside the source video.",
  COMPLETED: "The 3D environment is ready. Drag to look around.",
};

export function isProcessingStatus(status: ReconstructionStatus): boolean {
  return (
    status === "UPLOADING" ||
    status === "QUEUED" ||
    status === "EXTRACTING_FRAMES" ||
    status === "RUNNING_COLMAP" ||
    status === "TRAINING_SPLAT" ||
    status === "CONVERTING_SOG" ||
    status === "UPLOADING_RESULT"
  );
}

export function isCompletedStatus(status: ReconstructionStatus): boolean {
  return status === "COMPLETED";
}

export function pipelineIndex(status: ReconstructionStatus): number {
  if (status === "FAILED") return 0;
  return Math.max(
    PIPELINE_ORDER.indexOf(status as Exclude<ReconstructionStatus, "FAILED">),
    0,
  );
}

export const SCENE_PIPELINE = [
  {
    id: "video",
    label: "Video",
    statuses: ["UPLOADING"] as const,
    summary: "The walkthrough is stored. Reconstruction has not started.",
  },
  {
    id: "frames",
    label: "Frames",
    statuses: ["QUEUED", "EXTRACTING_FRAMES"] as const,
    summary: "Stills are pulled from the capture, or the job is waiting for the local reconstructor.",
  },
  {
    id: "camera",
    label: "Camera map",
    statuses: ["RUNNING_COLMAP"] as const,
    summary: "A feed-forward model is estimating where the camera moved through the room.",
  },
  {
    id: "reconstruction",
    label: "3D reconstruction",
    statuses: ["TRAINING_SPLAT"] as const,
    summary: "A short gsplat train is building a draft Gaussian volume.",
  },
  {
    id: "gaussians",
    label: "Gaussian field",
    statuses: ["TRAINING_SPLAT"] as const,
    summary: "The scene is a field of anisotropic Gaussians, not a mesh.",
  },
  {
    id: "optimize",
    label: "Web optimization",
    statuses: ["CONVERTING_SOG", "UPLOADING_RESULT"] as const,
    summary: "PlayCanvas SplatTransform packs the splat, then it is published.",
  },
  {
    id: "ready",
    label: "Ready",
    statuses: ["COMPLETED"] as const,
    summary: "The SOG is in object storage and can be opened in the viewer.",
  },
] as const;

export type ScenePipelineId = (typeof SCENE_PIPELINE)[number]["id"];

export function sceneStageIndex(status: ReconstructionStatus): number {
  if (status === "FAILED") return 0;
  if (status === "COMPLETED") return SCENE_PIPELINE.length - 1;
  if (status === "TRAINING_SPLAT") return 3;
  const index = SCENE_PIPELINE.findIndex((stage) =>
    (stage.statuses as readonly ReconstructionStatus[]).includes(status),
  );
  return Math.max(index, 0);
}

export function sceneStageProgress(status: ReconstructionStatus): number {
  if (status === "FAILED") return 0;
  if (status === "COMPLETED") return 1;
  return (sceneStageIndex(status) + 0.45) / (SCENE_PIPELINE.length - 1);
}

export function pipelineRatio(status: ReconstructionStatus): number {
  if (status === "FAILED") return 0;
  if (status === "COMPLETED") return 1;
  return (pipelineIndex(status) + 0.35) / (PIPELINE_ORDER.length - 1);
}
