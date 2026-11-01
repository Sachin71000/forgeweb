// Run in a fresh, network-disabled Python process before generated tests can seed its database.
export const schemaWorkflowVerification = String.raw`import os,json,re,sys,subprocess
from pathlib import Path
from urllib.parse import urlsplit,quote
os.environ['APP_DATABASE_PATH']='/tmp/forgeweb-independent-workflows.sqlite3'
path=Path('/app/shared/application-schema.json')
if not path.exists():
    print('FORGEWEB_SCHEMA_WORKFLOWS '+json.dumps({'status':'legacy-unavailable','limitations':'No canonical schema; independent workflow verification was not performed.'}))
    sys.exit(0)
schema=json.loads(path.read_text())
assert schema.get('version')=='1' and schema.get('routes') and schema.get('workflows'),'Invalid canonical workflow contract'
from app.main import app
from app.schemas import generated_contracts as models
from fastapi.testclient import TestClient
actual=app.openapi()
components=actual.get('components',{}).get('schemas',{})
def normalized(value,definitions,seen=frozenset()):
    if isinstance(value,list): return [normalized(v,definitions,seen) for v in value]
    if not isinstance(value,dict): return value
    if '$ref' in value:
        name=value['$ref'].split('/')[-1]
        if name in seen: return {'recursiveRef':name}
        assert name in definitions,'Unresolved route schema reference'
        return normalized(definitions[name],definitions,seen|{name})
    return {key:normalized(item,definitions,seen) for key,item in value.items() if key not in ('title','description','examples','example','$defs')}
def expected_schema(name,array=False):
    model=getattr(models,name)
    definition=model.model_json_schema()
    result=normalized(definition,definition.get('$defs',{}))
    return {'type':'array','items':result} if array else result
def body_schema(operation):
    return operation.get('content',{}).get('application/json',{}).get('schema')
routes=schema['routes']
for route in routes:
    operation=actual.get('paths',{}).get(route['path'],{}).get(route['method'].lower())
    assert operation is not None,'Canonical route/method missing: '+route['method']+' '+route['path']
    if route.get('requestModel'):
        declared=body_schema(operation.get('requestBody',{}))
        assert declared is not None and normalized(declared,components)==expected_schema(route['requestModel']),'Request model disagrees with canonical binding: '+route['path']
    status=str(route['successStatus'])
    response=operation.get('responses',{}).get(status)
    assert response is not None,'Canonical success status missing: '+route['path']
    if route.get('responseModel'):
        declared=body_schema(response)
        assert declared is not None and normalized(declared,components)==expected_schema(route['responseModel'],route.get('responseArray',False)),'Response model disagrees with canonical binding: '+route['path']
def pointer(value,path):
    if path=='': return True,value
    try:
        for part in path[1:].split('/'):
            part=part.replace('~1','/').replace('~0','~')
            if isinstance(value,list):
                if not re.fullmatch(r'0|[1-9][0-9]*',part): return False,None
                value=value[int(part)]
            else: value=value[part]
        return True,value
    except (KeyError,IndexError,TypeError,ValueError): return False,None
def substitute(value,variables):
    if isinstance(value,list): return [substitute(item,variables) for item in value]
    if isinstance(value,dict): return {key:substitute(item,variables) for key,item in value.items()}
    if not isinstance(value,str): return value
    exact=re.fullmatch(r'\{\{([A-Za-z][A-Za-z0-9_]*)\}\}',value)
    if exact:
        assert exact[1] in variables,'Workflow variable not captured'
        return variables[exact[1]]
    def replace(match):
        assert match[1] in variables,'Workflow variable not captured'
        return str(variables[match[1]])
    return re.sub(r'\{\{([A-Za-z][A-Za-z0-9_]*)\}\}',replace,value)
def matching_route(method,path):
    pathname=urlsplit(path).path
    for route in routes:
        pattern=re.sub(r'\\\{[^{}]+\\\}',r'[^/]+',re.escape(route['path']))
        if route['method']==method and re.fullmatch(pattern,pathname): return route
    raise AssertionError('Workflow targets an undeclared route')
def equal_json(left,right):
    if type(left) in (int,float) and type(right) in (int,float): return left==right
    if type(left)!=type(right): return False
    if isinstance(left,list): return len(left)==len(right) and all(equal_json(a,b) for a,b in zip(left,right))
    if isinstance(left,dict): return left.keys()==right.keys() and all(equal_json(left[key],right[key]) for key in left)
    return left==right
restart_probe="""import sys,json
from app.main import app
from fastapi.testclient import TestClient
payload=json.loads(sys.stdin.read())
with TestClient(app) as client:
    response=client.get(payload['path'],cookies=payload['cookies'])
    print('FORGEWEB_RESTART_READ '+json.dumps({'status':response.status_code,'body':response.json() if response.content else None}))
"""
covered=set();steps=0;assertions=0;mutation_samples={};negative_checks=0;durability_checks=0;mutated=False
with TestClient(app) as client:
    for workflow in schema['workflows']:
        variables={};assert workflow['steps'],'Empty independent workflow'
        for step in workflow['steps']:
            target=substitute(step['path'],variables)
            assert target.startswith('/api/') and not target.startswith('//') and not urlsplit(target).netloc,'Unsafe workflow URL'
            route=matching_route(step['method'],target)
            body=substitute(step.get('body'),variables)
            response=client.request(step['method'],target,**({'json':body} if 'body' in step else {}))
            assert response.status_code==step['expectedStatus'],'Independent workflow status failed: '+workflow['name']+' '+step['method']+' '+route['path']
            value=response.json() if response.content else None
            durable=None
            if step['method']=='GET' and mutated:
                probe=subprocess.run([sys.executable,'-c',restart_probe],input=json.dumps({'path':target,'cookies':dict(client.cookies)}),text=True,capture_output=True,timeout=15)
                assert probe.returncode==0,'Restart persistence probe failed'
                lines=[line for line in probe.stdout.splitlines() if line.startswith('FORGEWEB_RESTART_READ ')]
                assert lines,'Restart persistence probe returned no evidence'
                durable=json.loads(lines[-1][len('FORGEWEB_RESTART_READ '):])
                assert durable['status']==response.status_code,'Restart persistence status differs from live response'
                if not step['assertions']: assert equal_json(durable['body'],value),'Restart persistence response differs'
                durability_checks+=1
            if 200<=response.status_code<300:
                covered.add((route['method'],route['path']))
                if route.get('requestModel') and step['method'] in ('POST','PUT','PATCH'):
                    mutation_samples[(route['method'],route['path'])]=(route,target,body)
                if route.get('responseModel'):
                    model=getattr(models,route['responseModel'])
                    if route.get('responseArray'):
                        assert isinstance(value,list),'Expected response array'
                        for item in value: model.model_validate(item)
                    else: model.model_validate(value)
            for assertion in step['assertions']:
                exists,found=pointer(value,assertion['pointer'])
                if 'exists' in assertion: assert exists==assertion['exists'],'Independent existence assertion failed: '+assertion['pointer']
                else: assert exists and equal_json(found,substitute(assertion['equals'],variables)),'Independent value assertion failed: '+assertion['pointer']
                assertions+=1
                if durable is not None:
                    persisted,persisted_value=pointer(durable['body'],assertion['pointer'])
                    if 'exists' in assertion: assert persisted==assertion['exists'],'Restart persistence existence assertion failed'
                    else: assert persisted and equal_json(persisted_value,substitute(assertion['equals'],variables)),'Restart persistence value assertion failed'
            for name,location in step.get('capture',{}).items():
                exists,found=pointer(value,location);assert exists and name not in variables,'Invalid workflow capture';variables[name]=found
            steps+=1
            if step['method'] in ('POST','PUT','PATCH','DELETE') and 200<=response.status_code<300: mutated=True
    for route,target,body in mutation_samples.values():
        assert isinstance(body,dict),'Canonical mutation model requires an object body'
        invalid=[]
        for field,rules in schema['models'][route['requestModel']]['fields'].items():
            def changed(value):
                result=json.loads(json.dumps(body));result[field]=value;invalid.append(result)
            if rules.get('required',True):
                result=json.loads(json.dumps(body));result.pop(field,None);invalid.append(result)
            if not rules.get('nullable',False): changed(None)
            if rules.get('enum'):
                if rules['type']=='string': changed('__FORGEWEB_INVALID_ENUM__')
                elif rules['type'] in ('integer','number'): changed(max(rules['enum'])+1)
            if 'minimum' in rules: changed(rules['minimum']-1)
            if 'maximum' in rules: changed(rules['maximum']+1)
            if rules.get('minLength',0)>0: changed('')
            if 'maxLength' in rules: changed('x'*(rules['maxLength']+1))
            if rules.get('format'): changed('not-a-valid-'+rules['format'])
        result=json.loads(json.dumps(body));result['__unexpected_field__']=True;invalid.append(result)
        for payload in invalid[:100]:
            response=client.request(route['method'],target,json=payload)
            assert response.status_code==422,'Canonical invalid input was not rejected: '+route['method']+' '+route['path']
            negative_checks+=1
assert all((route['method'],route['path']) in covered for route in routes),'Independent workflows do not successfully cover all declared routes'
assert assertions>0,'Independent workflows contain no value assertions'
if mutated: assert durability_checks>0,'No independent persisted read was executed after mutation'
print('FORGEWEB_SCHEMA_WORKFLOWS '+json.dumps({'status':'passed','workflows':len(schema['workflows']),'steps':steps,'assertions':assertions,'negativeChecks':negative_checks,'restartReads':durability_checks,'routesCovered':len(covered),'limitations':'Executed schema API scenarios and process-restart reads; browser journeys and unmodeled business rules still need separate evidence.'}))
`;
