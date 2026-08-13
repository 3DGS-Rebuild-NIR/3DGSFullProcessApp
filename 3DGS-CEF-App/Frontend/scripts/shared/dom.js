function $id(s) { return document.getElementById(s); }
function $val(id) { var e = $id(id); return e ? e.value : ''; }
function $num(id, d) { var v = parseFloat($val(id)); return isNaN(v) ? (d || 0) : v; }
function $txt(id, v) { var e = $id(id); if (e) e.textContent = v; }
function $show(id, on) { var e = $id(id); if (e) e.style.display = on ? '' : 'none'; }
function $(s){return document.querySelector(s)}
function $$(s){return[...document.querySelectorAll(s)]}
function _clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function _pad2(n){return String(n).padStart(2,'0');}
function _fmtHMS(ms){var t=Math.floor(ms/1000);return _pad2(Math.floor(t/3600))+':'+_pad2(Math.floor(t/60)%60)+':'+_pad2(t%60);}
function _parseDur(s){var p=s.split(':').map(Number);return ((p[0]*60+p[1])*60+p[2])*1000;}

function _setTxt(id, v) { try { var e = document.getElementById(id); if (e) e.textContent = v; } catch(e) {} }

// 本地路径 → app://localhost/raw/ URL（AppSchemeHandler 直接读盘返回）。
// 用 encodeURI：保留 : / 等路径结构字符可读，仅编码空格/非 ASCII；
// 再补编 # ? 以免被当作 fragment/query。
function _appUrl(p) {
  return 'app://localhost/raw/' + encodeURI(String(p).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

// 清空网格并卸载图片资源（removeAttribute('src') 让解码器释放位图，切换页面前调用）
function _clearGrid(grid) {
  if (!grid) return;
  grid.querySelectorAll('img').forEach(function(img) { img.removeAttribute('src'); });
  grid.innerHTML = '';
}

function toast(msg,color){
  var t=document.createElement('div');t.className='toast';
  t.innerHTML='<span class="tdot" style="background:'+(color||'var(--green)')+'"></span>'+msg;
  $('#toastWrap').appendChild(t);setTimeout(()=>t.remove(),2300);
}
