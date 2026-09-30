import { Paperclip, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";

// Redmine's attachment description column holds 255 characters.
export const ATTACHMENT_DESCRIPTION_MAX = 255;

export interface DescribedFile {
  filename: string;
  description?: string;
}

// Selected files listed the way Redmine's own "Files" box lists them: the
// filename, an "Optional description" box, and a delete icon. The
// description travels with the file, so anyone opening the attachment later
// can tell what it is.
//
// Layout never overflows its container, however long the filename: every
// flex child that holds text carries min-w-0 so it can shrink, the name
// truncates (full name on hover), and below the sm breakpoint the
// description box drops onto its own line instead of squeezing the name.
export function AttachmentFileList<T extends DescribedFile>({
  files,
  onChange,
  disabled,
  meta,
}: {
  files: T[];
  onChange: (files: T[]) => void;
  disabled?: boolean;
  // Extra text after the name, e.g. the file size.
  meta?: (file: T) => string | null | undefined;
}) {
  if (files.length === 0) return null;
  return (
    <ul className="w-full min-w-0 space-y-2">
      {files.map((file, i) => {
        const extra = meta?.(file);
        return (
          <li
            key={`${file.filename}-${i}`}
            className="flex w-full min-w-0 flex-col gap-1.5 rounded-md border bg-muted/40 px-2 py-1.5 text-xs sm:flex-row sm:items-center sm:gap-2"
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-[45%]">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={file.filename}>{file.filename}</span>
              {extra && <span className="shrink-0 text-muted-foreground">{extra}</span>}
              {/* On phones the delete icon rides the name row. */}
              <RemoveButton className="sm:hidden" file={file} disabled={disabled} onClick={() => onChange(files.filter((_, idx) => idx !== i))} />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                className="h-8 min-w-0 flex-1 text-xs"
                placeholder="Optional description"
                aria-label={`Description for ${file.filename}`}
                maxLength={ATTACHMENT_DESCRIPTION_MAX}
                value={file.description ?? ""}
                disabled={disabled}
                onChange={(e) => onChange(files.map((f, idx) => (idx === i ? { ...f, description: e.target.value } : f)))}
              />
              <RemoveButton className="hidden sm:inline-flex" file={file} disabled={disabled} onClick={() => onChange(files.filter((_, idx) => idx !== i))} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RemoveButton({ file, disabled, onClick, className }: { file: DescribedFile; disabled?: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={`Remove ${file.filename}`}
      disabled={disabled}
      onClick={onClick}
      className={`shrink-0 items-center justify-center rounded p-1 hover:bg-muted ${className ?? ""}`}
    >
      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
    </button>
  );
}
