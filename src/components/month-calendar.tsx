"use client";

import * as React from "react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Calendar as DayPicker } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";

type Props = {
  name: string;
  label?: string;
  defaultValue?: string; // "YYYY-MM"
};

function toYYYYMM(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function MonthCalendar({ name, label, defaultValue }: Props) {
  const initial = React.useMemo(() => {
    if (defaultValue && /^\d{4}-\d{2}$/.test(defaultValue)) {
      const [y, m] = defaultValue.split("-").map(Number);
      return new Date(y, (m ?? 1) - 1, 1);
    }
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [defaultValue]);

  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Date>(initial);

  const display = format(selected, "LLLL yyyy", { locale: pl });
  const hiddenValue = toYYYYMM(selected);

  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm text-zinc-300">{label}</label>}

      {/* ukryty input dla server action (to właśnie submituje YYYY-MM) */}
      <input type="hidden" name={name} value={hiddenValue} />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="justify-between w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 hover:bg-zinc-900"
          >
            <span className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              {display}
            </span>
            <span className="text-xs text-zinc-400">zmień</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="p-0 bg-zinc-950 border border-zinc-800"
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) {
                const norm = new Date(d.getFullYear(), d.getMonth(), 1);
                setSelected(norm);
                setOpen(false);
              }
            }}
            showOutsideDays
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
