var reBrushLine = /^(?:\[3DGS\]\s+)?\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+(\w+)\s+([\w:]+)\]\s+(.*)/;

function parseReconOutput(msg) {
  try {
    if (msg.charAt(0) === '{') {
      var d = JSON.parse(msg);
      if (d.type === 'log') { RecLog(d.message || msg, 'system'); return; }
      if (d.type === 'error') { RecLog('[ERROR] ' + (d.message || msg), 'error'); return; }
      // 结构化事件（brush-headless）：step/eval/phase/summary/done/report/...
      handleBrushEvent(d);
      return;
    }
  } catch(e) {}

  var m = msg.match(reBrushLine);
  if (m) {
    var level = m[1], module = m[2], text = m[3];
    if (/Start training loop/i.test(text)) {
      Recon.step = 0; updateReconProgress();
      RecLog('训练循环开始', 'info');
      $txt('barStatus', '训练中…');
      return;
    }
    if (/Begin IR training phase/i.test(text)) {
      RecLog('进入 IR 训练阶段', 'info');
      $txt('barStatus', 'IR 训练阶段');
      return;
    }
    if (/Done training!/i.test(text)) {
      var tMatch = text.match(/Took\s+FormattedDuration\(([^)]+)\)/i);
      var dur = tMatch ? tMatch[1] : '';
      var tSteps = $num('reconTrainSteps', 30000);
      Recon.total = tSteps; Recon.step = tSteps;
      Recon.training = false; stopReconTimer(); updateReconUI();
      $txt('barStatus', '训练完成' + (dur ? ' (' + dur + ')' : ''));
      RecLog('训练完成' + (dur ? '，耗时 ' + dur : ''), 'system');
      toast('训练完成！');
      updateReconProgress();
      return;
    }
    if (/Loaded dataset with/i.test(text)) {
      var vMatch = text.match(/(\d+)\s+training/);
      if (vMatch) RecLog('数据集加载完成，' + vMatch[1] + ' 个训练视图', 'info');
      return;
    }
    if (/Completed loading/i.test(text)) {
      $txt('barStatus', '训练引擎启动中');
      RecLog('数据加载完成，训练准备就绪', 'info');
      return;
    }
    var iterM = text.match(/splat_dist\s+iter=(\d+)/);
    if (iterM) {
      Recon.step = parseInt(iterM[1]);
      updateReconProgress();
      return;
    }
    var evalM = text.match(/Eval\s+iter\s+(\d+):\s*PSNR\s+([\d.]+)/i);
    if (evalM) {
      Recon.step = parseInt(evalM[1]);
      var met = { step: Recon.step, psnr: parseFloat(evalM[2]) };
      var ssimM = text.match(/ssim\s+([\d.]+)/i);
      if (ssimM) met.ssim = parseFloat(ssimM[1]);
      var lpipsM = text.match(/lpips?\s+([\d.]+)/i);
      if (lpipsM) met.lpips = parseFloat(lpipsM[1]);
      updateReconMetrics(met);
      updateReconProgress();
      RecLog('评估 iter=' + met.step + ' PSNR=' + met.psnr.toFixed(2) +
        (met.ssim != null ? ' SSIM=' + met.ssim.toFixed(4) : '') +
        (met.lpips != null ? ' LPIPS=' + met.lpips.toFixed(4) : ''), 'info');
      return;
    }
    RecLog(text, 'system');
    return;
  }

  var text = msg.replace(/^\[3DGS\]\s+/, '');
  var sm = text.match(/step\s*[=:]\s*(\d+)\s*\/\s*(\d+)/i);
  if (sm) { Recon.step = parseInt(sm[1]); Recon.total = parseInt(sm[2]); updateReconProgress(); }
  var met = {};
  var pm = text.match(/psnr\s*[=:]\s*([\d.]+)/i); if (pm) met.psnr = parseFloat(pm[1]);
  var s2 = text.match(/ssim\s*[=:]\s*([\d.]+)/i); if (s2) met.ssim = parseFloat(s2[1]);
  var lm = text.match(/lpips?\s*[=:]\s*([\d.]+)/i); if (lm) met.lpips = parseFloat(lm[1]);
  var sp = text.match(/speed\s*[=:]\s*([\d.]+)/i); if (sp) met.speed = parseFloat(sp[1]);
  if (Object.keys(met).length) updateReconMetrics(met);
  if (/complete|done|finished|训练完成/i.test(text)) {
    Recon.training = false; updateReconUI();
    $txt('barStatus', '训练完成'); toast('训练完成！');
  }
  RecLog(text, 'system');
}
