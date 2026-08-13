// ==================== Window Controls (无系统标题栏) ====================
function _setMaxIcon(maxed) {
  var btn = document.getElementById('winMax');
  if (!btn) return;
  var im = btn.querySelector('.ic-max');
  var ir = btn.querySelector('.ic-restore');
  if (im) im.style.display = maxed ? 'none' : '';
  if (ir) ir.style.display = maxed ? '' : 'none';
  btn.title = maxed ? '还原' : '最大化';
}

function initWindowControls() {
  var minBtn = document.getElementById('winMin');
  var maxBtn = document.getElementById('winMax');
  var closeBtn = document.getElementById('winClose');
  if (!minBtn || !maxBtn || !closeBtn) return;

  minBtn.addEventListener('click', function() {
    CEF.windowControl('min').catch(function() {});
  });
  maxBtn.addEventListener('click', function() {
    CEF.windowControl('max').then(function(s) { _setMaxIcon(s === 'max'); }).catch(function() {});
  });
  closeBtn.addEventListener('click', function() {
    CEF.windowControl('close').catch(function() {});
  });

  CEF.windowControl('state').then(function(s) { _setMaxIcon(s === 'max'); }).catch(function() {});

  var topbar = document.querySelector('.topbar');
  if (topbar) {
    topbar.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      if (e.target.closest('.tabs,.settings,.win-controls')) return;
      e.preventDefault();
      CEF.windowControl('dragStart').catch(function() {});
    });
  }
}

if (typeof CEF !== 'undefined') {
  initWindowControls();
}
