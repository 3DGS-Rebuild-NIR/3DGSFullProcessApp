// ==================== EvalReport — 评估报告渲染 ====================
// 将评估结果渲染为页面报告：汇总表 / 排名 / 逐图明细 / 警告 / 导出

(function (root) {
  'use strict';

  var METRIC_META = {
    'psnr': { label: 'PSNR', unit: 'dB', dir: 'up', digits: 2 },
    'ssim': { label: 'SSIM', unit: '', dir: 'up', digits: 4 },
    'ms-ssim': { label: 'MS-SSIM', unit: '', dir: 'up', digits: 4 },
    'rmse': { label: 'RMSE', unit: '', dir: 'down', digits: 4 },
    'mae': { label: 'MAE', unit: '', dir: 'down', digits: 4 },
    'lpips': { label: 'LPIPS', unit: '', dir: 'down', digits: 4 }
  };

  function metricLabel(m) {
    var meta = METRIC_META[m];
    return meta ? meta.label + (meta.dir === 'up' ? ' (↑)' : ' (↓)') : m;
  }

  function fmtNum(v, digits) {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'number') {
      if (!isFinite(v)) return v > 0 ? 'inf' : '-inf';
      return v.toFixed(digits);
    }
    return String(v);
  }

  // ---------- DOM 工具 ----------

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---------- 报告主体 ----------

  // result: 见 core.js 中 buildResult
  function renderReport(container, result) {
    container.innerHTML = '';
    var wrap = el('div', 'eval-report');

    // 标题
    var title = el('div', 'er-title');
    title.appendChild(el('div', 'er-title-main', '3DGS 重建质量量化评估报告'));
    title.appendChild(el('div', 'er-title-sub', 'Reconstruction Evaluation Report'));
    wrap.appendChild(title);

    // 元信息
    var meta = el('div', 'er-meta');
    addMetaRow(meta, '评估时间', result.timeText || new Date().toLocaleString());
    addMetaRow(meta, 'Ground Truth', result.meta.gtDir || '(演示数据)');
    addMetaRow(meta, 'Prediction', result.meta.predDir || '(演示数据)');
    addMetaRow(meta, '图像尺寸', result.meta.sizeWh ? result.meta.sizeWh[0] + ' × ' + result.meta.sizeWh[1] : '-');
    addMetaRow(meta, '配对数量', String(result.meta.numImages) + (result.meta.sampled ? '（抽样）' : ''));
    addMetaRow(meta, '评估指标', result.meta.metrics.map(metricLabel).join('  ·  '));
    addMetaRow(meta, '耗时', result.meta.timeSec != null ? result.meta.timeSec.toFixed(1) + ' s' : '-');
    wrap.appendChild(meta);

    // 指标汇总表
    var sTitle = el('div', 'er-sec-title', '指标汇总（mean / std / min / max）');
    wrap.appendChild(sTitle);
    var table = el('table', 'er-table er-summary');
    var thead = el('thead');
    var hr = el('tr');
    ['指标', 'mean', 'std', 'min', 'max'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    result.meta.metrics.forEach(function (m) {
      var s = result.metrics[m];
      if (!s) return;
      var tr = el('tr');
      var nameTd = el('td', 'er-metric-name');
      nameTd.textContent = metricLabel(m);
      if (METRIC_META[m] && METRIC_META[m].unit) nameTd.appendChild(el('span', 'er-unit', METRIC_META[m].unit));
      tr.appendChild(nameTd);
      ['mean', 'std', 'min', 'max'].forEach(function (k) {
        var digits = METRIC_META[m] ? METRIC_META[m].digits : 4;
        var td = el('td', 'mono');
        var v = s[k];
        if (k === 'mean') {
          td.classList.add('er-mean');
          if (METRIC_META[m] && METRIC_META[m].dir === 'up') td.classList.add('good');
          else if (METRIC_META[m] && METRIC_META[m].dir === 'down') td.classList.add('bad');
        }
        td.textContent = fmtNum(v, digits);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    // PSNR 排名
    if (result.rankings && result.rankings.worst && result.rankings.worst.length) {
      var rankBox = el('div', 'er-rank-grid');
      rankBox.appendChild(buildRankCard('PSNR 最差视图（worst 5）', result.rankings.worst, 'bad'));
      rankBox.appendChild(buildRankCard('PSNR 最好视图（best 5）', result.rankings.best, 'good'));
      wrap.appendChild(rankBox);
    }

    // 警告 / 未匹配
    var notes = [];
    (result.warnings || []).forEach(function (w) { notes.push({ type: 'warn', text: w }); });
    if (result.unmatchedGt && result.unmatchedGt.length) {
      notes.push({ type: 'info', text: '真值目录中未匹配到渲染图的 ' + result.unmatchedGt.length + ' 张: ' + result.unmatchedGt.slice(0, 10).join(', ') + (result.unmatchedGt.length > 10 ? ' ...' : '') });
    }
    if (result.unmatchedPred && result.unmatchedPred.length) {
      notes.push({ type: 'info', text: '渲染目录中未匹配到真值的 ' + result.unmatchedPred.length + ' 张: ' + result.unmatchedPred.slice(0, 10).join(', ') + (result.unmatchedPred.length > 10 ? ' ...' : '') });
    }
    if (notes.length) {
      var noteBox = el('div', 'er-notes');
      notes.forEach(function (n) {
        noteBox.appendChild(el('div', 'er-note ' + n.type, (n.type === 'warn' ? '⚠ ' : 'ℹ ') + n.text));
      });
      wrap.appendChild(noteBox);
    }

    // 逐图明细表
    wrap.appendChild(el('div', 'er-sec-title', '逐图评估明细（per-image）'));
    wrap.appendChild(buildPerImageTable(result));

    // 导出按钮
    var actions = el('div', 'er-actions');
    actions.appendChild(mkActionBtn('导出 summary.json', function () { downloadJson(result); }));
    actions.appendChild(mkActionBtn('导出 per_image.csv', function () { downloadCsv(result); }));
    actions.appendChild(mkActionBtn('复制报告文本', function () { copyReportText(result); }));
    wrap.appendChild(actions);

    container.appendChild(wrap);
  }

  function addMetaRow(box, k, v) {
    var row = el('div', 'er-meta-row');
    row.appendChild(el('span', 'er-meta-k', k));
    row.appendChild(el('span', 'er-meta-v', v));
    box.appendChild(row);
  }

  function buildRankCard(title, list, cls) {
    var card = el('div', 'er-rank-card');
    card.appendChild(el('div', 'er-rank-title', title));
    var ol = el('ol', 'er-rank-list');
    list.forEach(function (item) {
      var li = el('li');
      li.appendChild(el('span', 'er-rank-name mono', item[0]));
      li.appendChild(el('span', 'er-rank-val mono ' + cls, item[1].toFixed(2)));
      ol.appendChild(li);
    });
    card.appendChild(ol);
    return card;
  }

  // ---------- 逐图明细表（分页 + 排序） ----------

  var _perPage = 20;

  function buildPerImageTable(result) {
    var box = el('div', 'er-pitable');
    var state = { rows: result.rows.slice(), sortKey: 'name', sortAsc: true, page: 0 };
    var metrics = result.meta.metrics;

    // 排序控件
    var toolbar = el('div', 'er-pit-toolbar');
    var sortSel = el('select', null);
    var nameOpt = el('option', null, '按文件名');
    nameOpt.value = 'name';
    sortSel.appendChild(nameOpt);
    metrics.forEach(function (m) {
      var opt = el('option', null, '按 ' + metricLabel(m));
      opt.value = m;
      sortSel.appendChild(opt);
    });
    sortSel.value = 'name';
    sortSel.addEventListener('change', function () {
      state.sortKey = sortSel.value;
      state.page = 0;
      render();
    });
    toolbar.appendChild(sortSel);

    var pager = el('div', 'er-pager');
    var pageInfo = el('span', 'er-page-info', '');
    var prevBtn = mkSmallBtn('‹', function () { if (state.page > 0) { state.page--; render(); } });
    var nextBtn = mkSmallBtn('›', function () { if ((state.page + 1) * _perPage < sorted().length) { state.page++; render(); } });
    pager.appendChild(prevBtn);
    pager.appendChild(pageInfo);
    pager.appendChild(nextBtn);
    toolbar.appendChild(pager);
    box.appendChild(toolbar);

    var table = el('table', 'er-table er-perimage');
    var thead = el('thead');
    var hr = el('tr');
    hr.appendChild(el('th', 'er-col-name', '#'));
    hr.appendChild(el('th', 'er-col-name', '文件名'));
    metrics.forEach(function (m) {
      var th = el('th', 'er-col-' + m, metricLabel(m));
      th.style.cursor = 'pointer';
      th.addEventListener('click', function () {
        var key = m;
        if (state.sortKey === key) state.sortAsc = !state.sortAsc;
        else { state.sortKey = key; state.sortAsc = (METRIC_META[m] && METRIC_META[m].dir === 'up'); }
        state.page = 0;
        render();
      });
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    table.appendChild(tbody);
    var scroll = el('div', 'er-table-scroll');
    scroll.appendChild(table);
    box.appendChild(scroll);

    function sorted() {
      var rows = state.rows.slice();
      var key = state.sortKey;
      rows.sort(function (a, b) {
        var va = key === 'name' ? a.name : a[key];
        var vb = key === 'name' ? b.name : b[key];
        var cmp;
        if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
        else cmp = String(va).localeCompare(String(vb));
        return state.sortAsc ? cmp : -cmp;
      });
      return rows;
    }

    function render() {
      var rows = sorted();
      var total = rows.length;
      var pages = Math.max(1, Math.ceil(total / _perPage));
      if (state.page >= pages) state.page = pages - 1;
      pageInfo.textContent = (state.page + 1) + ' / ' + pages + ' 页 · ' + total + ' 行';
      prevBtn.disabled = state.page === 0;
      nextBtn.disabled = state.page >= pages - 1;
      tbody.innerHTML = '';
      var start = state.page * _perPage;
      var slice = rows.slice(start, start + _perPage);
      slice.forEach(function (r, idx) {
        var tr = el('tr');
        tr.appendChild(el('td', 'mono', String(start + idx + 1)));
        tr.appendChild(el('td', 'er-name mono', r.name));
        metrics.forEach(function (m) {
          var digits = METRIC_META[m] ? METRIC_META[m].digits : 4;
          var td = el('td', 'mono');
          var v = r[m];
          td.textContent = fmtNum(v, digits);
          if (typeof v === 'number' && isFinite(v) && m === 'psnr' && result.metrics[m]) {
            var mean = result.metrics[m].mean;
            if (isFinite(mean)) {
              td.classList.add(v >= mean ? 'cell-good' : 'cell-bad');
            }
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    render();
    return box;
  }

  // ---------- 导出 ----------

  function mkActionBtn(label, fn) {
    var b = el('button', 'btn', label);
    b.addEventListener('click', fn);
    return b;
  }

  function mkSmallBtn(label, fn) {
    var b = el('button', 'er-pager-btn', label);
    b.addEventListener('click', fn);
    return b;
  }

  // summary.json（结构与 evaluate.py 一致；非有限值序列化为 null）
  function buildSummaryJson(result) {
    var summary = { metrics: {} };
    Object.keys(result.metrics).forEach(function (m) {
      summary.metrics[m] = { mean: norm(result.metrics[m].mean), std: norm(result.metrics[m].std), min: norm(result.metrics[m].min), max: norm(result.metrics[m].max) };
    });
    summary.num_images = result.meta.numImages;
    summary.image_size_wh = result.meta.sizeWh;
    summary.config = {
      gt: result.meta.gtDir, pred: result.meta.predDir, out: result.meta.outDir,
      size: result.meta.sizeWh ? result.meta.sizeWh[0] + 'x' + result.meta.sizeWh[1] : null,
      metrics: result.meta.metrics.join(','),
      max_images: result.meta.maxImages, seed: result.meta.seed
    };
    summary.rankings = result.rankings;
    summary.warnings = result.warnings;
    summary.unmatched_gt = result.unmatchedGt;
    summary.unmatched_pred = result.unmatchedPred;
    summary.per_image_csv = 'per_image.csv';
    return JSON.stringify(summary, null, 2);
  }

  function norm(v) {
    return (typeof v === 'number' && !isFinite(v)) ? null : v;
  }

  function downloadJson(result) {
    var blob = new Blob([buildSummaryJson(result)], { type: 'application/json' });
    triggerDownload(blob, 'summary.json');
  }

  function downloadCsv(result) {
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
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    triggerDownload(blob, 'per_image.csv');
  }

  // 纯文本报告（与 evaluate.py summary.txt 同构）
  function buildReportText(result) {
    var lines = [];
    lines.push('='.repeat(72));
    lines.push(' 3DGS 重建质量量化评估报告 / Reconstruction Evaluation Report');
    lines.push('='.repeat(72));
    lines.push(' Ground truth : ' + (result.meta.gtDir || '(demo)'));
    lines.push(' Prediction   : ' + (result.meta.predDir || '(demo)'));
    lines.push(' Image size   : ' + (result.meta.sizeWh ? result.meta.sizeWh[0] + 'x' + result.meta.sizeWh[1] : '-'));
    lines.push(' Num pairs    : ' + result.meta.numImages);
    lines.push(' Metrics      : ' + result.meta.metrics.join(', '));
    lines.push('-' .repeat(72));
    lines.push('metric        mean       std        min        max');
    lines.push('-' .repeat(72));
    result.meta.metrics.forEach(function (m) {
      var s = result.metrics[m];
      lines.push(String(m).padEnd(14) + [s.mean, s.std, s.min, s.max].map(function (v) { return fmtNum(v, 4).padStart(10); }).join(''));
    });
    if (result.rankings && result.rankings.worst.length) {
      lines.push('-' .repeat(72));
      lines.push(' PSNR 最差视图 (worst 5) : ' + result.rankings.worst.map(function (x) { return x[0] + '(' + x[1].toFixed(2) + ')'; }).join(', '));
      lines.push(' PSNR 最好视图 (best 5)  : ' + result.rankings.best.map(function (x) { return x[0] + '(' + x[1].toFixed(2) + ')'; }).join(', '));
    }
    (result.warnings || []).forEach(function (w) { lines.push(' [warning] ' + w); });
    if (result.unmatchedGt && result.unmatchedGt.length) {
      lines.push(' [info] 真值目录中未匹配到渲染图的 ' + result.unmatchedGt.length + ' 张: ' + result.unmatchedGt.slice(0, 10).join(', '));
    }
    if (result.unmatchedPred && result.unmatchedPred.length) {
      lines.push(' [info] 渲染目录中未匹配到真值的 ' + result.unmatchedPred.length + ' 张: ' + result.unmatchedPred.slice(0, 10).join(', '));
    }
    lines.push('='.repeat(72));
    return lines.join('\n');
  }

  function copyReportText(result) {
    var text = buildReportText(result);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (typeof toast === 'function') toast('报告已复制到剪贴板');
      });
    }
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  var api = {
    METRIC_META: METRIC_META,
    renderReport: renderReport,
    buildSummaryJson: buildSummaryJson,
    buildReportText: buildReportText,
    fmtNum: fmtNum
  };

  root.EvalReport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
