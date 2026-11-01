import {useEffect,useRef,useState} from 'react';
import {BufferGeometry} from 'three/src/core/BufferGeometry.js';
import {Float32BufferAttribute} from 'three/src/core/BufferAttribute.js';
import {Points} from 'three/src/objects/Points.js';
import {PointsMaterial} from 'three/src/materials/PointsMaterial.js';
import {LineSegments} from 'three/src/objects/LineSegments.js';
import {LineBasicMaterial} from 'three/src/materials/LineBasicMaterial.js';
import {Scene} from 'three/src/scenes/Scene.js';
import {PerspectiveCamera} from 'three/src/cameras/PerspectiveCamera.js';
import {WebGLRenderer} from 'three/src/renderers/WebGLRenderer.js';
import {Color} from 'three/src/math/Color.js';
import {Raycaster} from 'three/src/core/Raycaster.js';
import {Vector2} from 'three/src/math/Vector2.js';
import {CanvasTexture} from 'three/src/textures/CanvasTexture.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {graphColors,type CodeNode,type CodeLink} from '../lib/code-graph';
export type GraphCommands={zoom:(factor:number)=>void;reset:()=>void;rotate:(x:number,y:number)=>void};
type Props={nodes:CodeNode[];links:CodeLink[];positions:Map<string,[number,number,number]>;selected:string;auto:boolean;onSelect:(id:string)=>void;commands:React.RefObject<GraphCommands|null>};

export default function CodeGraphScene({nodes,links,positions,selected,auto,onSelect,commands}:Props){
 const host=useRef<HTMLDivElement>(null),update=useRef<(id:string)=>void>(()=>{}),motion=useRef<(value:boolean)=>void>(()=>{}),selection=useRef(selected),automatic=useRef(auto);const [error,setError]=useState('');
 useEffect(()=>{selection.current=selected;update.current(selected);},[selected]);useEffect(()=>{automatic.current=auto;motion.current(auto);},[auto]);
 useEffect(()=>{
  const target=host.current;if(!target)return;setError('');let renderer:WebGLRenderer;
  const element=document.createElement('canvas');element.dataset.codeGraph='true';
  try{renderer=new WebGLRenderer({canvas:element,antialias:true,alpha:true});}catch{setError('3D is unavailable on this device. Search and inspect all graph symbols below.');return;}
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Rotatable ForgeWeb code graph. Drag to orbit; arrow keys to rotate; plus and minus to zoom.');
  target.appendChild(canvas);renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));const scene=new Scene(),camera=new PerspectiveCamera(50,1,.1,1000);camera.position.set(0,15,145);
  const controls=new OrbitControls(camera,canvas);controls.enableZoom=false;controls.enablePan=false;controls.enableDamping=false;controls.autoRotateSpeed=.5;controls.saveState();
  const pointGeometry=new BufferGeometry(),lineGeometry=new BufferGeometry();
  pointGeometry.setAttribute('position',new Float32BufferAttribute(nodes.flatMap(n=>positions.get(n.id)??[0,0,0]),3));
  const nodeColors=new Float32Array(nodes.length*3);pointGeometry.setAttribute('color',new Float32BufferAttribute(nodeColors,3));
  const dots=document.createElement('canvas');dots.width=dots.height=32;const brush=dots.getContext('2d');if(brush){const gradient=brush.createRadialGradient(16,16,1,16,16,16);gradient.addColorStop(0,'#fff');gradient.addColorStop(.45,'#fff');gradient.addColorStop(1,'rgba(255,255,255,0)');brush.fillStyle=gradient;brush.fillRect(0,0,32,32);}
  const texture=new CanvasTexture(dots),pointMaterial=new PointsMaterial({size:2.5,vertexColors:true,map:texture,transparent:true,alphaTest:.05,depthWrite:false});
  const points=new Points(pointGeometry,pointMaterial);scene.add(points);
  lineGeometry.setAttribute('position',new Float32BufferAttribute(links.flatMap(l=>[...(positions.get(l.source)??[0,0,0]),...(positions.get(l.target)??[0,0,0])]),3));lineGeometry.setAttribute('color',new Float32BufferAttribute(new Float32Array(links.length*6),3));
  const lineMaterial=new LineBasicMaterial({vertexColors:true,transparent:true,opacity:.18,depthWrite:false}),lines=new LineSegments(lineGeometry,lineMaterial);scene.add(lines);
  let frame=0,visible=true,disposed=false;const raycaster=new Raycaster();raycaster.params.Points={threshold:1.3};
  function draw(){if(disposed)return;renderer.render(scene,camera);canvas.dataset.camera=camera.position.toArray().map(n=>n.toFixed(2)).join(',');}
  function highlight(id:string){const neighbors=new Set([id]);for(const link of links)if(link.source===id||link.target===id){neighbors.add(link.source);neighbors.add(link.target);}
   const colors=pointGeometry.getAttribute('color');nodes.forEach((n,i)=>{const c=new Color(graphColors[((n.community%graphColors.length)+graphColors.length)%graphColors.length]);if(id&&!neighbors.has(n.id))c.multiplyScalar(.18);colors.setXYZ(i,c.r,c.g,c.b);});colors.needsUpdate=true;
   const edges=lineGeometry.getAttribute('color'),groups=new Map(nodes.map(n=>[n.id,n.community]));links.forEach((l,i)=>{const related=!id||l.source===id||l.target===id;const community=groups.get(l.source)??0;const c=new Color(related?graphColors[((community%graphColors.length)+graphColors.length)%graphColors.length]:'#182020');if(id&&related)c.set('#dfff68');for(let end=0;end<2;end++)edges.setXYZ(i*2+end,c.r,c.g,c.b);});edges.needsUpdate=true;draw();
  }
  function animate(){frame=0;if(disposed||!visible||document.hidden||!automatic.current)return;controls.autoRotate=true;controls.update(1/60);draw();frame=requestAnimationFrame(animate);}
  function setMotion(value:boolean){cancelAnimationFrame(frame);frame=0;controls.autoRotate=value;if(value&&visible&&!document.hidden)frame=requestAnimationFrame(animate);}
  const observer=new ResizeObserver(()=>{const {width,height}=target!.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();draw();});observer.observe(target);
  const visibility=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;setMotion(automatic.current);});visibility.observe(target);
  const pageVisibility=()=>setMotion(automatic.current);document.addEventListener('visibilitychange',pageVisibility);
  const changed=()=>draw();controls.addEventListener('change',changed);
  const api:GraphCommands={zoom(factor){camera.position.multiplyScalar(Math.max(45,Math.min(320,camera.position.length()*factor))/camera.position.length());controls.update();draw();},reset(){controls.reset();draw();},rotate(x,y){controls.rotateLeft(x);controls.rotateUp(y);controls.update();draw();}};commands.current=api;
  const key=(event:KeyboardEvent)=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','Home'].includes(event.key)){event.preventDefault();if(event.key==='Home')api.reset();else if(['+','='].includes(event.key))api.zoom(.85);else if(event.key==='-')api.zoom(1.15);else api.rotate(event.key==='ArrowLeft'?.15:event.key==='ArrowRight'?-.15:0,event.key==='ArrowUp'?.15:event.key==='ArrowDown'?-.15:0);}};canvas.addEventListener('keydown',key);
  let pointer:{x:number;y:number}|null=null;const down=(e:PointerEvent)=>{pointer={x:e.clientX,y:e.clientY};};const up=(event:PointerEvent)=>{if(!pointer||Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>5)return;const rect=canvas.getBoundingClientRect();raycaster.setFromCamera(new Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);const hit=raycaster.intersectObject(points)[0];if(hit?.index!==undefined)onSelect(nodes[hit.index].id);};canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);
  const lost=(event:Event)=>{event.preventDefault();setMotion(false);setError('The 3D context was lost. The searchable symbol list below remains available.');};canvas.addEventListener('webglcontextlost',lost);
  update.current=highlight;motion.current=setMotion;highlight(selection.current);setMotion(automatic.current);target.dataset.nodes=String(nodes.length);target.dataset.edges=String(links.length);
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();visibility.disconnect();document.removeEventListener('visibilitychange',pageVisibility);controls.removeEventListener('change',changed);controls.dispose();canvas.removeEventListener('keydown',key);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('webglcontextlost',lost);pointGeometry.dispose();pointMaterial.dispose();texture.dispose();lineGeometry.dispose();lineMaterial.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();commands.current=null;update.current=()=>{};motion.current=()=>{};};
 },[nodes,links,positions,onSelect,commands]);
 return <div className="code-graph-stage" ref={host}>{error&&<p className="code-graph-fallback" role="status">{error}</p>}</div>;
}
