// ABOUTME: Shared input and output for the command-line tools: read one JSON object on stdin, write one on stdout.
// ABOUTME: A failure writes {"error": "..."} on stdout and exits with status 1.

export async function runJsonTool(handle: (input: Record<string, unknown>) => Promise<unknown>): Promise<void> {
    try {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
        const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!input || typeof input !== "object" || Array.isArray(input)) {
            throw new Error("input must be a JSON object");
        }
        process.stdout.write(JSON.stringify(await handle(input)) + "\n");
    } catch (err) {
        process.stdout.write(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) + "\n");
        process.exitCode = 1;
    }
}
