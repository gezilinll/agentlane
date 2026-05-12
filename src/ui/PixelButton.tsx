import type { ButtonHTMLAttributes, ReactNode } from "react";

type PixelButtonVariant = "primary" | "secondary" | "danger";

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: "paper-plane";
  variant?: PixelButtonVariant;
  children: ReactNode;
}

export function PixelButton({ children, className = "", icon, variant = "primary", ...props }: PixelButtonProps) {
  const variantClass = variant === "primary" ? "" : ` pixel-button--${variant}`;

  return (
    <button className={`pixel-button${variantClass}${className ? ` ${className}` : ""}`} {...props}>
      {icon ? (
        <span className="pixel-button__icon" data-testid="pixel-button-icon" aria-hidden="true">
          <PaperPlaneIcon />
        </span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}

function PaperPlaneIcon() {
  return (
    <svg className="pixel-button__svg" viewBox="0 0 24 24" focusable="false">
      <path d="M3 11.5 21 3l-5.8 18-3.4-7.4L3 11.5Z" />
      <path d="m11.8 13.6 4.8-5.1" />
    </svg>
  );
}
