#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
evaluate.py -- 3DGS (Gaussian Splatting) 重建质量量化评估工具
============================================================

将重建（渲染）出的测试视图与真实拍摄的 ground-truth 测试视图逐张对比，
输出标准新视角合成（novel view synthesis）量化指标：

    PSNR, SSIM, MS-SSIM, RMSE, MAE   （纯 numpy 实现，无重型依赖）
    LPIPS                           （可选，需要 torch + lpips 包）

NIR（近红外）仅作为重建辅助信息、最终输出仍为 RGB 时，直接用本工具按
标准 RGB 指标评估即可；若渲染结果为单通道灰度（如 NIR 通道），本工具
会自动把灰度图视为 RGB 三通道等值图参与计算。

用法
----
    python evaluate.py --gt <gt_dir> --pred <pred_dir> [选项]

    # 在合成数据集上跑通全流程，验证工具本身（无需真实数据）
    python evaluate.py --demo

示例
----
    python evaluate.py --gt data/test_gt --pred output/renders
    python evaluate.py --gt data/test_gt --pred output/renders --out results
    python evaluate.py --gt data/test_gt --pred output/renders \
        --metrics psnr,ssim,lpips --max-images 100 --seed 0
    python evaluate.py --gt data/test_gt --pred output/renders --size 800x600

输出
----
    控制台：指标汇总表 + 最好/最差视图排名
    <out>/summary.json   全部指标的 mean / std / min / max 及排名
    <out>/per_image.csv  逐张图片的完整指标
    <out>/summary.txt    与控制台相同的汇总报告
"""

import argparse
import csv
import json
import os
import sys
import time

import numpy as np

try:
    from PIL import Image
    HAVE_PIL = True
except Exception:  # pragma: no cover
    HAVE_PIL = False

try:
    from scipy.ndimage import convolve as _scipy_convolve
    HAVE_SCIPY = True
except Exception:
    HAVE_SCIPY = False

DEFAULT_EXTS = ("png", "jpg", "jpeg", "bmp", "tif", "tiff", "webp")
DEFAULT_METRICS = ("psnr", "ssim", "ms-ssim", "rmse", "mae")
ALL_METRICS = ("psnr", "ssim", "ms-ssim", "rmse", "mae", "lpips")
MS_SSIM_WEIGHTS = (0.0448, 0.2856, 0.3001, 0.2363, 0.1333)


# ---------------------------------------------------------------------------
# 图像加载与预处理
# ---------------------------------------------------------------------------

def _normalize(arr):
    """任意整数/浮点数组 -> float32，数值范围归一到 [0, 1]。"""
    if arr.dtype == np.uint8:
        return arr.astype(np.float32) / 255.0
    if arr.dtype == np.uint16:
        return arr.astype(np.float32) / 65535.0
    if np.issubdtype(arr.dtype, np.floating):
        return arr.astype(np.float32)
    info = np.iinfo(arr.dtype)
    return (arr.astype(np.float32) - info.min) / float(info.max - info.min)


def load_image(path, target_size=None):
    """读取图片 -> float32 的 HxWx3 数组，数值范围 [0,1]。

    支持 8/16 位整数图；灰度图自动扩展为三通道；丢弃 alpha。
    target_size 为 (w, h) 时用 LANCZOS 重采样。
    """
    if not HAVE_PIL:  # pragma: no cover
        raise RuntimeError("需要 Pillow 库：pip install Pillow")
    with Image.open(path) as im:
        if im.mode == "I;16":  # 16 位灰度
            arr = np.asarray(im, dtype=np.uint16)
        else:
            arr = np.asarray(im.convert("RGB"))
    arr = _normalize(arr)
    if arr.ndim == 2:
        arr = np.repeat(arr[:, :, None], 3, axis=2)
    if arr.shape[2] != 3:
        arr = arr[:, :, :3]
    if target_size is not None:
        arr = resize_to(arr, target_size)
    return arr


def resize_to(arr, size_wh):
    """float32 HxWxC [0,1] -> 重采样为 (w, h)，LANCZOS。"""
    h, w = arr.shape[:2]
    if (w, h) == tuple(size_wh):
        return arr
    pil = Image.fromarray((np.clip(arr, 0.0, 1.0) * 255.0).round().astype(np.uint8))
    pil = pil.resize((int(size_wh[0]), int(size_wh[1])), Image.LANCZOS)
    return np.asarray(pil, dtype=np.float32) / 255.0


def collect_images(directory, exts):
    """扫描目录，返回 {文件名主干: 完整路径}（同主干多扩展名时优先 png）。"""
    found = {}
    if not directory or not os.path.isdir(directory):
        return found
    for name in sorted(os.listdir(directory)):
        path = os.path.join(directory, name)
        if not os.path.isfile(path):
            continue
        ext = os.path.splitext(name)[1].lstrip(".").lower()
        if ext in exts:
            stem = os.path.splitext(name)[0]
            if stem not in found or ext == "png":
                found[stem] = path
    return found


# ---------------------------------------------------------------------------
# 指标计算（纯 numpy）
# ---------------------------------------------------------------------------

def compute_psnr(a, b):
    """a, b: HxWxC float [0,1]。全通道 MSE -> PSNR(dB)。"""
    mse = float(np.mean((a - b) ** 2))
    if mse <= 0.0:
        return float("inf")
    return 10.0 * np.log10(1.0 / mse)


def compute_rmse(a, b):
    return float(np.sqrt(np.mean((a - b) ** 2)))


def compute_mae(a, b):
    return float(np.mean(np.abs(a - b)))


def _gauss_blur(img, sigma=1.5, win=11):
    """对 HxWxC 图像做高斯模糊（reflect 边界），返回同尺寸 float32 数组。

    优先用 scipy（快）；否则回退到纯 numpy 可分离卷积。
    """
    h, w = img.shape[:2]
    win = int(win) | 1  # 强制奇数
    if win > min(h, w):
        win = min(h, w) - 1 if min(h, w) % 2 == 0 else min(h, w)
        win = max(win, 1)
    if win < 3:
        return img.astype(np.float32)

    single = img.ndim == 2
    if single:
        img = img[:, :, None]

    if HAVE_SCIPY:
        ax = np.arange(-(win // 2), win // 2 + 1, dtype=np.float32)
        g1 = np.exp(-(ax ** 2) / (2.0 * sigma ** 2))
        kernel = np.outer(g1, g1)
        kernel /= kernel.sum()
        out = np.empty_like(img, dtype=np.float32)
        for c in range(img.shape[2]):
            out[..., c] = _scipy_convolve(img[..., c], kernel, mode="reflect")
        return out[..., 0] if single else out

    # ---- 纯 numpy 回退：可分离一维卷积 ----
    ax = np.arange(-(win // 2), win // 2 + 1, dtype=np.float32)
    g = np.exp(-(ax ** 2) / (2.0 * sigma ** 2))
    g /= g.sum()
    p = win // 2
    # 沿宽度方向
    img_p = np.pad(img, ((0, 0), (p, p), (0, 0)), mode="reflect")
    out = np.apply_along_axis(lambda m: np.convolve(m, g, mode="valid"), axis=1, arr=img_p)
    # 沿高度方向
    img_p = np.pad(out, ((p, p), (0, 0), (0, 0)), mode="reflect")
    out = np.apply_along_axis(lambda m: np.convolve(m, g, mode="valid"), axis=0, arr=img_p)
    out = out.astype(np.float32)
    return out[..., 0] if single else out


def _ssim_channel(a, b, data_range=1.0, k1=0.01, k2=0.03, win=11, sigma=1.5):
    """单通道 SSIM 图与对比度-结构 (CS) 图。"""
    c1 = (k1 * data_range) ** 2
    c2 = (k2 * data_range) ** 2
    mu1 = _gauss_blur(a, sigma, win)
    mu2 = _gauss_blur(b, sigma, win)
    mu1_sq = mu1 * mu1
    mu2_sq = mu2 * mu2
    mu1_mu2 = mu1 * mu2
    sigma1_sq = _gauss_blur(a * a, sigma, win) - mu1_sq
    sigma2_sq = _gauss_blur(b * b, sigma, win) - mu2_sq
    sigma12 = _gauss_blur(a * b, sigma, win) - mu1_mu2
    eps = 1e-12
    cs_map = (2.0 * sigma12 + c2) / (sigma1_sq + sigma2_sq + c2 + eps)
    ssim_map = ((2.0 * mu1_mu2 + c1) * (2.0 * sigma12 + c2)) / (
        (mu1_sq + mu2_sq + c1) * (sigma1_sq + sigma2_sq + c2) + eps
    )
    return ssim_map, cs_map


def compute_ssim(a, b, data_range=1.0, win=11, sigma=1.5):
    """a, b: HxWxC float [0,1] -> 各通道 SSIM 的均值（与 skimage 默认一致）。"""
    total = 0.0
    for c in range(a.shape[2]):
        m, _ = _ssim_channel(a[..., c], b[..., c], data_range, win=win, sigma=sigma)
        total += float(m.mean())
    return total / a.shape[2]


def _downsample2(img):
    """2x2 平均池化下采样（与 MS-SSIM 原文一致）。"""
    h, w = img.shape[:2]
    h2, w2 = h // 2 * 2, w // 2 * 2
    img = img[:h2, :w2]
    return img.reshape(h2 // 2, 2, w2 // 2, 2, -1).mean(axis=(1, 3))


def compute_ms_ssim(a, b, data_range=1.0, win=11, sigma=1.5,
                    weights=MS_SSIM_WEIGHTS):
    """a, b: HxWxC float [0,1] -> 多尺度 SSIM（Wang et al. 2003）。"""
    weights = np.asarray(weights, dtype=np.float64)
    cur_a = a.astype(np.float32)
    cur_b = b.astype(np.float32)
    mcs, ssims = [], []
    used = 0
    for level in range(len(weights)):
        s_sum = cs_sum = 0.0
        for c in range(cur_a.shape[2]):
            m, cs = _ssim_channel(cur_a[..., c], cur_b[..., c],
                                  data_range, win=win, sigma=sigma)
            s_sum += float(m.mean())
            cs_sum += float(cs.mean())
        ssims.append(max(s_sum / cur_a.shape[2], 0.0))
        mcs.append(max(cs_sum / cur_a.shape[2], 0.0))
        used += 1
        if level == len(weights) - 1:
            break
        # 图像过小无法继续下采样时提前停止，并重归一化权重
        if min(cur_a.shape[0], cur_a.shape[1]) // 2 < win + 2:
            break
        cur_a = _downsample2(cur_a)
        cur_b = _downsample2(cur_b)
    w = weights[:used]
    w = w / w.sum()
    value = 1.0
    for i in range(used - 1):
        value *= mcs[i] ** w[i]
    value *= ssims[used - 1] ** w[used - 1]
    return float(value)


# ---------------------------------------------------------------------------
# LPIPS（可选，依赖 torch + lpips）
# ---------------------------------------------------------------------------

def _resolve_lpips_device(device):
    if device == "auto":
        try:
            import torch
            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"
    return device


def get_lpips_model(device="auto"):
    """构建 LPIPS(AlexNet) 模型。首次运行会自动下载预训练权重到缓存目录。"""
    import torch  # noqa: F401
    import lpips

    dev = _resolve_lpips_device(device)
    model = lpips.LPIPS(net="alex")
    model.eval()
    model.to(dev)
    return model, dev


def compute_lpips(a, b, model, device):
    """a, b: HxWxC float [0,1] -> LPIPS 距离（越小越好）。"""
    import torch

    a_t = torch.from_numpy(a.transpose(2, 0, 1)[None]).to(device) * 2.0 - 1.0
    b_t = torch.from_numpy(b.transpose(2, 0, 1)[None]).to(device) * 2.0 - 1.0
    with torch.no_grad():
        dist = model(a_t, b_t)
    return float(dist.item())


# ---------------------------------------------------------------------------
# 统计与输出
# ---------------------------------------------------------------------------

def summarize(values):
    arr = np.asarray(list(values), dtype=np.float64)
    finite = arr[np.isfinite(arr)]
    mean = float(arr.mean()) if arr.size else float("nan")
    if finite.size == arr.size:
        std = float(arr.std())
    elif finite.size:
        std = float(finite.std())
    else:
        std = float("nan")
    return {
        "mean": mean,
        "std": std,
        "min": float(arr.min()) if arr.size else float("nan"),
        "max": float(arr.max()) if arr.size else float("nan"),
    }


def fmt(v, width=10, nd=4):
    if v is None:
        return "-" * width
    if isinstance(v, float):
        if np.isinf(v):
            return "inf".rjust(width)
        if np.isnan(v):
            return "nan".rjust(width)
        return ("%%.%df" % nd % v).rjust(width)
    return (str(v)).rjust(width)


def write_report(out_dir, args, rows, metrics, num_images, size, warnings,
                 unmatched_gt, unmatched_pred, rankings):
    os.makedirs(out_dir, exist_ok=True)

    summary = {"metrics": {}}
    for m in metrics:
        summary["metrics"][m] = summarize(r[m] for r in rows)
    summary.update({
        "num_images": num_images,
        "image_size_wh": list(size),
        "config": vars(args),
        "rankings": rankings,
        "warnings": warnings,
        "unmatched_gt": unmatched_gt,
        "unmatched_pred": unmatched_pred,
        "per_image_csv": "per_image.csv",
    })
    with open(os.path.join(out_dir, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    fieldnames = ["name"] + list(metrics)
    with open(os.path.join(out_dir, "per_image.csv"), "w", newline="",
              encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            line = {"name": r["name"]}
            for m in metrics:
                v = r[m]
                line[m] = "inf" if (isinstance(v, float) and np.isinf(v)) else v
            writer.writerow(line)

    # ---- 控制台 / summary.txt 报告 ----
    lines = []
    bar = "=" * 72
    lines.append(bar)
    lines.append(" 3DGS 重建质量量化评估报告 / Reconstruction Evaluation Report")
    lines.append(bar)
    lines.append(" Ground truth : %s" % (args.gt if args.gt else "(demo)"))
    lines.append(" Prediction   : %s" % (args.pred if args.pred else "(demo)"))
    lines.append(" Image size   : %dx%d" % (size[0], size[1]))
    lines.append(" Num pairs    : %d" % num_images)
    lines.append(" Metrics      : %s" % ", ".join(metrics))
    if warnings:
        lines.append(" Warnings     : %d (见下方)" % len(warnings))
    lines.append("-" * 72)
    lines.append("%-12s %10s %10s %10s %10s" % ("metric", "mean", "std", "min", "max"))
    lines.append("-" * 72)
    for m in metrics:
        s = summary["metrics"][m]
        lines.append("%-12s %s %s %s %s" % (
            m, fmt(s["mean"]), fmt(s["std"]), fmt(s["min"]), fmt(s["max"])))
    lines.append("-" * 72)
    if "psnr" in metrics and rankings["worst"]:
        lines.append(" PSNR 最差视图 (worst 5) : %s" %
                     ", ".join("%s(%.2f)" % (n, v) for n, v in rankings["worst"]))
        lines.append(" PSNR 最好视图 (best 5)  : %s" %
                     ", ".join("%s(%.2f)" % (n, v) for n, v in rankings["best"]))
        lines.append("-" * 72)
    for w in warnings:
        lines.append(" [warning] %s" % w)
    if unmatched_gt:
        shown = unmatched_gt[:10]
        lines.append(" [info] 真值目录中未匹配到渲染图的 %d 张: %s%s" %
                     (len(unmatched_gt), ", ".join(shown),
                      " ..." if len(unmatched_gt) > 10 else ""))
    if unmatched_pred:
        shown = unmatched_pred[:10]
        lines.append(" [info] 渲染目录中未匹配到真值的 %d 张: %s%s" %
                     (len(unmatched_pred), ", ".join(shown),
                      " ..." if len(unmatched_pred) > 10 else ""))
    lines.append(bar)
    lines.append(" 结果已写入: %s" % out_dir)

    report = "\n".join(lines)
    print(report)
    with open(os.path.join(out_dir, "summary.txt"), "w", encoding="utf-8") as f:
        f.write(report + "\n")


# ---------------------------------------------------------------------------
# 演示模式：生成合成数据集并跑通全流程
# ---------------------------------------------------------------------------

def run_demo(out_dir, seed=0):
    rng = np.random.default_rng(seed)
    demo_dir = os.path.join(out_dir, "demo_data")
    gt_dir = os.path.join(demo_dir, "gt")
    pred_dir = os.path.join(demo_dir, "pred")
    os.makedirs(gt_dir, exist_ok=True)
    os.makedirs(pred_dir, exist_ok=True)

    h, w, n = 512, 768, 6
    yy, xx = np.mgrid[0:h, 0:w]
    for i in range(n):
        base = (
            (xx / w)[..., None] * np.array([0.9, 0.5, 0.3])
            + (yy / h)[..., None] * np.array([0.2, 0.6, 0.8])
        )
        cx, cy = int(rng.integers(120, w - 120)), int(rng.integers(120, h - 120))
        r = int(rng.integers(30, 90))
        disk = ((xx - cx) ** 2 + (yy - cy) ** 2) < r ** 2
        base[disk] = np.array([0.9, 0.2, 0.2])
        rect = (np.abs(xx - cx + 150) < 60) & (np.abs(yy - cy - 100) < 30)
        base[rect] = np.array([0.2, 0.8, 0.9])
        gt = (np.clip(base, 0, 1) * 255).astype(np.uint8)

        # 渲染图 = 真值 + 噪声 + 轻微模糊 + 轻微色偏（模拟重建误差）
        noise = rng.normal(0.0, 4.0, gt.shape)
        pred = np.clip(gt.astype(np.float32) + noise, 0, 255)
        pred = _gauss_blur(pred / 255.0, sigma=1.0, win=5) * 255.0
        pred = pred * np.array([1.0, 0.99, 1.01]) + 1.5
        pred = np.clip(pred, 0, 255).astype(np.uint8)

        Image.fromarray(gt).save(os.path.join(gt_dir, "%05d.png" % i))
        Image.fromarray(pred).save(os.path.join(pred_dir, "%05d.png" % i))
    return gt_dir, pred_dir


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="3DGS 重建质量量化评估（PSNR / SSIM / MS-SSIM / RMSE / MAE / LPIPS）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__)
    p.add_argument("--gt", help="真值测试图片目录（ground truth）")
    p.add_argument("--pred", help="重建渲染图片目录（prediction）")
    p.add_argument("--out", default="eval_output",
                   help="输出目录（默认: %(default)s）")
    p.add_argument("--ext", default=",".join(DEFAULT_EXTS),
                   help="纳入比较的图片扩展名（逗号分隔，默认: %(default)s）")
    p.add_argument("--size", default=None, metavar="WxH",
                   help="统一重采样到 WxH（如 800x600）；默认不缩放")
    p.add_argument("--metrics", default=",".join(DEFAULT_METRICS),
                   help="要计算的指标（逗号分隔，可选: %s；默认: %%(default)s）"
                        % ", ".join(ALL_METRICS))
    p.add_argument("--max-images", type=int, default=None, metavar="N",
                   help="最多评估 N 对图片；超过时按 seed 随机抽样")
    p.add_argument("--seed", type=int, default=0,
                   help="随机抽样种子（默认: %(default)s）")
    p.add_argument("--lpips-device", default="auto",
                   choices=["auto", "cpu", "cuda"],
                   help="LPIPS 运行设备（默认: %(default)s）")
    p.add_argument("--demo", action="store_true",
                   help="生成合成数据集并评估，用于验证工具")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    # Windows 控制台默认代码页可能不是 UTF-8，显式切到 UTF-8 避免中文乱码。
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

    if not HAVE_PIL:
        print("错误：需要 Pillow 库，请执行  pip install Pillow", file=sys.stderr)
        return 1

    metrics = tuple(m.strip().lower() for m in args.metrics.split(",") if m.strip())
    bad = [m for m in metrics if m not in ALL_METRICS]
    if bad:
        print("错误：未知指标 %s（可选: %s）" % (bad, ", ".join(ALL_METRICS)),
              file=sys.stderr)
        return 1
    if not metrics:
        print("错误：--metrics 不能为空", file=sys.stderr)
        return 1

    exts = set(e.strip().lstrip(".").lower() for e in args.ext.split(",") if e.strip())
    if not exts:
        print("错误：--ext 不能为空", file=sys.stderr)
        return 1

    size = None
    if args.size:
        try:
            w, h = (int(x) for x in args.size.lower().split("x"))
            if w <= 0 or h <= 0:
                raise ValueError
            size = (w, h)
        except Exception:
            print("错误：--size 格式应为 WxH，如 800x600", file=sys.stderr)
            return 1

    # ---- demo 模式 ----
    if args.demo:
        gt_dir, pred_dir = run_demo(args.out, seed=args.seed)
        args.gt, args.pred = gt_dir, pred_dir
        print("已生成合成数据:\n  GT : %s\n  Pred: %s" % (gt_dir, pred_dir))

    if not args.gt or not args.pred:
        print("错误：需要 --gt 与 --pred 目录（或用 --demo 验证）", file=sys.stderr)
        return 1

    # ---- 图片配对 ----
    gt_map = collect_images(args.gt, exts)
    pred_map = collect_images(args.pred, exts)
    common = sorted(set(gt_map) & set(pred_map))
    total_pairs = len(common)
    unmatched_gt = sorted(set(gt_map) - set(pred_map))
    unmatched_pred = sorted(set(pred_map) - set(gt_map))

    if not common:
        print("错误：真值目录找到 %d 张图片，渲染目录找到 %d 张图片，但没有匹配对。"
              % (len(gt_map), len(pred_map)), file=sys.stderr)
        if unmatched_gt:
            print("  真值示例: %s" % unmatched_gt[:5], file=sys.stderr)
        if unmatched_pred:
            print("  渲染示例: %s" % unmatched_pred[:5], file=sys.stderr)
        return 1

    if args.max_images and args.max_images < len(common):
        rng = np.random.default_rng(args.seed)
        chosen = set(rng.choice(len(common), size=args.max_images, replace=False))
        common = [s for i, s in enumerate(common) if i in chosen]
        print("按 seed=%d 随机抽样 %d / %d 对图片进行评估"
              % (args.seed, len(common), total_pairs))

    # ---- LPIPS 模型（可选） ----
    lpips_model, lpips_device, lpips_note = None, None, None
    if "lpips" in metrics:
        try:
            lpips_model, lpips_device = get_lpips_model(args.lpips_device)
        except Exception as e:
            print("错误：无法初始化 LPIPS（需要 torch 与 lpips 包，"
                  "见 README）：%s" % e, file=sys.stderr)
            return 1

    # ---- 逐张评估 ----
    rows = []
    warnings = []
    resized = 0
    t0 = time.time()
    n = len(common)
    for i, stem in enumerate(common, 1):
        gt = load_image(gt_map[stem])
        if size is not None:
            gt = resize_to(gt, size)
        pred = load_image(pred_map[stem])
        if pred.shape[:2] != gt.shape[:2]:
            pred = resize_to(pred, (gt.shape[1], gt.shape[0]))
            resized += 1
        gt = np.clip(gt, 0.0, 1.0)
        pred = np.clip(pred, 0.0, 1.0)

        row = {"name": stem}
        for m in metrics:
            if m == "psnr":
                row[m] = compute_psnr(gt, pred)
            elif m == "ssim":
                row[m] = compute_ssim(gt, pred)
            elif m == "ms-ssim":
                row[m] = compute_ms_ssim(gt, pred)
            elif m == "rmse":
                row[m] = compute_rmse(gt, pred)
            elif m == "mae":
                row[m] = compute_mae(gt, pred)
            elif m == "lpips":
                row[m] = compute_lpips(gt, pred, lpips_model, lpips_device)
        rows.append(row)
        sys.stderr.write("\r  评估进度 [%d/%d] %s        " % (i, n, stem))
        sys.stderr.flush()
    sys.stderr.write("\n")

    if resized:
        warnings.append("%d 张渲染图尺寸与真值不一致，已自动重采样到真值尺寸。"
                        "建议用 --size 统一尺寸以保证指标一致性。" % resized)
    if lpips_note:
        warnings.append(lpips_note)

    # ---- 排名与输出 ----
    rankings = {"worst": [], "best": []}
    if "psnr" in metrics:
        by_psnr = sorted(rows, key=lambda r: r["psnr"])
        finite_rows = [r for r in by_psnr if np.isfinite(r["psnr"])]
        rankings["worst"] = [(r["name"], float(r["psnr"])) for r in finite_rows[:5]]
        rankings["best"] = [(r["name"], float(r["psnr"])) for r in finite_rows[-5:]][::-1]

    h_img, w_img = load_image(gt_map[common[0]]).shape[:2]
    if size is not None:
        w_img, h_img = size

    write_report(args.out, args, rows, metrics, len(rows), (w_img, h_img),
                 warnings, unmatched_gt, unmatched_pred, rankings)
    print("耗时: %.1f s" % (time.time() - t0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
