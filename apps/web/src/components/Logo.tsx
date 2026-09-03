export function Logo({ size = 44 }: { size?: number }) {
  return (
    <span
      aria-label="Resenha05"
      className="inline-flex select-none items-center justify-center rounded-full font-extrabold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        letterSpacing: '-0.03em',
        background:
          'radial-gradient(circle at 32% 28%, #59BE8B, #1F6B42 55%, #154D30 100%)',
        boxShadow:
          'inset 0 -3px 6px rgba(0,0,0,0.28), inset 0 2px 3px rgba(255,255,255,0.4), 0 4px 12px rgba(20,32,26,0.15)',
      }}
    >
      R5
    </span>
  );
}
