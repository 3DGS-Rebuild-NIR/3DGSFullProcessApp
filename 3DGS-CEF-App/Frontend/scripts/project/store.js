// ==================== 工程项目存储 ====================
// 工程文件保存在 <exe目录>/projects/<id>.json
var ProjectStore = (function () {
  var PROJECTS_DIR = 'projects';
  var _baseDir = null;
  var _current = null;

  function uid() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function resolveBaseDir() {
    if (_baseDir) return _baseDir;
    var exe = await CEF.getExeDir();
    _baseDir = exe.replace(/[\\/]+$/, '') + '/' + PROJECTS_DIR;
    return _baseDir;
  }

  async function ensureDir() {
    var d = await resolveBaseDir();
    try { await FileCEF.mkdir(d); } catch (e) { /* 目录已存在 */ }
    return d;
  }

  function newProject(name) {
    return {
      id: uid(),
      name: name || '未命名项目',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: { shootDate: '', shootTime: '', weather: '', remark: '' },
      activeTab: 'preproc',
      state: null,
      _saved: false
    };
  }

  async function list() {
    var d = await ensureDir();
    var entries;
    try { entries = await FileCEF.list(d); }
    catch (e) { return []; }
    var projects = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.is_file && /\.json$/i.test(e.name)) {
        try {
          var raw = await FileCEF.read(d + '/' + e.name);
          var p = JSON.parse(_unb64(raw));
          if (p && p.id) projects.push(p);
        } catch (err) { /* 跳过损坏文件 */ }
      }
    }
    projects.sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    return projects;
  }

  async function load(id) {
    var d = await ensureDir();
    var raw = await FileCEF.read(d + '/' + id + '.json');
    return JSON.parse(_unb64(raw));
  }

  async function save(project) {
    var d = await ensureDir();
    project.updatedAt = new Date().toISOString();
    project._saved = true;
    await FileCEF.write(d + '/' + project.id + '.json', JSON.stringify(project));
    return project;
  }

  async function remove(id) {
    var d = await ensureDir();
    try { await FileCEF.delete(d + '/' + id + '.json'); }
    catch (e) { /* 忽略 */ }
  }

  return {
    resolveBaseDir: resolveBaseDir,
    ensureDir: ensureDir,
    newProject: newProject,
    list: list,
    load: load,
    save: save,
    remove: remove,
    get current() { return _current; },
    set current(p) { _current = p; }
  };
})();
