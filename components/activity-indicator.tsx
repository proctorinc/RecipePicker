import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export function ActivityIndicator({
  label = "In progress",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <>
      <LoaderCircle aria-hidden="true" className={cn("status-activity-spinner h-3.5 w-3.5", className)} />
      <span className="sr-only">{label}</span>
    </>
  );
}
