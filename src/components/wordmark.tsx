/** MicroManus wordmark — "Micro" dim, "Manus" bright, accent square glyph. */
export function Wordmark({
  className = "",
  size = "base",
}: {
  className?: string;
  size?: "base" | "lg";
}) {
  const text = size === "lg" ? "text-2xl" : "text-base";
  const dot = size === "lg" ? "h-3 w-3" : "h-2 w-2";
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`${dot} rounded-[3px] bg-accent`} aria-hidden />
      <span className={`${text} font-medium tracking-tight`}>
        <span className="text-ink-dim">Micro</span>
        <span className="text-ink">Manus</span>
      </span>
    </span>
  );
}
