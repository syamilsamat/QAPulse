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
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ContactOption {
  id: number;
  fullName: string;
  email: string;
  isGroup: boolean;
}

interface ContactMultiSelectProps {
  contacts: ContactOption[];
  selected: ContactOption[];
  onChange: (selected: ContactOption[]) => void;
  placeholder?: string;
}

export function ContactMultiSelect({
  contacts,
  selected,
  onChange,
  placeholder = "Select contacts...",
}: ContactMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggle = (contact: ContactOption) => {
    if (selected.some((c) => c.id === contact.id)) {
      onChange(selected.filter((c) => c.id !== contact.id));
    } else {
      onChange([...selected, contact]);
    }
  };

  const remove = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between shadow-none font-normal h-auto min-h-9 py-1.5 px-3"
          >
            {selected.length === 0 ? (
              <span className="text-muted-foreground text-sm">{placeholder}</span>
            ) : (
              <div className="flex flex-wrap gap-1 mr-2 min-w-0 flex-1">
                {selected.map((c) => (
                  <Badge key={c.id} variant="secondary" className="gap-1 py-0.5 pr-0.5 text-xs font-normal max-w-[200px]">
                    <span className="truncate">{c.fullName}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 shrink-0 cursor-pointer"
                      onClick={(e) => remove(c.id, e)}
                      onKeyDown={(e) => e.key === "Enter" && remove(c.id, e as any)}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </Badge>
                ))}
              </div>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-auto" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search name or email..." />
            <ScrollArea className="max-h-52">
            <CommandList className="max-h-none overflow-visible">
              <CommandEmpty>No contacts found.</CommandEmpty>
              <CommandGroup>
                {contacts.filter((c) => c.email?.trim()).map((contact) => {
                  const isSelected = selected.some((c) => c.id === contact.id);
                  return (
                    <CommandItem
                      key={contact.id}
                      value={`${contact.fullName} ${contact.email}`}
                      onSelect={() => toggle(contact)}
                      className="gap-2"
                    >
                      <Check className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {contact.fullName}
                          {contact.isGroup && (
                            <span className="ml-1.5 text-xs text-muted-foreground font-normal">(Group)</span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{contact.email}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
            </ScrollArea>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground truncate">
          {selected.map((c) => c.email).join(", ")}
        </p>
      )}
    </div>
  );
}
