import {JsonStore} from '../server/store.ts';
import {resolve} from 'node:path';
import {digest,id,now} from '../server/lib.ts';
// Maintenance only: stop ForgeWeb before running, then restart it.
const projectId=process.argv[2];if(!projectId)throw new Error('Provide the affected project ID');
const store=new JsonStore(resolve('.forgeweb-data'));await store.initialize();const state=store.read();const project=state.projects[projectId];if(!project?.currentVersionId)throw new Error('Project version not found');
const sourceVersionId=project.currentVersionId,files=structuredClone(state.versionFiles[sourceVersionId]);
const form=files.find(f=>f.path==='frontend/src/components/ReservationForm.tsx');const pkg=files.find(f=>f.path==='package.json');
if(!form?.content.includes('// Simulated API delay')||!pkg)throw new Error('Unexpected source; refusing an unrelated repair');
form.content=form.content.replace("const [loading, setLoading] = useState(false);","const [loading, setLoading] = useState(false);\n  const [error, setError] = useState('');");
const handlers=`const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try { const result=await checkAvailability(form.date,form.time,form.size); if(!result.available) throw new Error('This slot is unavailable. Choose another time.'); setStep(2); }
    catch(error) { setError(error instanceof Error?error.message:'Availability check failed'); }
    finally { setLoading(false); }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try { const result=await createReservation({date:form.date,time:form.time,party_size:form.size,name:form.name,email:form.email}); if(typeof result.code!=='string') throw new Error('No booking confirmation received'); onSuccess(result.code); setStep(1); }
    catch(error) { setError(error instanceof Error?error.message:'Reservation was not saved'); }
    finally { setLoading(false); }
  };

`;
form.content=form.content.replace(/const handleCheck[\s\S]*?(?=  return \()/,handlers);
for(const [label,target]of [['Date','date'],['Time','time'],['Party Size','size'],['Full Name','name'],['Email Address','email']]){
  form.content=form.content.replace(`<label>${label}</label>`,`<label htmlFor="reservation-${target}">${label}</label>`);
  form.content=form.content.replace(new RegExp(`(<(?:input|select))(?=[^>]*value=\\{form\\.${target}\\})`),`$1 id="reservation-${target}"`);
}
form.content=form.content.replace('<div className="reservation-card">','<div className="reservation-card">\n      {error && <p role="alert">{error}</p>}');form.digest=digest(form.content);
const manifest=JSON.parse(pkg.content);manifest.devDependencies={...manifest.devDependencies,vite:'8.2.4','@vitejs/plugin-react':'6.0.5',typescript:'7.0.2'};pkg.content=JSON.stringify(manifest,null,2)+'\n';pkg.digest=digest(pkg.content);
const versionId=id('version');const versionNumber=Math.max(...Object.values(state.versions).filter(v=>v.projectId===projectId).map(v=>v.versionNumber))+1;
await store.mutate(database=>{database.versions[versionId]={id:versionId,projectId,buildId:project.currentBuildId!,versionNumber,label:'Live reservation wiring and runtime compatibility',editPrompt:'Connect the existing reservation form to its API, add accessible labels and pin the reviewed compiler baseline without changing design.',modifiedFiles:[form.path,pkg.path],sourceVersionId,validationStatus:'pending',validationChecks:[],createdAt:now()};database.versionFiles[versionId]=files;database.projects[projectId].currentVersionId=versionId;database.projects[projectId].currentVersionNumber=versionNumber;database.projects[projectId].status='editing';});
console.log(JSON.stringify({projectId,versionId,versionNumber,status:'pending',previousVersionPreserved:true}));
