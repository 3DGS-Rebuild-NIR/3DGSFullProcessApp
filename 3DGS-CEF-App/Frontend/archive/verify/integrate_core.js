#!/usr/bin/env node
// ==================== 集成测试：core.js 完整评估管线（vm 全局加载 + DOM/CEF 桩） ====================
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');

// ---------- DOM / 环境桩 ----------
function makeEl(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    children: [], style: {}, dataset: {}, value: '', textContent: '', innerHTML: '',
    disabled: false, listeners: {},
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; }
  };
}
global.document = {
  createElement: makeEl,
  body: makeEl('body'),
  getElementById: () => makeEl('div'),
  querySelectorAll: () => []
};
global.window = global;
Object.defineProperty(global, 'navigator', { value: { clipboard: undefined }, configurable: true });
global.toast = () => {};
global.setStatus = () => {};
global._applyBar = () => {};
global.DialogCEF = { pickDir: () => Promise.resolve(null) };
global.FileCEF = {
  list: () => Promise.resolve([]),
  write: () => Promise.resolve('success')
};
global.$id = (s) => makeEl('div');
global.$val = () => '';
global.$num = () => 0;
global.$txt = () => {};
global.$show = () => {};
global.$$ = () => [];

// ---------- 加载 evaluate 脚本（保持与 index.html 相同顺序） ----------
const base = path.join(__dirname, '..', '..', 'scripts', 'evaluate');
const EvalMetrics = require(path.join(base, 'metrics.js'));
const EvalIO = require(path.join(base, 'io.js'));
global.EvalMetrics = EvalMetrics;
global.EvalIO = EvalIO;
global.EvalReport = require(path.join(base, 'report.js'));
vm.runInThisContext(fs.readFileSync(path.join(base, 'core.js'), 'utf8'));

// ---------- 测试 computeAll（演示数据，内存图） ----------
const cfg = {
  demo: true, gtDir: '', predDir: '', outDir: '',
  metrics: ['psnr', 'ssim', 'ms-ssim', 'rmse', 'mae'],
  sizeWidth: null, maxImages: 0, seed: 0
};

const pairs = EvalIO.generateDemo(0, 6).map(item => ({ name: item.name, gt: item.gt, pred: item.pred }));

computeAll(pairs, cfg, { unmatchedGt: [], unmatchedPred: [] }).then(result => {
  console.log('computeAll 完成, 配对: ' + result.meta.numImages);
  if (result.meta.numImages !== 6) throw new Error('配对数量错误');
  if (!result.meta.sizeWh || result.meta.sizeWh[0] !== 768) throw new Error('sizeWh 错误');
  if (result.rows.length !== 6) throw new Error('rows 数量错误');
  ['psnr', 'ssim', 'ms-ssim', 'rmse', 'mae'].forEach(m => {
    const s = result.metrics[m];
    if (!s || !isFinite(s.mean)) throw new Error('指标 ' + m + ' 汇总缺失或非有限: ' + JSON.stringify(s));
  });
  if (result.rankings.worst.length !== 5 || result.rankings.best.length !== 5) {
    throw new Error('PSNR 排名数量错误: ' + result.rankings.worst.length + '/' + result.rankings.best.length);
  }
  console.log('rankings.worst[0] = ' + JSON.stringify(result.rankings.worst[0]));
  console.log('rankings.best[0]  = ' + JSON.stringify(result.rankings.best[0]));
  console.log('✅ core.js 集成测试通过');
  process.exit(0);
}).catch(e => {
  console.error('❌ 集成测试失败:', e);
  process.exit(1);
});
