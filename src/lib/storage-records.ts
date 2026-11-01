const names:Record<string,string>={id:'Record ID',code:'Confirmation code',party_size:'Guests',createdAt:'Created at',updatedAt:'Updated at'};
export function storageFieldLabel(key:string):string{return names[key]??key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,c=>c.toUpperCase());}
export function storageValue(value:unknown,depth=0):string{
  if(value===null||value===undefined||value==='')return 'Not provided';
  if(typeof value==='boolean')return value?'Yes':'No';
  if(depth>6)return 'Nested information';
  if(Array.isArray(value))return value.length?value.map(item=>storageValue(item,depth+1)).join(' • '):'None';
  if(typeof value==='object')return Object.entries(value).map(([key,item])=>`${storageFieldLabel(key)}: ${storageValue(item,depth+1)}`).join('; ')||'No details';
  return String(value);
}
export function storageRecordFields(row:unknown):Array<{label:string;value:string}>{
  if(!row||typeof row!=='object'||Array.isArray(row))return [{label:'Value',value:storageValue(row)}];
  const order=['name','email','date','time','party_size','code'];
  return Object.entries(row).sort(([a],[b])=>{const rank=(key:string)=>key==='id'?100:order.includes(key)?order.indexOf(key):50;return rank(a)-rank(b);}).map(([key,value])=>({label:storageFieldLabel(key),value:storageValue(value)}));
}
