// Test steps are stored as one free-text block, so numbering is something the
// app applies rather than something the data guarantees. Authors number them
// inconsistently ("1.", "1)", "Step 1 -", or not at all), so every consumer
// strips whatever prefix is there and renumbers from the real line order —
// otherwise the same case reads "1. 1. Open statements" in one place and
// "Open statements" in another.
//
// Shared by the execution sheet's read-only views, the edit-mode normaliser,
// and the Redmine defect description, so a step numbered 4 on screen is step 4
// in the ticket a developer opens.

// The lookahead keeps a decimal out of the strip: "1.5x zoom" must survive
// intact, while "1. Open", "1)Open" and "Step 1 - Open" all lose their
// prefix. A digit straight after the delimiter means it was never a step
// number in the first place.
const STEP_PREFIX = /^\s*(?:step\s*)?\d+\s*[.)\-:](?=\D|$)\s*/i;

/** Steps as a clean list, prefixes removed and blank lines dropped. */
export function splitTestSteps(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(STEP_PREFIX, "").trim())
    .filter((line) => line.length > 0);
}

/**
 * The same steps as one numbered block ("1. …\n2. …").
 *
 * A single step is returned bare: "1." in front of a lone instruction reads as
 * a list of one and adds nothing. Empty input returns an empty string so
 * callers can treat it as "no steps" without a special case.
 */
export function numberTestSteps(raw: string | null | undefined): string {
  const steps = splitTestSteps(raw);
  if (steps.length === 0) return "";
  if (steps.length === 1) return steps[0];
  return steps.map((step, i) => `${i + 1}. ${step}`).join("\n");
}

/**
 * True when `raw` is already exactly what numberTestSteps would produce.
 * Lets the edit-mode normaliser skip a no-op write, so a blur that changed
 * nothing doesn't mark the row dirty and trigger a save.
 */
export function isAlreadyNumbered(raw: string | null | undefined): boolean {
  return (raw ?? "") === numberTestSteps(raw);
}
