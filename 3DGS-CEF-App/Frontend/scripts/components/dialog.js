var _dialogResolve = null;

function showDialog(title, msg) {
  return new Promise(function(resolve) {
    _dialogResolve = resolve;
    document.getElementById('dialogTitle').textContent = title;
    document.getElementById('dialogMsg').textContent = msg;
    document.getElementById('iosDialog').style.display = 'block';
  });
}

function closeDialog(ok) {
  document.getElementById('iosDialog').style.display = 'none';
  if (_dialogResolve) {
    _dialogResolve(ok);
    _dialogResolve = null;
  }
}
