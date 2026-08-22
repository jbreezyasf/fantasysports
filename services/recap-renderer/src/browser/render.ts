import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';

type Scene = { scene_index:number; scene_kind:string; duration_ms:number; payload:Record<string,unknown> };
type FrameInput = { width:number; height:number; scene:Scene; progress:number; title:string };

const GOLD=0xd9b43b, INK=0xf5f1e8, CYAN=0x20e7df, DARK=0x08090b, TURF=0x123b26;
const textStyle=(size:number,color=INK,weight='800')=>new TextStyle({fontFamily:'Arial, Helvetica, sans-serif',fontSize:size,fill:color,fontWeight:weight as '800',letterSpacing:Math.max(1,size*.025)});
let app: Application | null = null;

function label(v:unknown){return String(v??'');}
function addText(stage:Container,value:string,x:number,y:number,size:number,color=INK,anchorX=0){const t=new Text({text:value,style:textStyle(size,color)});t.x=x;t.y=y;t.anchor.set(anchorX,0);stage.addChild(t);return t;}
function fitText(stage:Container,value:string,x:number,y:number,size:number,maxWidth:number,color=INK,anchorX=0){
  const t=addText(stage,value,x,y,size,color,anchorX);
  if(t.width>maxWidth)t.scale.set(maxWidth/t.width);
  return t;
}
function addGraphic(stage:Container,g:Graphics){stage.addChild(g);return g;}

async function ensureApp(width:number,height:number){
  if(!app){
    const canvas=document.querySelector('canvas') as HTMLCanvasElement;
    app=new Application();
    await app.init({canvas,width,height,backgroundColor:DARK,antialias:true,resolution:1,autoDensity:false});
  } else {
    app.renderer.resize(width,height);
  }
  app.stage.removeChildren().forEach(child=>child.destroy());
  return app;
}

async function build(input:FrameInput){
  const renderer=await ensureApp(input.width,input.height);
  const stage=renderer.stage;
  const {width:w,height:h,scene,progress:p}=input; const payload=scene.payload;
  addGraphic(stage,new Graphics().rect(0,0,w,h).fill(DARK));
  addGraphic(stage,new Graphics().circle(w*.76,h*.17,Math.min(w,h)*(.22+.04*Math.sin(p*Math.PI))).fill({color:GOLD,alpha:.12}));
  addGraphic(stage,new Graphics().poly([0,0,w*.36,0,w*.56,h,w*.42,h]).fill({color:GOLD,alpha:.028}));
  addGraphic(stage,new Graphics().poly([w,0,w*.66,0,w*.46,h,w*.6,h]).fill({color:CYAN,alpha:.022}));
  for(let i=0;i<18;i++){
    const orbit=(i*137.5+p*80)%360, radius=Math.min(w,h)*(.18+(i%5)*.055);
    const x=w*.5+Math.cos(orbit*Math.PI/180)*radius, y=h*.38+Math.sin(orbit*Math.PI/180)*radius*.55;
    addGraphic(stage,new Graphics().circle(x,y,Math.max(1,w*.0015)*(1+i%3)).fill({color:i%3?GOLD:CYAN,alpha:.12+(i%4)*.04}));
  }
  addGraphic(stage,new Graphics().roundRect(w*.06,h*.18,w*.88,h*.64,Math.min(w,h)*.08).stroke({color:CYAN,width:Math.max(2,w*.002),alpha:.55}));
  for(let i=0;i<10;i++){const y=h*(.28+i*.035);addGraphic(stage,new Graphics().rect(w*.1,y,w*.8,h*.018).fill({color:0xffffff,alpha:.035+i*.006}));}
  const fieldY=h*.67, fieldH=h*.22;
  addGraphic(stage,new Graphics().poly([w*.25,fieldY,w*.75,fieldY,w*.9,fieldY+fieldH,w*.1,fieldY+fieldH]).fill(TURF).stroke({color:CYAN,width:Math.max(2,w*.003),alpha:.85}));
  for(let i=1;i<9;i++){const x=w*(.1+i*.1);addGraphic(stage,new Graphics().moveTo(w*.25+(x-w*.1)*.625,fieldY).lineTo(x,fieldY+fieldH).stroke({color:0xffffff,width:1,alpha:.18}));}
  addText(stage,'BIG EXEC • ARCADE RECAP',w*.07,h*.075,Math.max(18,w*.017),GOLD);
  addGraphic(stage,new Graphics().rect(w*.07,h*.12,w*.86,Math.max(2,h*.003)).fill({color:0xffffff,alpha:.12}));
  addGraphic(stage,new Graphics().rect(w*.07,h*.12,w*.86*p,Math.max(2,h*.003)).fill({color:CYAN,alpha:.9}));
  const enter=Math.min(1,p/.22); const offset=(1-enter)*w*.12;
  if(scene.scene_kind==='stadium_open'){
    fitText(stage,`${label(payload.home)} VS`,w*.07-offset,h*.34,Math.max(38,w*.05),w*.82,INK);
    fitText(stage,label(payload.away),w*.07-offset,h*.43,Math.max(48,w*.065),w*.82,INK);
    addText(stage,`WEEK ${label(payload.week)} • ${label(payload.event_type).toUpperCase()}`,w*.07,h*.57,Math.max(18,w*.018),CYAN);
  } else if(scene.scene_kind==='score_reveal'){
    addText(stage,label(payload.home_points),w*.3-offset,h*.36,Math.max(70,w*.11),INK,.5);
    addText(stage,'—',w*.5,h*.4,Math.max(44,w*.06),GOLD,.5);
    addText(stage,label(payload.away_points),w*.7+offset,h*.36,Math.max(70,w*.11),INK,.5);
    addText(stage,'FINAL FANTASY SCORE',w*.5,h*.57,Math.max(18,w*.018),CYAN,.5);
  } else if(scene.scene_kind==='arcade_star'){
    addText(stage,'GAME BREAKER',w*.07,h*.3,Math.max(22,w*.022),GOLD);
    fitText(stage,label(payload.name).toUpperCase(),w*.07-offset,h*.39,Math.max(50,w*.07),w*.86,INK);
    addText(stage,`${label(payload.points)} FANTASY PTS`,w*.07,h*.55,Math.max(26,w*.03),CYAN);
  } else if(scene.scene_kind==='winner_moment'){
    addText(stage,'WINNER',w*.07,h*.29,Math.max(22,w*.022),GOLD);
    fitText(stage,label(payload.winner).toUpperCase(),w*.07-offset,h*.39,Math.max(50,w*.068),w*.86,INK);
    addText(stage,`+${label(payload.margin)} • ${label(payload.effect).replaceAll('_',' ').toUpperCase()}`,w*.07,h*.56,Math.max(22,w*.022),CYAN);
  } else {
    fitText(stage,label(payload.title||input.title).toUpperCase(),w*.5,h*.38,Math.max(46,w*.058),w*.86,INK,.5);
    addText(stage,'RESULT LOCKED • BIG EXEC',w*.5,h*.56,Math.max(18,w*.018),GOLD,.5);
  }
  renderer.renderer.render(stage);
  return true;
}

// @ts-expect-error exposed intentionally to the Playwright worker
window.BIG_EXEC_RENDER=build;
