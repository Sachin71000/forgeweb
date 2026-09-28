# ForgeWeb — supplied IEEE-reference revision

The compiled paper is four pages, including all 25 references supplied in `ForgeWeb_25_IEEE_Papers.pdf` and three editable diagrams. The introduction and literature review have been rewritten to cite those references; the old 26-entry bibliography is not used.

## LaTeX

Upload the ZIP to Overleaf and select `main-5page.tex` as the main document. Use pdfLaTeX. The filename refers to the five-page maximum, not the final page count.

Local commands:

```sh
pdflatex main-5page.tex
bibtex main-5page
pdflatex main-5page.tex
pdflatex main-5page.tex
```

Alternatively, run `tectonic main-5page.tex`.

## Bibliography and scope

`references-ieee.bib` contains the 25 replacement entries. Conference names are abbreviated in the PDF; full publication records and corrections are documented in `SUPPLIED_REFERENCE_AUDIT.md` and `ieee-metadata.json`. Reference numbers follow first citation order, not the ordering of the supplied PDF.

The local LLaMA-based backend generator remains proposed, not presented as a completed training experiment. Gemini remains in the planning/frontend path. Names have no superscript symbols. The reported platform checks are earlier baseline results, not local-model evaluation.

No similarity score or guaranteed plagiarism-test pass is claimed. The revised prose has not undergone an institutional similarity check. This is an IEEE-style manuscript, not an accepted IEEE publication.
