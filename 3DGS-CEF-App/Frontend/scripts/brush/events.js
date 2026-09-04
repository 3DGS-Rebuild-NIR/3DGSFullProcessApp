// ==================== brush-headless 结构化事件处理 ====================
// 数据来源：brush-headless 输出的 JSON 行事件（stdout → CEF → update3DGSOutput）。
// 全部为真实训练数据，无模拟数据。

var BrushEvents = {
  phase: 'rgb',
  rgbTotal: 0,  // RGB 阶段总迭代数（IR 阶段事件里的 iter 是相对值，需加上它换算绝对迭代）
  series: [],   // [{iter, phase, psnr, ssim, ms_ssim, rmse, mae, lpips}]
  views: [],    // 最近一次评估的逐视角数据 [{name, psnr, ssim}]
  rgbFinal: null,
  irFinal: null
};

function handleBrushEvent(d) {
  if (!d || !d.type) return;
  switch (d.type) {
    case 'dataset':
      RecLog('数据集就绪：训练 ' + (d.train_views != null ? d.train_views : '?') +
        ' 视图，评估 ' + (d.eval_views != null ? d.eval_views : '?') + ' 视图（真实评估集已保留）', 'info');
      break;
    case 'phase':
      BrushEvents.phase = d.name || 'rgb';
      if (BrushEvents.phase === 'ir') {
        // IR 阶段 step 事件的 iter 是 1..ir_iters 的相对值：进度 = rgbTotal + iter
        BrushEvents.rgbTotal = $num('reconTrainSteps', 30000);
        var irSteps = $num('reconIRSteps', 5000);
        if (BrushEvents.rgbTotal && irSteps) {
          Recon.total = BrushEvents.rgbTotal + irSteps;
        }
      }
      $txt('reconPhaseBadge', BrushEvents.phase === 'ir' ? 'IR 强化中' : 'RGB 训练中');
      $txt('barStatus', BrushEvents.phase === 'ir' ? 'IR 训练阶段' : '训练中…');
      RecLog(BrushEvents.phase === 'ir' ? '进入 IR 强化阶段' : 'RGB 训练阶段', 'info');
      break;
    case 'step':
      if (d.iter != null) {
        Recon.step = parseInt(d.iter) + (BrushEvents.phase === 'ir' ? BrushEvents.rgbTotal : 0);
        Recon.total = Math.max(Recon.total, Recon.step);
        updateReconProgress();
      }
      if (d.ir_loss != null) RecLog('[IR 步] iter=' + d.iter + ' ir_loss=' + Number(d.ir_loss).toFixed(6), 'info');
      break;
    case 'eval':
      onBrushEval(d);
      break;
    case 'status':
      if (d.phase) $txt('reconPhaseBadge', d.phase === 'ir' ? 'IR 强化中' : 'RGB 训练中');
      if (d.splats != null) RecLog('[状态] phase=' + d.phase + ' splats=' + d.splats, 'info');
      break;
    case 'summary':
      renderBrushSummary(d);
      break;
    case 'done':
      onBrushDone(d);
      break;
    case 'report':
      renderBrushReport(d);
      break;
    case 'warning':
      RecLog('[警告] ' + (d.message || ''), 'error');
      break;
    case 'error':
      RecLog('[错误] ' + (d.message || ''), 'error');
      Recon.training = false; stopReconTimer(); updateReconUI();
      $txt('barStatus', '训练出错');
      break;
    case 'stopped':
      Recon.training = false; stopReconTimer(); updateReconUI();
      $txt('barStatus', '训练已停止');
      RecLog('训练已停止（brush-headless 优雅退出）', 'system');
      toast('训练已停止');
      break;
  }
}

// ---------------- eval 事件 ----------------
function onBrushEval(d) {
  var m = d.metrics || {};
  BrushEvents.series.push({
    iter: d.iter, phase: d.phase,
    psnr: m.psnr, ssim: m.ssim, ms_ssim: m.ms_ssim,
    rmse: m.rmse, mae: m.mae, lpips: m.lpips
  });
  BrushEvents.views = d.views || [];

  $show('reconEvalCard', true);
  if (m.psnr != null)   $txt('reconPSNR', Number(m.psnr).toFixed(2));
  if (m.ssim != null)   $txt('reconSSIM', Number(m.ssim).toFixed(4));
  if (m.ms_ssim != null)$txt('reconMSSSIM', Number(m.ms_ssim).toFixed(4));
  if (m.rmse != null)   $txt('reconRMSE', Number(m.rmse).toFixed(4));
  if (m.mae != null)    $txt('reconMAE', Number(m.mae).toFixed(4));
  if (m.lpips != null)  $txt('reconLPIPS', Number(m.lpips).toFixed(4));

  Recon.step = parseInt(d.iter);
  updateReconProgress();

  drawMetricChart();
  renderViewTable();

  var parts = ['[评估] iter=' + d.iter + ' 阶段=' + (d.phase || 'rgb')];
  if (m.psnr != null) parts.push('PSNR=' + Number(m.psnr).toFixed(2));
  if (m.ssim != null) parts.push('SSIM=' + Number(m.ssim).toFixed(4));
  if (m.ms_ssim != null) parts.push('MS-SSIM=' + Number(m.ms_ssim).toFixed(4));
  if (m.rmse != null) parts.push('RMSE=' + Number(m.rmse).toFixed(4));
  if (m.mae != null) parts.push('MAE=' + Number(m.mae).toFixed(4));
  if (m.lpips != null) parts.push('LPIPS=' + Number(m.lpips).toFixed(4));
  RecLog(parts.join(' '), 'info');
}

// ---------------- 指标曲线（SVG） ----------------
function drawMetricChart() {
  var svg = $id('reconMetricChart');
  if (!svg) return;
  var s = BrushEvents.series;
  if (!s.length) return;
  var W = svg.clientWidth || 560, H = 150, pl = 44, pr = 12, pt = 12, pb = 22;
  var iw = W - pl - pr, ih = H - pt - pb;

  var xAt = function(iter) {
    var it0 = s[0].iter, it1 = s[s.length - 1].iter;
    return it1 > it0 ? pl + (iter - it0) / (it1 - it0) * iw : pl + iw / 2;
  };
  var yAt = function(v, lo, hi) {
    return hi > lo ? pt + (1 - (v - lo) / (hi - lo)) * ih : pt + ih / 2;
  };

  function series(key, color, nd) {
    var vals = s.map(function(e) { return e[key]; }).filter(function(v) { return v != null; });
    if (vals.length < 2) return null;
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    var pts = [];
    s.forEach(function(e) {
      if (e[key] == null) return;
      pts.push(xAt(e.iter).toFixed(1) + ',' + yAt(e[key], lo, hi).toFixed(1));
    });
    return { line: pts.join(' '), lo: lo, hi: hi, color: color, key: key, nd: nd || 3 };
  }

  var seriesList = [series('psnr', '#3b82f6', 2), series('ssim', '#22c55e', 3)].filter(Boolean);
  var html = '<text x="' + pl + '" y="14" fill="#94a3b8" font-size="11">PSNR(dB) / SSIM 随训练迭代</text>';
  // grid + labels
  var loAll = Math.min.apply(null, seriesList.map(function(si) { return si.lo; }));
  var hiAll = Math.max.apply(null, seriesList.map(function(si) { return si.hi; }));
  for (var g = 0; g <= 3; g++) {
    var gy = pt + g / 3 * ih;
    html += '<line x1="' + pl + '" y1="' + gy + '" x2="' + (pl + iw) + '" y2="' + gy + '" stroke="#1e293b" stroke-width="1"/>';
  }
  seriesList.forEach(function(si) {
    html += '<polyline points="' + si.line + '" fill="none" stroke="' + si.color + '" stroke-width="1.8"/>';
    var lx = xAt(s[s.length - 1].iter);
    html += '<text x="' + (lx + 4) + '" y="' + (yAt(s[s.length - 1][si.key], si.lo, si.hi) - 4) +
      '" fill="' + si.color + '" font-size="10">' + si.key.toUpperCase() + ' ' +
      Number(s[s.length - 1][si.key]).toFixed(si.nd) + '</text>';
  });
  // x labels
  html += '<text x="' + pl + '" y="' + (H - 6) + '" fill="#94a3b8" font-size="10">iter ' + s[0].iter + '</text>';
  html += '<text x="' + (pl + iw - 40) + '" y="' + (H - 6) + '" fill="#94a3b8" font-size="10">iter ' + s[s.length - 1].iter + '</text>';
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.innerHTML = html;
}

// ---------------- 逐视角表格 ----------------
function renderViewTable() {
  var box = $id('reconEvalViews');
  if (!box) return;
  var views = BrushEvents.views;
  if (!views || !views.length) {
    box.innerHTML = '<span style="color:var(--ink-3);font-size:11px">暂无逐视角数据</span>';
    return;
  }
  var sorted = views.slice().sort(function(a, b) { return b.psnr - a.psnr; });
  var head = '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
    '<tr style="color:var(--ink-3)"><th style="text-align:left;padding:3px 6px">视角</th>' +
    '<th style="text-align:right;padding:3px 6px">PSNR(dB)</th><th style="text-align:right;padding:3px 6px">SSIM</th></tr>';
  var rows = sorted.slice(0, 8).map(function(v) {
    return '<tr><td style="padding:2px 6px">' + v.name + '</td>' +
      '<td style="text-align:right;padding:2px 6px">' + Number(v.psnr).toFixed(2) + '</td>' +
      '<td style="text-align:right;padding:2px 6px">' + Number(v.ssim).toFixed(4) + '</td></tr>';
  }).join('');
  box.innerHTML = head + rows +
    '<tr><td colspan="3" style="padding:3px 6px;color:var(--ink-3)">共 ' + views.length +
    ' 视角（展示 PSNR 最优 8 个，完整数据可导出 CSV）</td></tr></table>';
}

function exportEvalCSV() {
  if (!BrushEvents.series.length && !BrushEvents.views.length) { toast('暂无评估数据'); return; }
  var lines = ['type,iter,phase,name,psnr,ssim,ms_ssim,rmse,mae,lpips'];
  BrushEvents.series.forEach(function(e) {
    lines.push(['eval', e.iter, e.phase || 'rgb', '-',
      e.psnr != null ? e.psnr : '', e.ssim != null ? e.ssim : '',
      e.ms_ssim != null ? e.ms_ssim : '', e.rmse != null ? e.rmse : '',
      e.mae != null ? e.mae : '', e.lpips != null ? e.lpips : ''].join(','));
  });
  BrushEvents.views.forEach(function(v) {
    lines.push(['view', BrushEvents.series.length ? BrushEvents.series[BrushEvents.series.length - 1].iter : '',
      '-', v.name, v.psnr, v.ssim, '', '', '', ''].join(','));
  });
  var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'brush_eval_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  toast('评估 CSV 已导出');
}

// ---------------- 训练完成报告（RGB vs IR + Δ 提升） ----------------
function _metricCell(label, rgb, ir, delta, higherBetter, nd) {
  nd = nd || 3;
  function fmt(v) { return v == null ? '—' : Number(v).toFixed(nd); }
  function deltaBadge(dv) {
    if (dv == null || isNaN(dv)) return '';
    var good = higherBetter ? dv > 0 : dv < 0;
    var arrow = higherBetter ? (dv >= 0 ? '↑' : '↓') : (dv <= 0 ? '↓' : '↑');
    return ' <span style="color:' + (good ? '#22c55e' : '#ef4444') + ';font-size:11px">' + arrow + ' ' + Math.abs(dv).toFixed(nd) + '</span>';
  }
  return '<tr><td style="padding:4px 8px">' + label + '</td>' +
    '<td style="text-align:right;padding:4px 8px">' + fmt(rgb) + '</td>' +
    '<td style="text-align:right;padding:4px 8px">' + fmt(ir) + '</td>' +
    '<td style="text-align:right;padding:4px 8px">' + fmt(delta) + deltaBadge(delta) + '</td></tr>';
}

function renderBrushSummary(d) {
  var body = $id('reconReportBody');
  if (!body) return;
  var rgb = d.rgb, ir = d.ir, delta = d.delta || {};
  var title = '训练完成报告';
  var rows = '';
  rows += _metricCell('PSNR (dB)', rgb ? rgb.metrics.psnr : null, ir ? ir.metrics.psnr : null, delta.psnr_db, true, 2);
  rows += _metricCell('SSIM', rgb ? rgb.metrics.ssim : null, ir ? ir.metrics.ssim : null, delta.ssim, true, 4);
  rows += _metricCell('MS-SSIM', rgb ? rgb.metrics.ms_ssim : null, ir ? ir.metrics.ms_ssim : null, delta.ms_ssim, true, 4);
  rows += _metricCell('RMSE', rgb ? rgb.metrics.rmse : null, ir ? ir.metrics.rmse : null, delta.rmse, false, 4);
  rows += _metricCell('MAE', rgb ? rgb.metrics.mae : null, ir ? ir.metrics.mae : null, delta.mae, false, 4);

  var head = '<tr style="color:var(--ink-3)"><td style="padding:4px 8px">指标</td>' +
    '<td style="text-align:right;padding:4px 8px">RGB 阶段 (iter ' + (rgb ? rgb.iter : '-') + ')</td>' +
    '<td style="text-align:right;padding:4px 8px">IR 强化 (iter ' + (ir ? ir.iter : '-') + ')</td>' +
    '<td style="text-align:right;padding:4px 8px">Δ 提升</td></tr>';

  var extra = '';
  if (delta.psnr_db != null) {
    extra = '<div style="margin-top:8px;padding:8px;border:1px solid var(--line);border-radius:6px;font-size:12px">' +
      'IR 强化阶段带来的提升：<b style="color:#22c55e">PSNR ' + (delta.psnr_db >= 0 ? '+' : '') +
      Number(delta.psnr_db).toFixed(2) + ' dB</b>，SSIM ' + (delta.ssim >= 0 ? '+' : '') +
      Number(delta.ssim).toFixed(4) + (delta.ms_ssim != null ? '，MS-SSIM ' + (delta.ms_ssim >= 0 ? '+' : '') + Number(delta.ms_ssim).toFixed(4) : '') + '</div>';
  }

  body.innerHTML = '<div style="font-weight:600;margin-bottom:6px">' + title + '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px">' + head + rows + '</table>' + extra;
  $show('reconReportCard', true);
}

// ---------------- 已训 PLY 评估报告（eval-ply 模式） ----------------
function renderBrushReport(d) {
  var body = $id('reconReportBody');
  if (!body) return;
  var m = d.metrics || {};
  var rows = '';
  rows += '<tr><td style="padding:4px 8px">PSNR (dB)</td><td style="text-align:right;padding:4px 8px">' + (m.psnr != null ? Number(m.psnr).toFixed(2) : '—') + '</td></tr>';
  rows += '<tr><td style="padding:4px 8px">SSIM</td><td style="text-align:right;padding:4px 8px">' + (m.ssim != null ? Number(m.ssim).toFixed(4) : '—') + '</td></tr>';
  rows += '<tr><td style="padding:4px 8px">MS-SSIM</td><td style="text-align:right;padding:4px 8px">' + (m.ms_ssim != null ? Number(m.ms_ssim).toFixed(4) : '—') + '</td></tr>';
  rows += '<tr><td style="padding:4px 8px">RMSE</td><td style="text-align:right;padding:4px 8px">' + (m.rmse != null ? Number(m.rmse).toFixed(4) : '—') + '</td></tr>';
  rows += '<tr><td style="padding:4px 8px">MAE</td><td style="text-align:right;padding:4px 8px">' + (m.mae != null ? Number(m.mae).toFixed(4) : '—') + '</td></tr>';
  body.innerHTML = '<div style="font-weight:600;margin-bottom:6px">已训 PLY 评估报告（' + (d.num_views || 0) + ' 视角）</div>' +
    '<div style="font-size:11px;color:var(--ink-3);margin-bottom:6px;word-break:break-all">' + (d.ply || '') + '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px"><tr style="color:var(--ink-3)"><td style="padding:4px 8px">指标</td><td style="text-align:right;padding:4px 8px">均值</td></tr>' + rows + '</table>';
  $show('reconReportCard', true);
}

// ---------------- 已训 PLY 评估入口 ----------------
// 评估渲染图有两个来源：
// 1) 训练循环内置 eval（--eval-save-to-disk）：export_path/eval_{iter}/ 下
// 2) headless 详细 eval（--eval-out）：eval_out/eval_{iter}_{phase}/ 下（每张含指标）
// 前端构建参数时把 --eval-out 指到与 export 相同的根目录，因此优先提示该目录。
function evalTrainedPly() {
  // 获取导出路径
  var exportPath = $val('reconExportPath');
  var datasetPath = $val('reconImageDir');
  if (!datasetPath) {
    toast('请先设置数据集根目录', 'var(--red)');
    return;
  }

  var evalBase = _resolveExportBase(exportPath, _datasetRoot($val('reconImageDir'), $val('reconColmapPath')));

  // 弹出提示，引导用户到评估 Tab
  var msg = '训练时已自动生成评估渲染图（--eval-out / --eval-save-to-disk）。\n\n' +
    '评估渲染图根目录：\n' + evalBase + '\n' +
    '（子目录形如 eval_{iter}_{phase} 或 eval_{iter}）\n\n' +
    '请切换到「评估验证」标签页：\n' +
    '1. GT 目录：选择数据集的图像目录\n' +
    '2. Pred 目录：选择上述某一评估子目录\n' +
    '3. 点击「开始评估」即可获得完整指标报告\n\n' +
    '是否立即切换到评估标签页？';

  if (confirm(msg)) {
    // 切换到评估 Tab
    document.querySelector('.tab[data-tab="evaluate"]').click();
    // 自动填入目录（默认取数字最大的 eval 子目录交给用户确认；此处先填根目录）
    if ($id('evalPredDir')) $id('evalPredDir').value = evalBase;
    if ($id('evalGtDir')) $id('evalGtDir').value = _normPath($val('reconImageDir'));
  }
}

// ---------------- 训练完成 / 预览加载 ----------------
function onBrushDone(d) {
  Recon.training = false; stopReconTimer(); updateReconUI();
  $txt('barStatus', '训练完成');
  toast('训练完成！');
  RecLog('训练完成，导出: ' + (d.export_ply || '未知路径'), 'system');
  if (d.export_ply) {
    try { loadPLYModel(d.export_ply); } catch (e) { RecLog('PLY 预览加载失败: ' + e.message, 'error'); }
  }
  _showEvalPathHint();
}
