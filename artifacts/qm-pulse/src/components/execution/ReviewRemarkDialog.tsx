import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Remark prompt for a peer-review decision. Optional on approve/accept (the
// reviewer can confirm with nothing to say); required where the server
// demands a reason (reject/return use their own dialogs).
export function ReviewRemarkDialog({
  open,
  onOpenChange,
  title,
  description,
  label = "Remark",
  placeholder = "Anything the author should know (optional)",
  confirmLabel,
  required = false,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  confirmLabel: string;
  required?: boolean;
  busy?: boolean;
  onConfirm: (remark: string) => void;
}) {
  const [remark, setRemark] = useState("");

  // Start empty every time the dialog opens, so a remark typed for one file
  // never carries over to the next.
  useEffect(() => {
    if (open) setRemark("");
  }, [open]);

  const trimmed = remark.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          <div>
            <Label htmlFor="review-remark" className="mb-2 block text-sm font-medium">
              {label}{" "}
              {required ? <span className="text-destructive">*</span> : <span className="text-xs text-muted-foreground">(optional)</span>}
            </Label>
            <Textarea
              id="review-remark"
              placeholder={placeholder}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={4}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={busy || (required && !trimmed)}
            onClick={() => onConfirm(trimmed)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
