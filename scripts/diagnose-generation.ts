import { readFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { GenerationEvidence } from '../server/providers/generation-evidence.ts';
import { backendImplementationPrompt, FORGEWEB_MASTER_GENERATION_PROMPT } from '../server/generation/master-prompt.ts';
import { validatePythonSyntax } from '../server/python-validation.ts';
import { digest, id } from '../server/lib.ts';
import type { ForgeDatabase } from '../server/domain.ts';

if (!process.argv.includes('--allow-live')) throw new Error('Requires explicit --allow-live. This script makes at most three generation requests.');
const environment = loadEnv('development', process.cwd(), '');
const database = JSON.parse(await readFile('.forgeweb-data/forgeweb.json','utf8')) as ForgeDatabase;
const specification = Object.values(database.builds).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
  .map((build) => build.specificationId ? database.specifications[build.specificationId] : undefined)
  .find((spec) => spec?.status === 'approved');
if (!specification) throw new Error('No approved specification to diagnose.');
const evidence = new GenerationEvidence('.forgeweb-data', Object.entries(environment).filter(([name,value]) => /KEY|TOKEN|SECRET/.test(name) && value).map(([,value]) => value));
const path = 'backend/app/models/domain.py';
const schema = {type:'object',properties:{files:{type:'array',items:{type:'object',properties:{path:{type:'string'},content:{type:'string'},requirementIds:{type:'array',items:{type:'string'}}},required:['path','content','requirementIds'],additionalProperties:false}}},required:['files'],additionalProperties:false};
const prompt = [backendImplementationPrompt(specification,true),`FILE-BY-FILE OVERRIDE: Earlier bundle-size instructions are replaced for this request. Return exactly ONE file: ${path}. Use ordinary raw source in the content JSON string, NEVER Base64. All other files are generated separately. Complete this file within 800 output tokens; use concise code but preserve required validation and behavior. No unrequested imports/modules.`, 'Previously completed source: []'].join('\n\n');
const runId = id('diagnostic');
let requests = 0;
const cases = [
  {slot:'groq',key:environment.GROQ_API_KEY,model:environment.FORGEWEB_GROQ_MODEL??'qwen/qwen3.8-27b',gemini:false,budget:800},
  {slot:'gemini-1',key:environment.GOOGLE_API_KEY??environment.GEMINI_API_KEY,model:environment.FORGEWEB_GEMINI_MODEL??'gemini-3-flash-preview',gemini:true,budget:2048},
  {slot:'gemini-3',key:environment.GEMINI_FALLBACK_API_KEY_2,model:environment.FORGEWEB_GEMINI_MODEL??'gemini-3-flash-preview',gemini:true,budget:2048},
];
for (const task of cases) {
  if (!task.key) { console.log(JSON.stringify({slot:task.slot,status:'skipped-missing-key'})); continue; }
  if (requests >= 3) throw new Error('Diagnostic request budget exhausted');
  const started = Date.now();
  console.log(JSON.stringify({slot:task.slot,event:'request-start',request:++requests,maxOutputTokens:task.budget}));
  try {
    const url = task.gemini ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(task.model)}:generateContent` : 'https://api.groq.com/openai/v1/chat/completions';
    const body = task.gemini ? {systemInstruction:{parts:[{text:FORGEWEB_MASTER_GENERATION_PROMPT}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.28,maxOutputTokens:task.budget,responseMimeType:'application/json',responseJsonSchema:schema}} : {model:task.model,temperature:0.28,max_tokens:task.budget,messages:[{role:'system',content:FORGEWEB_MASTER_GENERATION_PROMPT},{role:'user',content:prompt}],response_format:{type:'json_schema',json_schema:{name:'forgeweb_single_file',strict:true,schema}}};
    const response = await fetch(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json',...(task.gemini?{'x-goog-api-key':task.key}:{authorization:`Bearer ${task.key}`})},body:JSON.stringify(body),signal:AbortSignal.timeout(120_000)});
    const raw = await response.text();
    let payload: any;
    try { payload=JSON.parse(raw); } catch { payload=undefined; }
    if (!response.ok) {
      await evidence.record({event:'live_diagnostic_rejection',runId,slot:task.slot,httpStatus:response.status,elapsedMs:Date.now()-started,response:raw.slice(0,512_000)});
      console.log(JSON.stringify({slot:task.slot,httpStatus:response.status,providerStatus:payload?.error?.status??payload?.error?.code,evidenceSaved:true}));
      continue;
    }
    const text = task.gemini ? payload?.candidates?.[0]?.content?.parts?.filter((part: any)=>!part.thought).map((part: any)=>part.text??'').join('')??'' : payload?.choices?.[0]?.message?.content??'';
    const finishReason = task.gemini ? payload?.candidates?.[0]?.finishReason : payload?.choices?.[0]?.finish_reason;
    let output: any;
    try { output=JSON.parse(text); } catch { output=undefined; }
    const file=output?.files?.length===1&&output.files[0]?.path===path?output.files[0]:undefined;
    const validation=file&&typeof file.content==='string'?await validatePythonSyntax([{path,content:file.content,requirementIds:[],digest:digest(file.content)}]):undefined;
    await evidence.record({event:'live_diagnostic_output',runId,slot:task.slot,model:task.model,httpStatus:response.status,finishReason,maxOutputTokens:task.budget,elapsedMs:Date.now()-started,usage:payload?.usageMetadata??payload?.usage,output:text.slice(0,512_000),validation});
    console.log(JSON.stringify({slot:task.slot,httpStatus:response.status,finishReason,elapsedSeconds:Math.round((Date.now()-started)/1000),syntax:validation?.status??'no-valid-file',compilerEvidence:validation?.status==='failed'?validation.evidence:undefined,usage:payload?.usageMetadata??payload?.usage,evidenceSaved:true}));
  } catch (error) {
    const code=(error as {cause?:{code?:string};name?:string}).cause?.code??(error as Error).name;
    await evidence.record({event:'live_diagnostic_transport_failure',runId,slot:task.slot,code,elapsedMs:Date.now()-started});
    console.log(JSON.stringify({slot:task.slot,status:'transport-failed',code}));
  }
}
console.log(JSON.stringify({runId,totalGenerationRequests:requests,budget:3,applicationGenerated:false,sourceExecuted:false}));
