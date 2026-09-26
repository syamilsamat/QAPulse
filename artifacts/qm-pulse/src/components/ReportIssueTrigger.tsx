import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Wrench, Loader2, Paperclip, X } from "lucide-react";

// CR079 — global "Report an issue" trigger for bugs/ideas/questions about
// QM Pulse itself, mounted once in Layout.tsx (same pattern as
// GlobalQACopilot/GlobalSearch) so it's present on every authenticated page
// without needing to be a nav item people remember exists. Deliberately not
// the Defects fail-modal's UI — that reports bugs in the projects QM Pulse
// tests, this reports bugs in QM Pulse.

type IssueType = "bug" | "idea" | "question";
type IssueSeverity = "blocking" | "major" | "minor";

const TYPE_OPTIONS: { value: IssueType; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
  { value: "question", label: "Question" },
];

const SEVERITY_OPTIONS: { value: IssueSeverity; label: string }[] = [
  { value: "blocking", label: "Blocking" },
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
];

// Raw file cap — base64 inflates ~33%, kept safely under the API's 8mb
// screenshotUrl limit (platform-issues.ts, MAX_SCREENSHOT_BYTES).
export const MAX_SCREENSHOT_FILE_BYTES = 5 * 1024 * 1024;

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ReportIssueTrigger() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<IssueType>("bug");
  const [severity, setSeverity] = useState<IssueSeverity>("major");
  const [screenshot, setScreenshot] = useState<{ name: string; dataUrl: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setType("bug");
    setSeverity("major");
    setScreenshot(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SCREENSHOT_FILE_BYTES) {
      toast({ variant: "destructive", title: "Screenshot too large", description: "Keep it under 5MB." });
      e.target.value = "";
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setScreenshot({ name: file.name, dataUrl });
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ variant: "destructive", title: "Title required", description: "Give it a short, specific title." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}/platform-issues`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          type,
          severity,
          pagePath: location,
          browserInfo: navigator.userAgent.slice(0, 300),
          screenshotUrl: screenshot?.dataUrl,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to submit");
      }
      toast({ title: "Thanks — reported", description: "We'll follow up if we need more detail." });
      resetForm();
      setOpen(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Couldn't submit", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        className="fixed bottom-24 right-6 z-40 rounded-full w-11 h-11 shadow-lg hover:shadow-xl transition-shadow border"
        onClick={() => setOpen(true)}
        title="Report an issue with QM Pulse"
        aria-label="Report an issue with QM Pulse"
      >
        <Wrench className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report an issue with QM Pulse</DialogTitle>
            <DialogDescription>
              Bugs, ideas, or questions about the tool itself — not about a project's test results.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="platform-issue-title">Title</Label>
              <Input
                id="platform-issue-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Execution timestamp shows server time, not mine"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="platform-issue-description">Details (optional)</Label>
              <Textarea
                id="platform-issue-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did you expect, and what happened instead?"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex gap-1.5">
                {TYPE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={type === opt.value ? "default" : "outline"}
                    onClick={() => setType(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Severity</Label>
              <div className="flex gap-1.5">
                {SEVERITY_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={severity === opt.value ? "default" : "outline"}
                    onClick={() => setSeverity(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground font-mono">
              auto-attached · {location} · {user.role}
            </p>

            <div className="space-y-1.5">
              <Label>Screenshot (optional)</Label>
              {screenshot ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="truncate flex items-center gap-1.5 text-muted-foreground">
                    <Paperclip className="w-3.5 h-3.5 shrink-0" />
                    {screenshot.name}
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setScreenshot(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <Input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="text-sm" />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
