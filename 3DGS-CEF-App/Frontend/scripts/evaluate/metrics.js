// ==================== EvalMetrics — 3DGS 重建质量指标引擎（纯 JS） ====================
// 与 evaluate.py（C:\WKSPC\PYTHON\3DGSVerify\evaluate.py）公式逐项一致：
//   PSNR / SSIM / MS-SSIM / RMSE / MAE（11-tap Gaussian σ=1.5, C1=0.01², C2=0.03²）
// 图像表示：{ w, h, data: Float32Array(w*h*3) }，行主序 RGB 交错，数值范围 [0,1]
// 浏览器中挂载为全局 EvalMetrics；Node 中 module.exports 导出（便于回归测试）。

(function (root) {
  'use strict';

  var MS_SSIM_WEIGHTS = [0.0448, 0.2856, 0.3001, 0.2363, 0.1333];

  function makeImg(w, h) {
    return { w: w, h: h, data: new Float32Array(w * h * 3) };
  }

  // 提取第 c 通道（0/1/2）为独立 Float32Array
  function getChannel(img, c) {
    var n = img.w * img.h;
    var out = new Float32Array(n);
    var d = img.data;
    for (var i = 0, j = c; i < n; i++, j += 3) out[i] = d[j];
    return out;
  }

  // ---------- 指标：全图 ----------

  function computePsnr(a, b) {
    var n = a.data.length, s = 0, i;
    var da = a.data, db = b.data;
    for (i = 0; i < n; i++) {
      var d = da[i] - db[i];
      s += d * d;
    }
    var mse = s / n;
    if (mse <= 0) return Infinity;
    return 10.0 * Math.log10(1.0 / mse);
  }

  function computeRmse(a, b) {
    var n = a.data.length, s = 0, i;
    var da = a.data, db = b.data;
    for (i = 0; i < n; i++) {
      var d = da[i] - db[i];
      s += d * d;
    }
    return Math.sqrt(s / n);
  }

  function computeMae(a, b) {
    var n = a.data.length, s = 0, i;
    var da = a.data, db = b.data;
    for (i = 0; i < n; i++) s += Math.abs(da[i] - db[i]);
    return s / n;
  }

  // ---------- 高斯模糊（可分离，reflect 边界，与 scipy.ndimage.convolve 一致） ----------

  function blurChannel(src, w, h, sigma, win) {
    win = win | 1; // 强制奇数
    var mn = Math.min(h, w);
    if (win > mn) {
      win = (mn % 2 === 0) ? mn - 1 : mn;
      win = Math.max(win, 1);
    }
    if (win < 3) {
      var cp = new Float64Array(src.length);
      for (var i = 0; i < src.length; i++) cp[i] = src[i];
      return cp;
    }
    var half = (win - 1) >> 1;
    // 一维高斯核（归一化）
    var g = new Float64Array(win);
    var sum = 0;
    for (var k = -half; k <= half; k++) {
      var v = Math.exp(-(k * k) / (2.0 * sigma * sigma));
      g[k + half] = v;
      sum += v;
    }
    for (var k2 = 0; k2 < win; k2++) g[k2] /= sum;

    // 水平方向（利用核对称性，半量计算）
    var tmp = new Float64Array(w * h);
    var y, x, acc, xi, row;
    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = 0; x < w; x++) {
        acc = g[half] * src[row + x];
        for (var k3 = 1; k3 <= half; k3++) {
          var xl = x - k3;
          if (xl < 0) xl = -xl;
          var xr = x + k3;
          if (xr >= w) xr = 2 * w - xr - 2;
          acc += g[half + k3] * (src[row + xl] + src[row + xr]);
        }
        tmp[row + x] = acc;
      }
    }
    // 垂直方向
    var out = new Float64Array(w * h);
    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = 0; x < w; x++) {
        acc = g[half] * tmp[row + x];
        for (var k4 = 1; k4 <= half; k4++) {
          var yu = y - k4;
          if (yu < 0) yu = -yu;
          var yd = y + k4;
          if (yd >= h) yd = 2 * h - yd - 2;
          acc += g[half + k4] * (tmp[yu * w + x] + tmp[yd * w + x]);
        }
        out[row + x] = acc;
      }
    }
    return out;
  }

  // 单通道 SSIM：返回 { ssim, cs }（全图均值）
  function ssimChannelMeans(a, b, w, h, dataRange, k1, k2, win, sigma) {
    var c1 = (k1 * dataRange) * (k1 * dataRange);
    var c2 = (k2 * dataRange) * (k2 * dataRange);
    var mu1 = blurChannel(a, w, h, sigma, win);
    var mu2 = blurChannel(b, w, h, sigma, win);
    var n = w * h;
    var a2 = new Float64Array(n), b2 = new Float64Array(n), ab = new Float64Array(n);
    var mu1sq = new Float64Array(n), mu2sq = new Float64Array(n), mu1mu2 = new Float64Array(n);
    var i;
    for (i = 0; i < n; i++) {
      a2[i] = a[i] * a[i];
      b2[i] = b[i] * b[i];
      ab[i] = a[i] * b[i];
      mu1sq[i] = mu1[i] * mu1[i];
      mu2sq[i] = mu2[i] * mu2[i];
      mu1mu2[i] = mu1[i] * mu2[i];
    }
    var sigma1sq = blurChannel(a2, w, h, sigma, win);
    var sigma2sq = blurChannel(b2, w, h, sigma, win);
    var sigma12 = blurChannel(ab, w, h, sigma, win);
    var eps = 1e-12;
    var sSum = 0, csSum = 0;
    for (i = 0; i < n; i++) {
      var s1 = sigma1sq[i] - mu1sq[i];
      var s2 = sigma2sq[i] - mu2sq[i];
      var s12 = sigma12[i] - mu1mu2[i];
      var cs = (2.0 * s12 + c2) / (s1 + s2 + c2 + eps);
      var ssim = ((2.0 * mu1mu2[i] + c1) * (2.0 * s12 + c2)) /
        ((mu1sq[i] + mu2sq[i] + c1) * (s1 + s2 + c2) + eps);
      sSum += ssim;
      csSum += cs;
    }
    return { ssim: sSum / n, cs: csSum / n };
  }

  function computeSsim(a, b, dataRange, win, sigma) {
    var total = 0;
    for (var c = 0; c < 3; c++) {
      var r = ssimChannelMeans(getChannel(a, c), getChannel(b, c),
        a.w, a.h, dataRange, 0.01, 0.03, win, sigma);
      total += r.ssim;
    }
    return total / 3.0;
  }

  // 2x2 平均池化下采样（与 MS-SSIM 原文一致）
  function downsample2(src, w, h) {
    var w2 = (w >> 1) * 2, h2 = (h >> 1) * 2;
    var nw = w2 / 2, nh = h2 / 2;
    var out = new Float32Array(nw * nh);
    for (var y = 0; y < nh; y++) {
      for (var x = 0; x < nw; x++) {
        out[y * nw + x] =
          (src[y * 2 * w + x * 2] + src[y * 2 * w + x * 2 + 1] +
            src[(y * 2 + 1) * w + x * 2] + src[(y * 2 + 1) * w + x * 2 + 1]) * 0.25;
      }
    }
    return { data: out, w: nw, h: nh };
  }

  function computeMsSsim(a, b, dataRange, win, sigma, weights) {
    weights = weights || MS_SSIM_WEIGHTS;
    var curA = { w: a.w, h: a.h, data: a.data };
    var curB = { w: b.w, h: b.h, data: b.data };
    var mcs = [], ssims = [];
    var used = 0, level;
    for (level = 0; level < weights.length; level++) {
      var sSum = 0, csSum = 0;
      for (var c = 0; c < 3; c++) {
        var r = ssimChannelMeans(getChannel(curA, c), getChannel(curB, c),
          curA.w, curA.h, dataRange, 0.01, 0.03, win, sigma);
        sSum += r.ssim;
        csSum += r.cs;
      }
      ssims.push(Math.max(sSum / 3.0, 0.0));
      mcs.push(Math.max(csSum / 3.0, 0.0));
      used++;
      if (level === weights.length - 1) break;
      if (Math.min(curA.h, curA.w) >> 1 < win + 2) break;
      // 下采样所有通道
      var chA = [], chB = [], dA = null, dB = null;
      for (var c2 = 0; c2 < 3; c2++) {
        chA.push(downsample2(getChannel(curA, c2), curA.w, curA.h));
        chB.push(downsample2(getChannel(curB, c2), curB.w, curB.h));
      }
      var nw = chA[0].w, nh = chA[0].h;
      dA = new Float32Array(nw * nh * 3);
      dB = new Float32Array(nw * nh * 3);
      for (var c3 = 0; c3 < 3; c3++) {
        var da = chA[c3].data, db = chB[c3].data, nn = nw * nh;
        for (var i = 0; i < nn; i++) {
          dA[i * 3 + c3] = da[i];
          dB[i * 3 + c3] = db[i];
        }
      }
      curA = { w: nw, h: nh, data: dA };
      curB = { w: nw, h: nh, data: dB };
    }
    var w = weights.slice(0, used);
    var wsum = 0;
    for (var wi = 0; wi < w.length; wi++) wsum += w[wi];
    for (var wi2 = 0; wi2 < w.length; wi2++) w[wi2] /= wsum;
    var value = 1.0;
    for (var k = 0; k < used - 1; k++) value *= Math.pow(mcs[k], w[k]);
    value *= Math.pow(ssims[used - 1], w[used - 1]);
    return value;
  }

  // 汇总统计：{mean, std, min, max}（Infinity/NaN 按 evaluate.py 的 summarize 口径处理）
  function summarize(values) {
    var arr = values.slice();
    var finite = arr.filter(function (v) { return isFinite(v); });
    var mean = arr.length ? meanOf(arr) : NaN;
    var std;
    if (finite.length === arr.length) std = stdOf(arr);
    else if (finite.length) std = stdOf(finite);
    else std = NaN;
    return {
      mean: mean,
      std: std,
      min: arr.length ? Math.min.apply(null, arr) : NaN,
      max: arr.length ? Math.max.apply(null, arr) : NaN
    };
  }

  function meanOf(a) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }

  function stdOf(a) {
    var m = meanOf(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / a.length);
  }

  var api = {
    MS_SSIM_WEIGHTS: MS_SSIM_WEIGHTS,
    makeImg: makeImg,
    computePsnr: computePsnr,
    computeRmse: computeRmse,
    computeMae: computeMae,
    computeSsim: computeSsim,
    computeMsSsim: computeMsSsim,
    summarize: summarize,
    _blurChannel: blurChannel,
    _downsample2: downsample2
  };

  root.EvalMetrics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
