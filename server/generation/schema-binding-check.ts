import {validateApplicationSchema,generateSchemaBindings} from './application-schema.ts';
export function schemaBindingIssues(files:Array<{path:string;content:string}>):string[]{
 const schema=files.find(file=>file.path==='shared/application-schema.json');if(!schema)return [];
 try{const contract=validateApplicationSchema(JSON.parse(schema.content));const expected=generateSchemaBindings(contract);
  return expected.flatMap(binding=>files.find(file=>file.path===binding.path)?.content===binding.content?[]:[`${binding.path}: missing or modified canonical binding; regenerate it from shared/application-schema.json.`]);
 }catch(error){return [error instanceof Error?error.message:'Invalid canonical application schema.'];}
}
