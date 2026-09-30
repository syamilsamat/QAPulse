// Optional per-file description, the same field Redmine's own "Files" box
// offers beside each attachment. Redmine stores it in a 255-character column,
// so anything longer is cut rather than failing the whole upload.
export const ATTACHMENT_DESCRIPTION_MAX = 255;

export function attachmentDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/[\r\n]+/g, " ").trim();
  return text ? text.slice(0, ATTACHMENT_DESCRIPTION_MAX) : undefined;
}
