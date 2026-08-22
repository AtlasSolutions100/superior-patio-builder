/**
 * Superior Patio Covers mark: a serif "S" over three patio panels (rotated
 * squares) stacked top / left / bottom, redrawn as vector from the
 * company's logo. Draws in `currentColor` so it works on any ground —
 * set the color with a text-* class.
 */
export function BrandMark({
  className = "",
  title = "Superior Patio Covers",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="2.75" strokeLinejoin="round" opacity="0.9">
        <rect x="21" y="4" width="22" height="22" transform="rotate(45 32 15)" />
        <rect x="4" y="21" width="22" height="22" transform="rotate(45 15 32)" />
        <rect x="21" y="38" width="22" height="22" transform="rotate(45 32 49)" />
      </g>
      <text
        x="33"
        y="44.5"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontWeight="600"
        fontSize="36"
        fill="currentColor"
      >
        S
      </text>
    </svg>
  );
}
