# ForgeWeb: revised IEEE-style paper (within five pages)

The final local-model revision is four pages including 26 references and three vector diagrams, within the requested five-page maximum. Author names have no superscript symbols. Standard IEEEtran margins and body font sizes are retained. The additional reference is the Code Llama research paper. Forced page breaks and restrictive float placement were removed to correct the column gap.

## Revised model scope

Gemini remains the planning/frontend provider. Backend generation is reframed as a proposed local, project-fine-tuned LLaMA-based model. This means adapting a pretrained checkpoint, not claiming foundation-model pretraining from scratch. No checkpoint, dataset size, hardware, training completion, or model benchmark result has been invented. Prior platform tests do not validate this proposed integration. Application code was not changed by this paper revision.

## Edit on Overleaf

Upload this ZIP as a new project. Select `main-5page.tex` as the main document and use pdfLaTeX. The bibliography and TikZ diagrams are included.

## Compile locally

```sh
pdflatex main-5page.tex
bibtex main-5page
pdflatex main-5page.tex
pdflatex main-5page.tex
```

Alternatively: `tectonic main-5page.tex`.

## Originality and attribution

The exposition has been rewritten around the project's implementation, with citations retained for research-derived ideas. Diagrams are original editable TikZ drawings. No external plagiarism/similarity checker has been run, and no similarity percentage or guaranteed pass is claimed. Bibliographic titles, institutional names, and standard technical terms may legitimately match other documents. Review the final paper under your institution's authorship, AI-assistance, and similarity-check policies before submission.

`REFERENCE_AUDIT.md` identifies the research sources. `EVIDENCE.md` explains the limits of the reported prototype tests. This is an IEEE-style manuscript, not an accepted IEEE publication.
