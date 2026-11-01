// Executed only inside the fixed, network-disabled Python validation container.
export const backendVerification = `import os,sys,json
os.environ['APP_DATABASE_PATH']='/tmp/forgeweb-verification.sqlite3'
os.environ['PYTEST_DISABLE_PLUGIN_AUTOLOAD']='1'
import pytest
class Evidence:
    passed=0
    def pytest_runtest_logreport(self,report):
        if report.when=='call' and report.passed: self.passed+=1
evidence=Evidence()
code=pytest.main(['-q','-p','no:cacheprovider','--disable-warnings','/app/backend/tests'],plugins=[evidence])
assert code==0 and evidence.passed>0,'Backend acceptance tests failed or no tests executed'
from app.main import app
from fastapi.testclient import TestClient
probed=[]
with TestClient(app) as client:
    health=client.get('/health')
    assert health.status_code==200 and health.json().get('status')=='ok','Process health failed'
    for path,operations in app.openapi().get('paths',{}).items():
        operation=operations.get('get')
        if not path.startswith('/api/') or '{' in path or not operation: continue
        if any(parameter.get('required') for parameter in operation.get('parameters',[])): continue
        response=client.get(path)
        assert response.status_code<500,f'Business endpoint {path} returned {response.status_code}'
        assert response.status_code in (200,204,401,403),f'Unexpected readiness status {path}: {response.status_code}'
        probed.append({'path':path,'status':response.status_code})
assert probed,'No parameter-free business GET route available; supply executable readiness scenarios'
print('FORGEWEB_BACKEND_EVIDENCE '+json.dumps({'passedTests':evidence.passed,'readiness':probed,'limitations':'Protected routes and complete browser workflows require separate authenticated/scenario tests.'}))
`;
