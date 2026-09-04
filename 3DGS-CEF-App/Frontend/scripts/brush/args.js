function _normPath(s) {
  if (!s) return '';
  return s.replace(/\\/g, '/').replace(/\/+$/, '');
}

// "#RRGGBB" → "R,G,B"（0~1 浮点，与 brush 的 --background-color 语义一致）
function _hexToRgb01(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '';
  var n = parseInt(m[1], 16);
  var r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return r.toFixed(3) + ',' + g.toFixed(3) + ',' + b.toFixed(3);
}

// 复刻 Rust 侧导出目录解析：--export-path 绝对路径直接用；相对路径基于数据集父目录；
// 未设置时默认 ./{dataset}_exports/。返回规范化后的导出根目录（不带 {dataset} 插值前的字面值已插好）。
function _resolveExportBase(exportPath, datasetPath) {
  var root = _normPath(datasetPath);
  if (!root) return '';
  var parent = root.substring(0, root.lastIndexOf('/'));
  var name = root.substring(root.lastIndexOf('/') + 1);
  var ep = _normPath(exportPath);
  if (!ep) return (parent ? parent + '/' : '') + name + '_exports';
  if (/^[a-zA-Z]:[\/]/.test(ep)) return ep; // 绝对路径
  if (ep.charAt(0) === '/') return ep;
  return (parent ? parent + '/' : '') + ep.replace(/^\.\//, '');
}

function _datasetRoot(imgDir, colmapDir) {
  if (imgDir) {
    var d = _normPath(imgDir);
    if (/\/imgs$/i.test(d)) d = d.replace(/\/imgs$/i, '');
    return d;
  }
  if (colmapDir) {
    var d = _normPath(colmapDir);
    d = d.replace(/\/sparse(\/\d+)?$/i, '');
    d = d.replace(/\/colmap(\/sparse(\/\d+)?)?$/i, '');
    return d;
  }
  return '';
}

function buildBrushArgs() {
  var imgDir = $val('reconImageDir');
  var colmapDir = $val('reconColmapPath');
  var datasetPath = _datasetRoot(imgDir, colmapDir);
  function q(s) { return s.indexOf(' ') >= 0 ? '"' + s + '"' : s; }

  var p = ['--total-train-iters ' + $num('reconTrainSteps',30000),
    '--max-splats ' + $num('reconMaxSplats',10000000),
    '--sh-degree ' + $num('reconSHDegree',3),
    '--max-resolution ' + $num('reconMaxResolution',1920),
    '--eval-every ' + Math.max(1, $num('reconEvalEvery',1000)),
    '--eval-save-to-disk',
    '--export-every ' + Math.max(1, $num('reconExportEvery',5000))];

  var ep = $val('reconExportPath');
  if (ep) p.push('--export-path ' + q(_normPath(ep)));
  var en = $val('reconExportName');
  if (en) p.push('--export-name ' + q(en));

  // headless 详细评估图的输出目录（Rust 侧 --eval-out，保存 eval_{iter}_{phase}/*.png）
  if (datasetPath) p.push('--eval-out ' + q(_resolveExportBase(ep, datasetPath)));

  if ($id('reconEnableIR') && $id('reconEnableIR').checked) {
    p.push('--ir-iters ' + $num('reconIRSteps',5000));
    p.push('--lr-ir ' + $num('reconIRLR',0.01));
    p.push('--ir-refine-every ' + $num('reconIRRefine',0));
    p.push('--ir-translation-offset ' + $num('reconIRTransX',0) + ' ' + $num('reconIRTransY',0) + ' ' + $num('reconIRTransZ',0));
    p.push('--ir-rotation-offset ' + $num('reconIRQuatW',1) + ' ' + $num('reconIRQuatX',0) + ' ' + $num('reconIRQuatY',0) + ' ' + $num('reconIRQuatZ',0));
    var sub = $val('reconIRSubdir');
    if (sub) p.push('--ir-subdir ' + sub);
  } else { p.push('--ir-iters 0'); }

  var rm = $val('reconRenderMode');
  if (rm) p.push('--render-mode ' + rm);

  var lrMean = $num('reconLRMean', null);
  if (lrMean != null) p.push('--lr-mean ' + lrMean);
  var lrMeanEnd = $num('reconLRMeanEnd', null);
  if (lrMeanEnd != null) p.push('--lr-mean-end ' + lrMeanEnd);
  var meanNoise = $num('reconMeanNoiseWeight', null);
  if (meanNoise != null) p.push('--mean-noise-weight ' + meanNoise);
  var lrCoeffsDC = $num('reconLRCoeffsDC', null);
  if (lrCoeffsDC != null) p.push('--lr-coeffs-dc ' + lrCoeffsDC);
  var lrShScale = $num('reconLRShScale', null);
  if (lrShScale != null) p.push('--lr-coeffs-sh-scale ' + lrShScale);
  var lrOpac = $num('reconLROpac', null);
  if (lrOpac != null) p.push('--lr-opac ' + lrOpac);
  var lrScale = $num('reconLRScale', null);
  if (lrScale != null) p.push('--lr-scale ' + lrScale);
  var lrRotation = $num('reconLRRotation', null);
  if (lrRotation != null) p.push('--lr-rotation ' + lrRotation);

  var ssimW = $num('reconSSIMWeight', null);
  if (ssimW != null) p.push('--ssim-weight ' + ssimW);
  var opacDecay = $num('reconOpacDecay', null);
  if (opacDecay != null) p.push('--opac-decay ' + opacDecay);
  var matchAlpha = $num('reconMatchAlphaWeight', null);
  if (matchAlpha != null) p.push('--match-alpha-weight ' + matchAlpha);

  var refineEvery = $num('reconRefineEvery', null);
  if (refineEvery != null) p.push('--refine-every ' + refineEvery);
  var growthGrad = $num('reconGrowthGradThreshold', null);
  if (growthGrad != null) p.push('--growth-grad-threshold ' + growthGrad);
  var growthSelect = $num('reconGrowthSelectFraction', null);
  if (growthSelect != null) p.push('--growth-select-fraction ' + growthSelect);
  var growthStop = $num('reconGrowthStopIter', null);
  if (growthStop != null) p.push('--growth-stop-iter ' + growthStop);
  var splitScreen = $num('reconSplitAtScreenSize', null);
  if (splitScreen != null) p.push('--split-at-screen-size ' + splitScreen);

  var bgColor = _hexToRgb01($val('reconBgColor'));
  if (bgColor && bgColor !== '0.000,0.000,0.000') p.push('--background-color ' + bgColor);
  var bgNoise = $num('reconBgNoiseStrength', null);
  if (bgNoise != null) p.push('--background-noise-strength ' + bgNoise);
  var lodLevels = $num('reconLodLevels', null);
  if (lodLevels != null && lodLevels > 0) p.push('--lod-levels ' + lodLevels);

  var mf = $num('reconMaxFrames', 0);
  if (mf > 0) p.push('--max-frames ' + mf);
  var es = $num('reconEvalSplitEvery', 0);
  if (es > 0) p.push('--eval-split-every ' + es);
  var ss = $num('reconSubsampleFrames', 0);
  if (ss > 0) p.push('--subsample-frames ' + ss);
  var sp = $num('reconSubsamplePoints', 0);
  if (sp > 0) p.push('--subsample-points ' + sp);
  var alphaMode = $val('reconAlphaMode');
  if (alphaMode) p.push('--alpha-mode ' + alphaMode);

  var seed = $num('reconSeed', null);
  if (seed != null) p.push('--seed ' + seed);
  var startIter = $num('reconStartIter', null);
  if (startIter != null && startIter > 0) p.push('--start-iter ' + startIter);

  var rerun = $id('reconEnableRerun');
  if (rerun && rerun.checked) p.push('--rerun-enabled');

  if (datasetPath) p.push(q(datasetPath));
  return p.join(' ');
}
