import {parse} from '@babel/parser';

type Node = {type?:string;[key:string]:unknown};
function node(value:unknown):Node { return value && typeof value==='object' ? value as Node : {}; }
function attribute(element:Node,name:string):Node|undefined {
  return (element.attributes as Node[]??[]).find(attr=>node(attr.name).name===name);
}
function literal(attr:Node|undefined):unknown {
  if(!attr)return undefined;
  if(attr.value===null)return true;
  const value=node(attr.value);
  return value.type==='JSXExpressionContainer'?node(value.expression).value:value.value;
}
function handler(element:Node,name:string):boolean {
  const attr=attribute(element,name);
  if(!attr)return false;
  const expression=node(node(attr.value).expression);
  if(expression.type==='NullLiteral'||expression.type==='BooleanLiteral')return false;
  const body=node(expression.body);
  return !(body.type==='BlockStatement' && Array.isArray(body.body) && body.body.length===0);
}

// Static evidence only: browser/API tests must still establish working behavior.
export function frontendInteractionIssues(files:Array<{path:string;content:string}>):string[]{
  if(files.some(file=>!file||typeof file.path!=='string'||typeof file.content!=='string'))return ['Frontend source contains an invalid file record'];
  const issues:string[]=[];
  for(const file of files.filter(file=>file.path.endsWith('.tsx'))){
    let ast:unknown;
    try { ast=parse(file.content,{sourceType:'module',plugins:['typescript','jsx']}); }
    catch { issues.push(`${file.path}: frontend JSX could not be parsed`); continue; }
    function visit(value:unknown,ancestors:Node[]):void {
      if(Array.isArray(value)){for(const child of value)visit(child,ancestors);return;}
      if(!value||typeof value!=='object')return;
      const current=node(value);
      let next=ancestors;
      if(current.type==='JSXElement'){
        const opening=node(current.openingElement);
        const name=node(opening.name).name;
        const form=[...ancestors].reverse().find(parent=>node(parent.name).name==='form');
        const submitted=Boolean(form&&handler(form,'onSubmit'));
        const delegated=attribute(opening,'data-action')&&ancestors.some(parent=>handler(parent,'onClick'));
        const disabled=literal(attribute(opening,'disabled'))===true;
        if(name==='a'&&['#',''].includes(String(literal(attribute(opening,'href'))))&&!handler(opening,'onClick')&&!delegated)issues.push(`${file.path}: anchor has a placeholder destination and no click action`);
        if(!disabled&&name==='button'){
          const type=literal(attribute(opening,'type'));
          const submit=submitted&&(type===undefined||type==='submit');
          if(!submit&&!delegated&&!handler(opening,'onClick')&&!handler(opening,'onPointerDown')&&!attribute(opening,'formAction'))issues.push(`${file.path}: button has no click or form action`);
        }
        if(!disabled&&name==='select'&&!handler(opening,'onChange')&&!handler(opening,'onInput')&&!(submitted&&attribute(opening,'name'))&&!ancestors.some(parent=>handler(parent,'onChange')))issues.push(`${file.path}: select has no change handler`);
        next=[...ancestors,opening];
      }
      for(const [key,child] of Object.entries(current))if(!['loc','start','end','comments','tokens'].includes(key))visit(child,next);
    }
    visit(ast,[]);
  }
  return [...new Set(issues)];
}
