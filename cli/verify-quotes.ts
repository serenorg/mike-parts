// ABOUTME: Command-line tool that checks each quote appears word for word in a source text, using Mike's quote verifier.
// ABOUTME: Stdin {source, quotes: [string]}; stdout {results: [{quote, verified, needs_correction, start_char?, end_char?, source_excerpt?}]}.

import { createQuoteVerifier } from "../mike/backend/src/modules/chat/engine/verifyCitations";
import { runJsonTool } from "./read-stdin";

runJsonTool(async (input) => {
    if (typeof input.source !== "string") throw new Error("source must be a string");
    if (!Array.isArray(input.quotes) || input.quotes.some((q) => typeof q !== "string")) {
        throw new Error("quotes must be an array of strings");
    }
    const verify = createQuoteVerifier(input.source);
    return { results: (input.quotes as string[]).map((quote) => ({ quote, ...verify(quote) })) };
});
