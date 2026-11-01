import { loadEnvFile } from 'node:process';
import { StitchToolClient } from '@google/stitch-sdk';
import { downloadStitchHtml } from '../server/providers/stitch-design.ts';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Explicit manual diagnostic: no OpenAI calls, no customer brief or source sent.
loadEnvFile('.env.local');
if (!process.env.STITCH_API_KEY?.trim()) throw new Error('STITCH_API_KEY is missing');
const client = new StitchToolClient({apiKey:process.env.STITCH_API_KEY,timeout:240_000});
const started = Date.now();
try {
  const listed = await client.callTool<{projects?:Array<{name?:string}>}>('list_projects',{});
  console.log(JSON.stringify({stage:'connection',ok:true,projects:Array.isArray(listed.projects)?listed.projects.length:0}));
  if (process.argv.includes('--download-qa')) {
    const screen=await client.callTool<any>('get_screen',{name:'projects/10859664341207201089/screens/477aae77e0d2446b8170741f84a1c50c'});
    const url=screen.htmlCode?.downloadUrl??screen.html_code?.download_url;
    if(!url)throw new Error('Screen metadata has no HTML download URL');
    const html=await downloadStitchHtml(url,process.env.STITCH_API_KEY);
    const path=resolve('stitch-portfolio-design.html');
    await writeFile(path,html,{flag:'wx'});
    console.log(JSON.stringify({stage:'saved',path,bytes:Buffer.byteLength(html)}));
  }
  if (process.argv.includes('--generate')) {
    const project = await client.callTool<{name?:string}>('create_project',{title:'ForgeWeb Stitch connectivity QA'});
    if (!project.name?.match(/^projects\/[A-Za-z0-9_-]+$/)) throw new Error('Invalid project response');
    const projectId=project.name.split('/')[1];
    console.log(JSON.stringify({stage:'project',projectId}));
    const result=await client.callTool<Record<string,any>>('generate_screen_from_text',{
      projectId,deviceType:'DESKTOP',prompt:'Create one simple responsive portfolio homepage for fictional designer Avery Stone. Light cream background, dark green text, navigation Work/About/Contact, headline Independent digital designer, three project cards and a contact section. No login, no external integrations. This is a synthetic design test.'
    });
    const screens=(result.outputComponents??(result as any).output_components??[]).flatMap((entry:any)=>entry.design?.screens??[]);
    console.log(JSON.stringify({stage:'generation',ok:true,screenCount:screens.length}));
    const screen=screens[0];
    const screenId=screen?.id??screen?.name?.split('/screens/')[1];
    if (!screenId) {console.log(JSON.stringify({stage:'artifact',ok:false,reason:'Generation returned no screen identifier',responseFields:Object.keys(result)}));process.exitCode=1;}
    else {
      console.log(JSON.stringify({stage:'screen',screenId}));
      const fresh=await client.callTool<any>('get_screen',{name:`projects/${projectId}/screens/${screenId}`});
      const url=fresh.htmlCode?.downloadUrl??fresh.html_code?.download_url;
      if(!url)throw new Error('Screen metadata has no HTML download URL');
      const html=await downloadStitchHtml(url,process.env.STITCH_API_KEY);
      console.log(JSON.stringify({stage:'artifact',ok:true,bytes:Buffer.byteLength(html),completeHtml:/<html[\s>]/i.test(html)&&/<body[\s>]/i.test(html)}));
    }
  }
} catch(error) {
  // Raw SDK errors may contain secrets or signed URLs: never print them.
  console.log(JSON.stringify({stage:'failure',ok:false,type:error instanceof Error?error.name:'Unknown',code:(error as any)?.code??null,status:(error as any)?.status??null}));
  process.exitCode=1;
} finally {await client.close().catch(()=>{});console.log(JSON.stringify({elapsedSeconds:Math.round((Date.now()-started)/1000)}));}
