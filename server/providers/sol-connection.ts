import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ApiError} from '../lib.ts';

// Fixed Standard pricing; conservatively charge all input at the cache-write rate.
export class SolConnection {
 private db:DatabaseSync;
 private key:string;
 private limit:number;
 constructor(key:string,directory:string,limit=1){
  if(!Number.isFinite(limit)||limit<1||limit>4.553683)throw new Error('Invalid approved Sol testing limit.');this.limit=limit;
  this.key=key;
  mkdirSync(directory,{recursive:true});this.db=new DatabaseSync(join(directory,'openai-test-budget.sqlite3'));
  this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, reserved INTEGER NOT NULL, charged INTEGER, input_tokens INTEGER, output_tokens INTEGER, stage TEXT NOT NULL)');
 }
 usage(){const row=this.db.prepare('SELECT COALESCE(SUM(COALESCE(charged,reserved)),0) AS committed, COALESCE(SUM(charged),0) AS accounted, COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output, COUNT(*) AS calls FROM requests').get()!;return {limitUsd:this.limit,committedUsd:Number(row.committed)/1e6,accountedUsd:Number(row.accounted)/1e6,inputTokens:Number(row.input),outputTokens:Number(row.output),calls:Number(row.calls)};}
 close(){this.db.close();}
 async request<T>(instructions:string,prompt:string,schema:object,stage:string,maxOutput:number):Promise<T>{
  const body={model:'gpt-6.1-sol',instructions,input:prompt,store:false,service_tier:'default',reasoning:{effort:'low'},max_output_tokens:maxOutput,text:{format:{type:'json_schema',name:stage,strict:true,schema}}};
  const encoded=JSON.stringify(body),inputBound=Buffer.byteLength(encoded)+4096;
  if(inputBound>200000)throw new ApiError(422,'OPENAI_INPUT_LIMIT','Sol request context is too large; no paid call was made.');
  const reserved=Math.ceil(inputBound*2.5+maxOutput*10),id=randomUUID();
  this.db.exec('BEGIN IMMEDIATE');
  try{if(Math.round(this.usage().committedUsd*1e6)+reserved>Math.floor(this.limit*1e6))throw new ApiError(402,'OPENAI_TEST_BUDGET_STOP','Budget alert: the next Sol request cannot safely fit within the approved test allowance. Generation stopped; no extra call was made.');this.db.prepare('INSERT INTO requests(id,reserved,stage) VALUES(?,?,?)').run(id,reserved,stage);this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
  // No automatic network retries: an uncertain response can still be chargeable.
  let response:Response;
  try{response=await fetch('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',headers:{authorization:`Bearer ${this.key}`,'content-type':'application/json'},body:encoded,signal:AbortSignal.timeout(480000)});}catch{throw new ApiError(502,'OPENAI_CONNECTION_FAILED','Sol connection failed. Its maximum cost remains reserved; no automatic retry was made.');}
  if(!response.ok){if([400,401,403,404,429].includes(response.status))this.db.prepare('UPDATE requests SET charged=0 WHERE id=?').run(id);throw new ApiError(502,'OPENAI_REQUEST_FAILED',`Sol returned HTTP ${response.status}. No provider fallback or automatic retry was made.`);}
  const result=await response.json() as any;
  const input=result.usage?.input_tokens,output=result.usage?.output_tokens;
  if(Number.isSafeInteger(input)&&input>=0&&Number.isSafeInteger(output)&&output>=0){const charge=Math.ceil(input*2.5+output*10);this.db.prepare('UPDATE requests SET charged=?,input_tokens=?,output_tokens=? WHERE id=?').run(Math.max(0,charge),input,output,id);}
  else throw new ApiError(502,'OPENAI_USAGE_UNKNOWN','Sol returned no valid usage. Maximum cost remains reserved; stop and inspect billing.');
  if(result.status!=='completed')throw new ApiError(502,'MODEL_TRUNCATED','Sol did not complete its response; incomplete source was rejected. Usage was recorded.');
  const text=(result.output??[]).filter((item:any)=>item.type==='message').flatMap((item:any)=>item.content??[]).filter((item:any)=>item.type==='output_text').map((item:any)=>item.text).join('');
  try{const parsed=JSON.parse(text);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed as T;}catch{throw new ApiError(502,'MODEL_INVALID_JSON','Sol returned invalid structured output; no incomplete source accepted.');}
 }
}
