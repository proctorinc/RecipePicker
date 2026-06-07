import { Badge } from "@/components/ui/badge";
import { formatStatusLabel, statusTone } from "@/lib/server/status";
import type { PinStatus } from "@/types/view-models";

export function StatusBadge({ status }: { status: PinStatus }) {
  return <Badge variant={statusTone(status)}>{formatStatusLabel(status)}</Badge>;
}

