export type CodeNode={id:string;label:string;file:string;line:string;community:number;external:boolean};
export type CodeLink={source:string;target:string;relation:string;confidence:string;score:number;file:string;line:string};
export type CodeGraph={generatedAt:string;sourceHash:string;graphifyVersion:string;toolRevision:string;files:string[];nodes:CodeNode[];links:CodeLink[]};
export const graphColors=['#dfff68','#50c7f0','#ff9fcf','#b49bff','#ffbb70','#5ee4b8','#fa8585','#a0c3ff'];
const text=(value:unknown,max=300)=>typeof value==='string'?value.slice(0,max):'';
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};

/** Public display contains symbol metadata, never source bodies or arbitrary parser metadata. */
export function sanitizeCodeGraph(raw:unknown,files:string[]):Pick<CodeGraph,'nodes'|'links'>{
 const graph=object(raw),allowed=new Set(files);if(!Array.isArray(graph.nodes)||!Array.isArray(graph.links)||graph.nodes.length>20000||graph.links.length>100000)throw new Error('Unsupported graph size or schema');
 const path=(value:unknown)=>text(value).replaceAll('\\','/');
 const nodes:CodeNode[]=graph.nodes.map(object).filter(n=>typeof n.id==='string'&&((n.external===true&&!n.source_file)||allowed.has(path(n.source_file)))).map(n=>({id:text(n.id,500),label:text(n.label)||text(n.id),file:path(n.source_file),line:text(n.source_location),community:typeof n.community==='number'&&Number.isSafeInteger(n.community)?n.community:0,external:n.external===true}));
 if(new Set(nodes.map(n=>n.id)).size!==nodes.length)throw new Error('Duplicate graph symbols');
 const ids=new Set(nodes.map(n=>n.id));
 const links:CodeLink[]=graph.links.map(object).filter(l=>ids.has(text(l.source,500))&&ids.has(text(l.target,500))).map(l=>({source:text(l.source,500),target:text(l.target,500),relation:text(l.relation,80)||'related',confidence:text(l.confidence,40)||'UNSPECIFIED',score:typeof l.confidence_score==='number'&&Number.isFinite(l.confidence_score)?l.confidence_score:0,file:allowed.has(path(l.source_file))?path(l.source_file):'',line:text(l.source_location)}));
 return {nodes,links};
}

export function graphCommunities(graph:CodeGraph){
 const groups=new Map<number,{id:number;label:string;count:number}>();
 for(const node of graph.nodes){const group=groups.get(node.community)??{id:node.community,label:node.label,count:0};if(!node.external&&group.label.startsWith('ref_'))group.label=node.label;group.count++;groups.set(group.id,group);}
 return [...groups.values()].sort((a,b)=>b.count-a.count);
}

/** Deterministic display coordinates; topology/provenance are untouched. */
export function codeGraphLayout(nodes:CodeNode[]):Map<string,[number,number,number]>{
 const communities=[...new Set(nodes.map(n=>n.community))].sort((a,b)=>a-b),counts=new Map<number,number>(),placed=new Map<number,number>();for(const n of nodes)counts.set(n.community,(counts.get(n.community)??0)+1);
 const result=new Map<string,[number,number,number]>();const angle=Math.PI*(3-Math.sqrt(5));
 for(const n of nodes){const group=communities.indexOf(n.community),y=communities.length===1?0:1-2*(group+.5)/communities.length,r=Math.sqrt(1-y*y),theta=group*angle;const i=placed.get(n.community)??0;placed.set(n.community,i+1);const count=counts.get(n.community)!;const localY=1-2*(i+.5)/count,localR=Math.sqrt(1-localY*localY),size=5+Math.sqrt(count)*.85;
  result.set(n.id,[34*r*Math.cos(theta)+size*localR*Math.cos(i*angle),34*y+size*localY,34*r*Math.sin(theta)+size*localR*Math.sin(i*angle)]);
 }return result;
}
