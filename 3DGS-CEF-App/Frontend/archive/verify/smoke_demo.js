#!/usr/bin/env node
// ==================== 冒烟测试：JS 演示模式 + 完整计算管线（无 DOM 依赖部分） ====================
// 验证 EvalIO.generateDemo + EvalMetrics 在纯 Node 环境可跑通，输出指标合理。
'use strict';

const path = require('path');
const EvalMetrics = require(path.join(__dirname, '..', '..', 'scripts', 'evaluate', 'metrics.js'));
const EvalIO = require(path.join(__dirname, '..', '..', 'scripts', 'evaluate', 'io.js'));

const pairs = EvalIO.generateDemo(0, 6);
console.log('演示数据生成: ' + pairs.length + ' 对, 尺寸 ' + pairs[0].gt.w + 'x' + pairs[0].gt.h);

const rows = pairs.map(function (item, i) {
  const gt = item.gt, pred = item.pred;
  const row = {
    name: item.name,
    psnr: EvalMetrics.computePsnr(gt, pred),
    ssim: EvalMetrics.computeSsim(gt, pred, 1.0, 11, 1.5),
    'ms-ssim': EvalMetrics.computeMsSsim(gt, pred, 1.0, 11, 1.5),
    rmse: EvalMetrics.computeRmse(gt, pred),
    mae: EvalMetrics.computeMae(gt, pred)
  };
  console.log('  ' + item.name + ': psnr=' + row.psnr.toFixed(3) + ' ssim=' + row.ssim.toFixed(4) +
    ' ms-ssim=' + row['ms-ssim'].toFixed(4) + ' rmse=' + row.rmse.toFixed(4) + ' mae=' + row.mae.toFixed(4));
  return row;
});

const s = EvalMetrics.summarize(rows.map(r => r.psnr));
console.log('PSNR mean=' + s.mean.toFixed(3) + ' std=' + s.std.toFixed(3) + ' min=' + s.min.toFixed(3) + ' max=' + s.max.toFixed(3));

let ok = true;
rows.forEach(r => {
  ['psnr', 'ssim', 'ms-ssim', 'rmse', 'mae'].forEach(m => {
    if (!isFinite(r[m]) || r[m] < 0) { console.error('异常值: ' + r.name + '.' + m + '=' + r[m]); ok = false; }
  });
});
if (s.mean < 15 || s.mean > 60) { console.error('PSNR mean 超出合理范围'); ok = false; }
console.log(ok ? '✅ 冒烟测试通过' : '❌ 冒烟测试失败');
process.exit(ok ? 0 : 1);
