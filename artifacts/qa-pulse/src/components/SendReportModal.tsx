import { useState, useEffect } from "react";
import { Loader2, ChevronRight, ChevronLeft, Send, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ContactMultiSelect, type ContactOption } from "@/components/ContactMultiSelect";
import { getApiUrl, authHeaders } from "@/lib/api";

interface SendReportModalProps {
  open: boolean;
  onClose: () => void;
  onSend: (to: ContactOption[], cc: ContactOption[]) => Promise<void>;
  isSending: boolean;
  reportName: string;
}

export function SendReportModal({ open, onClose, onSend, isSending, reportName }: SendReportModalProps) {
  const [step, setStep] = useState(1);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [to, setTo] = useState<ContactOption[]>([]);
  const [cc, setCc] = useState<ContactOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setTo([]);
    setCc([]);
    fetch(`${getApiUrl()}/contacts`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => setContacts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Send Report
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Select recipients for <span className="font-medium text-foreground">{reportName}</span>
            </p>
            <div className="space-y-1.5">
              <Label>
                TO <span className="text-destructive">*</span>
              </Label>
              <ContactMultiSelect
                contacts={contacts}
                selected={to}
                onChange={setTo}
                placeholder="Select TO recipients..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>CC</Label>
              <ContactMultiSelect
                contacts={contacts}
                selected={cc}
                onChange={setCc}
                placeholder="Select CC recipients..."
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">Review before sending</p>
            <div className="rounded-md border bg-muted/30 p-4 space-y-3 text-sm">
              <div>
                <span className="font-medium">Subject: </span>
                <span className="text-muted-foreground">[QA Report] {reportName}</span>
              </div>
              <div>
                <span className="font-medium">TO: </span>
                <span className="text-muted-foreground">
                  {to.map((c) => `${c.fullName} <${c.email}>`).join(", ")}
                </span>
              </div>
              {cc.length > 0 && (
                <div>
                  <span className="font-medium">CC: </span>
                  <span className="text-muted-foreground">
                    {cc.map((c) => `${c.fullName} <${c.email}>`).join(", ")}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t text-xs text-muted-foreground">
                The PMO report will be generated as a screenshot and attached inline. Active defects Excel
                spreadsheet also attached if applicable.
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button onClick={() => setStep(2)} disabled={to.length === 0} className="gap-2">
              Preview <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={isSending} className="gap-2">
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              <Button onClick={() => onSend(to, cc)} disabled={isSending} className="gap-2">
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Send
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
