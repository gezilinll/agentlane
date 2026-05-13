import type { InputHTMLAttributes } from "react";
import { PixelIcon, type PixelIconName } from "./PixelIcon";

interface PixelFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: PixelIconName;
  label: string;
  name: string;
}

export function PixelField({ icon, id, label, name, className = "", ...props }: PixelFieldProps) {
  const inputId = id ?? name;

  return (
    <label className={`pixel-field${className ? ` ${className}` : ""}`} htmlFor={inputId}>
      <span className="pixel-field__label">{label}</span>
      <span className="pixel-field__control">
        {icon ? <PixelIcon className="pixel-field__icon" name={icon} size={22} /> : null}
        <input className="pixel-field__input" id={inputId} name={name} {...props} />
      </span>
    </label>
  );
}
