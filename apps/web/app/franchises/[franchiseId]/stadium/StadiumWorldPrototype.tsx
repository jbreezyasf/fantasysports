'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildStadiumWorldObjects, STADIUM_WORLD_ZONES, type StadiumWorldZone } from './stadiumWorldModel';

type Props = {
  franchiseName: string;
  abbreviation: string;
  primary: string;
  secondary: string;
  titleCount: number;
  rivalryCount: number;
  unlockedFeatureCount: number;
};

type Vec3 = [number, number, number];

const vertexShader = `
attribute vec3 aPosition;
uniform mat4 uMatrix;
varying float vShade;
void main(){
  gl_Position = uMatrix * vec4(aPosition,1.0);
  vShade = 0.72 + 0.28 * max(max(abs(aPosition.x), abs(aPosition.y)), abs(aPosition.z));
}
`;
const fragmentShader = `
precision mediump float;
uniform vec4 uColor;
varying float vShade;
void main(){ gl_FragColor = vec4(uColor.rgb * vShade, uColor.a); }
`;

function multiply(a:number[],b:number[]){
  const out=new Array(16).fill(0);
  for(let col=0;col<4;col++){
    for(let row=0;row<4;row++){
      out[col*4+row]=
        a[0*4+row]*b[col*4+0]+
        a[1*4+row]*b[col*4+1]+
        a[2*4+row]*b[col*4+2]+
        a[3*4+row]*b[col*4+3];
    }
  }
  return out;
}
function perspective(fov:number,aspect:number,near:number,far:number){
  const f=1/Math.tan(fov/2), nf=1/(near-far);
  return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
}
function translate(x:number,y:number,z:number){ return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]; }
function scale(x:number,y:number,z:number){ return [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]; }
function subtract(a:Vec3,b:Vec3):Vec3{return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function normalize(v:Vec3):Vec3{
  const length=Math.hypot(v[0],v[1],v[2])||1;
  return [v[0]/length,v[1]/length,v[2]/length];
}
function cross(a:Vec3,b:Vec3):Vec3{
  return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
}
function dot(a:Vec3,b:Vec3){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function lookAt(eye:Vec3,target:Vec3):number[]{
  const z=normalize(subtract(eye,target));
  const x=normalize(cross([0,1,0],z));
  const y=cross(z,x);
  return [
    x[0],y[0],z[0],0,
    x[1],y[1],z[1],0,
    x[2],y[2],z[2],0,
    -dot(x,eye),-dot(y,eye),-dot(z,eye),1
  ];
}
function hexToRgba(hex:string,alpha=1):[number,number,number,number]{
  const safe=/^#[0-9a-fA-F]{6}$/.test(hex)?hex:'#d9b43b';
  return [parseInt(safe.slice(1,3),16)/255,parseInt(safe.slice(3,5),16)/255,parseInt(safe.slice(5,7),16)/255,alpha];
}

const cube = new Float32Array([
  -1,-1,-1, 1,-1,-1, 1,1,-1, -1,-1,-1, 1,1,-1, -1,1,-1,
  -1,-1,1, 1,1,1, 1,-1,1, -1,-1,1, -1,1,1, 1,1,1,
  -1,-1,-1, -1,1,-1, -1,1,1, -1,-1,-1, -1,1,1, -1,-1,1,
  1,-1,-1, 1,-1,1, 1,1,1, 1,-1,-1, 1,1,1, 1,1,-1,
  -1,1,-1, 1,1,-1, 1,1,1, -1,1,-1, 1,1,1, -1,1,1,
  -1,-1,-1, 1,-1,1, 1,-1,-1, -1,-1,-1, -1,-1,1, 1,-1,1
]);

function drawBox(gl:WebGLRenderingContext, matrixLoc:WebGLUniformLocation, colorLoc:WebGLUniformLocation, vp:number[], position:Vec3, size:Vec3, color:[number,number,number,number]){
  const model=multiply(translate(...position),scale(...size));
  const matrix=multiply(vp,model);
  gl.uniformMatrix4fv(matrixLoc,false,new Float32Array(matrix));
  gl.uniform4fv(colorLoc,new Float32Array(color));
  gl.drawArrays(gl.TRIANGLES,0,36);
}

export function StadiumWorldPrototype(props:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [zone,setZone]=useState<StadiumWorldZone>('concourse');
  const [selectedId,setSelectedId]=useState<'champions-trophy'|'rivalry-monument'|'legacy-wall'>('legacy-wall');
  const [supported,setSupported]=useState(true);
  const objects=useMemo(()=>buildStadiumWorldObjects({
    titleCount:props.titleCount,
    rivalryCount:props.rivalryCount,
    unlockedFeatureCount:props.unlockedFeatureCount
  }),[props.titleCount,props.rivalryCount,props.unlockedFeatureCount]);
  const selected=objects.find((item)=>item.id===selectedId) ?? objects[0];

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas) return;
    canvas.dataset.renderState='loading';
    const gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});
    if(!gl){ setSupported(false); return; }

    const compile=(type:number,source:string)=>{
      const shader=gl.createShader(type);
      if(!shader) throw new Error('Unable to create WebGL shader.');
      gl.shaderSource(shader,source); gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed.');
      return shader;
    };
    const program=gl.createProgram();
    if(!program) return;
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexShader));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentShader));
    gl.linkProgram(program); gl.useProgram(program);
    const positionLoc=gl.getAttribLocation(program,'aPosition');
    const matrixLoc=gl.getUniformLocation(program,'uMatrix');
    const colorLoc=gl.getUniformLocation(program,'uColor');
    if(matrixLoc===null||colorLoc===null) return;
    const buffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,cube,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc,3,gl.FLOAT,false,0,0);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    const active=STADIUM_WORLD_ZONES.find((item)=>item.id===zone) ?? STADIUM_WORLD_ZONES[0];
    const targets:Record<StadiumWorldZone,Vec3>={
      'concourse':[0,.45,-3.5],
      'owners-office':[-4.15,.3,-1.4],
      'rivalry-hall':[4.2,.45,-1.2]
    };
    const resize=()=>{
      const ratio=Math.min(window.devicePixelRatio||1,2);
      const width=Math.max(1,Math.floor(canvas.clientWidth*ratio));
      const height=Math.max(1,Math.floor(canvas.clientHeight*ratio));
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      gl.viewport(0,0,width,height);
    };
    resize();
    const projection=perspective(Math.PI/3,canvas.width/canvas.height,.1,100);
    const vp=multiply(projection,lookAt(active.camera,targets[active.id]));
    gl.clearColor(.025,.035,.035,1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const gold=hexToRgba(props.primary);
    const ivory=hexToRgba(props.secondary);
    const dark:[number,number,number,number]=[.035,.055,.06,1];
    const stone:[number,number,number,number]=[.10,.12,.12,1];

    drawBox(gl,matrixLoc,colorLoc,vp,[0,-1.2,0],[11,.12,11],dark);
    drawBox(gl,matrixLoc,colorLoc,vp,[0,-.92,-3.2],[6.8,.05,3.7],[.07,.12,.09,1]);
    for(let i=-5;i<=5;i+=2){
      drawBox(gl,matrixLoc,colorLoc,vp,[i,-.84,-3.2],[.035,.03,3.6],[.6,.5,.19,1]);
    }
    drawBox(gl,matrixLoc,colorLoc,vp,[0,3.5,-5.2],[10.5,4.6,.18],stone);
    drawBox(gl,matrixLoc,colorLoc,vp,[-5.4,2.2,0],[.18,3.4,5.2],stone);
    drawBox(gl,matrixLoc,colorLoc,vp,[5.4,2.2,0],[.18,3.4,5.2],stone);
    drawBox(gl,matrixLoc,colorLoc,vp,[0,.1,-3.9],[4.2,.15,.9],gold);
    drawBox(gl,matrixLoc,colorLoc,vp,[0,1.1,-4.15],[2.6,.95,.18],ivory);

    const trophyEarned=props.titleCount>0;
    drawBox(gl,matrixLoc,colorLoc,vp,[-4.15,-.55,-1.4],[1.25,.12,1.1],stone);
    drawBox(gl,matrixLoc,colorLoc,vp,[-4.15,.2,-1.4],[.5,.72,.5],trophyEarned?gold:[.18,.18,.18,1]);
    drawBox(gl,matrixLoc,colorLoc,vp,[-4.15,1.05,-1.4],[.9,.12,.9],trophyEarned?ivory:[.25,.25,.25,1]);
    drawBox(gl,matrixLoc,colorLoc,vp,[4.2,.15,-1.2],[.95,1.25,.45],props.rivalryCount>0?gold:[.16,.16,.16,1]);
    for(let i=0;i<Math.min(props.unlockedFeatureCount,6);i++){
      drawBox(gl,matrixLoc,colorLoc,vp,[-2.5+i,1.8,-5.0],[.36,.52,.12],i%2?ivory:gold);
    }

    gl.finish();
    canvas.dataset.renderState=gl.getError()===gl.NO_ERROR?'ready':'failed';

    return ()=>{ gl.deleteProgram(program); gl.deleteBuffer(buffer); };
  },[props.primary,props.secondary,props.titleCount,props.rivalryCount,props.unlockedFeatureCount,zone]);

  const travel=(next:StadiumWorldZone)=>{
    setZone(next);
    const preferred=objects.find((item)=>item.zone===next);
    if(preferred) setSelectedId(preferred.id);
  };

  return <section className="stadiumWorld" aria-labelledby="stadium-world-heading">
    <div className="stadiumWorldIntro">
      <div>
        <p className="eyebrow">BIG EXEC WORLD • TECHNICAL SPIKE</p>
        <h2 id="stadium-world-heading">{props.franchiseName} Stadium</h2>
        <p>Explore the first live-rendered slice of your franchise world. The geometry is presentation-only; official accomplishments still come from Fantasy Core.</p>
      </div>
      <div className="stadiumWorldMetrics" aria-label="Current franchise legacy data">
        <span><b>{props.titleCount}</b> Titles</span>
        <span><b>{props.rivalryCount}</b> Rivalry Wins</span>
        <span><b>{props.unlockedFeatureCount}</b> Unlocks</span>
      </div>
    </div>

    <div className="stadiumWorldViewport">
      {supported
        ? <canvas ref={canvasRef} className="stadiumWorldCanvas" aria-hidden="true" data-render-state="loading" />
        : <div className="stadiumWorldFallback" role="status">3D rendering is unavailable on this device. Stadium data and navigation remain available below.</div>}
      <div className="stadiumWorldHud" aria-hidden="true">
        <span>NOW VISITING</span>
        <strong>{STADIUM_WORLD_ZONES.find((item)=>item.id===zone)?.label}</strong>
        <small>{props.abbreviation} • LIVE LEGACY DATA</small>
      </div>
    </div>

    <nav className="stadiumWorldTravel" aria-label="Fast travel inside the stadium">
      {STADIUM_WORLD_ZONES.map((item)=><button key={item.id} type="button" aria-pressed={zone===item.id} onClick={()=>travel(item.id)}>{item.label}</button>)}
    </nav>

    <div className="stadiumWorldObjects">
      <div>
        <p className="eyebrow">INSPECT OBJECTS</p>
        <div className="stadiumWorldObjectButtons">
          {objects.map((item)=><button key={item.id} type="button" aria-pressed={selectedId===item.id} onClick={()=>{setSelectedId(item.id);setZone(item.zone);}}>
            <span>{item.earned?'EARNED':'LOCKED / WAITING'}</span>
            <strong>{item.label}</strong>
          </button>)}
        </div>
      </div>
      <aside className="stadiumWorldDetail" aria-live="polite">
        <span>{selected.earned?'Franchise legacy':'Future unlock'}</span>
        <h3>{selected.label}</h3>
        <p>{selected.detail}</p>
        <small>Zone: {STADIUM_WORLD_ZONES.find((item)=>item.id===selected.zone)?.label}</small>
      </aside>
    </div>
  </section>;
}
