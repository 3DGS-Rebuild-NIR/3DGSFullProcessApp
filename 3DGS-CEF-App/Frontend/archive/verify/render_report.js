#!/usr/bin/env node
// ==================== 渲染测试：EvalReport 报告渲染（轻量 DOM 桩） ====================
'use strict';

// ---------- 最小 DOM 桩 ----------
function makeEl(tag) {
  const e = {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    disabled: false,
    value: '',
    innerHTML: '',
    textContent: '',
    parentNode: null,
    _classes: new Set(),
    listeners: {},
    appendChild(c) {
      if (c === undefined || c === null) throw new Error('appendChild(undefined) in <' + tag + '>');
      this.children.push(c);
      c.parentNode = this;
      return c;
    },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      return c;
    },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    click() { (this.listeners['click'] || []).forEach(fn => fn({ target: this })); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; }
  };
  Object.defineProperty(e, 'classList', {
    get: () => ({
      add: (...cs) => cs.forEach(c => e._classes.add(c)),
      remove: (...cs) => cs.forEach(c => e._classes.delete(c)),
      toggle: (c, on) => { on ? e._classes.add(c) : e._classes.delete(c); },
      contains: c => e._classes.has(c)
    })
  });
  Object.defineProperty(e, 'className', {
    get: () => [...e._classes].join(' '),
    set: v => { e._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  return e;
}

const documentStub = {
  createElement: makeEl,
  body: makeEl('body'),
  getElementById: () => null
};
global.document = documentStub;
Object.defineProperty(global, 'navigator', { value: { clipboard: undefined }, configurable: true });
global.window = global;

// ---------- 加载被测模块 ----------
const path = require('path');
const EvalReport = require(path.join(__dirname, '..', '..', 'scripts', 'evaluate', 'report.js'));

// ---------- 构造一个示例评估结果 ----------
const metrics = ['psnr', 'ssim', 'ms-ssim', 'rmse', 'mae'];
const rows = ['00000', '00001', '00002', '00003', '00004', '00005'].map((name, i) => {
  const r = { name };
  r.psnr = 38 + i * 0.4;
  r.ssim = 0.98 + i * 0.001;
  r['ms-ssim'] = 0.99 + i * 0.0004;
  r.rmse = 0.012 - i * 0.0003;
  r.mae = 0.0074;
  return r;
});
const result = {
  meta: {
    gtDir: 'D:\\demo\\gt', predDir: 'D:\\demo\\pred', outDir: '',
    sizeWh: [768, 512], numImages: rows.length, metrics: metrics.slice(),
    maxImages: 0, seed: 0, timeSec: 3.2, timeText: '2024/01/01 12:00:00'
  },
  metrics: {},
  rankings: { worst: [['00000', 38.0], ['00001', 38.4]], best: [['00005', 40.0], ['00004', 39.6]] },
  warnings: ['1 张渲染图尺寸与真值不一致，已自动重采样到真值尺寸。'],
  rows: rows,
  unmatchedGt: ['frame_0001'],
  unmatchedPred: []
};
metrics.forEach(m => {
  const vals = rows.map(r => r[m]);
  result.metrics[m] = EvalReport.METRIC_META && require(path.join(__dirname, '..', '..', 'scripts', 'evaluate', 'metrics.js')).summarize(vals);
});

// ---------- 渲染 ----------
const container = makeEl('div');
EvalReport.renderReport(container, result);

const children = container.children[0];
if (!children || children.tagName !== 'DIV') throw new Error('renderReport 未产出报告根节点');
console.log('报告渲染完成, 根节点子元素数: ' + children.children.length);

// 汇总表检查
const tables = [];
(function walk(n) { n.children.forEach(c => { if (c.tagName === 'TABLE') tables.push(c); walk(c); }); })(children);
if (!tables.length) throw new Error('缺少汇总表');
const summary = tables[0];
console.log('表格数量: ' + tables.length + '（汇总 + 逐图明细）');

// JSON / 文本导出
const json = EvalReport.buildSummaryJson(result);
const parsed = JSON.parse(json);
if (parsed.num_images !== rows.length) throw new Error('summary.json num_images 错误');
if (parsed.metrics.psnr.mean !== result.metrics.psnr.mean) throw new Error('summary.json mean 错误');
console.log('summary.json 生成成功: ' + json.length + ' bytes');

const text = EvalReport.buildReportText(result);
if (!text.includes('3DGS 重建质量量化评估报告')) throw new Error('报告文本缺标题');
console.log('报告文本生成成功: ' + text.length + ' chars');

// 分页按钮冒烟
const pagerBtns = [];
(function walk2(n) { n.children.forEach(c => { if (c.className && c.className.indexOf('er-pager-btn') >= 0) pagerBtns.push(c); walk2(c); }); })(children);
console.log('分页按钮: ' + pagerBtns.length);

console.log('✅ 渲染测试通过');
