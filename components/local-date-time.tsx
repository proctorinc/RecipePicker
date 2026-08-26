"use client";

import { useEffect, useState } from "react";

function formatInTimeZone(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}

export function LocalDateTime({ value }: { value: string | null | undefined }) {
  const fallback = value ? formatInTimeZone(value, "UTC") : "Unknown";
  const [formatted, setFormatted] = useState(fallback);

  useEffect(() => {
    setFormatted(value ? formatInTimeZone(value) : "Unknown");
  }, [value]);

  return <time dateTime={value ?? undefined}>{formatted}</time>;
}
