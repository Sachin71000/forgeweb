from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
source=root/'presentation_sources/review2'
target=root/'ForgeWeb_Review_2_Editable_Source.zip'
with ZipFile(target,'w',ZIP_DEFLATED) as archive:
 for file in source.rglob('*'):
  if file.is_file() and '__pycache__' not in file.parts:archive.write(file,file.relative_to(root))
 template=Path('C:/Users/sachi/Downloads/7th sem Major Project PPT Template_review-2.pptx')
 archive.write(template,'template/'+template.name)
 archive.write(root/'ForgeWeb_Review_2_Template_Faithful.pptx','ForgeWeb_Review_2_Template_Faithful.pptx')
print(target)
