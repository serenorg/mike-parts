<!-- ABOUTME: What mike-parts is, where each part comes from and under which license. -->
<!-- ABOUTME: Also how to rebuild the two command-line tools in dist/. -->
# mike-parts

Seren's copies of a few useful parts of [Mike](https://github.com/open-legal-products/mike),
an open-source legal AI app, and how to rebuild them. Seren's Employees use these
parts without running Mike itself.

`mike-parts.yaml` lists every part with its upstream repository, path and commit.
Each copy sits at the same path under a folder named for its repository
(`mike/` or `mike-workflows/`) and is kept unchanged, so a newer upstream commit
can be copied over it and compared.

## Parts and their licenses

| Part | From | License |
|---|---|---|
| `mike/backend/src/lib/docxTrackedChanges.ts`: writes edits into a Word file as tracked changes | `open-legal-products/mike` | AGPL-3.0 |
| `mike/backend/src/modules/chat/engine/verifyCitations.ts`: checks that a quote appears word for word in its source | `open-legal-products/mike` | AGPL-3.0 |
| `mike-workflows/assistant-workflows/`: `compare-documents`, `draft-from-template`, `extract-key-terms`, `in-their-own-words`, `issues-list-draft`, `proofread`, `verity-the-hallucination-audit`, `legal-verification-pack/opposing-counsel-attack`, `legal-verification-pack/output-scoring` | `open-legal-products/mike-workflows` | MIT (`mike-workflows/LICENSE`) |

This repository as a whole, including the tools built from Mike's code, is
under the AGPL-3.0 (`LICENSE`).
