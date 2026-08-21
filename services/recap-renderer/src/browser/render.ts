import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';

type Scene = { scene_index:number; scene_kind:string; duration_ms:number; payload:Record<string,unknown> };
type FrameInput = { width:number; height:number; scene:Scene; progress:number; title:string };

const GOLD=0xd9b43b, INK=0xf5f1e8, CYAN=0x20e7df, DARK=0x08090b, TURF=0x123b26;
const textStyle=(size:number,color=INK,weight='800')=>new TextStyle({fontFamily:'Arial, Helvetica, sans-serif',fontSize:size,fill:color,fontWeight:weight as '800',letterSpacing:Math.max(1,size*.025)});

function label(v:unknown){return String(v??'');}
function addText(stage:Container, value:string, x:number,y:number,size:number,color=INK,anchorX=0){const t=new Text({text:value,style:textStyle(size,color)});t.x=x;t.y=y;t.anchor.set(anchorX,0);stage.addChild(t);return t;}

async function build(input:FrameInput){
  const canvas=document.querySelector('canvas') as HTMLCanvasElement;
  canvas.width=input.width;canvas.height=input.height;
  const app=new Application();
  await app.init({canvas,width:input.width,height:input.height,backgroundColor:DARK,antialias:true,resolution:1,autoDensity:false});
  const {width:w,height:h,scene,progress:p}=input; const payload=scene.payload;
  const bg=new Graphics().rect(0,0,w,h).fill(DARK); app.stage.addChild(bg);
  const glow=new Graphics().circle(w*.76,h*.17,Math.min(w,h)*(.22+.04*Math.sin(p*Math.PI))).fill({color:GOLD,alpha:.12}); app.stage.addChild(glow);
  const bowl=new Graphics().roundRect(w*.06,h*.18,w*.88,h*.64,Math.min(w,h)*.08).stroke({color:CYAN,width:Math.max(2,w*.002),alpha:.55});app.stage.addChild(bowl);
  for(let i=0;i<10;i++){const y=h*(.28+i*.035);new Graphics().rect(w*.1,y,w*.8,h*.018).fill({color:0xffffff,alpha:.035+i*.006}).addTo(app.stage)}
  const fieldY=h*.67, fieldH=h*.22; const field=new Graphics().poly([w*.25,fieldY,w*.75,fieldY,w*.9,fieldY+fieldH,w*.1,fieldY+fieldH]).fill(TURF).stroke({color:CYAN,width:Math.max(2,w*.003),alpha:.85});app.stage.addChild(field);
  for(let i=1;i<9;i++){const x=w*(.1+i*.1);new Graphics().moveTo(w*.25+(x-w*.1)*.625,fieldY).lineTo(x,fieldY+fieldH).stroke({color:0xffffff,width:1,alpha:.18}).addTo(app.stage)}
  addText(app.stage,'BIG EXEC • ARCADE RECAP',w*.07,h*.075,Math.max(18,w*.017),GOLD);
  const enter=Math.min(1,p/.22); const offset=(1-enter)*w*.12;
  if(scene.scene_kind==='stadium_open'){
    addText(app.stage,`${label(payload.home)} VS`,w*.07-offset,h*.34,Math.max(38,w*.05),INK);
    addText(app.stage,label(payload.away),w*.07-offset,h*.43,Math.max(48,w*.065),INK);
    addText(app.stage,`WEEK ${label(payload.week)} • ${label(payload.event_type).toUpperCase()}`,w*.07,h*.57,Math.max(18,w*.018),CYAN);
  } else if(scene.scene_kind==='score_reveal'){
    addText(app.stage,label(payload.home_points),w*.3-offset,h*.36,Math.max(70,w*.11),INK,.5);
    addText(app.stage,'—',w*.5,h*.4,Math.max(44,w*.06),GOLD,.5);
    addText(app.stage,label(payload.away_points),w*.7+offset,h*.36,Math.max(70,w*.11),INK,.5);
    addText(app.stage,'FINAL FANTASY SCORE',w*.5,h*.57,Math.max(18,w*.018),CYAN,.5);
  } else if(scene.scene_kind==='arcade_star'){
    addText(app.stage,'GAME BREAKER',w*.07,h*.3,Math.max(22,w*.022),GOLD);
    addText(app.stage,label(payload.name).toUpperCase(),w*.07-offset,h*.39,Math.max(50,w*.07),INK);
    addText(app.stage,`${label(payload.points)} FANTASY PTS`,w*.07,h*.55,Math.max(26,w*.03),CYAN);
  } else if(scene.scene_kind==='winner_moment'){
    addText(app.stage,'WINNER',w*.07,h*.29,Math.max(22,w*.022),GOLD);
    addText(app.stage,label(payload.winner).toUpperCase(),w*.07-offset,h*.39,Math.max(50,w*.068),INK);
    addText(app.stage,`+${label(payload.margin)} • ${label(payload.effect).replaceAll('_',' ').toUpperCase()}`,w*.07,h*.56,Math.max(22,w*.022),CYAN);
  } else {
    addText(app.stage,label(payload.title||input.title).toUpperCase(),w*.5,h*.38,Math.max(46,w*.058),INK,.5);
    addText(app.stage,'RESULT LOCKED • BIG EXEC',w*.5,h*.56,Math.max(18,w*.018),GOLD,.5);
  }
  app.renderer.render(app.stage);
  return true;
}

// @ts-expect-error exposed intentionally to the Playwright worker
window.BIG_EXEC_RENDER=build;
