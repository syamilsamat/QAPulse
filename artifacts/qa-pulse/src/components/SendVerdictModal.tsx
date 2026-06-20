import { useState, useEffect } from "react";
import { Loader2, Send, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ContactMultiSelect, type ContactOption } from "@/components/ContactMultiSelect";
import { getApiUrl } from "@/lib/api";

export type Verdict = "PASS" | "CONDITIONAL SIGN OFF";

interface SendVerdictModalProps {
  open: boolean;
  onClose: () => void;
  verdict: Verdict;
  redmineId: string;
  issueType: string;
  issueSubject: string;
  onSend: (to: ContactOption[], cc: ContactOption[], reason: string) => Promise<void>;
  isSending: boolean;
}

export function SendVerdictModal({
  open,
  onClose,
  verdict,
  redmineId,
  issueType,
  issueSubject,
  onSend,
  isSending,
}: SendVerdictModalProps) {
  const [step, setStep] = useState(1);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [to, setTo] = useState<ContactOption[]>([]);
  const [cc, setCc] = useState<ContactOption[]>([]);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setTo([]);
    setCc([]);
    setReason("");
    fetch(`${getApiUrl()}/contacts`)
      .then((r) => r.json())
      .then((data) => setContacts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [open]);

  const isConditional = verdict === "CONDITIONAL SIGN OFF";
  const canProceed = to.length > 0 && (!isConditional || reason.trim().length > 0);

  const typeLabel = issueType || "Issue";
  const emailBody = isConditional
    ? `Hi All,\n\nThe test verdict for ${typeLabel} #${redmineId} : ${issueSubject} is CONDITIONAL SIGN OFF due to ${reason.trim() || "[reason]"}.\nPlease refer attached email for details.\n\nRefer attachment for the details.\n\nThank you.`
    : `Hi All,\n\nTest Verdict for ${typeLabel} #${redmineId} : ${issueSubject} is PASS.\nAll issues encountered during testing have been fixed & retest.\nAttached is the test case that we had covered during testing.\n\nThank you.`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Send Verdict
            <Badge
              variant={isConditional ? "destructive" : "default"}
              className="text-xs font-medium"
            >
              {verdict}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-1">
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
            {isConditional && (
              <div className="space-y-1.5">
                <Label>
                  Reason{" "}
                  <span className="text-destructive">*</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    (required for Conditional Sign Off)
                  </span>
                </Label>
                <Textarea
                  rows={3}
                  placeholder="Describe the reason for Conditional Sign Off..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="resize-none shadow-none"
                />
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">Review email before sending</p>
            <div className="rounded-md border bg-muted/30 p-4 space-y-3 text-sm">
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
              <div className="pt-3 border-t">
                <pre className="font-sans text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {emailBody}
                </pre>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button onClick={() => setStep(2)} disabled={!canProceed} className="gap-2">
              Preview <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={isSending} className="gap-2">
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                onClick={() => onSend(to, cc, reason)}
                disabled={isSending || !canProceed}
                className="gap-2"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Send Verdict
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
