from copy import deepcopy
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.oxml.xmlchemy import OxmlElement

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('C:/Users/sachi/Downloads/7th sem Major Project PPT Template_review-2.pptx')
OUT=ROOT/'ForgeWeb_Review_2_Completed.pptx'
p=Presentation(SOURCE)
original=list(p.slides)
NAVY=RGBColor(27,49,76); TEAL=RGBColor(22,112,119); INK=RGBColor(25,25,25)

def text(shape,value,size=20,bold=False):
 f=shape.text_frame; f.clear(); f.word_wrap=True
 f.margin_left=f.margin_right=Inches(.04); f.margin_top=f.margin_bottom=Inches(.03)
 for i,line in enumerate(value.split('\n')):
  q=f.paragraphs[0] if i==0 else f.add_paragraph();q.text=line;q.space_after=Pt(6);q.line_spacing=1.12
  pr=q._p.get_or_add_pPr()
  for child in list(pr):
   if child.tag.endswith(('}buNone','}buChar','}buAutoNum','}buBlip')):pr.remove(child)
  default=pr.find('{http://schemas.openxmlformats.org/drawingml/2006/main}defRPr');pr.insert(list(pr).index(default) if default is not None else len(pr),OxmlElement('a:buNone'))
  for r in q.runs:r.font.name='Times New Roman';r.font.size=Pt(size);r.font.bold=bold;r.font.color.rgb=INK
 return f

def copy_slide(source):
 slide=p.slides.add_slide(source.slide_layout)
 for shape in list(slide.shapes):shape._element.getparent().remove(shape._element)
 for shape in source.shapes:
  el=deepcopy(shape._element)
  for node in el.iter():
   for key,value in list(node.attrib.items()):
    if key.endswith('}embed') or key.endswith('}link'):
     rel=source.part.rels.get(value)
     if rel:node.set(key,slide.part.relate_to(rel.target_ref if rel.is_external else rel.target_part,rel.reltype,rel.is_external))
  slide.shapes._spTree.insert_element_before(el,'p:extLst')
 if source._element.find('{http://schemas.openxmlformats.org/presentationml/2006/main}cSld').find('{http://schemas.openxmlformats.org/presentationml/2006/main}bg') is not None:
  slide._element.find('{http://schemas.openxmlformats.org/presentationml/2006/main}cSld').insert(0,deepcopy(source._element.find('{http://schemas.openxmlformats.org/presentationml/2006/main}cSld')[0]))
 return slide

def prepare(slide,title,body=''):
 shapes=[s for s in slide.shapes if s.has_text_frame]
 heading=shapes[0];heading.left=Inches(.5);heading.top=Inches(.35);heading.width=Inches(9);heading.height=Inches(.9)
 text(heading,title,28,True)
 box=shapes[1];box.left=Inches(.65);box.top=Inches(1.65);box.width=Inches(8.7);box.height=Inches(4.65)
 text(box,body)
 return box

slides=[]
def add(title,body='',base=3):
 s=copy_slide(original[base]);prepare(s,title,body);slides.append(s);return s

title=original[0];slides.append(title)
main=next(s for s in title.shapes if s.has_text_frame and 'PROJECT TITLE' in s.text)
text(main,'FORGEWEB\nAI-Assisted Full-Stack Web Application Generator\n\nPratyush Manas  (1BY23CS163)\nRajeev Kumar  (1BY23CS171)\nSachin Yash Raj  (1BY23CS192)\nSanaa Kumari  (1BY23CS202)\n\nB.E. • Computer Science and Engineering\nGuide name and designation: to be confirmed\nAcademic Year 2026–27',18)
main.top=Inches(1.85);main.height=Inches(4.7)
for q in main.text_frame.paragraphs:q.space_after=Pt(3)

add('CONTENTS','01  Overview: abstract, introduction and motivation\n02  Problem statement and objectives\n03  Methodology and system diagrams\n04  Algorithms and experimental setup\n05  Demonstration and result analysis\n06  SDG alignment and complex engineering problem\n07  Project management, finance and future work\n08  References and publication status')
add('ABSTRACT','ForgeWeb helps users turn a plain-language idea into a full-stack web application. It prepares requirements and an architecture file for approval before generating code.\nA schema-first pipeline connects React interfaces, FastAPI models and SQLite storage. Saved checkpoints protect completed work when generation stops.\nLocal checks compile the frontend and test API behavior and persistence. The aim is to make generation more dependable while clearly reporting what has and has not been verified.')
add('INTRODUCTION','• Full-stack development connects the interface, server logic and database.\n• AI can produce code quickly, but separate files may disagree about routes, fields or validation.\n• ForgeWeb provides an approval-led workflow for planning, generation, preview and inspection.\n• The current reliability target is React, Python FastAPI and SQLite.\n• The platform keeps project history and supports bounded, checkpoint-based recovery.')
add('MOTIVATION','• Students and small teams often spend substantial effort setting up repeated application foundations.\n• A generated page is useful only when its actions connect to working server behavior.\n• Failures should preserve progress rather than force users to restart.\n• Users need clear evidence of real saves, valid responses and durable data.\n• ForgeWeb combines faster prototyping with visible engineering checks.')
add('PROBLEM STATEMENT','Users need a practical way to build web applications from natural-language requirements without manually coordinating every interface, API and database detail. However, generated components can use inconsistent field names, incompatible category values or missing storage dependencies. A page may compile and still fail when a user submits a form.\nThe problem is therefore to create an approval-led generation workflow that preserves the user’s requirements, maintains a consistent full-stack contract, saves partial progress and verifies observable behavior before presenting the application as working.')
add('OBJECTIVES OF THE WORK','• Create a clear architecture file from the user’s requirements.\n• Generate source only after the proposed plan is approved.\n• Derive shared types and server models from one schema.\n• Connect React actions to FastAPI routes and persistent SQLite data.\n• Preserve checkpoints and support controlled recovery.\n• Test compilation, API workflows, validation and persistence.\n• Report failures and unverified behavior honestly.')
add('METHODOLOGY','1. Understand the prompt and prepare requirements and architecture.\n2. Ask the user to approve or revise the proposed plan.\n3. Freeze a machine-readable schema for routes and data models.\n4. Generate shared bindings, frontend pages and backend services.\n5. Save accepted files as durable checkpoints.\n6. Run isolated compilation, API and persistence checks.\n7. Show source, preview, version history and verification evidence.')

def label(slide,x,y,w,h,value,size=18,fill=None):
 shape=slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,Inches(x),Inches(y),Inches(w),Inches(h))
 shape.fill.solid();shape.fill.fore_color.rgb=fill or RGBColor(239,244,248);shape.line.color.rgb=TEAL
 f=text(shape,value,16);f.vertical_anchor=MSO_ANCHOR.MIDDLE
 for q in f.paragraphs:q.alignment=PP_ALIGN.CENTER;q.space_after=Pt(0)
 return shape
def arrow(slide,a,b):
 line=slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,Inches(a[0]),Inches(a[1]),Inches(b[0]),Inches(b[1]));line.line.color.rgb=TEAL;line.line.width=Pt(1.7)
 pr=line._element.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}ln');end=OxmlElement('a:tailEnd');end.set('type','triangle');pr.append(end)
def caption(s,value):
 box=s.shapes.add_textbox(Inches(.65),Inches(5.85),Inches(8.7),Inches(.65));text(box,value,16)
def diagram(title):
 s=add(title);body=[v for v in s.shapes if v.has_text_frame][1];body.text_frame.clear();return s

s=diagram('SYSTEM ARCHITECTURE')
for x,y,w,h,t in [(0.7,1.6,2.3,.9,'USER LAYER\nPrompt • approval • preview'),(3.6,1.6,2.8,.9,'FORGEWEB CONTROL PLANE\nWorkflow • versions • budget'),(7,1.6,2.3,.9,'DESIGN & MODEL SERVICES\nStitch reference • code model'),(.7,3.35,2.3,1,'SHARED CONTRACT\nSchema • types • HTTP helpers'),(3.6,3.35,2.8,1,'GENERATED APPLICATION\nReact → FastAPI → SQLite'),(7,3.35,2.3,1,'ISOLATED VERIFICATION\nCompile • API tests • restart')]:label(s,x,y,w,1.3,t,17)
for a,b in [((3,2.05),(3.6,2.05)),((6.4,2.05),(7,2.05)),((5,2.5),(5,3.35)),((3,3.85),(3.6,3.85)),((6.4,3.85),(7,3.85))]:arrow(s,a,b)
caption(s,'Model services generate source; the isolated application runs with its own persistent data.')
s=diagram('DATA FLOW DIAGRAM — LEVEL 0')
label(s,.7,2.5,2.1,1,'User\nRequirements / approval');label(s,3.6,2.2,2.8,1.6,'ForgeWeb\nPlan → generate → verify');label(s,7.2,2.5,2.1,1,'Project store\nSource / checkpoints')
arrow(s,(2.8,2.8),(3.6,2.8));arrow(s,(6.4,2.8),(7.2,2.8));arrow(s,(3.6,3.3),(2.8,3.3))
label(s,3.6,4.5,2.8,.7,'Preview + test evidence');arrow(s,(5,3.8),(5,4.5));caption(s,'Inputs become project artifacts; results return as inspectable source, preview and verification evidence.')
s=diagram('DATA FLOW DIAGRAM — LEVEL 1')
for x,t in [(.6,'1. Plan and\napprove'),(2.9,'2. Freeze schema\nand generate'),(5.2,'3. Execute\nchecks'),(7.5,'4. Preview /\nreport failure')]:label(s,x,2,1.9,1,t,18)
for x in [2.5,4.8,7.1]:arrow(s,(x,2.5),(x+.4,2.5))
label(s,1.2,4.1,3.3,.9,'Project SQLite store\nHistory • source • checkpoints');label(s,5.4,4.1,3.3,.9,'Generated-app SQLite\nUser records • transactions')
arrow(s,(3.85,3),(3,4.1));arrow(s,(6.15,3),(6.8,4.1));caption(s,'ForgeWeb project data and generated application records remain separate.')
s=diagram('SEQUENCE DIAGRAM — GENERATION')
xs=[1.25,3.65,6.05,8.45]
for x,t in zip(xs,['User','ForgeWeb','Model service','Verifier']):
 label(s,x-.8,1.55,1.6,.55,t,17);arrow(s,(x,2.2),(x,5.45))
for y,a,b,t in [(2.5,0,1,'Submit prompt'),(3,1,0,'Proposed plan'),(3.5,0,1,'Approve plan'),(4,1,2,'Request source'),(4.5,2,1,'Save checkpoints'),(5,1,3,'Run verification tests')]:
 arrow(s,(xs[a],y),(xs[b],y));box=s.shapes.add_textbox(Inches(min(xs[a],xs[b])+.05),Inches(y-.28),Inches(abs(xs[b]-xs[a])-.1),Inches(.28));text(box,t,14)
caption(s,'A failed stage keeps accepted files; continuation is bounded and preserves the approved plan.')
s=diagram('TRANSACTION DIAGRAM — SAVING DATA')
for x,y,t in [(.7,1.8,'Validate request'),(3.8,1.8,'Begin transaction'),(7,1.8,'Write related records'),(3.8,3.6,'Commit on success'),(.7,3.6,'Return confirmation'),(7,3.6,'Rollback on failure')]:label(s,x,y,2.2,.8,t,18)
for a,b in [((2.9,2.2),(3.8,2.2)),((6,2.2),(7,2.2)),((8.1,2.6),(8.1,3.6)),((7,2.6),(6,3.6)),((3.8,4),(2.9,4))]:arrow(s,a,b)
caption(s,'Related writes share one connection. Success is returned only after commit; failures must not leave partial data.')
add('ALGORITHMS USED','• Schema validation checks types, references and routes before generation.\n• Deterministic bindings create matching TypeScript and Python models.\n• Checkpoint recovery reuses accepted files after an interruption.\n• Workflow verification checks responses and persistent data.\n• Graph retrieval selects relevant code for scoped reviews and edits.\n• Budget checks stop requests that cannot fit the approved allowance.')
add('EXPERIMENTAL SETUP','Software\nReact and TypeScript; Python FastAPI; SQLite; Docker; Playwright; local Graphify.\nHardware\nIntel Core i7-11800H, 16 GB RAM and NVIDIA RTX 3050 Ti laptop GPU.\nTest environment\nIsolated containers, disposable test databases and synthetic records. External generation uses server-side credentials; secrets are excluded from source and exports.')
s=add('DEMONSTRATION — GENERATED APPLICATION','')
body=[v for v in s.shapes if v.has_text_frame][1];body.text_frame.clear()
images=Path('C:/Users/sachi/.codex/visualizations/2026/08/10/019fed26-35d5-78d1-b331-081ed48b9d21')
from PIL import Image
for filename,x,y,w,h in [('pockettrack-desktop.png',.65,1.65,6.1,3.65),('pockettrack-mobile.png',7.05,1.65,2,3.65)]:
 path=images/filename
 if path.exists():
  im=Image.open(path);ratio=min(w/im.width,h/im.height);s.shapes.add_picture(str(path),Inches(x+(w-im.width*ratio)/2),Inches(y),width=Inches(im.width*ratio),height=Inches(im.height*ratio))
caption(s,'PocketTrack: real API-connected expense forms, calculated totals and mobile layout. Demonstration from a repaired project—not a fresh autonomous build.')
add('RESULT ANALYSIS — TEST CASES','• Contract tests reject mismatched enums, routes and request models.\n• CRUD tests check real create, read, update and delete behavior.\n• Input tests reject invalid values and undeclared fields.\n• Transaction tests check rollback and concurrent writes.\n• Restart tests distinguish SQLite persistence from in-memory state.\n• Recovery and export tests protect accepted work and reject invalid versions.\nEvidence: local suites and isolated fixtures passed; fresh paid model generation remains unverified.')
add('RESULT ANALYSIS — OBSERVATIONS','What improved\nShared bindings reduce inconsistent data definitions. Checkpoints retain progress. Business-route tests catch failures hidden by a healthy startup.\nWhat the evidence does not prove\nPassing local fixtures does not guarantee every future prompt will succeed. API workflow checks do not replace browser tests for every interface.\nCurrent boundary\nThe supported schema subset and direct Sol path are implemented; further live acceptance requires a controlled, approved run.')
add('SDG ALIGNMENT','SDG 4 — Quality Education\nSupports learning by making architecture, code and test evidence visible to students.\nSDG 9 — Industry, Innovation and Infrastructure\nExplores reusable application foundations and more dependable software prototyping.\nAssessment boundary\nThese are qualitative project links, not measured social-impact claims. Department-specific SDG scoring metrics were not supplied and must be confirmed before submission.')
add('COMPLEX ENGINEERING PROBLEM','• Reconcile an open-ended prompt with a precise, executable contract.\n• Coordinate independently generated UI, API and persistence code.\n• Balance output limits, response time, test coverage and API cost.\n• Preserve state when models, storage or runtimes fail.\n• Isolate generated code while still providing a usable live preview.\n• Distinguish convincing output from evidence of correct behavior.')
add('PROJECT MANAGEMENT AND FINANCE','Completed phases\nRequirement-led planning; generation and project history; SQLite persistence; checkpoint recovery; schema bindings; local verification gates.\nCurrent focus\nControlled acceptance testing of fresh generation and broader UI scenarios.\nResources and cost control\nTeam development effort and existing laptop hardware. Hosted model use follows an explicit test allowance; local guards stop requests that cannot fit. No commercial deployment budget is claimed.')
add('CONCLUSION AND FUTURE WORK','ForgeWeb connects planning, code generation and observable verification in one workflow. The key lesson is that a good-looking interface and valid source are not enough: the complete data flow must work.\nNext steps\nRun bounded fresh-generation acceptance tests; broaden independent browser scenarios; improve supported schema coverage and performance measurements. Additional stacks remain future work.\nA universal or 100% generation-success claim is not supported by current evidence.')
add('REFERENCES — IEEE STYLE','[1] M. Chen et al., “Evaluating Large Language Models Trained on Code,” arXiv:2107.03374, 2021.\n[2] Y. Li et al., “Competition-level code generation with AlphaCode,” Science, vol. 378, no. 6624, pp. 1092–1097, 2022.\n[3] B. Rozière et al., “Code Llama: Open Foundation Models for Code,” arXiv:2308.12950, 2023.\n[4] J. Liu et al., “Is Your Code Generated by ChatGPT Really Correct? Rigorous Evaluation of Large Language Models for Code Generation,” NeurIPS, 2023.')
add('PUBLICATIONS AND REPORT STATUS','• A project research-paper draft and LaTeX source have been prepared in earlier project work.\n• No journal acceptance, conference acceptance or indexing status has been verified.\n• Publication venue and submission details must be confirmed by the team.\n• Replace all pending academic details before final submission.\n• Presentation wording is original and project-specific; no plagiarism-detector score is claimed.')

# Keep the actual template parts and order the selected originals/clones; never overwrite input.
ids=p.slides._sldIdLst
for el in list(ids):
 if el.rId not in [p.part.relate_to(sl.part,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide') for sl in slides]:
  p.part.drop_rel(el.rId);ids.remove(el)
for sl in slides:
 el=next(v for v in ids if p.part.related_part(v.rId)==sl.part);ids.remove(el);ids.append(el)
for n,sl in enumerate(slides):
 for shape in sl.shapes:
  if not shape.has_text_frame:continue
  if shape.shape_id==2 and 'Dept. of CSE' in shape.text:
   shape.top=Inches(7.1);text(shape,shape.text,11)
  if shape.shape_id==3 and n>0:
   shape.left=Inches(8.8);shape.top=Inches(6.75);shape.width=Inches(.7);text(shape,str(n),12)
  if shape.shape_id==4 and n>0:text(shape,'Major Project Phase 2 • Review 2',11)
  if n==0 and shape.text=='0':text(shape,'',11)
p.save(OUT)
print(OUT);print('Slides:',len(p.slides))
