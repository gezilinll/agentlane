import type { ButtonHTMLAttributes, ReactNode } from "react";

type PixelButtonVariant = "primary" | "secondary" | "danger";

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: "paper-plane";
  variant?: PixelButtonVariant;
  children: ReactNode;
}

const ICONS = {
  "paper-plane": "➤",
} as const;

export function PixelButton({ children, className = "", icon, variant = "primary", ...props }: PixelButtonProps) {
  const variantClass = variant === "primary" ? "" : ` pixel-button--${variant}`;

  return (
    <button className={`pixel-button${variantClass}${className ? ` ${className}` : ""}`} {...props}>
      {icon ? (
        <span className="pixel-button__icon" data-testid="pixel-button-icon" aria-hidden="true">
          {ICONS[icon]}
        </span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}
