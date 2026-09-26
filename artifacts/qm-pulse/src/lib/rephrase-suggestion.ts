import { getApiUrl, authHeaders } from "@/lib/api";

export const aiEditedFlagKey = (requirementId: number) => `ai-edited-description-${requirementId}`;

export interface RephrasedSuggestion {
  text: string;
  rephrased: boolean;
}

// Asks the server to reword an AI Analysis suggestion into prose for the
// requirement's Description. Never throws: any failure returns the suggestion
// as written so Accept still works.
export async function rephraseSuggestion(requirementId: number, suggestion: string): Promise<RephrasedSuggestion> {
  const asWritten = { text: suggestion.trim(), rephrased: false };
  try {
    const res = await fetch(`${getApiUrl()}/ai/rephrase-suggestion`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ requirementId, suggestion }),
    });
    if (!res.ok) return asWritten;
    const data = await res.json();
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    return text ? { text, rephrased: data.rephrased === true } : asWritten;
  } catch {
    return asWritten;
  }
}

export function markDescriptionAiEdited(requirementId: number): void {
  try { sessionStorage.setItem(aiEditedFlagKey(requirementId), "1"); } catch { /* storage unavailable */ }
}
