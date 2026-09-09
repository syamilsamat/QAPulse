import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Filename with its extension stripped, for display only — the stored name
 * (extension included) is what downloads, so callers must keep using the
 * original when setting a download target.
 *
 * A name that is *only* an extension (".pdf") is returned unchanged rather than
 * collapsing to an empty label.
 */
export function stripFileExtension(fileName: string): string {
  if (!fileName) return "";
  const stripped = fileName.replace(/\.[^./\\]+$/, "");
  return stripped || fileName;
}

/**
 * Recursive descendant walk over a flat requirement list (parentId-linked).
 * Shared by the AI Generate dialog's requirement picker, the TC Library's
 * requirement filter, and the execution file's "Pull from Library" picker,
 * so filtering by a parent also surfaces TCs linked to any child,
 * grandchild, etc. — not just the exact requirement selected.
 */
export function getAllDescendants(parentId: number, allReqs: any[], depth = 1): any[] {
  const children = allReqs.filter((r: any) => r.parentId === parentId);
  let desc: any[] = [];
  for (const child of children) {
    desc.push({ ...child, depth });
    desc = desc.concat(getAllDescendants(child.id, allReqs, depth + 1));
  }
  return desc;
}
