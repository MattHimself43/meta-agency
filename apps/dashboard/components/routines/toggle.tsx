"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleRoutineAction } from "@/app/(dashboard)/dashboard/actions";

/** Switch that saves immediately on change. */
export function RoutineToggle({ id, enabled, disabled, label }: { id: string; enabled: boolean; disabled?: boolean; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Switch
      defaultChecked={enabled}
      disabled={disabled || pending}
      aria-label={label}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", id);
        if (e.currentTarget.checked) fd.set("enabled", "on");
        start(() => toggleRoutineAction(fd));
      }}
    />
  );
}
