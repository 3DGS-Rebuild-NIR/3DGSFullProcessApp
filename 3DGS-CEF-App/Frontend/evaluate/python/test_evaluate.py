#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""evaluate.py 的单元自检：边界值 + numpy/scipy 双路径一致性。"""
import sys

import numpy as np

import evaluate as ev


def main():
    rng = np.random.default_rng(7)
    a = rng.random((128, 160, 3)).astype(np.float32)

    # 1) 恒等输入：PSNR=inf, SSIM=MS-SSIM=1, RMSE=MAE=0
    b = a.copy()
    assert ev.compute_psnr(a, b) == float("inf"), "PSNR(identical) != inf"
    assert abs(ev.compute_ssim(a, b) - 1.0) < 1e-6, "SSIM(identical) != 1"
    assert abs(ev.compute_ms_ssim(a, b) - 1.0) < 1e-6, "MS-SSIM(identical) != 1"
    assert ev.compute_rmse(a, b) == 0.0 and ev.compute_mae(a, b) == 0.0
    print("identity checks OK")

    # 2) 单调性：加噪后指标应劣化
    b2 = np.clip(a + rng.normal(0, 0.05, a.shape).astype(np.float32), 0, 1)
    assert ev.compute_psnr(a, b2) < 40.0
    assert ev.compute_ssim(a, b2) < 0.99
    assert ev.compute_rmse(a, b2) > 0.0
    print("monotonicity checks OK")

    # 3) numpy 回退路径与 scipy 路径一致
    s_scipy = ev.compute_ssim(a, b2)
    m_scipy = ev.compute_ms_ssim(a, b2)
    ev.HAVE_SCIPY = False
    s_numpy = ev.compute_ssim(a, b2)
    m_numpy = ev.compute_ms_ssim(a, b2)
    print(f"SSIM    scipy={s_scipy:.6f}  numpy={s_numpy:.6f}  diff={abs(s_scipy - s_numpy):.2e}")
    print(f"MS-SSIM scipy={m_scipy:.6f}  numpy={m_numpy:.6f}  diff={abs(m_scipy - m_numpy):.2e}")
    assert abs(s_scipy - s_numpy) < 1e-4, "SSIM path mismatch"
    assert abs(m_scipy - m_numpy) < 1e-4, "MS-SSIM path mismatch"
    print("numpy/scipy path consistency OK")

    # 4) 灰度图自动扩展三通道后指标可计算
    g = rng.random((64, 64)).astype(np.float32)
    g2 = np.clip(g + 0.02, 0, 1)
    assert np.isfinite(ev.compute_ssim(g[:, :, None], g2[:, :, None]))
    print("grayscale handling OK")

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
