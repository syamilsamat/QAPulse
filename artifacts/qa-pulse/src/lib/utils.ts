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
