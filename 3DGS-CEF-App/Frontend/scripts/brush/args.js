function _normPath(s) {
  if (!s) return '';
  return s.replace(/\\/g, '/').replace(/\/+$/, '');
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
    '--eval-every 999999',
    '--export-every ' + $num('reconExportEvery',5000)];
  var ep = $val('reconExportPath');
  if (ep) p.push('--export-path ' + q(_normPath(ep)));
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
  var mf = $num('reconMaxFrames', 0);
  if (mf > 0) p.push('--max-frames ' + mf);
  var es = $num('reconEvalSplitEvery', 0);
  if (es > 0) p.push('--eval-split-every ' + es);
  var ss = $num('reconSubsampleFrames', 0);
  if (ss > 0) p.push('--subsample-frames ' + ss);
  if (datasetPath) p.push(q(datasetPath));
  return p.join(' ');
}
