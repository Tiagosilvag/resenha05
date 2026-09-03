export function Logo({ size = 44, aro = false }: { size?: number; aro?: boolean }) {
  return (
    <span
      aria-label="Resenha05"
      className="inline-grid shrink-0 select-none place-items-center rounded-full font-display font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        letterSpacing: '-0.04em',
        background:
          'radial-gradient(circle at 32% 26%, #5FC38F, #2E8B54 46%, #123F26 100%)',
        boxShadow: aro
          ? 'inset 0 -3px 6px rgba(0,0,0,.3), inset 0 2px 3px rgba(255,255,255,.45), 0 0 0 2px rgba(255,255,255,.55), 0 6px 16px -6px rgba(0,0,0,.4)'
          : 'inset 0 -3px 6px rgba(0,0,0,.3), inset 0 2px 3px rgba(255,255,255,.45), 0 6px 16px -6px rgba(11,41,23,.5)',
      }}
    >
      R5
    </span>
  );
}
