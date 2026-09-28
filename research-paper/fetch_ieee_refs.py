import json, urllib.request, urllib.parse, concurrent.futures, time
from pathlib import Path
entries = [
('ReqInOne: A Large Language Model-Based Agent for Software Requirements Specification Generation','10.1109/RE63999.2025.00054'),
('Requirements are All You Need: From Requirements to Code with LLMs','10.1109/RE59067.2024.00049'),
('Using LLMs in Software Requirements Specifications: An Empirical Evaluation','10.1109/RE59067.2024.00056'),
('Can LLMs Generate Architectural Design Decisions? An Exploratory Empirical Study','10.1109/ICSA59870.2024.00016'),
('SALLMA: A Software Architecture for LLM-Based Multi-Agent Systems','10.1109/SATrends66715.2025.00006'),
('SOEN-101: Code Generation by Emulating Software Process Models Using Large Language Model Agents','10.1109/ICSE55347.2025.00140'),
('Human-In-the-Loop Software Development Agents','10.1109/ICSE-SEIP66354.2025.00036'),
('Enabling Architecture Traceability by LLM-based Architecture Component Name Extraction','10.1109/ICSA65012.2025.00011'),
('Locally-deployed Open-source LLMs for Code Generation: Promises and Challenges','10.1109/PAIS66004.2025.11126523'),
('CodeWisp: AST Guided Retrieval Augmented Generation for Code Generation and Completion','10.1109/WINCOM65874.2025.11313399'),
('Assured LLM-Based Software Engineering',''),
('Combining Large Language Models with Static Analyzers for Code Review Generation','10.1109/MSR66628.2025.00038'),
('Large Language Models as Assistants in Software Architecture Design','10.1109/MS.2026.3663353'),
('Evaluating Large Language Models for Code Generation: Assessing Accuracy, Quality, and Performance','10.1109/FLLM63129.2024.10852439'),
('LiSSA: Toward Generic Traceability Link Recovery Through Retrieval-Augmented Generation','10.1109/ICSE55347.2025.00186'),
('Code Gradients: Towards Automated Traceability of LLM-Generated Code',''),
('Can We Use LLMs to Recover Trace Links between Source Code and Security Requirements?','10.1109/REW66121.2025.00035'),
('A Multi-Agent LLM Environment for Software Design and Refactoring: A Conceptual Framework',''),
('Transforming Software Development: A Study on the Integration of Multi-Agent Systems and Large Language Models for Automatic Code Generation',''),
('LLM-Powered Multi-Agent Systems: A Technical Framework for Collaborative Intelligence Through Optimized Knowledge Retrieval and Communication',''),
('LLM-based Interactive Code Generation: Empirical Evaluation',''),
('Holistic Evaluation of LLM-Based Code Generation',''),
('A Review on Code Generation with LLMs: Application and Evaluation',''),
('An Empirical Evaluation of Using Large Language Models for Automated Unit Test Generation',''),
('Acceptance Test Generation with Large Language Models: An Industrial Case Study','10.1109/AST66626.2025.00007')]
def fetch(item):
    i,(title,doi)=item
    url='https://api.crossref.org/works/'+urllib.parse.quote(doi,safe='') if doi else 'https://api.crossref.org/works?rows=2&query.title='+urllib.parse.quote(title)
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'ForgeWebBibliographyAudit/1.0'})
        with urllib.request.urlopen(req,timeout=60) as r: data=json.load(r)['message']
        return {'id':i,'requested':title,'source':url,'records':[data] if doi else data['items']}
    except Exception as e: return {'id':i,'requested':title,'error':str(e)}
target=Path(__file__).with_name('ieee-metadata.json')
results=json.loads(target.read_text(encoding='utf-8')) if target.exists() else []
cached={r['id']:r for r in results if 'error' not in r and r['id'] != 20}
results=[]
for i,entry in enumerate(entries,1):
    if i in cached: results.append(cached[i]); continue
    time.sleep(2)
    results.append(fetch((i,entry)))
Path(__file__).with_name('ieee-metadata.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
for r in results:
    print(r['id'],r.get('error',''))
    for v in r.get('records',[]):
        print(json.dumps({k:v.get(k) for k in ['title','author','DOI','container-title','published','page','volume','issue','abstract']},ensure_ascii=True))
