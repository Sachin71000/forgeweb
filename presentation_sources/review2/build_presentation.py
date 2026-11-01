"""Local, template-faithful ForgeWeb deck. No hosted generation or API calls."""
from pathlib import Path
from copy import deepcopy
import json, argparse, zipfile, hashlib
from html import escape
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.oxml.xmlchemy import OxmlElement

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--template',type=Path,default=Path('C:/Users/sachi/Downloads/7th sem Major Project PPT Template_review-2.pptx'));parser.add_argument('--output',type=Path,default=ROOT/'ForgeWeb_Review_2_Template_Faithful.pptx');args=parser.parse_args()
RED='D1282E'; BLACK='000000'; GRAY='545454'; PALE='FBEAEB'; WHITE='FFFFFF'
deck=Presentation(args.template);template_slides=list(deck.slides)
content_path=HERE/'content.json'
if not content_path.exists():
 previous=Presentation(ROOT/'ForgeWeb_Review_2_Completed.pptx')
 content=[{'title':list(s.shapes)[0].text,'body':list(s.shapes)[1].text} for s in list(previous.slides)[1:]]
 content_path.write_text(json.dumps(content,ensure_ascii=False,indent=2),encoding='utf8')
content=json.loads(content_path.read_text(encoding='utf8'))

def clone(source):
 s=deck.slides.add_slide(source.slide_layout)
 for shape in list(s.shapes):shape._element.getparent().remove(shape._element)
 for shape in source.shapes:
  el=deepcopy(shape._element)
  for node in el.iter():
   for attr,value in list(node.attrib.items()):
    if attr.endswith(('}embed','}link')):
     rel=source.part.rels.get(value)
     if rel:node.set(attr,s.part.relate_to(rel.target_ref if rel.is_external else rel.target_part,rel.reltype,rel.is_external))
  s.shapes._spTree.insert_element_before(el,'p:extLst')
 return s

def write(shape,value,size=20,font='Roboto',color=BLACK,bold=False,align=PP_ALIGN.LEFT,spacing=7):
 f=shape.text_frame;f.clear();f.word_wrap=True;f.margin_left=f.margin_right=Inches(.03);f.margin_top=f.margin_bottom=Inches(.03);f.vertical_anchor=MSO_ANCHOR.TOP
 for i,line in enumerate(value.split('\n')):
  q=f.paragraphs[0] if i==0 else f.add_paragraph();q.alignment=align;q.space_before=Pt(0);q.space_after=Pt(spacing);q.line_spacing=1.08
  pr=q._p.get_or_add_pPr()
  for child in list(pr):
   if child.tag.endswith(('}buNone','}buChar','}buAutoNum','}buBlip')):pr.remove(child)
  default=pr.find('{http://schemas.openxmlformats.org/drawingml/2006/main}defRPr');pr.insert(list(pr).index(default) if default is not None else len(pr),OxmlElement('a:buNone'))
  r=q.add_run();r.text=line;r.font.name=font;r.font.size=Pt(size);r.font.bold=bold;r.font.color.rgb=RGBColor.from_string(color)
 return shape

def textbox(s,x,y,w,h,t,size=20,color=BLACK,bold=False,align=PP_ALIGN.LEFT,font='Roboto'):
 return write(s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h)),t,size,font,color,bold,align)

def base(title):
 s=clone(template_slides[3]);heading=s.shapes[0];heading.width=Inches(9);heading.top=Inches(.62);heading.height=Inches(.85)
 write(heading,title,36,'Arial Black',RED,spacing=0)
 body=s.shapes[1];body.left=Inches(.6);body.top=Inches(1.85);body.width=Inches(8.7);body.height=Inches(4.6);body.text_frame.clear()
 return s,body

class Drawing:
 def __init__(self,s,name):self.s=s;self.name=name;self.svg=[]
 def box(self,x,y,w,h,title,detail='',kind='round',dark=False):
  if kind=='data':h=max(h,1.0)
  mapping={'round':MSO_SHAPE.ROUNDED_RECTANGLE,'rect':MSO_SHAPE.RECTANGLE,'process':MSO_SHAPE.OVAL,'data':MSO_SHAPE.CAN,'decision':MSO_SHAPE.DIAMOND}
  shape=self.s.shapes.add_shape(mapping[kind],Inches(x),Inches(y),Inches(w),Inches(h));shape.fill.solid();shape.fill.fore_color.rgb=RGBColor.from_string(RED if dark else PALE if kind!='data' else 'F0F0F0');shape.line.color.rgb=RGBColor.from_string(RED if kind!='data' else GRAY);shape.line.width=Pt(1.2)
  text=title+('\n'+detail if detail else '');write(shape,text,15,'Roboto',WHITE if dark else BLACK,False,PP_ALIGN.CENTER,0);shape.text_frame.vertical_anchor=MSO_ANCHOR.MIDDLE
  if kind=='data':shape.text_frame.margin_top=Inches(.2)
  fill=RED if dark else PALE if kind!='data' else 'F0F0F0'
  style=f'fill="#{fill}" stroke="#{RED}"'
  if kind=='process':self.svg.append(f'<ellipse cx="{(x+w/2)*120}" cy="{(y+h/2)*120}" rx="{w*60}" ry="{h*60}" {style}/>')
  elif kind=='decision':self.svg.append(f'<polygon points="{(x+w/2)*120},{y*120} {(x+w)*120},{(y+h/2)*120} {(x+w/2)*120},{(y+h)*120} {x*120},{(y+h/2)*120}" {style}/>')
  elif kind=='data':self.svg.append(f'<path d="M {x*120},{y*120+12} a {w*60},12 0 0 1 {w*120},0 v {h*120-24} a {w*60},12 0 0 1 {-w*120},0 Z M {x*120},{y*120+12} a {w*60},12 0 0 0 {w*120},0" {style}/>')
  else:self.svg.append(f'<rect x="{x*120}" y="{y*120}" width="{w*120}" height="{h*120}" rx="{12 if kind=="round" else 0}" {style}/>')
  for i,line in enumerate(text.split('\n')):self.svg.append(f'<text x="{(x+w/2)*120}" y="{(y+h/2)*120+(i-(len(text.split(chr(10)))-1)/2)*23}" text-anchor="middle" fill="#{WHITE if dark else BLACK}" font-family="Roboto" font-size="20">{escape(line)}</text>')
  return shape
 def edge(self,points,label='',label_xy=None,dashed=False):
  for i,(a,b) in enumerate(zip(points,points[1:])):
   line=self.s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,Inches(a[0]),Inches(a[1]),Inches(b[0]),Inches(b[1]));line.line.color.rgb=RGBColor.from_string(GRAY);line.line.width=Pt(1.5)
   pr=line._element.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}ln')
   if dashed:
    dash=OxmlElement('a:prstDash');dash.set('val','dash');pr.append(dash)
   if i==len(points)-2 and not dashed:
    end=OxmlElement('a:tailEnd');end.set('type','triangle');pr.append(end)
  self.svg.append('<polyline points="'+' '.join(f'{x*120},{y*120}' for x,y in points)+f'" fill="none" stroke="#{GRAY}" stroke-width="2" '+('stroke-dasharray="7 5"' if dashed else 'marker-end="url(#arrow)"')+'/>')
  if label:
   x,y=label_xy or ((points[0][0]+points[-1][0])/2-.65,(points[0][1]+points[-1][1])/2-.25)
   textbox(self.s,x,y,2,.35,label,13,GRAY)
   self.svg.append(f'<text x="{x*120}" y="{(y+.15)*120}" font-family="Roboto" font-size="17">{escape(label)}</text>')
 def band(self,x,y,w,h,label):
  q=self.s.shapes.add_shape(MSO_SHAPE.RECTANGLE,Inches(x),Inches(y),Inches(w),Inches(h));q.fill.background();q.line.color.rgb=RGBColor.from_string('BFBFBF');q.line.width=Pt(.7)
  textbox(self.s,x+.12,y+.06,w-.24,.3,label,14,RED,True)
  self.svg.append(f'<rect x="{x*120}" y="{y*120}" width="{w*120}" height="{h*120}" fill="none" stroke="#BFBFBF"/><text x="{(x+.12)*120}" y="{(y+.25)*120}" font-size="18" font-family="Roboto" fill="#{RED}">{escape(label)}</text>')
 def save(self):
  folder=HERE/'diagrams';folder.mkdir(exist_ok=True)
  (folder/(self.name+'.svg')).write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 Z" fill="#545454"/></marker></defs>'+''.join(self.svg)+'</svg>',encoding='utf8')

selected=[template_slides[0]]
cover=selected[0];main=next(s for s in cover.shapes if s.has_text_frame and 'PROJECT TITLE' in s.text)
write(main,'FORGEWEB\nSchema-First AI Web Application Generator\n\nPratyush Manas  •  1BY23CS163\nRajeev Kumar  •  1BY23CS171\nSachin Yash Raj  •  1BY23CS192\nSanaa Kumari  •  1BY23CS202\n\nB.E. — Computer Science and Engineering\nGuide name / designation: to be confirmed\n2026–27',18,'Century Schoolbook',BLACK,False,PP_ALIGN.CENTER,3)
main.top=Inches(2.05);main.height=Inches(4.4)
for r in main.text_frame.paragraphs[0].runs:r.font.size=Pt(28);r.font.bold=True;r.font.color.rgb=RGBColor.from_string(RED)

for item in content:
 title=item['title'];body=item['body'];short={'DEMONSTRATION — GENERATED APPLICATION':'PROJECT DEMONSTRATION','RESULT ANALYSIS — TEST CASES':'TEST CASES','RESULT ANALYSIS — OBSERVATIONS':'RESULT ANALYSIS','SEQUENCE DIAGRAM — GENERATION':'SEQUENCE DIAGRAM','TRANSACTION DIAGRAM — SAVING DATA':'TRANSACTION FLOW','PROJECT MANAGEMENT AND FINANCE':'MANAGEMENT & FINANCE','PUBLICATIONS AND REPORT STATUS':'PUBLICATION STATUS','DATA FLOW DIAGRAM — LEVEL 0':'DFD — CONTEXT LEVEL','DATA FLOW DIAGRAM — LEVEL 1':'DFD — LEVEL 1','COMPLEX ENGINEERING PROBLEM':'ENGINEERING CHALLENGES','CONCLUSION AND FUTURE WORK':'CONCLUSION & FUTURE WORK'}
 s,box=base(short.get(title,title));selected.append(s)
 if title=='SYSTEM ARCHITECTURE':
  d=Drawing(s,'architecture');d.band(.55,1.7,8.75,1.1,'USER LAYER');d.box(.8,2.05,2.1,.55,'Prompt + approval');d.box(3.5,2.05,2.7,.55,'Files • preview • history');d.box(6.9,2.05,2.1,.55,'Budget / status')
  d.band(.55,3.05,5.4,2.6,'FORGEWEB CONTROL PLANE');d.box(.8,3.5,2.1,.75,'Schema stage','Models + routes',dark=True);d.box(3.45,3.5,2.2,.75,'Typed bindings','TS client + Pydantic');d.box(.8,4.7,2.1,.65,'Code generation','Bounded file tasks');d.box(3.45,4.7,2.2,.65,'Verification gate','Compile + API checks',dark=True)
  d.band(6.15,3.05,3.15,2.6,'ISOLATED GENERATED APP');d.box(6.5,3.5,2.45,.55,'React → FastAPI');d.box(6.8,4.55,1.85,.85,'SQLite','Application records','data')
  d.edge([(1.85,2.6),(1.85,3.5)]);d.edge([(2.9,3.88),(3.45,3.88)]);d.edge([(1.85,4.25),(1.85,4.7)]);d.edge([(2.9,5.03),(3.45,5.03)]);d.edge([(5.65,5.03),(6.25,5.03),(6.25,3.78),(6.5,3.78)]);d.edge([(7.72,4.05),(7.72,4.55)])
  textbox(s,.7,5.95,8.5,.7,'Provider/design services supply reference and source. Checkpoints and graphs stay project-scoped.',16,GRAY);d.save()
 elif title=='DATA FLOW DIAGRAM — LEVEL 0':
  d=Drawing(s,'dfd-context');d.box(.65,2.2,1.9,1,'USER','Prompt / approval','rect');d.box(3.75,2.25,2.6,1.6,'0. FORGEWEB','Plan • build • verify','process',True);d.box(7.55,2.2,1.65,1.25,'MODEL / DESIGN','Source / reference','rect');d.box(3.75,4.95,2.6,.9,'D1: PROJECT STORE','Files • versions • evidence','data')
  d.edge([(2.55,2.5),(3.75,2.5)],'Requirements',(2.55,2.1));d.edge([(3.75,3.4),(2.9,3.4),(2.9,2.95),(2.55,2.95)],'Artifacts / status',(.8,3.65));d.edge([(6.35,2.5),(7.55,2.5)],'Bounded tasks',(6.35,2.05));d.edge([(7.55,3),(7,3),(7,3.5),(6.35,3.5)],'Generated files',(7.1,3.6));d.edge([(4.45,3.85),(4.45,4.95)],'Save',(3.7,4.3));d.edge([(5.65,4.95),(5.65,3.85)],'Recover',(5.75,4.3));d.save()
 elif title=='DATA FLOW DIAGRAM — LEVEL 1':
  d=Drawing(s,'dfd-level1')
  for x,n,t in [(.65,'1','Plan & approve'),(3.2,'2','Freeze contract'),(5.75,'3','Generate source')]:d.box(x,2,2.1,.85,n+'. '+t,'','process')
  d.box(5.75,4.15,2.1,.85,'4. Verify','API + persistence','process',True);d.box(.65,4.05,2.1,1.2,'5. Present results','Preview / failure','process');d.box(3.2,5.5,2.1,.7,'D1: Checkpoints','','data');d.box(7.55,5.5,1.65,.7,'D2: App data','','data')
  d.edge([(2.75,2.43),(3.2,2.43)]);d.edge([(5.3,2.43),(5.75,2.43)]);d.edge([(6.8,2.85),(6.8,4.15)],'Accepted files',(7,3.25));d.edge([(5.75,4.58),(2.75,4.58)],'Evidence / errors',(3.35,4.1));d.edge([(4.25,2.85),(4.25,5.5)],'Frozen state',(4.35,3.3));d.edge([(6.8,5),(6.8,5.85),(7.55,5.85)]);d.edge([(3.2,5.85),(1.7,5.85),(1.7,5)],'Restore',(.65,5.75));d.save()
 elif title=='SEQUENCE DIAGRAM — GENERATION':
  d=Drawing(s,'sequence');xs=[1.05,3.25,5.45,7.65,9.05]
  for x,name in zip(xs,['User','Workflow','Model','Verifier','SQLite']):
   d.box(x-.55,1.8,1.1,.5,name);d.edge([(x,2.35),(x,6.1)],dashed=True)
  for x,y,h in [(3.25,2.65,3.25),(5.45,3.85,.4),(7.65,5.05,.4),(9.05,4.65,.28)]:
   active=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,Inches(x-.04),Inches(y),Inches(.08),Inches(h));active.fill.solid();active.fill.fore_color.rgb=RGBColor.from_string(PALE);active.line.color.rgb=RGBColor.from_string(RED)
  events=[(2.65,0,1,'1  Prompt'),(3.05,1,0,'2  Proposed plan'),(3.45,0,1,'3  Approve'),(3.85,1,2,'4  Schema / source'),(4.25,2,1,'5  Complete files'),(4.65,1,4,'6  Save checkpoints'),(5.05,1,3,'7  Run workflows'),(5.45,3,1,'8  Evidence'),(5.9,1,0,'9  Preview / failure')]
  for y,a,b,t in events:d.edge([(xs[a],y),(xs[b],y)],t,(min(xs[a],xs[b])+.06,y-.26))
  d.save()
 elif title=='TRANSACTION DIAGRAM — SAVING DATA':
  d=Drawing(s,'transaction');d.box(.7,2.05,2,.7,'Validate payload');d.box(3.5,2.05,2.2,.7,'BEGIN IMMEDIATE',dark=True);d.box(6.6,2.05,2.2,.7,'Write + audit','Same connection');d.box(6.6,3.45,2.2,1.1,'All writes\nsuccessful?','','decision');d.box(3.5,4.8,2.2,.75,'COMMIT','Confirm save',dark=True);d.box(6.6,4.8,2.2,.75,'ROLLBACK','Safe error');d.box(.7,4.8,2,.75,'Return success','After commit')
  d.edge([(2.7,2.4),(3.5,2.4)]);d.edge([(5.7,2.4),(6.6,2.4)]);d.edge([(7.7,2.75),(7.7,3.45)]);d.edge([(6.6,4),(4.6,4),(4.6,4.8)],'Yes',(5,3.6));d.edge([(7.7,4.55),(7.7,4.8)],'No',(8,4.45));d.edge([(3.5,5.18),(2.7,5.18)]);textbox(s,.7,6,8.4,.4,'Invariant: related records are saved together, or none of the changes are retained.',16,GRAY);d.save()
 elif title=='DEMONSTRATION — GENERATED APPLICATION':
  image_dir=HERE/'assets';image_dir.mkdir(exist_ok=True)
  src=Path('C:/Users/sachi/.codex/visualizations/2026/08/10/019fed26-35d5-78d1-b331-081ed48b9d21')
  from PIL import Image
  for name,x,y,w,h in [('pockettrack-desktop.png',.6,1.85,6.5,3.8),('pockettrack-mobile.png',7.3,1.85,1.9,3.8)]:
   asset=image_dir/name
   if not asset.exists() and (src/name).exists():asset.write_bytes((src/name).read_bytes())
   if asset.exists():
    im=Image.open(asset);ratio=min(w/im.width,h/im.height);s.shapes.add_picture(str(asset),Inches(x+(w-im.width*ratio)/2),Inches(y),width=Inches(im.width*ratio),height=Inches(im.height*ratio))
  textbox(s,.6,5.95,8.6,.65,'PocketTrack: desktop and mobile views from the tested, repaired demonstration project.',16,GRAY)
 elif title=='CONTENTS':
  for i,(a,b) in enumerate([('01','Overview & objectives'),('02','Methodology & diagrams'),('03','Algorithms & setup'),('04','Demonstration & results'),('05','Engineering & management'),('06','Conclusion & references')]):
   x=.65+(i%2)*4.5;y=1.95+(i//2)*1.4
   textbox(s,x,y,.7,.6,a,28,RED,True);textbox(s,x+.85,y+.03,3.4,.85,b,21)
 elif title in ['OBJECTIVES OF THE WORK','MOTIVATION','COMPLEX ENGINEERING PROBLEM']:
  lines=[x.strip('• ') for x in body.split('\n') if x.strip()]
  for i,line in enumerate(lines):
   y=1.85+i*.68;textbox(s,.65,y,.45,.4,f'{i+1:02}',17,RED,True);desc=textbox(s,1.25,y,7.9,.66,line,20)
   for q in desc.text_frame.paragraphs:q.space_after=Pt(0);q.line_spacing=1.0
 elif title=='PROJECT MANAGEMENT AND FINANCE':
  write(box,'Completed work\nPlanning, source generation, SQLite storage, checkpoint recovery and verification gates.\nCurrent work\nFresh-generation acceptance and wider browser scenarios.\nResources and controls\nExisting team hardware and open-source tools. Model calls follow an approved allowance; the local budget guard stops requests that cannot fit.',20)
 else:
  write(box,body,20)

# Retain exact original logos, white canvas, red/black edge decoration and footer geometry.
ids=deck.slides._sldIdLst
keep={deck.part.relate_to(s.part,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide') for s in selected}
for el in list(ids):
 if el.rId not in keep:deck.part.drop_rel(el.rId);ids.remove(el)
for n,s in enumerate(selected):
 el=next(el for el in ids if deck.part.related_part(el.rId)==s.part);ids.remove(el);ids.append(el)
 if n:
  number=s.shapes[3]
  for node in number._element.iter():
   if node.tag.endswith('}t'):node.text=str(n)
args.output.parent.mkdir(parents=True,exist_ok=True);deck.save(args.output)
# Theme must remain byte-identical to the supplied template.
with zipfile.ZipFile(args.template) as a,zipfile.ZipFile(args.output) as b:
 for name in a.namelist():
  if name.startswith('ppt/theme/') and name.endswith('.xml'):assert a.read(name)==b.read(name),name
print(args.output);print('Theme XML unchanged; all diagrams are editable native PowerPoint shapes.')
