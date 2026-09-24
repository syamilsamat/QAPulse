// Turns an AI Analysis suggestion into prose that can be appended to a
// requirement's Description. Kept free of DB/AI imports so the guard on the
// model's output can be unit-tested on its own.

export const MAX_SUGGESTION_CHARS = 2000;

export const REPHRASE_SYSTEM_PROMPT = [
  "You edit software requirement documents.",
  "Rewrite the reviewer suggestion as one to three plain sentences of natural prose that state what the requirement needs, in the same voice as the existing description, so they can be appended to it.",
  "Do not use bullet points, headings, quotation marks, markdown, or labels such as \"Missing Items:\".",
  "Do not repeat anything the description already says and do not add details the suggestion does not contain.",
  "Return only the sentences.",
].join(" ");

export function buildRephrasePrompt(title: string, description: string | null | undefined, suggestion: string): string {
  return [
    `Requirement title: ${title || "Not provided"}`,
    `Existing description: ${(description ?? "").trim().slice(0, 4000) || "Not provided"}`,
    `Suggestion to merge: ${suggestion}`,
  ].join("\n\n");
}

// Returns the cleaned rewrite, or null when the model output can't be trusted
// (empty, or wildly longer than what it was asked to reword) so the caller can
// fall back to the original text.
export function cleanRephrased(output: string | null | undefined, original: string): string | null {
  let text = (output ?? "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .trim();
  text = text.replace(/^(?:missing items|issue suggestions?|description|rewritten|suggestion)\s*:\s*/i, "");
  text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (!text) return null;
  if (text.length > original.length * 3 + 300) return null;
  return text;
}
