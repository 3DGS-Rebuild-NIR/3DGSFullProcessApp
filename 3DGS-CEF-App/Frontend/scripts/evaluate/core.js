// ==================== Evaluate — 评估验证板块（3DGSVerify 功能前端化） ====================
// 将 3DGSVerify/evaluate.py 的离线重建质量评估能力搬入前端：
//   GT 目录 vs 渲染目录逐张对比 → PSNR/SSIM/MS-SSIM/RMSE/MAE → 页面报告
// 引擎为纯 JS（EvalMetrics），公式与 evaluate.py 一致；LPIPS 需 Python 后端，暂不提供。

var EvalState = {
  running: false,
  stop: false,
  startTime: 0,
  timer: null
};

// ---------- 初始化 ----------

function initEvaluate() {
  _bindEvalPickers();
  _bindEvalButtons();
  _restoreEvalPrefs();
  _updateEvalUI();
}

function _bindEvalPickers() {
  [['evalGtDir', 'GT 目录'], ['evalPredDir', 'Pred 目录'], ['evalOutDir', '输出目录']].forEach(function (p) {
    var btn = $id(p[0] + 'Btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      DialogCEF.pickDir({ title: '选择' + p[1] }).then(function (dir) {
        if (dir) { $id(p[0]).value = dir; _saveEvalPrefs(); }
      }).catch(function (e) { toast(e.message, 'var(--red)'); });
    });
  });
}

function _bindEvalButtons() {
  var start = $id('evalStartBtn');
  var demo = $id('evalDemoBtn');
  var stop = $id('evalStopBtn');
  if (start) start.addEventListener('click', function () { startEvaluation(false); });
  if (demo) demo.addEventListener('click', function () { startEvaluation(true); });
  if (stop) stop.addEventListener('click', stopEvaluation);
  $$('input[name="evalMetric"]').forEach(function (cb) {
    cb.addEventListener('change', function () { _syncEvalChips(); _saveEvalPrefs(); });
  });
  ['evalSize', 'evalMaxImages', 'evalSeed'].forEach(function (id) {
    var e = $id(id);
    if (e) e.addEventListener('change', function () { _saveEvalPrefs(); });
  });
  _syncEvalChips();
}

function _syncEvalChips() {
  $$('input[name="evalMetric"]').forEach(function (cb) {
    var label = cb.closest('.eval-chip');
    if (label) label.classList.toggle('on', cb.checked);
  });
}

// ---------- 配置 ----------

function _evalConfig(demo) {
  var metrics = [];
  $$('input[name="evalMetric"]:checked').forEach(function (cb) { metrics.push(cb.value); });
  if (!metrics.length) {
    toast('请至少选择一项指标', 'var(--red)');
    return null;
  }
  var sizeSel = $val('evalSize') || 'original';
  var sizeWidth = sizeSel === 'original' ? null : parseInt(sizeSel, 10);
  return {
    demo: !!demo,
    gtDir: demo ? '' : $val('evalGtDir').trim(),
    predDir: demo ? '' : $val('evalPredDir').trim(),
    outDir: $val('evalOutDir').trim(),
    metrics: metrics,
    sizeWidth: sizeWidth,
    maxImages: parseInt($val('evalMaxImages'), 10) || 0,
    seed: parseInt($val('evalSeed'), 10) || 0
  };
}

function _saveEvalPrefs() {
  try {
    localStorage.setItem('evalCfg', JSON.stringify({
      gtDir: $val('evalGtDir'), predDir: $val('evalPredDir'), outDir: $val('evalOutDir'),
      metrics: $$('input[name="evalMetric"]:checked').map(function (c) { return c.value; }),
      size: $val('evalSize'), maxImages: $val('evalMaxImages'), seed: $val('evalSeed')
    }));
  } catch (e) { /* ignore */ }
}

function _restoreEvalPrefs() {
  try {
    var raw = localStorage.getItem('evalCfg');
    if (!raw) return;
    var c = JSON.parse(raw);
    if (c.gtDir) $id('evalGtDir').value = c.gtDir;
    if (c.predDir) $id('evalPredDir').value = c.predDir;
    if (c.outDir) $id('evalOutDir').value = c.outDir;
    if (Array.isArray(c.metrics) && c.metrics.length) {
      var set = {};
      c.metrics.forEach(function (m) { set[m] = true; });
      $$('input[name="evalMetric"]').forEach(function (cb) { cb.checked = !!set[cb.value]; });
    }
    if (c.size && $id('evalSize')) $id('evalSize').value = c.size;
    if (c.maxImages && $id('evalMaxImages')) $id('evalMaxImages').value = c.maxImages;
    if (c.seed && $id('evalSeed')) $id('evalSeed').value = c.seed;
  } catch (e) { /* ignore */ }
}

// ---------- 主流程 ----------

function startEvaluation(demo) {
  if (EvalState.running) return;
  var cfg = _evalConfig(demo);
  if (!cfg) return;
  if (!cfg.demo && (!cfg.gtDir || !cfg.predDir)) {
    toast('请选择 GT 目录与 Pred 目录（或用演示模式）', 'var(--red)');
    return;
  }

  EvalState.running = true;
  EvalState.stop = false;
  EvalState.startTime = Date.now();
  _updateEvalUI();
  setStatus(demo ? '演示评估中' : '评估中', 'processing');

  var t0 = performance.now();
  var warnings = [];

  var runPromise = cfg.demo
    ? _runDemo(cfg)
    : _runReal(cfg, warnings);

  runPromise.then(function (result) {
    if (EvalState.stop) {
      toast('评估已停止');
      result = result || null;
      if (result) {
        result.meta.interrupted = true;
        result.warnings.push('评估被用户中止，仅完成部分配对。');
        EvalReport.renderReport($id('evalReport'), result);
      }
      return;
    }
    result.meta.timeSec = (performance.now() - t0) / 1000;
    result.meta.timeText = new Date().toLocaleString();
    EvalReport.renderReport($id('evalReport'), result);
    _writeOutputs(cfg, result);
    toast('评估完成：' + result.meta.numImages + ' 对图片');
    setStatus('评估完成', '');
  }).catch(function (err) {
    toast('评估失败: ' + err.message, 'var(--red)');
    setStatus('评估失败', 'error');
    _setEvalLog('错误：' + err.message);
  }).finally(function () {
    EvalState.running = false;
    _stopEvalTimer();
    _updateEvalUI();
  });
}

function _runDemo(cfg) {
  _setEvalLog('正在生成演示数据（6 对 512×768 合成图）...');
  return new Promise(function (resolve) {
    setTimeout(function () {
      var pairs = EvalIO.generateDemo(cfg.seed, 6);
      _setEvalLog('演示数据已生成，开始计算指标...');
      computeAll(pairs, cfg, { gtDir: '', predDir: '', unmatchedGt: [], unmatchedPred: [] })
        .then(function (result) {
          result.meta.gtDir = '';
          result.meta.predDir = '';
          result.meta.demo = true;
          result.warnings.push('演示模式：合成数据仅用于验证评估流程，不代表真实重建质量。');
          result.warnings.push('注：若伪测试集来自全量训练数据，指标反映重建保真度而非泛化能力（乐观估计）。');
          resolve(result);
        });
    }, 30);
  });
}

function _runReal(cfg, warnings) {
  _setEvalLog('扫描目录并配对图片...');
  return EvalIO.pairDirs(cfg.gtDir, cfg.predDir, EvalIO.DEFAULT_EXTS).then(function (p) {
    if (!p.common.length) {
      throw new Error('GT 目录找到图片但与 Pred 目录无匹配对。请检查文件名主干是否一致（GT 示例: ' +
        (p.unmatchedGt.slice(0, 3).join(', ') || '无') + '，Pred 示例: ' +
        (p.unmatchedPred.slice(0, 3).join(', ') || '无') + '）');
    }
    var pairs = p.common.map(function (stem) {
      return { name: stem, gtPath: p.gtMap[stem].path, predPath: p.predMap[stem].path };
    });
    // 抽样
    var totalPairs = pairs.length;
    if (cfg.maxImages > 0 && cfg.maxImages < pairs.length) {
      var rng = EvalIO.mulberry32(cfg.seed);
      var chosen = new Set();
      while (chosen.size < cfg.maxImages) chosen.add(Math.floor(rng() * totalPairs));
      pairs = pairs.filter(function (_, i) { return chosen.has(i); });
      warnings.push('按 seed=' + cfg.seed + ' 随机抽样 ' + pairs.length + ' / ' + totalPairs + ' 对图片评估');
    }
    p.warnings = warnings;
    _setEvalLog('配对完成：' + pairs.length + ' 对图片，开始逐张评估...');
    return computeAll(pairs, cfg, p);
  }).then(function (result) {
    result.meta.demo = false;
    return result;
  });
}

// 逐张计算指标（每张后让出事件循环以便刷新进度）
function computeAll(pairs, cfg, pairInfo) {
  var rows = [];
  var resized = 0;
  var warnings = [];
  var metrics = cfg.metrics;
  var n = pairs.length;
  var firstSize = null;

  function step(i) {
    if (EvalState.stop) {
      return Promise.resolve(buildResult());
    }
    var item = pairs[i];
    _setEvalProgress(i, n, item.name);

    var gtP = item.gt ? Promise.resolve(item.gt) : EvalIO.loadImage(item.gtPath, null);
    return gtP.then(function (gt) {
      var target = null;
      if (cfg.sizeWidth) target = [cfg.sizeWidth, Math.round(gt.h * cfg.sizeWidth / gt.w)];
      if (target) gt = EvalIO.resizeTo(gt, target[0], target[1]);
      if (!firstSize) firstSize = { w: gt.w, h: gt.h };
      var predP = item.pred ? Promise.resolve(item.pred) : EvalIO.loadImage(item.predPath, target || null);
      return predP.then(function (pred) {
        if (pred.w !== gt.w || pred.h !== gt.h) {
          pred = EvalIO.resizeTo(pred, gt.w, gt.h);
          resized++;
        }
        var row = { name: item.name };
        metrics.forEach(function (m) {
          if (m === 'psnr') row[m] = EvalMetrics.computePsnr(gt, pred);
          else if (m === 'ssim') row[m] = EvalMetrics.computeSsim(gt, pred, 1.0, 11, 1.5);
          else if (m === 'ms-ssim') row[m] = EvalMetrics.computeMsSsim(gt, pred, 1.0, 11, 1.5);
          else if (m === 'rmse') row[m] = EvalMetrics.computeRmse(gt, pred);
          else if (m === 'mae') row[m] = EvalMetrics.computeMae(gt, pred);
        });
        rows.push(row);
        // 让出主线程，刷新进度 UI
        return new Promise(function (r) { setTimeout(r, 0); }).then(function () {
          if (i + 1 < n) return step(i + 1);
          return buildResult();
        });
      });
    });
  }

  function buildResult() {
    if (resized) {
      warnings.push(resized + ' 张渲染图尺寸与真值不一致，已自动重采样到真值尺寸。建议用「评估宽度」统一尺寸以保证指标一致性。');
    }
    var allWarnings = warnings.concat(pairInfo.warnings || []);
    var metricsSummary = {};
    metrics.forEach(function (m) {
      var values = rows.map(function (r) { return r[m]; });
      metricsSummary[m] = EvalMetrics.summarize(values);
    });
    var rankings = { worst: [], best: [] };
    if (metrics.indexOf('psnr') >= 0) {
      var byPsnr = rows.slice().sort(function (a, b) { return a.psnr - b.psnr; });
      var finiteRows = byPsnr.filter(function (r) { return isFinite(r.psnr); });
      rankings.worst = finiteRows.slice(0, 5).map(function (r) { return [r.name, r.psnr]; });
      rankings.best = finiteRows.slice(-5).reverse().map(function (r) { return [r.name, r.psnr]; });
    }
    return {
      meta: {
        gtDir: cfg.gtDir, predDir: cfg.predDir, outDir: cfg.outDir,
        sizeWh: firstSize ? [firstSize.w, firstSize.h] : null,
        numImages: rows.length, metrics: metrics.slice(),
        maxImages: cfg.maxImages, seed: cfg.seed, timeSec: null
      },
      metrics: metricsSummary,
      rankings: rankings,
      warnings: allWarnings,
      rows: rows,
      unmatchedGt: pairInfo.unmatchedGt || [],
      unmatchedPred: pairInfo.unmatchedPred || []
    };
  }

  return step(0);
}

// ---------- 停止 / 输出 ----------

function stopEvaluation() {
  if (!EvalState.running) return;
  EvalState.stop = true;
  setStatus('正在停止...', 'processing');
}

function _writeOutputs(cfg, result) {
  if (!cfg.outDir) return;
  var dir = cfg.outDir;
  var tasks = [
    ['summary.json', EvalReport.buildSummaryJson(result)],
    ['per_image.csv', buildCsv(result)],
    ['summary.txt', EvalReport.buildReportText(result)]
  ];
  var chain = Promise.resolve();
  tasks.forEach(function (t) {
    chain = chain.then(function () {
      return FileCEF.write(dir.replace(/[\\/]+$/, '') + '\\' + t[0], t[1]).catch(function (e) {
        toast('写入 ' + t[0] + ' 失败: ' + e.message, 'var(--red)');
      });
    });
  });
  chain.then(function () { toast('结果已写入 ' + dir); }).catch(function () {});
}

function buildCsv(result) {
  var metrics = result.meta.metrics;
  var lines = ['name' + metrics.map(function (m) { return ',' + m; }).join('')];
  result.rows.forEach(function (r) {
    var cells = [r.name];
    metrics.forEach(function (m) {
      var v = r[m];
      cells.push((typeof v === 'number' && !isFinite(v)) ? 'inf' : v);
    });
    lines.push(cells.join(','));
  });
  return lines.join('\r\n');
}

// ---------- 进度 UI ----------

function _setEvalProgress(i, n, name) {
  var pct = n > 0 ? Math.round(((i + 1) / n) * 100) : 0;
  var fill = $id('evalProgressFill');
  if (fill) fill.style.width = pct + '%';
  $txt('evalProgressPct', pct + '%');
  $txt('evalProgressLabel', '正在评估 [' + (i + 1) + '/' + n + '] ' + (name || ''));
  $txt('evalDone', (i + 1) + ' / ' + n);
  $txt('evalCurPair', (name || '-'));
  if (i === 0) _startEvalTimer();
}

function _setEvalLog(text) {
  $txt('evalProgressLabel', text);
  $txt('evalDone', '-');
  $txt('evalCurPair', '-');
  var fill = $id('evalProgressFill');
  if (fill) fill.style.width = '0%';
  $txt('evalProgressPct', '0%');
}

function _startEvalTimer() {
  _stopEvalTimer();
  EvalState.timer = setInterval(function () {
    if (!EvalState.startTime) return;
    var s = Math.floor((Date.now() - EvalState.startTime) / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    $txt('evalElapsed', (h > 0 ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0'));
  }, 500);
}

function _stopEvalTimer() {
  if (EvalState.timer) { clearInterval(EvalState.timer); EvalState.timer = null; }
}

function _updateEvalUI() {
  var start = $id('evalStartBtn');
  var demo = $id('evalDemoBtn');
  var stop = $id('evalStopBtn');
  if (start) start.disabled = EvalState.running;
  if (demo) demo.disabled = EvalState.running;
  if (stop) stop.disabled = !EvalState.running;
}

// 供 status.js 刷新状态栏
function refreshEvaluateStatus() {
  if (EvalState.running) { _applyBar('评估中', 'processing'); return; }
  if (typeof cefQuery === 'undefined') { _applyBar('CEF 未就绪', 'error'); return; }
  _applyBar('就绪');
}
