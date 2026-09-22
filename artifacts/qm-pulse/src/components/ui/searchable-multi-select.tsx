import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SearchableMultiSelectOption {
  value: string;
  label: string;
  /** Extra text to match when searching, beyond the visible label. */
  keywords?: string;
}

interface SearchableMultiSelectProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  options: SearchableMultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Multi-select twin of SearchableSelect: same option shape and search
 * behaviour, but selections accumulate as removable badges and the popover
 * stays open while picking so several can be chosen in one go.
 */
export function SearchableMultiSelect({
  values,
  onValuesChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  disabled = false,
  className,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = options.filter((o) => values.includes(o.value));

  const toggle = (value: string) => {
    onValuesChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  const remove = (value: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onValuesChange(values.filter((v) => v !== value));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal h-auto min-h-9 py-1.5 px-3", className)}
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <div className="flex flex-wrap gap-1 mr-2 min-w-0 flex-1">
              {selected.map((o) => (
                <Badge key={o.value} variant="secondary" className="gap-1 py-0.5 pr-0.5 text-xs font-normal max-w-[220px]">
                  <span className="truncate">{o.label}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${o.label}`}
                    className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 shrink-0 cursor-pointer"
                    onClick={(e) => remove(o.value, e)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && remove(o.value, e)}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              ))}
            </div>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 min-w-[var(--radix-popper-anchor-width)]" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <div
            className="max-h-[240px] overflow-y-auto overflow-x-hidden"
            onWheel={(e) => { e.currentTarget.scrollTop += e.deltaY; }}
          >
            <CommandList className="max-h-none overflow-visible">
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.keywords ? `${option.label} ${option.keywords}` : option.label}
                    // Deliberately no setOpen(false) — picking one person
                    // shouldn't close the list when you're naming several.
                    onSelect={() => toggle(option.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        values.includes(option.value) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
