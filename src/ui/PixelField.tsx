import type { InputHTMLAttributes } from "react";

interface PixelFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
}

export function PixelField({ id, label, name, className = "", ...props }: PixelFieldProps) {
  const inputId = id ?? name;

  return (
    <label className={`pixel-field${className ? ` ${className}` : ""}`} htmlFor={inputId}>
      <span className="pixel-field__label">{label}</span>
      <input className="pixel-field__input" id={inputId} name={name} {...props} />
    </label>
  );
}
