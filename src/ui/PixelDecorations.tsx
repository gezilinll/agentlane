import { PixelIcon } from "./PixelIcon";

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
      <PixelSprite tone="pink" />
      <PixelSprite tone="blue" />
      <span className="pixel-deco pixel-deco--heart pixel-deco--heart-left">
        <PixelIcon name="heart" size={16} />
      </span>
      <span className="pixel-deco pixel-deco--heart pixel-deco--heart-right">
        <PixelIcon name="heart" size={16} />
      </span>
    </div>
  );
}

function PixelSprite({ tone }: { tone: "blue" | "pink" }) {
  return (
    <svg
      className={`pixel-deco pixel-deco--sprite pixel-deco--sprite-${tone}`}
      data-pixel-sprite={tone}
      focusable="false"
      shapeRendering="crispEdges"
      viewBox="0 0 72 64"
    >
      <rect className="pixel-sprite__body" x="16" y="16" width="40" height="8" />
      <rect className="pixel-sprite__body" x="8" y="24" width="56" height="24" />
      <rect className="pixel-sprite__body" x="8" y="48" width="8" height="8" />
      <rect className="pixel-sprite__body" x="24" y="48" width="8" height="8" />
      <rect className="pixel-sprite__body" x="40" y="48" width="8" height="8" />
      <rect className="pixel-sprite__body" x="56" y="48" width="8" height="8" />
      <rect className="pixel-sprite__highlight" x="24" y="24" width="8" height="16" />
      <rect className="pixel-sprite__highlight" x="44" y="24" width="8" height="16" />
      <rect className="pixel-sprite__shine" x="20" y="12" width="8" height="8" />
      <rect className="pixel-sprite__shine" x="28" y="4" width="8" height="8" />
    </svg>
  );
}
