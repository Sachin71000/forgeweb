"""Convert reviewed publisher metadata into the replacement bibliography."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parent
data=json.loads((root/'ieee-metadata.json').read_text(encoding='utf-8'))
def tex(s):
    return s.replace('&',r'\&').replace('%',r'\%').replace('_',r'\_')
out=[]
shortvenues={1:'Proc. IEEE RE',2:'Proc. IEEE RE',3:'Proc. IEEE RE',4:'Proc. IEEE ICSA',5:'Proc. IEEE/ACM SATrends',6:'Proc. IEEE/ACM ICSE',7:'Proc. IEEE/ACM ICSE-SEIP',8:'Proc. IEEE ICSA',9:'Proc. PAIS',10:'Proc. WINCOM',11:'Proc. IEEE/ACM InteNSE',12:'Proc. IEEE/ACM MSR',14:'Proc. FLLM',15:'Proc. IEEE/ACM ICSE',16:'Proc. IEEE RE',17:'Proc. IEEE REW',18:'Proc. SoutheastCon',19:'Proc. CONISOFT',20:'Proc. AIRC',21:'Proc. Ivannikov ISPRAS',22:'Proc. FLLM',23:'Proc. IEEE MedAI',25:'Proc. IEEE/ACM AST'}
audit=['# Supplied-reference verification','', 'The active paper uses the 25 items supplied in ForgeWeb_25_IEEE_Papers.pdf, with publisher-deposited Crossref metadata used to resolve authors, years, venues, pages, and identifiers. IEEE Xplore direct pages were access-restricted. This is a bibliographic verification, not a claim to have read every full paper. Discussion is restricted to the research topics identified by the supplied summaries and records.','', '| PDF item / BibTeX key | Verified title | Publication year | Identifier |','|---|---|---|---|']
for r in data:
    assert 'error' not in r,r
    v=r['records'][0]
    i=r['id']; title=v['title'][0]; venue=v['container-title'][0]
    authors=v['author']; authors=authors if len(authors)<=6 else authors[:3]
    names=' and '.join(tex(a['family']+', '+a.get('given','')) for a in authors)
    if len(v['author'])>6: names+=' and others'
    year=v['published']['date-parts'][0][0]
    doi=v['DOI']; url='https://doi.org/'+doi
    if i==11:
        title='Assured LLM-Based Software Engineering'
        venue='Proc. IEEE/ACM 2nd Int. Workshop on Interpretability, Robustness, and Benchmarking in Neural Software Engineering (InteNSE)'
        url='https://ieeexplore.ieee.org/document/10669832'
        doi=''
    journal=v.get('type')=='journal-article'
    if not journal and i!=11:
        venue='Proc. '+re.sub(r'^20\d\d\s*','',venue)
        venue=venue.replace('International Conference','Int. Conf.').replace('International Requirements Engineering Conference','Int. Requirements Engineering Conf.').replace('International Workshop','Int. Workshop')
    fields={'author':names,'title':'{'+tex(title)+'}', 'journal' if journal else 'booktitle':tex(shortvenues.get(i,venue)),'year':str(year)}
    for src,dst in [('page','pages'),('volume','volume'),('issue','number')]:
        if v.get(src): fields[dst]=str(v[src]).replace('-','--') if src=='page' else str(v[src])
    if doi:
        fields['doi']=doi
        fields['note']='doi: '+doi
    else: fields['url']=url
    out.append('@'+('article' if journal else 'inproceedings')+'{ieee'+str(i)+',\n'+',\n'.join('  '+k+'={'+val+'}' for k,val in fields.items())+'\n}\n')
    audit.append(f'| {i} / ieee{i} | {title} | {year} | {url} |')
audit += ['', '## Corrections and version notes', '', '- Item 20: expanded the truncated title using the DOI record matching IEEE document 11077480.', '- Item 21: the proceedings year is 2024, although the supplied list labels it 2025.', '- Item 23: the proceedings year is 2023, outside the supplied cover date range.', '- Item 24: journal issue year 2024, volume 50(1), pages 85–105; its DOI was registered in 2023.', '- Item 11: IEEE indexes the title without “Offline”; the co-published ACM Crossref record includes “Offline.” The paper retains the supplied IEEE title and Xplore identifier, with the matching author/venue/page details. No mismatched DOI is printed.', '- No prior bibliography entries have been carried over. Every one of the supplied 25 is cited in the revised text.', '- These papers do not establish that ForgeWeb has trained or evaluated a local model. That integration remains explicitly proposed.']
(root/'references-ieee.bib').write_text('\n'.join(out),encoding='utf-8')
(root/'SUPPLIED_REFERENCE_AUDIT.md').write_text('\n'.join(audit)+'\n',encoding='utf-8')
print('Generated 25 reviewed bibliography records and audit.')
