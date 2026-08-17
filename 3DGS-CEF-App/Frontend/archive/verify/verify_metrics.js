#!/usr/bin/env node
// ==================== 验证：JS 指标引擎 vs evaluate.py（numpy 参考实现） ====================
// 读取 evaluate.py --demo 生成的 GT/Pred PNG，用 EvalMetrics 计算全部指标，
// 与 Python 生成的 summary.json（mean/std/min/max）逐项对比。
// 用法: node archive/verify/verify_metrics.js [demo_output_dir]
'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const EvalMetrics = require(path.join(__dirname, '..', '..', 'scripts', 'evaluate', 'metrics.js'));

// ---------- 最小 PNG 解码器（8-bit RGB/RGBA，含全部 5 种 filter） ----------
function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG: ' + file);
  let pos = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      if (bitDepth !== 8) throw new Error('Unsupported bit depth ' + bitDepth);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : (() => { throw new Error('Unsupported color type ' + colorType); })();
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = raw.slice(p, p + stride);
    p += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = line[x]; break;
        case 1: v = line[x] + a; break;
        case 2: v = line[x] + b; break;
        case 3: v = line[x] + ((a + b) >> 1); break;
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          v = line[x] + pr;
          break;
        }
        default: throw new Error('Unknown filter ' + filter);
      }
      cur[x] = v & 0xff;
    }
    prev = cur;
  }
  return { w, h, channels, data: out };
}

function pngToImg(png) {
  const { w, h, channels, data } = png;
  const img = EvalMetrics.makeImg(w, h);
  for (let i = 0; i < w * h; i++) {
    const o = i * channels, d = i * 3;
    img.data[d] = data[o] / 255;
    img.data[d + 1] = data[o + 1] / 255;
    img.data[d + 2] = channels >= 3 ? data[o + 2] / 255 : data[o] / 255;
  }
  return img;
}

// ---------- 主流程 ----------
const demoDir = process.argv[2] || path.join(__dirname, 'demo_output');
const gtDir = path.join(demoDir, 'demo_data', 'gt');
const predDir = path.join(demoDir, 'demo_data', 'pred');
const summaryPath = path.join(demoDir, 'summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error('缺少 summary.json，请先运行: python evaluate.py --demo --out ' + demoDir);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const names = fs.readdirSync(gtDir).filter(f => f.endsWith('.png')).sort();
const rows = [];
const metrics = Object.keys(summary.metrics);

for (const name of names) {
  const gt = pngToImg(decodePng(path.join(gtDir, name)));
  const pred = pngToImg(decodePng(path.join(predDir, name)));
  const row = { name };
  for (const m of metrics) {
    if (m === 'psnr') row[m] = EvalMetrics.computePsnr(gt, pred);
    else if (m === 'ssim') row[m] = EvalMetrics.computeSsim(gt, pred, 1.0, 11, 1.5);
    else if (m === 'ms-ssim') row[m] = EvalMetrics.computeMsSsim(gt, pred, 1.0, 11, 1.5);
    else if (m === 'rmse') row[m] = EvalMetrics.computeRmse(gt, pred);
    else if (m === 'mae') row[m] = EvalMetrics.computeMae(gt, pred);
    else if (m === 'lpips') row[m] = 0;
  }
  rows.push(row);
}

let maxDiff = 0;
let worst = null;
console.log('指标           Python(mean)   JS(mean)      diff    max-abs-diff(mean/std/min/max)');
for (const m of metrics) {
  const js = EvalMetrics.summarize(rows.map(r => r[m]));
  const py = summary.metrics[m];
  const keys = ['mean', 'std', 'min', 'max'];
  let md = 0;
  for (const k of keys) {
    const a = py[k], b = js[k];
    const d = Math.abs((isFinite(a) ? a : 0) - (isFinite(b) ? b : 0));
    if (d > md) md = d;
  }
  if (md > maxDiff) { maxDiff = md; worst = m; }
  console.log(String(m).padEnd(13) + String(py.mean).padEnd(14) + String(js.mean).padEnd(14) +
    String(Math.abs(py.mean - js.mean)).padEnd(9) + md.toFixed(6));
}

// PSNR 排名对比
if (summary.rankings && rows.length) {
  const byPsnr = rows.slice().sort((a, b) => a.psnr - b.psnr);
  const pyWorst = summary.rankings.worst.map(x => x[0]);
  const jsWorst = byPsnr.filter(r => isFinite(r.psnr)).slice(0, 5).map(r => r.name.replace(/\.\w+$/, ''));
  console.log('\nPSNR worst-5 一致性: Python=' + pyWorst.join(','));
  console.log('                       JS   =' + jsWorst.join(','));
  console.log('完全一致: ' + (JSON.stringify(pyWorst) === JSON.stringify(jsWorst)));
}

console.log('\n最大偏差: ' + maxDiff.toFixed(6) + ' (' + worst + ')');
if (maxDiff < 1e-3) {
  console.log('✅ 通过：JS 引擎与 evaluate.py 数值一致（误差 < 1e-3）');
  process.exit(0);
} else {
  console.log('❌ 未通过：偏差超过 1e-3');
  process.exit(1);
}
