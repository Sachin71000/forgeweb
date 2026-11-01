import {parse} from '@babel/parser';
import {frontendInteractionIssues} from './frontend-interactions.ts';
import {frontendToolchainIssues} from './frontend-toolchain.ts';
import {schemaClientIssues} from './schema-client-check.ts';

type Node={type?:string;[key:string]:unknown};
const asNode=(value:unknown):Node=>value&&typeof value==='object'?value as Node:{};
function attribute(opening:Node,name:string):Node|undefined{
  return (opening.attributes as Node[]??[]).find(item=>asNode(item.name).name===name);
}
function valueKey(attribute:Node|undefined,source:string):string{
  if(!attribute)return '';
  const value=asNode(attribute.value);
  if(value.type==='StringLiteral')return String(value.value??'').trim();
  const expression=asNode(value.expression);
  if(['NullLiteral','BooleanLiteral','JSXEmptyExpression'].includes(expression.type??''))return '';
  if(expression.type==='StringLiteral')return String(expression.value??'').trim();
  if(typeof expression.start==='number'&&typeof expression.end==='number')return 'expression:'+source.slice(expression.start,expression.end).replace(/\s/g,'');
  return '';
}
function hasLabelText(value:unknown):boolean{
  if(Array.isArray(value))return value.some(hasLabelText);
  const node=asNode(value);
  if(node.type==='JSXText')return Boolean(String(node.value??'').trim());
  if(node.type==='JSXExpressionContainer')return !['JSXEmptyExpression','NullLiteral'].includes(String(asNode(node.expression).type));
  return node.type==='JSXElement'&&hasLabelText(node.children);
}

// Recognizes common native JSX naming patterns. Cross-component labels and
// dynamic accessibility behavior still require browser/screen-reader testing.
export function frontendAccessibilityIssues(files:Array<{path:string;content:string}>):string[]{
  const issues:string[]=[];
  for(const file of files){
    if(!file||typeof file.path!=='string'||typeof file.content!=='string'||!file.path.endsWith('.tsx'))continue;
    let ast:unknown;
    try{ast=parse(file.content,{sourceType:'module',plugins:['typescript','jsx']});}catch{continue;}
    const labels=new Set<string>();
    const controls:Array<{opening:Node;ancestors:Node[]}>=[];
    function visit(value:unknown,ancestors:Node[]):void{
      if(Array.isArray(value)){value.forEach(child=>visit(child,ancestors));return;}
      if(!value||typeof value!=='object')return;
      const current=asNode(value);let next=ancestors;
      if(current.type==='JSXElement'){
        const opening=asNode(current.openingElement),name=asNode(opening.name).name;
        if(name==='label'&&hasLabelText(current.children)){
          const key=valueKey(attribute(opening,'htmlFor'),file.content);if(key)labels.add(key);
        }
        if(['input','select','textarea'].includes(String(name)))controls.push({opening,ancestors});
        next=[...ancestors,current];
      }
      for(const [key,child]of Object.entries(current))if(!['loc','start','end','comments','tokens'].includes(key))visit(child,next);
    }
    visit(ast,[]);
    for(const {opening,ancestors}of controls){
      const type=valueKey(attribute(opening,'type'),file.content);
      if(['hidden','submit','reset','button'].includes(type))continue;
      const id=valueKey(attribute(opening,'id'),file.content);
      const wrapped=ancestors.some(parent=>{
        const label=asNode(parent.openingElement);
        const target=valueKey(attribute(label,'htmlFor'),file.content);
        return asNode(label.name).name==='label'&&hasLabelText(parent.children)&&(!target||target===id);
      });
      if(!wrapped&&!(id&&labels.has(id))&&!valueKey(attribute(opening,'aria-label'),file.content)&&!valueKey(attribute(opening,'aria-labelledby'),file.content))issues.push(`${file.path}: ${String(asNode(opening.name).name)} has no associated accessible label`);
    }
  }
  return [...new Set(issues)];
}

export function frontendSourceIssues(files:Array<{path:string;content:string}>):string[]{
  return [...frontendInteractionIssues(files),...frontendAccessibilityIssues(files),...frontendToolchainIssues(files),...schemaClientIssues(files)];
}
