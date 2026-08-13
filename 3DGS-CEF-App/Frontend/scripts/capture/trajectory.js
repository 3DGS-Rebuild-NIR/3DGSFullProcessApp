function renderTrajectories(){
  var list=document.getElementById('trajList');if(!list)return;
  list.innerHTML='';
  _captureTrajectories.forEach(function(t,i){
    var d=document.createElement('div');d.className='traj'+(i===_captureState.sel?' sel':'');
    d.innerHTML='<div class="info"><b>'+t.name+'</b><small>'+t.frames+' 操作 &nbsp; '+t.dur+'</small></div><button class="more" title="更多"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>';
    d.addEventListener('click',function(e){if(e.target.closest('.more'))return;selectTraj(i);});
    var more=d.querySelector('.more');if(more)more.dataset.idx=i;
    list.appendChild(d);
  });
  var sel=document.getElementById('curTrajSel');
  if(sel){sel.innerHTML='';_captureTrajectories.forEach(function(t,i){var o=document.createElement('option');o.value=i;o.textContent=t.name;sel.appendChild(o);});sel.value=_captureState.sel;}
}
function selectTraj(i){
  _captureState.sel=_clamp(i,0,_captureTrajectories.length-1);
  if(_captureTrajectories[_captureState.sel]){
    _captureState.playDurMs=_parseDur(_captureTrajectories[_captureState.sel].dur);
    var pd=document.getElementById('playDur');if(pd)pd.textContent=_captureTrajectories[_captureState.sel].dur;
  }
  _captureState.playMs=0;updateProgress();renderTrajectories();
}
function importTrajectoryFile(){
  var input=document.createElement('input');
  input.type='file';input.accept='.json';
  input.onchange=function(e){
    var file=e.target.files[0];
    if(!file) return;
    var reader=new FileReader();
    reader.onload=function(ev){
      try{
        var data=JSON.parse(ev.target.result);
        if(!data||!data.name){toast('无效的轨迹文件','var(--red)');return;}
        var traj={name:data.name,frames:data.frames||(data.ops?data.ops.length:0),dur:data.dur||'00:00:00',ops:data.ops||[]};
        _captureTrajectories.unshift(traj);
        _captureState.sel=0;
        _saveTrajectories();renderTrajectories();
        toast('已导入轨迹: '+traj.name,'var(--green)');
      }catch(err){toast('导入失败: '+err.message,'var(--red)');}
    };
    reader.readAsText(file);
  };
  input.click();
}
document.addEventListener('change',function(e){if(e.target.id==='curTrajSel')selectTraj(+e.target.value);});

var _trajMenuIdx=0;
function openTrajMenu(i,btn){
  _trajMenuIdx=i;
  var menu=document.getElementById('trajMenu');if(!menu)return;
  menu.style.display='block';
  var bw=menu.offsetWidth||132,bh=menu.offsetHeight||148;
  var r=btn.getBoundingClientRect();
  var x=Math.min(r.right-bw,window.innerWidth-bw-8);
  var y=r.bottom+4;
  if(y+bh>window.innerHeight)y=Math.max(4,r.top-bh-4);
  menu.style.left=Math.max(4,x)+'px';
  menu.style.top=Math.max(4,y)+'px';
}
function closeTrajMenu(){
  var menu=document.getElementById('trajMenu');
  if(menu)menu.style.display='none';
}
function newTrajectory(){
  var d=new Date(),stamp=d.getFullYear()+_pad2(d.getMonth()+1)+_pad2(d.getDate())+'_'+_pad2(_captureTrajectories.length+1);
  _captureTrajectories.push({name:'轨迹_'+stamp,frames:0,dur:'00:00:00',ops:[]});
  _captureState.sel=_captureTrajectories.length-1;
  _saveTrajectories();renderTrajectories();toast('已新建轨迹');
}
function trajMenuAction(a){
  var i=_trajMenuIdx,t=_captureTrajectories[i];
  if(a==='edit'){
    var n=prompt('重命名轨迹',t?t.name:'');
    if(n&&n.trim()){_captureTrajectories[i].name=n.trim();_saveTrajectories();renderTrajectories();toast('已重命名');}
  }else if(a==='del'){
    if(_captureTrajectories.length<=1){toast('至少保留一条轨迹','#e23b3b');return;}
    var nm=_captureTrajectories[i].name;
    _captureTrajectories.splice(i,1);
    if(i<_captureState.sel)_captureState.sel--;
    _captureState.sel=_clamp(_captureState.sel,0,_captureTrajectories.length-1);
    selectTraj(_captureState.sel);_saveTrajectories();toast('已删除 '+nm,'#e23b3b');
  }else if(a==='export'){
    if(!t)return;
    var data=JSON.stringify(t,null,2);
    var blob=new Blob([data],{type:'application/json'});
    var link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=t.name+'.json';
    document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(link.href);
    toast('导出 '+t.name+' → .json');
  }else if(a==='import'){
    importTrajectoryFile();
  }
}
document.addEventListener('click',function(e){
  if(e.target.id==='loadTraj'||e.target.closest('#loadTraj')){closeTrajMenu();importTrajectoryFile();return;}
  if(e.target.id==='addTraj'||e.target.closest('#addTraj')){closeTrajMenu();newTrajectory();return;}
  var more=e.target.closest('.more');
  if(more){openTrajMenu(+more.dataset.idx,more);return;}
  var menu=document.getElementById('trajMenu');
  if(menu&&menu.style.display==='block'){
    var act=e.target.closest('[data-act]');
    if(act){var a=act.dataset.act;closeTrajMenu();trajMenuAction(a);return;}
    if(!menu.contains(e.target))closeTrajMenu();
  }
});
