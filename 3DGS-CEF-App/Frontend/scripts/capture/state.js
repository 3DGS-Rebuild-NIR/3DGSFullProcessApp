var _captureCX=225, _captureCY=125, _captureRX=190, _captureRY=62;
var _captureSamples=[10,80,100,150,250,290];
var _captureRecTimer=null, _capturePlayTimer=null, _captureDash=0, _captureLast=performance.now();
var _keymap={w:'up',s:'down',d:'cw',a:'ccw'};

var _captureState = {
  dcPWM:0, stepperRPM:0, speed:100,
  recording:false, recMs:0, recOps:[],
  playing:false, playMs:0, playDurMs:20000,
  sel:0,
  moving:{up:false,down:false,cw:false,ccw:false},
  devices:{rgb:false, ir:false, motor:true},
  preview:{rgb:false, ir:false},
  stream:{rgb:null, ir:null}
};

var _captureTrajectories=[];

function _loadTrajectories(){
  try{
    var d=localStorage.getItem('capture_trajectories');
    if(d){
      var arr=JSON.parse(d);
      if(Array.isArray(arr)){
        _captureTrajectories=arr.filter(function(t){return t&&typeof t==='object'&&typeof t.name==='string';});
        return true;
      }
    }
  }catch(e){}
  return false;
}
function _saveTrajectories(){
  try{localStorage.setItem('capture_trajectories',JSON.stringify(_captureTrajectories));}catch(e){}
}
if(!_loadTrajectories()){_captureTrajectories=[];}

var _motorConnected=false, _motorPort=null, _motorBaud=null;
