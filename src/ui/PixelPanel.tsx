import type { ReactNode } from "react";

interface PixelPanelProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function PixelPanel({ children, className = "", title }: PixelPanelProps) {
  return (
    <section className={`pixel-panel${className ? ` ${className}` : ""}`} aria-label={title} role={title ? "group" : undefined}>
      <div className="pixel-panel__inner">
        {title ? <h2 className="pixel-panel__title">{title}</h2> : null}
        {children}
      </div>
    </section>
  );
}
