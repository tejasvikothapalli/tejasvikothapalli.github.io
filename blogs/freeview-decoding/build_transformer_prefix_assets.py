#!/home/tejas/e2e/venv/bin/python
"""Build exact checkpointed prefix reconstructions for the streamlined decoder.

The shipped ``BESTA_f*.pt`` / ``BESTL_f*.pt`` files contain only a terminal
whole-scene prediction.  This builder re-runs the corresponding
``BESTFT_f*.ckpt`` model on chronological prefixes of the original 33.3 ms
tiled-token stream.  Prefixes are evaluated at exact model checkpoints, while
the site uses the exact accumulated token count at every fixation to interpolate
between adjacent checkpoints.  The last frame is always rendered from the
shipped BEST bundle itself.

The two timelines are aligned in raw 120 Hz rows.  A ridge event whose source
row is ``t`` reads bins ``t + 2 .. t + 10`` (nine bins).  A four-bin tiled
token beginning at ``s`` is admitted once it is fully observed, i.e.
``s + 3 <= t + 10``.  Tokens start every two rows (16.7 ms); the pack's
``stride`` metadata incorrectly says four, so starts are recovered from
``t_abs`` and the source timeline timestamps instead.

Examples::

    # Read-only worst-case-ish benchmark (second-to-last checkpoint).
    ./build_transformer_prefix_assets.py --benchmark \
        --animal allen --scene Hawaii_beach.JPG --device cuda:1

    # Publish every scene for both animals.
    ./build_transformer_prefix_assets.py --all --device cuda:1

The generated sprite is independent of the site's JavaScript.  Its integration
contract is recorded in ``scene.json`` under ``transformerProgress``.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import io
import json
import math
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Iterable

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image


SITE_ROOT = Path(__file__).resolve().parent
E2E_ROOT = Path("/home/tejas/e2e")
E2E_CODE = E2E_ROOT / "code"
RIDGE_BUILDER = Path(
    "/home/tejas/pixel_decoder_runs/backimage_fixation_shared_decoder_v1/"
    "demo/blog_prototype/all27_ridge_p13w9_interactive"
)
RIDGE_CONFIG = RIDGE_BUILDER / "config.json"
FIXATION_CACHE = Path("/home/tejas/eye_seg_20260827/cacheSC")

MODEL_HW = (180, 320)
FULL_HW = (720, 1280)
FRAME_HW = (288, 512)
TERMINAL_HW = (576, 1024)
THUMB_HW = (90, 160)
SPRITE_COLUMNS = 7
MODEL_K = 512
QCHUNK = 1200
PX = 720.0 / MODEL_HW[0]
OUTSIDE = np.asarray((9, 14, 22), dtype=np.uint8)
NEUTRAL = 128
SSIM_SIGMA = 1.5
SSIM_RADIUS = 5
SSIM_C1 = 0.01**2
SSIM_C2 = 0.03**2

ANIMALS: dict[str, dict[str, Any]] = {
    "allen": {
        "label": "Allen",
        "pack_dir": E2E_ROOT / "data21_sub4s2",
        "global_offset": 0,
        "final_pattern": "BESTA_f{}.pt",
        "scoring": E2E_ROOT / "data/scoring.pt",
    },
    "logan": {
        "label": "Logan",
        "pack_dir": E2E_ROOT / "data21_log4s2",
        "global_offset": 14,
        "final_pattern": "BESTL_f{}.pt",
        "scoring": E2E_ROOT / "data/scoring_logan.pt",
    },
}


if str(E2E_CODE) not in sys.path:
    sys.path.insert(0, str(E2E_CODE))
import model11 as M11  # noqa: E402
import preflight as PF  # noqa: E402
from model11 import E2E  # noqa: E402


# dens_cross.py removes an all-False key-padding mask so MultiheadAttention can
# use the fused SDPA path.  A one-item inference batch has no padding, so this
# is exact and prevents materialising an O(heads * tokens^2) mask path.
if not getattr(M11.Block, "_prefix_builder_no_empty_mask", False):
    _ORIGINAL_BLOCK_FORWARD = M11.Block.forward

    def _block_forward_no_empty_mask(
        module: M11.Block,
        x: torch.Tensor,
        kv: torch.Tensor | None = None,
        mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        if mask is not None and not bool(mask.any()):
            mask = None
        return _ORIGINAL_BLOCK_FORWARD(module, x, kv, mask)

    M11.Block.forward = _block_forward_no_empty_mask
    M11.Block._prefix_builder_no_empty_mask = True


@dataclass
class RawSession:
    global_index: int
    local_index: int
    name: str
    spikes: torch.Tensor
    drift: torch.Tensor
    pos: torch.Tensor
    tabs: torch.Tensor
    pscale: torch.Tensor
    gs: torch.Tensor
    fold: torch.Tensor
    start_rows: np.ndarray
    timestamp_error_ms: float


@dataclass
class SceneSession:
    global_index: int
    local_index: int
    name: str
    spikes: torch.Tensor
    drift: torch.Tensor
    pos: torch.Tensor
    tabs: torch.Tensor
    pscale: torch.Tensor
    start_rows: np.ndarray

    def __len__(self) -> int:
        return len(self.start_rows)


@dataclass
class TimelineSession:
    """The scene-specific token chronology needed for prefix bookkeeping."""

    local_index: int
    start_rows: np.ndarray

    def __len__(self) -> int:
        return len(self.start_rows)


@dataclass
class DisplayTransform:
    source_mean: float
    source_std: float
    target_mean: float
    target_std: float
    gain: float
    low: float
    high: float
    hull: torch.Tensor


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--benchmark", action="store_true", help="run one prefix without writing")
    mode.add_argument("--all", action="store_true", help="publish selected animals/scenes")
    mode.add_argument(
        "--refresh-ui",
        action="store_true",
        help="refresh per-fixation token metadata and two-panel thumbnails without inference",
    )
    parser.add_argument("--animal", choices=("allen", "logan", "all"), default="all")
    parser.add_argument("--scene", help="scene filename or site slug; benchmark requires one")
    parser.add_argument(
        "--checkpoint-index",
        type=int,
        default=-2,
        help="benchmark checkpoint index (negative indexes allowed; default: second-to-last)",
    )
    parser.add_argument("--device", default="cuda:1" if torch.cuda.device_count() > 1 else "cuda:0")
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--webp-quality", type=int, default=86)
    parser.add_argument(
        "--model-hull",
        choices=("shipped", "animal"),
        default="shipped",
        help=(
            "low-resolution cov supplied to the model; 'shipped' uses targets.pt for both "
            "animals, reproducing the Aug-30 BEST bundles"
        ),
    )
    parser.add_argument(
        "--validate-full",
        action="store_true",
        help="also re-run the complete token stream and compare raw output with BESTA/L",
    )
    parser.add_argument("--max-scenes", type=int, default=0, help="debug cap in --all mode")
    return parser.parse_args()


def atomic_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n")
    temporary.chmod(0o644)
    os.replace(temporary, path)


def atomic_webp(path: Path, image: Image.Image, *, quality: int) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    image.save(temporary, format="WEBP", quality=quality, method=6)
    temporary.chmod(0o644)
    os.replace(temporary, path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    return {"path": path.name, "bytes": path.stat().st_size, "sha256": sha256_file(path)}


def ridge_config(animal: str) -> dict[str, Any]:
    raw = json.loads(RIDGE_CONFIG.read_text())
    label = ANIMALS[animal]["label"]
    return {**{key: value for key, value in raw.items() if key != "animals"}, **raw["animals"][label]}


def canonical_targets() -> dict[str, Any]:
    return torch.load(E2E_ROOT / "data/targets.pt", map_location="cpu", weights_only=False)


def scene_lookup(scene_names: list[str]) -> dict[str, int]:
    return {name: index for index, name in enumerate(scene_names)}


def timeline_paths(animal: str) -> dict[str, Path]:
    label = ANIMALS[animal]["label"]
    paths: dict[str, Path] = {}
    for cache_path in sorted(FIXATION_CACHE.glob(f"fixation_{label}_*.pt")):
        cache = torch.load(cache_path, map_location="cpu", weights_only=False)
        name = str(cache["session"])
        path = Path(cache["metadata"]["timeline_path"])
        if name in paths:
            raise ValueError(f"duplicate timeline for {name}")
        if not path.exists():
            raise FileNotFoundError(path)
        paths[name] = path
    return paths


def nearest_rows(timestamps: np.ndarray, absolute_times: np.ndarray) -> tuple[np.ndarray, float]:
    right = np.searchsorted(timestamps, absolute_times, side="left")
    right = np.clip(right, 0, len(timestamps) - 1)
    left = np.maximum(right - 1, 0)
    choose_left = np.abs(timestamps[left] - absolute_times) <= np.abs(
        timestamps[right] - absolute_times
    )
    rows = np.where(choose_left, left, right).astype(np.int64)
    error_ms = float(np.max(np.abs(timestamps[rows] - absolute_times)) * 1000.0)
    return rows, error_ms


def load_raw_sessions(animal: str, names: list[str], canonical_names: list[str]) -> list[RawSession]:
    config = ANIMALS[animal]
    pack_paths = sorted(Path(config["pack_dir"]).glob("*.pt"))
    by_name = {path.stem: path for path in pack_paths}
    if set(by_name) != set(names):
        raise ValueError(
            f"{animal}: pack/session mismatch; missing={sorted(set(names)-set(by_name))}, "
            f"extra={sorted(set(by_name)-set(names))}"
        )
    timelines = timeline_paths(animal)
    canonical = scene_lookup(canonical_names)
    sessions: list[RawSession] = []

    for local_index, name in enumerate(names):
        pack = torch.load(by_name[name], map_location="cpu", weights_only=False)
        if str(pack["session"]) != name or int(pack["session_index"]) != local_index:
            raise ValueError(f"{name}: pack session identity/order differs from ridge manifest")
        if int(pack["tc"]) != 4:
            raise ValueError(f"{name}: expected four-bin tokens, got tc={pack['tc']}")

        lut = torch.tensor([canonical.get(value, -1) for value in pack["scene_names"]])
        gs_all = lut[pack["scene"].long()]
        keep = gs_all >= 0
        n_all = len(gs_all)
        timeline = torch.load(timelines[name], map_location="cpu", weights_only=False)
        timestamps = timeline["timestamps"].double().numpy()
        absolute_times = pack["t_abs"].double().numpy() + float(timestamps[0])
        rows_all, error_ms = nearest_rows(timestamps, absolute_times)

        if error_ms >= 1.0:
            raise ValueError(f"{name}: t_abs recovery error {error_ms:.3f} ms is too large")
        if np.any(rows_all[keep.numpy()] % 2):
            raise ValueError(f"{name}: recovered token starts are not all on the two-bin grid")
        raw_scene = timeline["scene_index"].numpy()
        local_scene = pack["scene"].numpy()
        if not np.array_equal(raw_scene[rows_all], local_scene):
            raise ValueError(f"{name}: recovered token starts disagree with raw scene labels")
        del timeline

        def filtered(key: str, *, dtype: torch.dtype | None = None) -> torch.Tensor:
            value = pack[key][keep]
            return value.to(dtype) if dtype is not None else value

        sessions.append(
            RawSession(
                global_index=int(config["global_offset"]) + local_index,
                local_index=local_index,
                name=name,
                spikes=filtered("spikes"),
                drift=filtered("drift"),
                pos=filtered("pos"),
                tabs=filtered("t_trial"),
                pscale=filtered("pscale"),
                gs=gs_all[keep].long(),
                fold=filtered("fold").long(),
                start_rows=rows_all[keep.numpy()],
                timestamp_error_ms=error_ms,
            )
        )
        print(
            f"loaded {name}: {int(keep.sum()):,} tokens; "
            f"timestamp recovery max {error_ms:.3f} ms",
            flush=True,
        )
        del pack
    return sessions


def fold_map(sessions: Iterable[RawSession], scene_count: int) -> torch.Tensor:
    result = torch.full((scene_count,), -1, dtype=torch.long)
    for session in sessions:
        for scene, fold in zip(session.gs.tolist(), session.fold.tolist()):
            previous = int(result[scene])
            if previous >= 0 and previous != fold:
                raise ValueError(f"scene {scene}: inconsistent folds {previous}/{fold}")
            result[scene] = fold
    if bool((result < 0).any()):
        raise ValueError(f"missing fold assignments for {torch.nonzero(result < 0).flatten().tolist()}")
    return result


def prepare_fold(
    sessions: list[RawSession],
    folds: torch.Tensor,
    fold: int,
    wanted_scenes: set[int],
) -> dict[int, list[SceneSession]]:
    training_scenes = torch.nonzero((folds >= 0) & (folds != fold)).flatten()
    output: dict[int, list[SceneSession]] = {scene: [] for scene in wanted_scenes}
    for session in sessions:
        started = time.perf_counter()
        spikes = session.spikes.float().sqrt()
        training = torch.isin(session.gs, training_scenes)
        x = spikes[training]
        if not len(x):
            raise ValueError(f"{session.name}: no training tokens for fold {fold}")
        mean = x.mean((0, 1))
        sd = PF.sd_floor(x)
        del x

        drift = session.drift.float()
        drift_mean = drift.mean((0, 1), keepdim=True)
        drift_sd = drift.std((0, 1), keepdim=True).clamp_min(1e-3)
        drift = (drift - drift_mean) / drift_sd

        for scene in wanted_scenes:
            indices = torch.nonzero(session.gs == scene).flatten()
            if not len(indices):
                continue
            starts = session.start_rows[indices.numpy()]
            if np.any(np.diff(starts) <= 0):
                raise ValueError(f"{session.name}: scene {scene} token starts are not monotone")
            output[scene].append(
                SceneSession(
                    global_index=session.global_index,
                    local_index=session.local_index,
                    name=session.name,
                    spikes=((spikes[indices] - mean) / sd).contiguous(),
                    drift=drift[indices].contiguous(),
                    pos=session.pos[indices].float().contiguous(),
                    tabs=session.tabs[indices].float().contiguous(),
                    pscale=session.pscale[indices].float().contiguous(),
                    start_rows=starts,
                )
            )
        print(
            f"prepared f{fold} {session.name}: {time.perf_counter()-started:.2f}s",
            flush=True,
        )
        del spikes, drift
    for value in output.values():
        value.sort(key=lambda session: session.local_index)
    return output


def timeline_sessions_for_scene(
    sessions: list[RawSession], scene_index: int
) -> list[TimelineSession]:
    """Select only the token start rows for one scene, without model preprocessing."""

    output: list[TimelineSession] = []
    for session in sessions:
        indices = torch.nonzero(session.gs == scene_index).flatten()
        if not len(indices):
            continue
        starts = session.start_rows[indices.numpy()]
        if np.any(np.diff(starts) <= 0):
            raise ValueError(f"{session.name}: scene {scene_index} token starts are not monotone")
        output.append(TimelineSession(local_index=session.local_index, start_rows=starts))
    output.sort(key=lambda session: session.local_index)
    return output


def model_from_checkpoint(
    fold: int,
    device: torch.device,
    qchunk: int,
) -> tuple[E2E, SimpleNamespace, dict[str, Any]]:
    checkpoint_path = E2E_ROOT / f"out/BESTFT_f{fold}.ckpt"
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    args = SimpleNamespace(**checkpoint["args"])
    args.K = MODEL_K
    units = checkpoint["units"]
    if len(units) != 30:
        raise ValueError(f"{checkpoint_path}: expected 30 global session read-ins")
    sources = [0] * 14 + [1] * 16 if getattr(args, "persrc", 0) else None
    source_ts = [4, 4] if sources is not None else None
    channels = 3 if int(getattr(args, "color", 0)) else 1
    model = E2E(
        units,
        T=args.T,
        Fb=getattr(args, "Fb", 8),
        d=args.d,
        nlat=getattr(args, "nlat", 256),
        K=args.K,
        nloc=args.nloc,
        depth=args.depth,
        up=args.up,
        aux=bool(args.aux),
        auxdet=bool(args.auxdet),
        auxpos=bool(getattr(args, "auxpos", 1)),
        attn=getattr(args, "attn", "global"),
        nfeat=checkpoint.get("nfeat", 0),
        perbin=getattr(args, "perbin", 0),
        dp=getattr(args, "dp", 32),
        qchunk=qchunk,
        tokattn=getattr(args, "tokattn", "plain"),
        sigt=getattr(args, "sigt", 0.4),
        src=sources,
        Ts=source_ts,
        geopos=bool(getattr(args, "geopos", 0)),
        globmlp=bool(getattr(args, "globmlp", 0)),
        qself=int(getattr(args, "qself", 0)),
        retinal=(getattr(args, "pscale", "ignore") == "retinal"),
        norefine=bool(getattr(args, "norefine", 0)),
        qpmin=float(getattr(args, "qpmin", 0.0)),
        tbfold=bool(getattr(args, "tbfold", 0)),
        nchout=channels,
    )
    model.load_state_dict(checkpoint["state"])
    model.eval().to(device)
    return model, args, checkpoint


def query_grid(device: torch.device, up: int) -> tuple[torch.Tensor, tuple[int, int]]:
    qh, qw = MODEL_HW[0] // up, MODEL_HW[1] // up
    yy, xx = torch.meshgrid(torch.arange(qh), torch.arange(qw), indexing="ij")
    qxy = torch.stack([(xx + 0.5) * up * PX, (yy + 0.5) * up * PX], -1).reshape(-1, 2)
    return qxy.to(device), (qh, qw)


def prefix_session_counts(
    scene_json: dict[str, Any],
    evidence_path: Path,
    sessions: list[SceneSession] | list[TimelineSession],
    counts: Iterable[int] | None = None,
) -> tuple[list[list[int]], list[int], list[int]]:
    evidence = np.load(evidence_path, allow_pickle=False)
    order = np.lexsort((evidence["fixation_id"], evidence["session_index"])).astype(np.int64)
    ordered_session = evidence["session_index"][order].astype(np.int64)
    ordered_fixation = evidence["fixation_id"][order].astype(np.int64)
    frame_bin = evidence["source_example_indices"][order, 0].astype(np.int64)
    if len(order) != int(scene_json["total"]):
        raise ValueError(f"{evidence_path.name}: ridge/site event count differs")
    if ordered_session.tolist() != scene_json["session"]:
        raise ValueError(f"{evidence_path.name}: ridge/site session chronology differs")
    if ordered_fixation.tolist() != scene_json["fixation"]:
        raise ValueError(f"{evidence_path.name}: ridge/site fixation chronology differs")

    by_local = {session.local_index: session for session in sessions}
    session_count = max(scene_json["session"]) + 1
    plans: list[list[int]] = []
    totals: list[int] = []
    cutoffs: list[int] = []
    requested_counts = scene_json["frameCounts"] if counts is None else counts
    for count in requested_counts:
        count = int(count)
        selected = [0] * session_count
        if count <= 0:
            plans.append(selected)
            totals.append(0)
            cutoffs.append(-1)
            continue
        current = int(ordered_session[count - 1])
        # Ridge lag=2 and W=9: last observed row is t+10.  Four-bin token
        # [s,s+3] is fully observed when s <= t+7.
        max_token_start = int(frame_bin[count - 1]) + 7
        for local_index, session in by_local.items():
            if local_index < current:
                selected[local_index] = len(session)
            elif local_index == current:
                selected[local_index] = int(
                    np.searchsorted(session.start_rows, max_token_start, side="right")
                )
        plans.append(selected)
        totals.append(sum(selected))
        cutoffs.append(max_token_start)

    if any(right < left for left, right in zip(totals, totals[1:])):
        raise ValueError(f"{evidence_path.name}: prefix token counts are not monotone")
    return plans, totals, cutoffs


def infer_prefix(
    model: E2E,
    args: SimpleNamespace,
    sessions: list[SceneSession],
    selected: list[int],
    model_hull_q: torch.Tensor,
    qxy: torch.Tensor,
    qshape: tuple[int, int],
    device: torch.device,
) -> tuple[torch.Tensor, float, int]:
    entries: dict[int, tuple[torch.Tensor, ...]] = {}
    token_count = 0
    for session in sessions:
        count = selected[session.local_index]
        if count <= 0:
            continue
        token_count += count
        spikes = session.spikes[:count].to(device, non_blocking=True)
        drift = session.drift[:count].to(device, non_blocking=True)
        position = session.pos[:count].to(device, non_blocking=True)
        tabs = session.tabs[:count].to(device, non_blocking=True)
        pscale = session.pscale[:count].to(device, non_blocking=True)
        velocity = torch.zeros((count, 40), device=device, dtype=spikes.dtype)
        entries[session.global_index] = (
            spikes.transpose(1, 2),
            drift,
            velocity,
            position,
            None,
            tabs,
            pscale,
        )
    if not entries:
        raise ValueError("the model cannot be evaluated on an empty prefix")

    mask = model_hull_q[None, None].float().to(device)
    cov = F.avg_pool2d(mask, args.up).flatten(2).transpose(1, 2)
    origin = torch.zeros(1, 2, device=device)
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    started = time.perf_counter()
    with torch.no_grad():
        prediction = model([entries], qxy[None], qshape, cov, origin, PX).float()[0]
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    elapsed = time.perf_counter() - started
    return prediction.cpu(), elapsed, token_count


def load_final_predictions(animal: str) -> dict[str, tuple[int, torch.Tensor, Path]]:
    output: dict[str, tuple[int, torch.Tensor, Path]] = {}
    pattern = ANIMALS[animal]["final_pattern"]
    for fold in range(5):
        path = E2E_ROOT / "out" / pattern.format(fold)
        bundle = torch.load(path, map_location="cpu", weights_only=False)
        if int(bundle["fold"]) != fold:
            raise ValueError(f"{path}: bundle fold differs")
        for scene, prediction in zip(bundle["scenes"], bundle["pred"], strict=True):
            if scene in output:
                raise ValueError(f"{animal}: duplicate terminal prediction for {scene}")
            output[scene] = (fold, prediction.float(), path)
    return output


def display_transform(
    terminal_prediction: torch.Tensor,
    truth: torch.Tensor,
    hull: torch.Tensor,
) -> DisplayTransform:
    terminal = F.interpolate(
        terminal_prediction[None, None],
        size=FULL_HW,
        mode="bicubic",
        align_corners=False,
    )[0, 0]
    source = terminal[hull]
    target = truth[hull]
    source_mean = float(source.mean())
    source_std = float(source.std())
    target_mean = float(target.mean())
    target_std = float(target.std())
    gain = target_std / source_std if source_std >= 1e-9 else 1.0
    calibrated = (terminal - source_mean) * gain + target_mean
    values = calibrated[hull]
    low, high = torch.quantile(values, torch.tensor([0.01, 0.99])).tolist()
    return DisplayTransform(
        source_mean=source_mean,
        source_std=source_std,
        target_mean=target_mean,
        target_std=target_std,
        gain=gain,
        low=float(low),
        high=float(high),
        hull=hull,
    )


def render_prediction(
    prediction: torch.Tensor,
    transform: DisplayTransform,
    size_hw: tuple[int, int],
) -> Image.Image:
    full = F.interpolate(
        prediction[None, None], size=FULL_HW, mode="bicubic", align_corners=False
    )[0, 0]
    calibrated = (full - transform.source_mean) * transform.gain + transform.target_mean
    scaled = ((calibrated - transform.low) / max(transform.high - transform.low, 1e-9)).clamp(0, 1)
    gray = scaled.mul(255).round().byte().numpy()
    rgb = np.empty((*FULL_HW, 3), dtype=np.uint8)
    rgb[:] = OUTSIDE
    mask = transform.hull.numpy().astype(bool)
    rgb[mask] = gray[mask, None]
    return Image.fromarray(rgb, mode="RGB").resize(
        (size_hw[1], size_hw[0]), Image.Resampling.LANCZOS
    )


def neutral_frame(hull: torch.Tensor, size_hw: tuple[int, int]) -> Image.Image:
    rgb = np.empty((*FULL_HW, 3), dtype=np.uint8)
    rgb[:] = OUTSIDE
    rgb[hull.numpy().astype(bool)] = NEUTRAL
    return Image.fromarray(rgb, mode="RGB").resize(
        (size_hw[1], size_hw[0]), Image.Resampling.LANCZOS
    )


def fidelity_gaussian_kernel() -> torch.Tensor:
    offsets = torch.arange(-SSIM_RADIUS, SSIM_RADIUS + 1, dtype=torch.float32)
    weights = torch.exp(-(offsets**2) / (2.0 * SSIM_SIGMA**2))
    return weights / weights.sum()


def fidelity_blur(value: torch.Tensor, kernel: torch.Tensor) -> torch.Tensor:
    horizontal = F.conv2d(value[None, None], kernel.view(1, 1, 1, -1))
    return F.conv2d(horizontal, kernel.view(1, 1, -1, 1))[0, 0]


def transformer_fidelity_series(
    frames: list[Image.Image],
    counts: list[int],
    score_record: dict[str, Any],
) -> dict[str, Any]:
    """Score the exact displayed transformer anchors on the ridge fidelity domain."""

    if len(frames) != len(counts):
        raise ValueError("transformer fidelity frame/count length differs")
    truth = score_record["truth"].float().clamp(0.0, 1.0)
    domain = score_record["hull"].bool()
    if tuple(truth.shape) != FULL_HW or tuple(domain.shape) != FULL_HW:
        raise ValueError("transformer fidelity truth/hull shape differs from the site canvas")

    kernel = fidelity_gaussian_kernel()
    truth_mean = fidelity_blur(truth, kernel)
    truth_variance = fidelity_blur(truth * truth, kernel) - truth_mean**2
    interior = F.conv2d(
        domain.float()[None, None],
        torch.ones(1, 1, 2 * SSIM_RADIUS + 1, 2 * SSIM_RADIUS + 1),
    )[0, 0] > (2 * SSIM_RADIUS + 1) ** 2 - 0.5
    if not bool(interior.any()):
        raise ValueError("transformer fidelity hull is too thin to score SSIM")

    curves: dict[str, list[float]] = {
        key: [] for key in ("psnr", "ssim", "rmse", "correlation")
    }
    for frame in frames:
        shown = frame.resize((FULL_HW[1], FULL_HW[0]), Image.Resampling.LANCZOS).convert("L")
        prediction = torch.from_numpy(
            np.asarray(shown, dtype=np.float32).copy() / 255.0
        )
        inside_prediction = prediction[domain]
        inside_truth = truth[domain]
        difference = inside_prediction - inside_truth
        mse = float(torch.mean(difference * difference))
        centered_prediction = inside_prediction - inside_prediction.mean()
        centered_truth = inside_truth - inside_truth.mean()
        denominator = float(
            torch.sqrt(torch.sum(centered_prediction**2) * torch.sum(centered_truth**2))
        )

        prediction_mean = fidelity_blur(prediction, kernel)
        prediction_variance = (
            fidelity_blur(prediction * prediction, kernel) - prediction_mean**2
        )
        covariance = fidelity_blur(prediction * truth, kernel) - prediction_mean * truth_mean
        ssim_map = (
            (2.0 * prediction_mean * truth_mean + SSIM_C1) *
            (2.0 * covariance + SSIM_C2)
        ) / (
            (prediction_mean**2 + truth_mean**2 + SSIM_C1) *
            (prediction_variance + truth_variance + SSIM_C2)
        )

        curves["psnr"].append(float(10.0 * np.log10(1.0 / mse)) if mse > 0.0 else 99.0)
        curves["ssim"].append(float(ssim_map[interior].mean()))
        curves["rmse"].append(float(math.sqrt(mse)))
        curves["correlation"].append(
            float(torch.sum(centered_prediction * centered_truth)) / denominator
            if denominator > 0.0
            else 0.0
        )

    return {
        "counts": [int(value) for value in counts],
        "psnr": [round(value, 3) for value in curves["psnr"]],
        "ssim": [round(value, 5) for value in curves["ssim"]],
        "rmse": [round(value, 5) for value in curves["rmse"]],
        "correlation": [round(value, 5) for value in curves["correlation"]],
        "source": "exact displayed transformer checkpoint frames",
    }


def attach_transformer_fidelity(
    scene_json: dict[str, Any],
    frames: list[Image.Image],
    score_record: dict[str, Any],
) -> None:
    fidelity = scene_json.get("fidelity")
    if not fidelity or not fidelity.get("series", {}).get("posterior"):
        raise ValueError(f"{scene_json.get('slug', 'scene')}: 1/f fidelity series is missing")
    fidelity["schema"] = 2
    fidelity["series"].pop("evidence", None)
    fidelity["series"]["transformer"] = transformer_fidelity_series(
        frames,
        [int(value) for value in scene_json["transformerProgress"]["counts"]],
        score_record,
    )
    fidelity["comparison"] = "1/f reconstruction and end-to-end transformer"
    fidelity["transformerEvaluation"] = (
        "displayed exact checkpoints scored against held-out truth on the robust hull; "
        "the chart interpolates between checkpoints"
    )


def transformer_frames_from_assets(
    scene_json: dict[str, Any], scene_dir: Path
) -> list[Image.Image]:
    progress = scene_json["transformerProgress"]
    sprite = Image.open(scene_dir / scene_json["assets"]["transformerPrefix"]).convert("RGB")
    frames: list[Image.Image] = []
    for frame_index in range(len(progress["counts"])):
        x = (frame_index % int(progress["spriteColumns"])) * int(progress["frameWidth"])
        y = (frame_index // int(progress["spriteColumns"])) * int(progress["frameHeight"])
        frames.append(
            sprite.crop(
                (
                    x,
                    y,
                    x + int(progress["frameWidth"]),
                    y + int(progress["frameHeight"]),
                )
            )
        )
    frames[-1] = Image.open(scene_dir / scene_json["assets"]["transformer"]).convert("RGB")
    return frames


def pack_sprite(frames: list[Image.Image], columns: int) -> Image.Image:
    if not frames:
        raise ValueError("empty sprite")
    width, height = frames[0].size
    rows = math.ceil(len(frames) / columns)
    sprite = Image.new("RGB", (columns * width, rows * height), tuple(OUTSIDE.tolist()))
    for index, frame in enumerate(frames):
        if frame.size != (width, height):
            raise ValueError("sprite frames have different sizes")
        sprite.paste(frame, ((index % columns) * width, (index // columns) * height))
    return sprite


def resolve_scene(record: dict[str, Any], requested: str | None) -> bool:
    if requested is None:
        return True
    return requested in (record["scene"], record["slug"])


def model_hull_tensor(mode: str, animal: str) -> tuple[torch.Tensor, str]:
    # Historical provenance: BESTL was generated on Aug 30 before dens_cross
    # accepted --hullsrc.  Its model cov therefore used TGS[0] (targets.pt),
    # even though its display/scoring cache was Logan-specific.  Default to that
    # contract so prefixes and the immutable terminal bundle use the same model.
    filename = "targets.pt" if mode == "shipped" or animal == "allen" else "targets_logan.pt"
    target = torch.load(E2E_ROOT / "data" / filename, map_location="cpu", weights_only=False)
    return target["hull_q"].bool(), filename


def benchmark_scene(args: argparse.Namespace, animal: str, record: dict[str, Any]) -> None:
    animal_config = ANIMALS[animal]
    ridge = ridge_config(animal)
    manifest = json.loads((Path(ridge["bundle_root"]) / "evidence/manifest.json").read_text())
    names = list(manifest["sessions"])
    targets = canonical_targets()
    canonical_names = list(targets["scene_names"])
    finals = load_final_predictions(animal)
    fold, terminal, bundle_path = finals[record["scene"]]
    scene_index = canonical_names.index(record["scene"])

    prep_started = time.perf_counter()
    raw = load_raw_sessions(animal, names, canonical_names)
    folds = fold_map(raw, len(canonical_names))
    prepared = prepare_fold(raw, folds, fold, {scene_index})[scene_index]
    prep_seconds = time.perf_counter() - prep_started
    scene_path = Path(ridge["site_data_root"]) / record["data"]
    scene_json = json.loads(scene_path.read_text())
    plans, token_counts, cutoffs = prefix_session_counts(
        scene_json,
        Path(ridge["bundle_root"]) / "evidence" / f"{record['scene']}.npz",
        prepared,
    )
    index = args.checkpoint_index
    if index < 0:
        index += len(plans)
    if not 0 < index < len(plans):
        raise ValueError(f"benchmark checkpoint must be in 1..{len(plans)-1}, got {index}")

    device = torch.device(args.device)
    model, model_args, _ = model_from_checkpoint(fold, device, QCHUNK)
    qxy, qshape = query_grid(device, model_args.up)
    hull_q, hull_source = model_hull_tensor(args.model_hull, animal)
    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats(device)
    prediction, forward_seconds, inferred_tokens = infer_prefix(
        model,
        model_args,
        prepared,
        plans[index],
        hull_q[scene_index],
        qxy,
        qshape,
        device,
    )
    peak_bytes = torch.cuda.max_memory_allocated(device) if device.type == "cuda" else 0

    scoring = torch.load(animal_config["scoring"], map_location="cpu", weights_only=False)
    score_record = scoring[record["scene"]]
    transform = display_transform(terminal, score_record["truth"].float(), score_record["hull"].bool())
    rendered = render_prediction(prediction, transform, FRAME_HW)
    buffer = io.BytesIO()
    rendered.save(buffer, format="WEBP", quality=args.webp_quality, method=6)
    full_token_count = sum(len(session) for session in prepared)
    fractions = np.asarray(token_counts, dtype=np.float64) / max(full_token_count, 1)
    selected_fraction = token_counts[index] / max(full_token_count, 1)
    # The two global token-attention blocks dominate asymptotically.  This is a
    # transparent rough estimate, not a scheduling promise.
    full_equivalent = float(np.square(fractions[1:-1]).sum())
    estimated_scene_seconds = (
        forward_seconds * full_equivalent / max(selected_fraction**2, 1e-6)
    )

    validation: dict[str, float] | None = None
    if args.validate_full:
        full_plan = [0] * len(names)
        for session in prepared:
            full_plan[session.local_index] = len(session)
        full_prediction, full_seconds, _ = infer_prefix(
            model,
            model_args,
            prepared,
            full_plan,
            hull_q[scene_index],
            qxy,
            qshape,
            device,
        )
        difference = full_prediction - terminal
        validation = {
            "seconds": full_seconds,
            "maxAbs": float(difference.abs().max()),
            "rmse": float(difference.square().mean().sqrt()),
        }

    report = {
        "animal": animal,
        "scene": record["scene"],
        "fold": fold,
        "checkpointIndex": index,
        "ridgeEvents": scene_json["frameCounts"][index],
        "tokens": inferred_tokens,
        "fullTokens": full_token_count,
        "tokenFraction": selected_fraction,
        "rawTokenStartCutoff": cutoffs[index],
        "prepSeconds": prep_seconds,
        "forwardSeconds": forward_seconds,
        "peakGpuBytes": int(peak_bytes),
        "singleFrameWebPBytes": len(buffer.getvalue()),
        "roughFullSceneSeconds": estimated_scene_seconds,
        "roughFullEquivalentForIntermediateCheckpoints": full_equivalent,
        "modelHull": hull_source,
        "terminalBundle": bundle_path.name,
        "fullValidation": validation,
    }
    print("BENCHMARK " + json.dumps(report, indent=2), flush=True)


def update_asset_manifest(
    scene_dir: Path,
    scene: str,
    report: dict[str, Any],
) -> None:
    path = scene_dir / "asset_manifest.json"
    if not path.exists():
        return
    manifest = json.loads(path.read_text())
    manifest.setdefault("outputs", {})["scene.json"] = file_record(scene_dir / "scene.json")
    manifest["outputs"]["transformer.webp"] = file_record(scene_dir / "transformer.webp")
    manifest["outputs"]["transformer-prefix.webp"] = file_record(
        scene_dir / "transformer-prefix.webp"
    )
    manifest["outputs"]["thumb.webp"] = file_record(scene_dir / "thumb.webp")
    manifest["outputs"]["thumb-transformer.webp"] = file_record(
        scene_dir / "thumb-transformer.webp"
    )
    manifest["transformer_prefix"] = {"scene": scene, **report}
    scene_json = json.loads((scene_dir / "scene.json").read_text())
    transformer_fidelity = scene_json.get("fidelity", {}).get("series", {}).get("transformer")
    if transformer_fidelity:
        reconstruction = manifest.setdefault("reconstruction_fidelity", {})
        reconstruction.pop("final_evidence_psnr_db", None)
        reconstruction["transformer_checkpoints"] = len(transformer_fidelity["counts"])
        reconstruction["final_transformer_psnr_db"] = transformer_fidelity["psnr"][-1]
        reconstruction["final_transformer_ssim"] = transformer_fidelity["ssim"][-1]
        manifest.setdefault("checks", {})[
            "transformer_fidelity_matches_displayed_checkpoint_frames"
        ] = True
    atomic_json(path, manifest)
    success_path = scene_dir / "_SUCCESS"
    if success_path.exists():
        atomic_json(success_path, {"asset_manifest_sha256": sha256_file(path)})


def build_thumbnail(scene_json: dict[str, Any], scene_dir: Path, terminal: Image.Image, quality: int) -> None:
    original = Image.open(scene_dir / scene_json["assets"]["original"]).convert("RGB")
    panels = [original, terminal]
    panels = [image.resize((THUMB_HW[1], THUMB_HW[0]), Image.Resampling.LANCZOS) for image in panels]
    thumbnail = Image.new("RGB", (2 * THUMB_HW[1] + 2, THUMB_HW[0]), tuple(OUTSIDE.tolist()))
    for index, panel in enumerate(panels):
        thumbnail.paste(panel, (index * (THUMB_HW[1] + 2), 0))
    # Keep the legacy filename correct for downstream users, but publish the
    # newly named file in the site manifest so browsers cannot reuse a cached
    # pre-transformer thumbnail.
    atomic_webp(scene_dir / "thumb.webp", thumbnail, quality=quality)
    atomic_webp(scene_dir / "thumb-transformer.webp", thumbnail, quality=quality)


def publish_scene(
    args: argparse.Namespace,
    animal: str,
    record: dict[str, Any],
    scene_index: int,
    fold: int,
    terminal: torch.Tensor,
    bundle_path: Path,
    prepared: list[SceneSession],
    model: E2E,
    model_args: SimpleNamespace,
    qxy: torch.Tensor,
    qshape: tuple[int, int],
    model_hull_q: torch.Tensor,
    model_hull_source: str,
    scoring: dict[str, Any],
    ridge: dict[str, Any],
    device: torch.device,
) -> dict[str, Any]:
    scene_path = Path(ridge["site_data_root"]) / record["data"]
    scene_dir = scene_path.parent
    scene_json = json.loads(scene_path.read_text())
    evidence_path = Path(ridge["bundle_root"]) / "evidence" / f"{record['scene']}.npz"
    plans, token_counts, cutoffs = prefix_session_counts(scene_json, evidence_path, prepared)
    _, fixation_token_counts, _ = prefix_session_counts(
        scene_json,
        evidence_path,
        prepared,
        counts=range(int(scene_json["total"]) + 1),
    )
    score_record = scoring[record["scene"]]
    truth = score_record["truth"].float()
    display_hull = score_record["hull"].bool()
    transform = display_transform(terminal, truth, display_hull)

    frames: list[Image.Image] = [neutral_frame(display_hull, FRAME_HW)]
    forward_seconds: list[float] = [0.0]
    actual_tokens: list[int] = [0]
    for frame_index in range(1, len(plans) - 1):
        prediction, elapsed, count = infer_prefix(
            model,
            model_args,
            prepared,
            plans[frame_index],
            model_hull_q,
            qxy,
            qshape,
            device,
        )
        if count != token_counts[frame_index]:
            raise AssertionError("planned and inferred token counts differ")
        frames.append(render_prediction(prediction, transform, FRAME_HW))
        forward_seconds.append(elapsed)
        actual_tokens.append(count)
        print(
            f"{animal:5s} f{fold} {record['slug']:24s} "
            f"frame {frame_index+1:02d}/{len(plans):02d} "
            f"ridge={scene_json['frameCounts'][frame_index]:4d} "
            f"tokens={count:6d} {elapsed:.2f}s",
            flush=True,
        )

    # The current-session cutoff can omit a small tail after the final ridge
    # event.  The immutable shipped bundle is the authoritative all-token frame.
    frames.append(render_prediction(terminal, transform, FRAME_HW))
    forward_seconds.append(0.0)
    actual_tokens.append(sum(len(session) for session in prepared))
    token_counts[-1] = actual_tokens[-1]
    fixation_token_counts[-1] = actual_tokens[-1]
    for frame_index, fixation_count in enumerate(scene_json["frameCounts"][:-1]):
        if fixation_token_counts[int(fixation_count)] != actual_tokens[frame_index]:
            raise AssertionError("per-fixation and checkpoint token counts differ")
    sprite = pack_sprite(frames, SPRITE_COLUMNS)
    atomic_webp(scene_dir / "transformer-prefix.webp", sprite, quality=args.webp_quality)
    terminal_image = render_prediction(terminal, transform, TERMINAL_HW)
    atomic_webp(scene_dir / "transformer.webp", terminal_image, quality=90)

    scene_json["assets"]["transformer"] = "transformer.webp"
    scene_json["assets"]["transformerPrefix"] = "transformer-prefix.webp"
    progress = {
        "mode": "exact-checkpointed-prefix-inference-with-fixation-interpolation",
        "counts": scene_json["frameCounts"],
        "tokenCounts": actual_tokens,
        "fixationTokenCounts": fixation_token_counts,
        "rawTokenStartCutoffs": cutoffs,
        "frameWidth": FRAME_HW[1],
        "frameHeight": FRAME_HW[0],
        "spriteColumns": SPRITE_COLUMNS,
        "frames": len(frames),
        "tokenBins": 4,
        "tokenMilliseconds": 1000.0 * 4.0 / 120.0,
        "strideBins": 2,
        "strideMilliseconds": 1000.0 * 2.0 / 120.0,
        "alignment": {
            "clock": "source raw120 rows recovered from t_abs and source timestamps",
            "ridgeWindow": "[t+2,t+10] inclusive",
            "admission": "four-bin token [s,s+3] included when s+3 <= t+10",
            "betweenCheckpoints": (
                "linear interpolation between adjacent exact prefix frames, equally weighted "
                "by fixation progress and exact accumulated token progress"
            ),
        },
        "checkpoint": f"BESTFT_f{fold}.ckpt",
        "terminalSource": bundle_path.name,
        "terminalPolicy": "shipped all-token bundle; no prefix inference substituted",
        "renderingPolicy": (
            "every fixation renders a distinct state from fixation and admitted-token progress; "
            "exact checkpoint frames are interpolation anchors"
        ),
        "modelHull": f"{model_hull_source}:hull_q",
        "display": {
            "hull": f"{Path(ANIMALS[animal]['scoring']).name}:solve_domain",
            "calibration": "single terminal truth-matched affine, fixed for all prefixes",
            "range": "single terminal in-hull q01/q99, fixed for all prefixes",
            "outsideRgb": OUTSIDE.astype(int).tolist(),
            "sourceMean": transform.source_mean,
            "sourceStd": transform.source_std,
            "targetMean": transform.target_mean,
            "targetStd": transform.target_std,
            "gain": transform.gain,
            "low": transform.low,
            "high": transform.high,
        },
    }
    scene_json["transformerProgress"] = progress
    fidelity_frames = [*frames]
    fidelity_frames[-1] = terminal_image
    attach_transformer_fidelity(scene_json, fidelity_frames, score_record)
    atomic_json(scene_path, scene_json)
    build_thumbnail(scene_json, scene_dir, terminal_image, quality=88)

    report = {
        "frames": len(frames),
        "fixationFrames": int(scene_json["total"]) + 1,
        "intermediateForwards": len(frames) - 2,
        "forwardSeconds": float(sum(forward_seconds)),
        "maxForwardSeconds": float(max(forward_seconds)),
        "fullTokens": actual_tokens[-1],
        "spriteBytes": (scene_dir / "transformer-prefix.webp").stat().st_size,
        "terminalBytes": (scene_dir / "transformer.webp").stat().st_size,
        "modelHull": model_hull_source,
        "terminalBundle": bundle_path.name,
        "timestampRecoveryMaxMs": max(
            (raw.timestamp_error_ms for raw in CURRENT_RAW_SESSIONS), default=0.0
        ),
    }
    update_asset_manifest(scene_dir, record["scene"], report)
    return report


# The manifest report needs the timing-recovery audit without copying it into
# every prepared session tensor.  This is assigned once per animal build.
CURRENT_RAW_SESSIONS: list[RawSession] = []


def publish_animal(args: argparse.Namespace, animal: str) -> list[dict[str, Any]]:
    global CURRENT_RAW_SESSIONS
    ridge = ridge_config(animal)
    site_manifest = json.loads((Path(ridge["site_data_root"]) / "manifest.json").read_text())
    records = [record for record in site_manifest["scenes"] if resolve_scene(record, args.scene)]
    if not records:
        raise ValueError(f"{animal}: requested scene {args.scene!r} not found")
    if args.max_scenes:
        records = records[: args.max_scenes]
    evidence_manifest = json.loads(
        (Path(ridge["bundle_root"]) / "evidence/manifest.json").read_text()
    )
    names = list(evidence_manifest["sessions"])
    targets = canonical_targets()
    canonical_names = list(targets["scene_names"])
    canonical = scene_lookup(canonical_names)
    finals = load_final_predictions(animal)
    expected = {record["scene"] for record in records}
    if not expected <= set(finals):
        raise ValueError(f"{animal}: terminal bundles missing {sorted(expected-set(finals))}")

    CURRENT_RAW_SESSIONS = load_raw_sessions(animal, names, canonical_names)
    folds = fold_map(CURRENT_RAW_SESSIONS, len(canonical_names))
    scoring = torch.load(ANIMALS[animal]["scoring"], map_location="cpu", weights_only=False)
    hull_q, hull_source = model_hull_tensor(args.model_hull, animal)
    device = torch.device(args.device)
    reports: list[dict[str, Any]] = []

    by_fold: dict[int, list[dict[str, Any]]] = {}
    for record in records:
        fold, _, _ = finals[record["scene"]]
        if int(folds[canonical[record["scene"]]]) != fold:
            raise ValueError(f"{record['scene']}: checkpoint/bundle fold differs from token fold")
        by_fold.setdefault(fold, []).append(record)

    for fold, fold_records in sorted(by_fold.items()):
        wanted = {canonical[record["scene"]] for record in fold_records}
        prepared = prepare_fold(CURRENT_RAW_SESSIONS, folds, fold, wanted)
        model, model_args, _ = model_from_checkpoint(fold, device, QCHUNK)
        qxy, qshape = query_grid(device, model_args.up)
        for record in fold_records:
            scene_index = canonical[record["scene"]]
            bundle_fold, terminal, bundle_path = finals[record["scene"]]
            report = publish_scene(
                args,
                animal,
                record,
                scene_index,
                bundle_fold,
                terminal,
                bundle_path,
                prepared[scene_index],
                model,
                model_args,
                qxy,
                qshape,
                hull_q[scene_index],
                hull_source,
                scoring,
                ridge,
                device,
            )
            record["thumb"] = str(Path(record["data"]).parent / "thumb-transformer.webp")
            reports.append({"animal": animal, "scene": record["scene"], **report})
        del prepared, model, qxy
        gc.collect()
        if device.type == "cuda":
            torch.cuda.empty_cache()

    atomic_json(Path(ridge["site_data_root"]) / "manifest.json", site_manifest)
    CURRENT_RAW_SESSIONS = []
    return reports


def refresh_ui_assets(args: argparse.Namespace, animal: str) -> list[dict[str, Any]]:
    """Refresh fixation-resolved metadata and thumbnails without loading a model."""

    ridge = ridge_config(animal)
    manifest_path = Path(ridge["site_data_root"]) / "manifest.json"
    site_manifest = json.loads(manifest_path.read_text())
    records = [record for record in site_manifest["scenes"] if resolve_scene(record, args.scene)]
    if not records:
        raise ValueError(f"{animal}: requested scene {args.scene!r} not found")
    if args.max_scenes:
        records = records[: args.max_scenes]

    evidence_manifest = json.loads(
        (Path(ridge["bundle_root"]) / "evidence/manifest.json").read_text()
    )
    names = list(evidence_manifest["sessions"])
    canonical_names = list(canonical_targets()["scene_names"])
    canonical = scene_lookup(canonical_names)
    raw_sessions = load_raw_sessions(animal, names, canonical_names)
    scoring = torch.load(ANIMALS[animal]["scoring"], map_location="cpu", weights_only=False)
    reports: list[dict[str, Any]] = []

    for record in records:
        scene_path = Path(ridge["site_data_root"]) / record["data"]
        scene_dir = scene_path.parent
        scene_json = json.loads(scene_path.read_text())
        scene_index = canonical[record["scene"]]
        sessions = timeline_sessions_for_scene(raw_sessions, scene_index)
        evidence_path = Path(ridge["bundle_root"]) / "evidence" / f"{record['scene']}.npz"
        _, fixation_token_counts, _ = prefix_session_counts(
            scene_json,
            evidence_path,
            sessions,
            counts=range(int(scene_json["total"]) + 1),
        )

        progress = scene_json.get("transformerProgress")
        if not progress or not progress.get("tokenCounts"):
            raise ValueError(f"{animal}/{record['slug']}: transformer checkpoints are missing")
        for frame_index, fixation_count in enumerate(progress["counts"][:-1]):
            expected = int(progress["tokenCounts"][frame_index])
            observed = fixation_token_counts[int(fixation_count)]
            if observed != expected:
                raise AssertionError(
                    f"{animal}/{record['slug']}: token count {observed} != checkpoint {expected}"
                )
        fixation_token_counts[-1] = int(progress["tokenCounts"][-1])
        progress["mode"] = "exact-checkpointed-prefix-inference-with-fixation-interpolation"
        progress["fixationTokenCounts"] = fixation_token_counts
        progress.setdefault("alignment", {})["betweenCheckpoints"] = (
            "linear interpolation between adjacent exact prefix frames, equally weighted by "
            "fixation progress and exact accumulated token progress"
        )
        progress["renderingPolicy"] = (
            "every fixation renders a distinct state from fixation and admitted-token progress; "
            "exact checkpoint frames are interpolation anchors"
        )
        scene_json["transformerProgress"] = progress
        attach_transformer_fidelity(
            scene_json,
            transformer_frames_from_assets(scene_json, scene_dir),
            scoring[record["scene"]],
        )
        atomic_json(scene_path, scene_json)

        terminal = Image.open(scene_dir / scene_json["assets"]["transformer"]).convert("RGB")
        build_thumbnail(scene_json, scene_dir, terminal, quality=88)
        record["thumb"] = str(Path(record["data"]).parent / "thumb-transformer.webp")

        asset_path = scene_dir / "asset_manifest.json"
        asset_manifest = json.loads(asset_path.read_text())
        report = dict(asset_manifest.get("transformer_prefix", {}))
        report.pop("scene", None)
        report["fixationFrames"] = int(scene_json["total"]) + 1
        update_asset_manifest(scene_dir, record["scene"], report)
        reports.append(
            {
                "animal": animal,
                "scene": record["scene"],
                "fixationFrames": int(scene_json["total"]) + 1,
                "tokens": fixation_token_counts[-1],
            }
        )
        print(
            f"{animal:5s} {record['slug']:24s} "
            f"fixations={scene_json['total']:4d} tokens={fixation_token_counts[-1]:6d}",
            flush=True,
        )

    atomic_json(manifest_path, site_manifest)
    del raw_sessions
    gc.collect()
    return reports


def main() -> None:
    args = parse_args()
    torch.set_num_threads(args.threads)
    torch.set_float32_matmul_precision("highest")
    if args.device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is unavailable")
    animals = list(ANIMALS) if args.animal == "all" else [args.animal]

    if args.refresh_ui:
        all_reports: list[dict[str, Any]] = []
        started = time.perf_counter()
        for animal in animals:
            all_reports.extend(refresh_ui_assets(args, animal))
        print(
            "COMPLETE "
            + json.dumps(
                {
                    "scenes": len(all_reports),
                    "seconds": time.perf_counter() - started,
                    "fixationFrames": sum(report["fixationFrames"] for report in all_reports),
                    "reports": all_reports,
                },
                indent=2,
            ),
            flush=True,
        )
        return

    if args.benchmark:
        if len(animals) != 1 or not args.scene:
            raise ValueError("--benchmark requires one --animal and --scene")
        animal = animals[0]
        ridge = ridge_config(animal)
        manifest = json.loads((Path(ridge["site_data_root"]) / "manifest.json").read_text())
        matches = [record for record in manifest["scenes"] if resolve_scene(record, args.scene)]
        if len(matches) != 1:
            raise ValueError(f"{animal}: expected one scene match for {args.scene!r}")
        benchmark_scene(args, animal, matches[0])
        return

    all_reports: list[dict[str, Any]] = []
    started = time.perf_counter()
    for animal in animals:
        all_reports.extend(publish_animal(args, animal))
    summary = {
        "scenes": len(all_reports),
        "seconds": time.perf_counter() - started,
        "forwardSeconds": sum(report["forwardSeconds"] for report in all_reports),
        "spriteBytes": sum(report["spriteBytes"] for report in all_reports),
        "terminalBytes": sum(report["terminalBytes"] for report in all_reports),
        "reports": all_reports,
    }
    print("COMPLETE " + json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
