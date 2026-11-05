#!/usr/bin/env bash
# ABOUTME: Rebuilds dist/, confirms it matches what is committed, then runs both tools on Node 22 with small real inputs.
# ABOUTME: Passes only if the .docx gets one tracked insertion and a real quote passes while a planted fake fails.
set -euo pipefail
cd "$(dirname "$0")/.."
committed="$(mktemp -d)"
cp dist/*.js "$committed/"
scripts/build.sh >/dev/null
for f in "$committed"/*.js; do
  cmp -s "$f" "dist/$(basename "$f")" || { echo "dist/$(basename "$f") differs from a fresh build; run npm run build and commit dist/" >&2; exit 1; }
done
rm -rf "$committed"

if [[ "$(node --version)" == v22.* ]]; then NODE22=(node); else NODE22=(npx --yes node@22); fi
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# Copy the tools away from node_modules so the check proves each bundle runs on its own.
cp dist/docx-tracked-changes.js dist/verify-quotes.js "$work/"
echo "Node for the tools: $("${NODE22[@]}" --version)"

# A small Word file with made-up text, built from scratch with jszip.
node -e '
const JSZip = require("jszip");
const zip = new JSZip();
zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">The Husband shall pay child support to the Wife each month.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
zip.generateAsync({ type: "nodebuffer" }).then((bytes) => process.stdout.write(JSON.stringify({
  docx_base64: bytes.toString("base64"),
  author: "Check",
  edits: [{ find: "each month", replace: "on the first day of each month", context_before: "to the Wife ", context_after: "." }],
})));
' > "$work/docx-in.json"
"${NODE22[@]}" "$work/docx-tracked-changes.js" < "$work/docx-in.json" > "$work/docx-out.json"
node -e '
const JSZip = require("jszip");
const out = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
if (out.errors.length) throw new Error("edit errors: " + JSON.stringify(out.errors));
if (out.changes.length !== 1) throw new Error("expected 1 change, got " + out.changes.length);
JSZip.loadAsync(Buffer.from(out.docx_base64, "base64")).then((zip) => zip.file("word/document.xml").async("string")).then((xml) => {
  const ins = xml.match(/<w:ins\b[\s\S]*?<\/w:ins>/g) || [];
  if (ins.length !== 1) throw new Error("expected one tracked insertion, got " + ins.length + ": " + xml);
  const text = (ins[0].match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("");
  if (!text.includes("on the first day of")) throw new Error("insertion text wrong: " + text);
  console.log("docx-tracked-changes: one tracked insertion: " + JSON.stringify(text));
});
' "$work/docx-out.json"

# A real quote must pass and a planted fake must fail.
cat > "$work/quotes-in.json" <<'JSON'
{"source": "Section 3. The parties shall divide the marital home equally.\nSection 4. Each party keeps the vehicle titled in that party's name.",
 "quotes": ["The parties shall divide the marital home equally.", "The Wife shall receive the marital home in full."]}
JSON
"${NODE22[@]}" "$work/verify-quotes.js" < "$work/quotes-in.json" > "$work/quotes-out.json"
node -e '
const { results } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
if (results.length !== 2) throw new Error("expected 2 results");
if (results[0].verified !== true || results[0].needs_correction !== false) throw new Error("real quote did not pass: " + JSON.stringify(results[0]));
if (results[1].verified !== false) throw new Error("planted fake passed: " + JSON.stringify(results[1]));
console.log("verify-quotes: real quote passed, planted fake failed");
' "$work/quotes-out.json"
echo "check passed"
