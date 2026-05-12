import type { HTMLAttributes, ReactNode } from "react";

type PixelBadgeTone = "neutral" | "success" | "warning" | "danger";

interface PixelBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PixelBadgeTone;
  children: ReactNode;
}

export function PixelBadge({ children, className = "", tone = "neutral", ...props }: PixelBadgeProps) {
  const toneClass = tone === "neutral" ? "" : ` pixel-badge--${tone}`;

  return (
    <span className={`pixel-badge${toneClass}${className ? ` ${className}` : ""}`} {...props}>
      {children}
    </span>
  );
}
