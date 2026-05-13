interface PixelDecorationsProps {
  testId?: string;
  variant?: "auth" | "console";
}

/** Decorative pixel layer. It carries atmosphere only; no product meaning. */
export function PixelDecorations({
  testId,
  variant = "auth",
}: PixelDecorationsProps) {
  return (
    <div
      className={`pixel-decorations pixel-decorations--${variant}`}
      data-testid={testId}
      aria-hidden="true"
    >
      <span className="pixel-deco pixel-deco--dots pixel-deco--dots-left" />
      <span className="pixel-deco pixel-deco--dots pixel-deco--dots-right" />
      <span className="pixel-deco pixel-deco--plus pixel-deco--plus-yellow" />
      <span className="pixel-deco pixel-deco--plus pixel-deco--plus-pink" />
      <span className="pixel-deco pixel-deco--square pixel-deco--square-blue" />
      <span className="pixel-deco pixel-deco--square pixel-deco--square-pink" />
      <span className="pixel-deco pixel-deco--square pixel-deco--square-yellow" />
      <span className="pixel-deco pixel-deco--sprite pixel-deco--sprite-pink" />
      <span className="pixel-deco pixel-deco--sprite pixel-deco--sprite-blue" />
      <span className="pixel-deco pixel-deco--heart pixel-deco--heart-left" />
      <span className="pixel-deco pixel-deco--heart pixel-deco--heart-right" />
    </div>
  );
}
