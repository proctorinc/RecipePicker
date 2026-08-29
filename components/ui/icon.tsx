import type { LucideIcon, LucideProps } from "lucide-react";

import { cn } from "@/lib/utils";

const iconSizes = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
  xl: "size-7",
} as const;

export type IconSize = keyof typeof iconSizes;

type IconProps = Omit<LucideProps, "size"> & {
  icon: LucideIcon;
  size?: IconSize;
};

/**
 * The single entry point for new Lucide icons. It provides a predictable visual
 * scale and prevents flex layouts from compressing an icon into invisibility.
 * Icons inherit their color from the surrounding control via `currentColor`.
 */
export function Icon({
  icon: Lucide,
  size = "md",
  className,
  "aria-label": ariaLabel,
  ...props
}: IconProps) {
  return (
    <Lucide
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
      className={cn("shrink-0", iconSizes[size], className)}
      {...props}
    />
  );
}
