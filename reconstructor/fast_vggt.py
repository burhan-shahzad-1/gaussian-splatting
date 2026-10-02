"""VGGT camera-only poses for an 8 GB laptop (no depth/point heads).

The full VGGT depth head thrashes 8 GB VRAM for 20+ minutes. Camera poses
are enough for a draft Gaussian: we unproject a coarse RGB grid in front of
each camera and write a COLMAP sparse model for gsplat.
"""

from __future__ import annotations

import argparse
import copy
import glob
import os
import random
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

torch.backends.cudnn.enabled = True
torch.backends.cudnn.benchmark = True

from vggt.dependency.np_to_pycolmap import batch_np_matrix_to_pycolmap_wo_track
from vggt.models.vggt import VGGT
from vggt.utils.load_fn import load_and_preprocess_images_square
from vggt.utils.pose_enc import pose_encoding_to_extri_intri


VGGT_RES = 518
LOAD_RES = 1024


def _log(message: str) -> None:
    print(message, flush=True)


def _load_checkpoint(model: VGGT) -> None:
    hub_ckpt = os.path.join(torch.hub.get_dir(), "checkpoints", "model.pt")
    state = None
    if os.path.isfile(hub_ckpt):
        try:
            state = torch.load(hub_ckpt, map_location="cpu", weights_only=False)
        except TypeError:
            state = torch.load(hub_ckpt, map_location="cpu")
        except Exception:
            state = None
    if state is None:
        from huggingface_hub import hf_hub_download

        ckpt_path = hf_hub_download(repo_id="facebook/VGGT-1B", filename="model.pt")
        try:
            state = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        except TypeError:
            state = torch.load(ckpt_path, map_location="cpu")
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]
    missing, unexpected = model.load_state_dict(state, strict=False)
    _log(
        f"Loaded VGGT camera weights (missing={len(missing)} unexpected={len(unexpected)})"
    )


def _scene_scale(extrinsics: np.ndarray) -> float:
    centers = []
    for pose in extrinsics:
        rotation = pose[:3, :3]
        translation = pose[:3, 3]
        centers.append(-rotation.T @ translation)
    centers = np.stack(centers, axis=0)
    if len(centers) < 2:
        return 1.0
    deltas = []
    for i in range(len(centers)):
        for j in range(i + 1, len(centers)):
            deltas.append(float(np.linalg.norm(centers[i] - centers[j])))
    median = float(np.median(deltas)) if deltas else 1.0
    return max(median, 0.25)


def _frustum_points(
    images: np.ndarray,
    extrinsics: np.ndarray,
    intrins: np.ndarray,
    stride: int,
    scale: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    frame_count, height, width, _ = images.shape
    ys = np.arange(stride // 2, height, stride, dtype=np.int32)
    xs = np.arange(stride // 2, width, stride, dtype=np.int32)
    grid_x, grid_y = np.meshgrid(xs, ys)
    u = grid_x.reshape(-1).astype(np.float64)
    v = grid_y.reshape(-1).astype(np.float64)
    ones = np.ones_like(u)
    pixels = np.stack([u, v, ones], axis=0)
    depths = np.array([0.45, 0.9, 1.6], dtype=np.float64) * scale

    xyz: list[np.ndarray] = []
    xyf: list[np.ndarray] = []
    rgb: list[np.ndarray] = []
    for index in range(frame_count):
        k_inv = np.linalg.inv(intrins[index])
        rays = k_inv @ pixels
        rotation = extrinsics[index][:3, :3]
        translation = extrinsics[index][:3, 3]
        colors = images[index][grid_y.reshape(-1), grid_x.reshape(-1)]
        for depth in depths:
            cam_points = rays * depth
            world = (rotation.T @ (cam_points - translation[:, None])).T
            xyz.append(world)
            xyf.append(np.stack([u, v, np.full(u.shape, index, dtype=np.float64)], axis=1))
            rgb.append(colors)
    return np.concatenate(xyz), np.concatenate(xyf), np.concatenate(rgb)


def rename_colmap_recons_and_rescale_camera(
    reconstruction,
    image_paths,
    original_coords,
    img_size,
    shift_point2d_to_original_res=False,
    shared_camera=False,
):
    rescale_camera = True
    for pyimageid in reconstruction.images:
        pyimage = reconstruction.images[pyimageid]
        pycamera = reconstruction.cameras[pyimage.camera_id]
        pyimage.name = image_paths[pyimageid - 1]
        if rescale_camera:
            pred_params = copy.deepcopy(pycamera.params)
            real_image_size = original_coords[pyimageid - 1, -2:]
            resize_ratio = max(real_image_size) / img_size
            pred_params = pred_params * resize_ratio
            real_pp = real_image_size / 2
            pred_params[-2:] = real_pp
            pycamera.params = pred_params
            pycamera.width = int(real_image_size[0])
            pycamera.height = int(real_image_size[1])
        if shift_point2d_to_original_res:
            top_left = original_coords[pyimageid - 1, :2]
            for point2D in pyimage.points2D:
                point2D.xy = (point2D.xy - top_left) * resize_ratio
        if shared_camera:
            rescale_camera = False
    return reconstruction


def run(scene_dir: Path, seed: int = 42, stride: int = 20) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    image_dir = scene_dir / "images"
    image_paths = sorted(glob.glob(str(image_dir / "*")))
    if not image_paths:
        raise SystemExit(f"No images in {image_dir}")
    names = [os.path.basename(path) for path in image_paths]
    _log(f"Fast VGGT cameras for {len(image_paths)} frames")

    dtype = torch.bfloat16 if torch.cuda.get_device_capability()[0] >= 8 else torch.float16
    device = "cuda" if torch.cuda.is_available() else "cpu"
    _log(f"device={device} dtype={dtype}")

    model = VGGT(enable_camera=True, enable_point=False, enable_depth=False, enable_track=False)
    _load_checkpoint(model)
    model.eval()
    model = model.to(device)
    _log("Camera-only model on GPU")

    images, original_coords = load_and_preprocess_images_square(image_paths, LOAD_RES)
    images = images.to(device)
    images_518 = F.interpolate(images, size=(VGGT_RES, VGGT_RES), mode="bilinear", align_corners=False)

    with torch.no_grad():
        with torch.amp.autocast("cuda", dtype=dtype, enabled=device == "cuda"):
            tokens, _ps_idx = model.aggregator(images_518[None])
        _log("VGGT aggregator done")
        pose_enc = model.camera_head(tokens)[-1]
        extrinsic, intrinsic = pose_encoding_to_extri_intri(pose_enc, images_518.shape[-2:])
        _log("VGGT camera head done")

    extrinsic_np = extrinsic.squeeze(0).detach().float().cpu().numpy()
    intrinsic_np = intrinsic.squeeze(0).detach().float().cpu().numpy()
    rgb = (images_518.detach().float().clamp(0, 1).cpu().numpy().transpose(0, 2, 3, 1) * 255).astype(np.uint8)
    coords = original_coords.detach().float().cpu().numpy()

    del model, tokens, pose_enc, images, images_518, extrinsic, intrinsic
    if device == "cuda":
        torch.cuda.empty_cache()

    scale = _scene_scale(extrinsic_np)
    points_3d, points_xyf, points_rgb = _frustum_points(rgb, extrinsic_np, intrinsic_np, stride, scale)
    _log(f"Init points={len(points_3d)} scene_scale={scale:.3f}")

    reconstruction = batch_np_matrix_to_pycolmap_wo_track(
        points_3d,
        points_xyf,
        points_rgb,
        extrinsic_np,
        intrinsic_np,
        np.array([VGGT_RES, VGGT_RES]),
        shared_camera=False,
        camera_type="PINHOLE",
    )
    reconstruction = rename_colmap_recons_and_rescale_camera(
        reconstruction,
        names,
        coords,
        img_size=VGGT_RES,
        shift_point2d_to_original_res=True,
        shared_camera=False,
    )

    sparse = scene_dir / "sparse"
    sparse.mkdir(parents=True, exist_ok=True)
    reconstruction.write(str(sparse))
    if hasattr(reconstruction, "write_text"):
        reconstruction.write_text(str(sparse))
    _log(f"Wrote COLMAP model to {sparse}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fast VGGT camera-only COLMAP export")
    parser.add_argument("--scene_dir", required=True)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--stride", type=int, default=20)
    args = parser.parse_args()
    run(Path(args.scene_dir), seed=args.seed, stride=args.stride)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"fast_vggt failed: {exc}", file=sys.stderr, flush=True)
        raise
