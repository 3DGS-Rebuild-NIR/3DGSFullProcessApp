// ==================== 工程项目管理器 UI ====================
var ProjectUI = (function () {

  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusKey(st) {
    switch (st) {
      case '已训练': return 'b-train';
      case '预处理完成': return 'b-done';
      case '进行中': case '预处理中': return 'b-run';
      case '出错': return 'b-err';
      default: return 'b-idle';
    }
  }

  function deriveStatus(p) {
    var st = (p.state && p.state.progress) || {};
    var rec = st.recon || {};
    if (rec.psnr && rec.psnr !== '—' && rec.psnr !== '-') return '已训练';
    if (st.status === 'running') return '进行中';
    if (st.status === 'error') return '出错';
    if (st.step >= 5 || (st.results && st.results.images && st.results.images !== '-' && st.results.images !== '0')) return '预处理完成';
    if (st.step > 0) return '预处理中';
    return '未开始';
  }

  function cardHTML(p, st) {
    var pr = (p.state && p.state.progress) || {};
    var r = pr.results || {};
    var rec = pr.recon || {};
    var n = p.notes || {};
    var stepTxt = (pr.step || 0) + '/5';
    var img = r.images || '-';
    var pts = r.points || '-';
    var reg = r.registered || '-';
    var err = r.repError || '-';
    var time = r.time || '-';
    var date = n.shootDate || '—';
    var weather = n.weather || '—';
    var reconLine = '';
    if (rec.psnr && rec.psnr !== '—') {
      reconLine = '<div class="proj-recon">PSNR ' + esc(rec.psnr) + ' · SSIM ' + esc(rec.ssim || '-') + '</div>';
    }
    return '' +
      '<div class="proj-item-main">' +
        '<div class="proj-item-top">' +
          '<b class="proj-item-name">' + esc(p.name) + '</b>' +
          '<span class="proj-badge ' + statusKey(st) + '">' + esc(st) + '</span>' +
        '</div>' +
        '<div class="proj-item-meta">' +
          '<span>拍摄：' + esc(date) + '</span>' +
          '<span>天气：' + esc(weather) + '</span>' +
        '</div>' +
        '<div class="proj-item-prog">' +
          '<span class="lbl">进度</span><span class="val mono">' + esc(stepTxt) + '</span>' +
          '<span class="lbl">状态</span><span class="val">' + esc(pr.label || '未开始') + '</span>' +
        '</div>' +
        '<div class="proj-stats">' +
          '<div class="ps"><span class="k">图片</span><span class="v mono">' + esc(img) + '</span></div>' +
          '<div class="ps"><span class="k">三维点</span><span class="v mono">' + esc(pts) + '</span></div>' +
          '<div class="ps"><span class="k">注册</span><span class="v mono">' + esc(reg) + '</span></div>' +
          '<div class="ps"><span class="k">误差</span><span class="v mono">' + esc(err) + '</span></div>' +
          '<div class="ps"><span class="k">耗时</span><span class="v mono">' + esc(time) + '</span></div>' +
        '</div>' +
        reconLine +
      '</div>' +
      '<div class="proj-item-actions">' +
        '<button class="proj-act" data-act="open">打开</button>' +
        '<button class="proj-act danger" data-act="del">删除</button>' +
      '</div>';
  }

  function renderCurrent() {
    var p = ProjectStore.current;
    if (!p) return;
    el('projCurName').value = p.name;
    el('projShootDate').value = (p.notes && p.notes.shootDate) || '';
    el('projShootTime').value = (p.notes && p.notes.shootTime) || '';
    el('projWeather').value = (p.notes && p.notes.weather) || '';
    el('projRemark').value = (p.notes && p.notes.remark) || '';
    updateProjBtn();
  }

  function renderList(list) {
    var wrap = el('projList');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!list || !list.length) {
      wrap.innerHTML = '<div class="proj-empty">暂无已保存的项目<br>配置当前界面后点击「保存当前」</div>';
      return;
    }
    list.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'proj-item' + (ProjectStore.current && p.id === ProjectStore.current.id ? ' sel' : '');
      item.innerHTML = cardHTML(p, deriveStatus(p));
      var openBtn = item.querySelector('[data-act="open"]');
      var delBtn = item.querySelector('[data-act="del"]');
      if (openBtn) openBtn.addEventListener('click', function (e) { e.stopPropagation(); openProject(p.id); });
      if (delBtn) delBtn.addEventListener('click', function (e) { e.stopPropagation(); deleteProject(p.id); });
      item.addEventListener('click', function () { openProject(p.id); });
      wrap.appendChild(item);
    });
  }

  async function refresh() {
    if (ProjectStore.current) {
      ProjectStore.current.state = ProjectSnapshot.gather();
      syncCurrentMeta();
    }
    renderCurrent();
    try { renderList(await ProjectStore.list()); }
    catch (e) { renderList([]); }
  }

  function open() {
    el('projOverlay').style.display = 'flex';
    refresh();
  }

  function close() {
    el('projOverlay').style.display = 'none';
  }

  function syncCurrentMeta() {
    var p = ProjectStore.current;
    if (!p) return;
    p.name = el('projCurName').value.trim() || '未命名项目';
    p.notes = {
      shootDate: el('projShootDate').value,
      shootTime: el('projShootTime').value,
      weather: el('projWeather').value,
      remark: el('projRemark').value
    };
    updateProjBtn();
  }

  function newProject() {
    ProjectStore.current = ProjectStore.newProject('未命名项目');
    renderCurrent();
    toast('已新建项目：配置当前界面后点「保存当前」');
  }

  async function saveCurrent() {
    var p = ProjectStore.current;
    if (!p) return;
    syncCurrentMeta();
    p.state = ProjectSnapshot.gather();
    try {
      await ProjectStore.save(p);
      toast('项目已保存：' + p.name);
      renderList(await ProjectStore.list());
    } catch (e) {
      toast('保存失败：' + (e.message || e), 'var(--red)');
    }
  }

  async function openProject(id) {
    try {
      var p = await ProjectStore.load(id);
      ProjectStore.current = p;
      renderCurrent();
      if (p.state) ProjectSnapshot.apply(p.state);
      close();
      toast('已打开项目：' + p.name);
    } catch (e) {
      toast('打开失败：' + (e.message || e), 'var(--red)');
    }
  }

  async function deleteProject(id) {
    var ok = await showDialog('删除项目', '确认删除该项目？该操作不可恢复。');
    if (!ok) return;
    try { await ProjectStore.remove(id); } catch (e) {}
    if (ProjectStore.current && ProjectStore.current.id === id) {
      ProjectStore.current = ProjectStore.newProject('未命名项目');
      renderCurrent();
    }
    renderList(await ProjectStore.list());
    toast('已删除项目');
  }

  function updateProjBtn() {
    var p = ProjectStore.current;
    var t = el('projBtnName');
    if (t && p) t.textContent = (p._saved ? '' : '* ') + p.name;
  }

  function initProject() {
    // 默认打开软件即进入「新项目」
    ProjectStore.current = ProjectStore.newProject('未命名项目');

    var btn = el('projBtn'); if (btn) btn.addEventListener('click', open);
    var closeBtn = el('projClose'); if (closeBtn) closeBtn.addEventListener('click', close);
    var newBtn = el('projNew'); if (newBtn) newBtn.addEventListener('click', newProject);
    var saveBtn = el('projSave'); if (saveBtn) saveBtn.addEventListener('click', saveCurrent);

    ['projCurName', 'projShootDate', 'projShootTime', 'projWeather', 'projRemark'].forEach(function (id) {
      var e = el(id);
      if (e) e.addEventListener('input', syncCurrentMeta);
    });

    var ov = el('projOverlay');
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

    renderCurrent();
  }

  return { init: initProject, open: open, close: close, refresh: refresh };
})();
