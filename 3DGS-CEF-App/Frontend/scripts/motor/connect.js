function showMotorConnectDialog(){
  closeMotorDlg();
  var overlay=document.createElement('div');overlay.className='motor-dlg-overlay';overlay.id='motorDlgOverlay';
  var box=document.createElement('div');box.className='motor-dlg-box';box.id='motorDlgBox';
  box.innerHTML='\
    <div class="motor-dlg-title">电机控制器连接</div>\
    <div class="motor-dlg-body">\
      <div class="motor-dlg-row"><label>COM 端口</label><select id="motorPortSel"><option value="">正在扫描...</option></select></div>\
      <div class="motor-dlg-row"><label>波特率</label><select id="motorBaudSel"><option value="9600" selected>9600</option><option value="19200">19200</option><option value="38400">38400</option><option value="57600">57600</option><option value="115200">115200</option></select></div>\
      <div class="motor-dlg-status" id="motorDlgStatus"></div>\
      <div class="motor-dlg-btns"><button class="btn" id="motorDlgCancel">取消</button><button class="btn-p" id="motorDlgConnect" style="flex:1">连接</button></div>\
    </div>';
  document.body.appendChild(overlay);document.body.appendChild(box);

  MotorCEF.scanPorts().then(function(ports){
    var sel=document.getElementById('motorPortSel');
    if(!sel) return; sel.innerHTML='';
    var list=typeof ports==='string'?JSON.parse(ports):ports;
    if(Array.isArray(list)&&list.length>0){list.forEach(function(p){var o=document.createElement('option');o.value=p;o.textContent=p;sel.appendChild(o);});}
    else{var o=document.createElement('option');o.value='';o.textContent='未发现串口';sel.appendChild(o);}
  });
  document.getElementById('motorDlgCancel').onclick=closeMotorDlg;
  document.getElementById('motorDlgConnect').onclick=function(){
    var port=document.getElementById('motorPortSel').value;
    var baud=parseInt(document.getElementById('motorBaudSel').value);
    if(!port||port===''||port==='未发现串口'){document.getElementById('motorDlgStatus').textContent='请选择串口';document.getElementById('motorDlgStatus').style.color='var(--red)';return;}
    connectMotor(port,baud);
  };
  overlay.onclick=closeMotorDlg;
}
function closeMotorDlg(){
  var o=document.getElementById('motorDlgOverlay'),b=document.getElementById('motorDlgBox');
  if(o)o.remove();if(b)b.remove();
}
function connectMotor(port,baud){
  var st=document.getElementById('motorDlgStatus'),btn=document.getElementById('motorDlgConnect');
  if(st){st.textContent='连接中...';st.style.color='var(--ink-2)';}
  if(btn){btn.disabled=true;btn.textContent='连接中...';}
  MotorCEF.connect(port,baud).then(function(){
    _motorConnected=true;_motorPort=port;_motorBaud=baud;
    updateMotorUI();closeMotorDlg();
    refreshGlobalStatus();
    toast('电机已连接: '+port+' @ '+baud+' baud','var(--green)');
  },function(){
    _motorConnected=false;
    updateMotorUI();
    refreshGlobalStatus();
    if(st){st.textContent='连接失败，请检查串口和波特率';st.style.color='var(--red)';}
    if(btn){btn.disabled=false;btn.textContent='连接';}
    toast('电机连接失败','var(--red)');
  });
}
