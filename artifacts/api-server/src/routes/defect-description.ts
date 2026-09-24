// A defect's Redmine description is one text body: the free-text description
// followed by "**Steps to Reproduce:**", "**Expected Result:**",
// "**Actual Result:**" and "**Test Case ID:**" sections (built in
// DefectCreationModal). QM Pulse stores those as separate columns, so a push
// must edit that body in place rather than overwrite it with one field.

const SECTION_ORDER = ["Steps to Reproduce", "Expected Result", "Actual Result", "Test Case ID"] as const;
type SectionName = (typeof SECTION_ORDER)[number];

const SECTION_RE = /^\*\*(Steps to Reproduce|Expected Result|Actual Result|Test Case ID):\*\*[ \t]*(.*)$/;

interface Section { name: SectionName; body: string }
interface ParsedDescription { head: string; sections: Section[] }

export function parseRedmineDescription(text: string): ParsedDescription {
  const headLines: string[] = [];
  const sections: { name: SectionName; lines: string[] }[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const m = SECTION_RE.exec(line);
    if (m) {
      sections.push({ name: m[1] as SectionName, lines: m[2] ? [m[2]] : [] });
    } else if (sections.length > 0) {
      sections[sections.length - 1].lines.push(line);
    } else {
      headLines.push(line);
    }
  }
  return {
    head: headLines.join("\n").trim(),
    sections: sections.map((s) => ({ name: s.name, body: s.lines.join("\n").trim() })),
  };
}

export function composeRedmineDescription({ head, sections }: ParsedDescription): string {
  const blocks = [head, ...sections.map((s) => (s.name === "Test Case ID" ? `**${s.name}:** ${s.body}` : `**${s.name}:**\n${s.body}`))];
  return blocks.filter((b) => b.length > 0).join("\n\n");
}

export interface DescriptionChanges {
  description?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
}

// Applies only the fields present in `changes` to the current Redmine body;
// every other section is carried over untouched.
export function mergeRedmineDescription(current: string, changes: DescriptionChanges): string {
  const parsed = parseRedmineDescription(current);
  if (changes.description !== undefined) parsed.head = (changes.description ?? "").trim();
  const setSection = (name: SectionName, value: string | null | undefined) => {
    if (value === undefined) return;
    const body = (value ?? "").trim();
    const at = parsed.sections.findIndex((s) => s.name === name);
    if (!body) {
      if (at >= 0) parsed.sections.splice(at, 1);
    } else if (at >= 0) {
      parsed.sections[at].body = body;
    } else {
      const rank = SECTION_ORDER.indexOf(name);
      const before = parsed.sections.findIndex((s) => SECTION_ORDER.indexOf(s.name) > rank);
      parsed.sections.splice(before < 0 ? parsed.sections.length : before, 0, { name, body });
    }
  };
  setSection("Expected Result", changes.expectedResult);
  setSection("Actual Result", changes.actualResult);
  return composeRedmineDescription(parsed);
}
