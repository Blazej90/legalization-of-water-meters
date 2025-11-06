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
  /** nazwa hidden inputu z miesiącem, np. "month" (YYYY-MM) */
  name: string;
  label?: string;
  defaultValue?: string; // np. "2025-11"
  /** nazwa hidden inputu z pełną datą, domyślnie "submittedAt" (YYYY-MM-DD) */
  submitDateName?: string;
};

function toYYYYMM(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function toYYYYMMDD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function MonthCalendar({
  name,
  label,
  defaultValue,
  submitDateName = "submittedAt",
}: Props) {
  const initial = React.useMemo(() => {
    // jeśli podano defaultValue "YYYY-MM" → ustaw na 1. dzień tego miesiąca
    if (defaultValue && /^\d{4}-\d{2}$/.test(defaultValue)) {
      const [y, m] = defaultValue.split("-").map(Number);
      return new Date(y, (m ?? 1) - 1, 1);
    }
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, [defaultValue]);

  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Date>(initial);

  const display = format(selected, "d LLLL yyyy", { locale: pl }); // pokazujemy DZIEŃ + miesiąc + rok
  const hiddenMonth = toYYYYMM(selected);
  const hiddenFullDate = toYYYYMMDD(selected);

  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm text-zinc-300">{label}</label>}

      {/* hidden: YYYY-MM */}
      <input type="hidden" name={name} value={hiddenMonth} />
      {/* hidden: YYYY-MM-DD */}
      <input type="hidden" name={submitDateName} value={hiddenFullDate} />

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
                // WAŻNE: NIE normalizujemy do 1. dnia miesiąca.
                setSelected(d);
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
