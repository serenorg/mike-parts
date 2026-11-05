// ABOUTME: Command-line tool that writes edits into a .docx as Word tracked changes, using Mike's applyTrackedEdits.
// ABOUTME: Stdin {docx_base64, edits: [{find, replace, context_before, context_after, reason?}], author?}; stdout {docx_base64, changes, errors}.

import { applyTrackedEdits, type EditInput } from "../mike/backend/src/lib/docxTrackedChanges";
import { runJsonTool } from "./read-stdin";

runJsonTool(async (input) => {
    if (typeof input.docx_base64 !== "string" || !input.docx_base64) {
        throw new Error("docx_base64 must be a non-empty base64 string");
    }
    if (!Array.isArray(input.edits)) throw new Error("edits must be an array");
    const edits = input.edits.map((edit, index): EditInput => {
        const e = edit as Record<string, unknown>;
        for (const key of ["find", "replace", "context_before", "context_after"]) {
            if (typeof e?.[key] !== "string") throw new Error(`edits[${index}].${key} must be a string`);
        }
        return {
            find: e.find as string,
            replace: e.replace as string,
            context_before: e.context_before as string,
            context_after: e.context_after as string,
            reason: typeof e.reason === "string" ? e.reason : undefined,
        };
    });
    const author = typeof input.author === "string" && input.author ? input.author : undefined;
    const result = await applyTrackedEdits(Buffer.from(input.docx_base64, "base64"), edits, { author });
    return { docx_base64: result.bytes.toString("base64"), changes: result.changes, errors: result.errors };
});
