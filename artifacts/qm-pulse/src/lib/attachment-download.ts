const PREVIEW_MIME_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain",
]);

/** Blob navigation loses Content-Disposition. Download non-previewable files
 * explicitly so Office documents keep their name instead of the blob UUID. */
export async function openAttachmentResponse(
  response: Response,
  fileName: string,
  inline: boolean,
  previewWindow: Window | null,
): Promise<void> {
  if (!response.ok) throw new Error(`Attachment request failed (${response.status})`);
  const mime = (response.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  const preview = inline && PREVIEW_MIME_TYPES.has(mime)
    && !/^attachment\b/i.test(response.headers.get("Content-Disposition") ?? "");
  if (preview && !previewWindow) throw new Error("Preview was blocked by the browser");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    if (preview) {
      previewWindow!.opener = null;
      previewWindow!.location.href = url;
    } else {
      previewWindow?.close();
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim() || "attachment";
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); }
    }
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
