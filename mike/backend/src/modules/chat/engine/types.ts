// ABOUTME: Seren's stand-in for Mike's chat engine types, holding only the one type verifyCitations.ts imports.
// ABOUTME: QuoteVerification is copied unchanged from Mike's packages/contracts/index.d.ts (see mike-parts.yaml).

/**
 * Per-quote verification result. `start_char`/`end_char` index into the
 * EXTRACTED source text (not the raw file bytes) and are only present for
 * single-segment quotes that matched.
 */
export type QuoteVerification = {
  verified: boolean;
  start_char?: number;
  end_char?: number;
  source_excerpt?: string;
};
