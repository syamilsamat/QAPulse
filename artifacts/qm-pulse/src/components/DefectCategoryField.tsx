import { useState } from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DEFECT_CATEGORIES } from "@/lib/defect-categories";

// Shown on every defect creation and edit dialog, to everyone. This was once
// Lead-tier only and rendered nothing below that, so the QA members raising
// most of the defects never saw it and the column went unfilled. Category is a
// classification rather than an authority — see canSetDefectCategory in
// routes/defects.ts, which is the matching server-side rule.
export function DefectCategoryField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label>Category</Label>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="What do these categories mean?"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>
      <SearchableSelect
        value={value}
        onValueChange={onChange}
        options={DEFECT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
        placeholder="Select category (optional)"
        searchPlaceholder="Search categories..."
      />

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Defect categories</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {DEFECT_CATEGORIES.map((c) => (
              <div key={c.value}>
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.description}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setInfoOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
