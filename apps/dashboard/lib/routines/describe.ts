const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Human-readable summary for the common cron shapes we use; falls back to the raw expression. */
export function describeCron(cron: string, everyNWeeks = 1): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];
  if (min.startsWith("*/") && hour === "*" && dom === "*" && mon === "*" && dow === "*") return `Every ${min.slice(2)} min`;
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hour)) return `cron ${cron} (AST)`;
  const h = Number(hour);
  const time = `${((h + 11) % 12) + 1}:${min.padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  let when = "";
  if (dom === "*" && mon === "*" && dow === "*") when = "Daily";
  else if (dom === "*" && mon === "*" && /^\d-\d$/.test(dow)) when = `${DAYS[Number(dow[0])]}–${DAYS[Number(dow[2])]}`;
  else if (dom === "*" && mon === "*" && /^\d$/.test(dow)) when = everyNWeeks > 1 ? `Every ${ordinal(everyNWeeks)} ${FULL[Number(dow)]}` : `${FULL[Number(dow)]}s`;
  else if (/^\d+$/.test(dom) && mon === "*" && dow === "*") when = `${ordinal(Number(dom))} of month`;
  else return `cron ${cron} (AST)`;
  return `${when} ${time} AST`;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]!);
}
