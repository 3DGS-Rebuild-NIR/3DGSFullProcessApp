function toggleRec(){_captureState.recording?stopRec():startRec();}
function startRec(){
  if(!_requireMotor()) return;
  if(_captureState.playing) stopPlay();
  _captureState.recording=true;_captureState.recMs=0;_captureState.recOps=[];
  var rs=document.getElementById('recStart');if(rs)rs.classList.add('recording');
  var rt=document.getElementById('recStartTxt');if(rt)rt.textContent='录制中…';
  var rp=document.getElementById('recStop');if(rp)rp.classList.add('enabled');
  refreshGlobalStatus();
  _captureRecTimer=setInterval(function(){
    _captureState.recMs+=100;
    _captureState.recOps.push({
      t:_captureState.recMs,
      up:_captureState.moving.up,down:_captureState.moving.down,
      cw:_captureState.moving.cw,ccw:_captureState.moving.ccw,
      dcPWM:_captureState.dcPWM,stepperRPM:_captureState.stepperRPM
    });
    var rtime=document.getElementById('recTime'),rframes=document.getElementById('recFrames'),rest=document.getElementById('recEst');
    if(rtime)rtime.textContent=_fmtHMS(_captureState.recMs);
    if(rframes)rframes.textContent=_captureState.recOps.length;
    if(rest)rest.textContent=_captureState.recOps.length;
  },100);
  toast('开始录制','#e23b3b');
}
function stopRec(){
  if(!_captureState.recording)return;
  _captureState.recording=false;clearInterval(_captureRecTimer);
  document.getElementById('recStart').classList.remove('recording');
  document.getElementById('recStartTxt').textContent='开始录制（Space）';
  document.getElementById('recStop').classList.remove('enabled');
  refreshGlobalStatus();
  if(_captureState.recOps.length>0){
    var d=new Date(),stamp=d.getFullYear()+_pad2(d.getMonth()+1)+_pad2(d.getDate())+'_'+_pad2(d.getHours())+_pad2(d.getMinutes());
    var dur=_fmtHMS(_captureState.recMs);
    _captureTrajectories.unshift({name:'录制_'+stamp,frames:_captureState.recOps.length,dur:dur,ops:_captureState.recOps.slice()});
    _captureState.sel=0;_saveTrajectories();renderTrajectories();
    toast('录制已保存为轨迹 ('+_captureState.recOps.length+' 条操作)');
  } else {toast('已停止录制');}
}
function resetTrack(){
  stopRec();stopPlay();captureStopAllMotors();
  _captureState.recMs=0;_captureState.recOps=[];
  document.getElementById('recTime').textContent='00:00:00';
  document.getElementById('recFrames').textContent='0';
  document.getElementById('recEst').textContent='--';
  _captureState.playMs=0;updateProgress();
  syncSliders();
  toast('轨迹已重置');
}
document.addEventListener('click',function(e){
  if(e.target.id==='recStart'||e.target.closest('#recStart'))toggleRec();
  if(e.target.id==='recStop'||e.target.closest('#recStop'))stopRec();
  if(e.target.id==='resetBtn'||e.target.closest('#resetBtn'))resetTrack();
});
