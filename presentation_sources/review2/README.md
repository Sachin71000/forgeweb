# ForgeWeb review 2 — editable presentation source

This rebuild uses the supplied college template, not a replacement theme.

## Included

- `build_presentation.py`: complete local authoring script.
- `content.json`: editable presentation text.
- `diagrams/*.svg`: diagram sources for architecture, DFD context/level 1, sequence and transaction flow.
- `assets/`: real project demonstration screenshots.
- The PPT itself contains editable native shapes, connectors and diagram labels, not flattened diagram screenshots.

## Rebuild

Requirements: Python 3.10+, python-pptx and Pillow. The template's fonts should be installed: Arial Black, Roboto, Century Schoolbook and Arial. Font substitution on another computer can change wrapping.

From the extracted source bundle root:

```powershell
python -m pip install python-pptx Pillow
python presentation_sources/review2/build_presentation.py --template "template/7th sem Major Project PPT Template_review-2.pptx" --output "ForgeWeb_Review_2_Template_Faithful.pptx"
```

No API credentials, hosted generation or paid model calls are needed.

## Template preservation

Original white canvas, logos, slide size, slide master/layouts, theme XML, red/black edge decoration, footer and page-number geometry are retained. Body slides normalize the template's own predominant typography: Arial Black 36 pt red headings, Roboto 20 pt black body, Roboto 15 pt diagram nodes and 13–16 pt diagram annotations. Cover retains Century Schoolbook. The template has mixed fonts/sizes originally; this normalization is explicit and does not introduce a new font family or theme.

PowerPoint rendering and body/diagram overflow measurement were completed for the final deck. Original theme XML is also compared byte-for-byte during generation. Unknown guide details remain explicitly pending. Publication acceptance and universal generation accuracy are not claimed.

This package is presentation-generation source, not a replacement for ForgeWeb's application source repository. The original supplied template is included for reproducibility and is not overwritten.
