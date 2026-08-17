// ==================== EvalIO — 评估模块图片 IO ====================
// 图片加载：通过 app://localhost/raw/<URL编码绝对路径>（AppSchemeHandler 提供任意本地文件）
// 目录扫描/配对：FileCEF.list
// 演示模式：在 canvas 上合成 GT / 渲染图（与 evaluate.py run_demo 同构）

(function (root) {
  'use strict';

  var DEFAULT_EXTS = ['png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff', 'webp'];

  // 构造 raw 协议 URL（编码所有特殊字符，C++ 端 UrlDecode 解码全部 %XX）
  function rawUrl(absPath) {
    if (typeof _appUrl === 'function') return _appUrl(absPath);
    return 'app://localhost/raw/' + encodeURIComponent(absPath);
  }

  // Float32 图重采样（LANCZOS 不可用，用 canvas high-quality 近似）
  function resizeTo(img, w, h) {
    if (img.w === w && img.h === h) return img;
    var canvas = imgToCanvas(img);
    var out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    var ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, w, h);
    var id = ctx.getImageData(0, 0, w, h);
    var px = id.data;
    var data = new Float32Array(w * h * 3);
    for (var i = 0, j = 0; i < px.length; i += 4, j += 3) {
      data[j] = px[i] / 255.0;
      data[j + 1] = px[i + 1] / 255.0;
      data[j + 2] = px[i + 2] / 255.0;
    }
    return { w: w, h: h, data: data };
  }

  // 用 Image + canvas 加载图片 -> Float32Array RGB [0,1]（丢弃 alpha，同 evaluate.py）
  function loadImage(absPath, sizeWh) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          resolve(imgToFloat32(img, sizeWh));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () {
        reject(new Error('无法加载图片: ' + absPath));
      };
      img.src = rawUrl(absPath);
    });
  }

  // 由 Image 元素绘制到 canvas -> {w,h,data}
  function imgToFloat32(img, sizeWh) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (sizeWh) {
      w = sizeWh[0];
      h = sizeWh[1];
    }
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    var id = ctx.getImageData(0, 0, w, h);
    var px = id.data;
    var data = new Float32Array(w * h * 3);
    for (var i = 0, j = 0; i < px.length; i += 4, j += 3) {
      data[j] = px[i] / 255.0;
      data[j + 1] = px[i + 1] / 255.0;
      data[j + 2] = px[i + 2] / 255.0;
    }
    return { w: w, h: h, data: data };
  }

  // Float32 图 -> canvas（用于预览/导出）
  function imgToCanvas(img) {
    var canvas = document.createElement('canvas');
    canvas.width = img.w;
    canvas.height = img.h;
    var ctx = canvas.getContext('2d');
    var id = ctx.createImageData(img.w, img.h);
    var px = id.data, d = img.data;
    for (var i = 0, j = 0; i < px.length; i += 4, j += 3) {
      px[i] = Math.round(Math.min(1, Math.max(0, d[j])) * 255);
      px[i + 1] = Math.round(Math.min(1, Math.max(0, d[j + 1])) * 255);
      px[i + 2] = Math.round(Math.min(1, Math.max(0, d[j + 2])) * 255);
      px[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return canvas;
  }

  // 扫描目录：{stem: {path, ext}}，同主干多扩展名时优先 png（同 collect_images）
  function scanImages(dir, exts) {
    exts = exts || DEFAULT_EXTS;
    var set = {};
    exts.forEach(function (e) { set[e] = true; });
    return (typeof FileCEF !== 'undefined' ? FileCEF.list(dir) : Promise.reject(new Error('CEF 环境未就绪')))
      .then(function (entries) {
        var found = {};
        (entries || []).forEach(function (en) {
          if (!en.is_file) return;
          var dot = en.name.lastIndexOf('.');
          if (dot <= 0) return;
          var ext = en.name.slice(dot + 1).toLowerCase();
          if (!set[ext]) return;
          var stem = en.name.slice(0, dot);
          if (!(stem in found) || ext === 'png') {
            found[stem] = { path: dir.replace(/[\\/]+$/, '') + '\\' + en.name, ext: ext };
          }
        });
        return found;
      });
  }

  // 配对两个目录
  function pairDirs(gtDir, predDir, exts) {
    return Promise.all([scanImages(gtDir, exts), scanImages(predDir, exts)]).then(function (r) {
      var gtMap = r[0], predMap = r[1];
      var common = Object.keys(gtMap).filter(function (k) { return k in predMap; }).sort();
      var unmatchedGt = Object.keys(gtMap).filter(function (k) { return !(k in predMap); }).sort();
      var unmatchedPred = Object.keys(predMap).filter(function (k) { return !(k in gtMap); }).sort();
      return { gtMap: gtMap, predMap: predMap, common: common, unmatchedGt: unmatchedGt, unmatchedPred: unmatchedPred };
    });
  }

  // ---------- 演示模式：合成数据（与 run_demo 同构，mulberry32 保证确定性） ----------

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Box-Muller 标准正态
  function randn(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // 可分离高斯模糊（用于演示合成，σ=1.0 win=5，reflect 边界）
  function demoBlur(img, w, h, sigma, win) {
    var half = (win - 1) >> 1;
    var g = new Float64Array(win), sum = 0;
    for (var k = -half; k <= half; k++) { var v = Math.exp(-(k * k) / (2 * sigma * sigma)); g[k + half] = v; sum += v; }
    for (var i = 0; i < win; i++) g[i] /= sum;
    var tmp = new Float64Array(img.length), out = new Float64Array(img.length);
    for (var y = 0; y < h; y++) {
      var row = y * w;
      for (var x = 0; x < w; x++) {
        var acc = 0;
        for (var kk = 0; kk < win; kk++) {
          var xi = x + kk - half;
          if (xi < 0) xi = -xi; else if (xi >= w) xi = 2 * w - xi - 2;
          acc += img[row + xi] * g[kk];
        }
        tmp[row + x] = acc;
      }
    }
    for (var y2 = 0; y2 < h; y2++) {
      for (var x2 = 0; x2 < w; x2++) {
        var acc2 = 0;
        for (var kk2 = 0; kk2 < win; kk2++) {
          var yi = y2 + kk2 - half;
          if (yi < 0) yi = -yi; else if (yi >= h) yi = 2 * h - yi - 2;
          acc2 += tmp[yi * w + x2] * g[kk2];
        }
        out[y2 * w + x2] = acc2;
      }
    }
    return out;
  }

  // 生成演示 GT/pred 图像对 -> [{name, gt:{w,h,data}, pred:{w,h,data}}]
  function generateDemo(seed, n) {
    n = n || 6;
    var rng = mulberry32(seed || 0);
    var h = 512, w = 768;
    var result = [];
    for (var i = 0; i < n; i++) {
      var gt = new Float32Array(w * h * 3);
      var pred = new Float32Array(w * h * 3);
      var cx = 120 + Math.floor(rng() * (w - 240));
      var cy = 120 + Math.floor(rng() * (h - 240));
      var r = 30 + Math.floor(rng() * 60);
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var idx = (y * w + x) * 3;
          var fx = x / w, fy = y / h;
          // 基础渐变（对应 numpy base）
          gt[idx] = 0.9 * fx + 0.2 * fy;
          gt[idx + 1] = 0.5 * fx + 0.6 * fy;
          gt[idx + 2] = 0.3 * fx + 0.8 * fy;
          var dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy < r * r) {
            gt[idx] = 0.9; gt[idx + 1] = 0.2; gt[idx + 2] = 0.2;
          }
          if (Math.abs(x - cx + 150) < 60 && Math.abs(y - cy - 100) < 30) {
            gt[idx] = 0.2; gt[idx + 1] = 0.8; gt[idx + 2] = 0.9;
          }
        }
      }
      // pred = clip(gt*255 + N(0,4) -> 高斯模糊 σ=1.0 win=5 -> tint [1,.99,1.01]+1.5 -> clip)
      var ch = [[], [], []];
      for (var c = 0; c < 3; c++) {
        var src = new Float64Array(w * h);
        for (var p = 0; p < w * h; p++) {
          var v = gt[p * 3 + c] * 255.0 + randn(rng) * 4.0;
          src[p] = Math.min(255, Math.max(0, v));
        }
        ch[c] = demoBlur(src, w, h, 1.0, 5);
      }
      var tint = [1.0, 0.99, 1.01];
      for (var p2 = 0; p2 < w * h; p2++) {
        for (var c2 = 0; c2 < 3; c2++) {
          var vv = ch[c2][p2] * tint[c2] + 1.5;
          pred[p2 * 3 + c2] = Math.min(255, Math.max(0, vv)) / 255.0;
        }
      }
      for (var p3 = 0; p3 < w * h * 3; p3++) gt[p3] = Math.min(1, Math.max(0, gt[p3]));
      result.push({ name: String(i).padStart(5, '0'), gt: { w: w, h: h, data: gt }, pred: { w: w, h: h, data: pred } });
    }
    return result;
  }

  var api = {
    DEFAULT_EXTS: DEFAULT_EXTS,
    rawUrl: rawUrl,
    loadImage: loadImage,
    imgToFloat32: imgToFloat32,
    imgToCanvas: imgToCanvas,
    resizeTo: resizeTo,
    scanImages: scanImages,
    pairDirs: pairDirs,
    generateDemo: generateDemo,
    mulberry32: mulberry32
  };

  root.EvalIO = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
