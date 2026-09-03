import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export function cn(...c: (string | false | undefined | null)[]) {
  return c.filter(Boolean).join(' ');
}

/* ── Botão ────────────────────────────────────────────────────────────────── */
type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo';

export function Button({
  variante = 'primario',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  const base =
    'inline-flex select-none items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-[0.95rem] font-semibold uppercase tracking-[0.03em] transition-[transform,background,box-shadow] duration-150 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50';
  const estilos: Record<Variante, string> = {
    primario:
      'bg-campo-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_8px_20px_-8px_rgba(23,82,48,.6)] hover:bg-campo-700',
    secundario:
      'border border-campo-200 bg-white text-campo-700 hover:border-campo-300 hover:bg-campo-50',
    fantasma: 'text-campo-700 hover:bg-campo-100/60',
    perigo: 'border border-barro-100 bg-white text-barro-600 hover:bg-barro-100/50',
  };
  return <button className={cn(base, estilos[variante], className)} {...props} />;
}

/* ── Campos ───────────────────────────────────────────────────────────────── */
const campoBase =
  'w-full rounded-xl border border-tinta-line bg-white px-3.5 py-2.5 text-[0.95rem] text-tinta outline-none transition-colors placeholder:text-tinta-faint/70 focus:border-campo-400 focus:ring-4 focus:ring-campo-100';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(campoBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(campoBase, 'min-h-[5rem] leading-relaxed', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        campoBase,
        'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%236E7E72%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")] bg-[right_0.7rem_center] bg-[length:1.1rem] bg-no-repeat pr-9',
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  erro,
  dica,
  children,
}: {
  label: string;
  erro?: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-display text-[0.82rem] font-semibold uppercase tracking-[0.06em] text-tinta-soft">
        {label}
      </span>
      {children}
      {dica && !erro && <span className="mt-1 block text-xs text-tinta-faint">{dica}</span>}
      {erro && <span className="mt-1 block text-xs font-medium text-barro-600">{erro}</span>}
    </label>
  );
}

/* ── Superfícies ──────────────────────────────────────────────────────────── */
export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section';
}) {
  return (
    <As
      className={cn(
        'rounded-2xl border border-tinta-line/70 bg-gramado-raised p-4 shadow-raise',
        className,
      )}
    >
      {children}
    </As>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('eyebrow mb-2', className)}>{children}</p>;
}

/* ── Estados ──────────────────────────────────────────────────────────────── */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="carregando"
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

type TomAviso = 'info' | 'erro' | 'ok';
export function Aviso({ tipo = 'info', children }: { tipo?: TomAviso; children: ReactNode }) {
  const estilos: Record<TomAviso, string> = {
    info: 'border-campo-200 bg-campo-50 text-campo-800',
    erro: 'border-barro-100 bg-barro-100/50 text-barro-600',
    ok: 'border-campo-300 bg-campo-100/70 text-campo-800',
  };
  return (
    <div className={cn('flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm', estilos[tipo])}>
      {children}
    </div>
  );
}

/* ── Chip de status (ponto + rótulo) ──────────────────────────────────────── */
type TomChip = 'confirmado' | 'pago' | 'desistiu' | 'pendente' | 'neutro';
const CHIP: Record<TomChip, { cls: string; ponto: string }> = {
  confirmado: { cls: 'bg-campo-100 text-campo-800', ponto: 'bg-campo-500' },
  pago: { cls: 'bg-ouro-100 text-ouro-700', ponto: 'bg-ouro-500' },
  desistiu: { cls: 'bg-tinta-line/40 text-tinta-faint', ponto: 'bg-tinta-faint' },
  pendente: { cls: 'bg-ouro-100 text-ouro-700', ponto: 'bg-ouro-500' },
  neutro: { cls: 'bg-gramado-sunk text-tinta-soft', ponto: 'bg-tinta-faint' },
};
export function Chip({ tom = 'neutro', children }: { tom?: TomChip; children: ReactNode }) {
  const { cls, ponto } = CHIP[tom];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-display text-[0.7rem] font-semibold uppercase tracking-[0.05em]',
        cls,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', ponto)} />
      {children}
    </span>
  );
}

/* ── Estrelas (habilidade) ────────────────────────────────────────────────── */
export function Estrelas({ n, className }: { n: number; className?: string }) {
  const cheias = Math.round(n);
  return (
    <span className={cn('inline-flex gap-0.5', className)} aria-label={`${cheias} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={cn('h-3.5 w-3.5', i < cheias ? 'fill-ouro-500' : 'fill-tinta-line')}
        >
          <path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 18l-6 3.4 1.4-6.8L2.3 9.1l6.9-.8L12 2Z" />
        </svg>
      ))}
    </span>
  );
}

/* ── Avatar ───────────────────────────────────────────────────────────────── */
export function Avatar({
  src,
  nome,
  size = 40,
}: {
  src?: string | null;
  nome?: string | null;
  size?: number;
}) {
  const iniciais = (nome ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  const estilo = { width: size, height: size } as const;
  return src ? (
    <img
      src={src}
      alt={nome ?? ''}
      style={estilo}
      className="rounded-full object-cover ring-2 ring-white shadow-sm"
    />
  ) : (
    <span
      style={estilo}
      className="inline-flex items-center justify-center rounded-full bg-campo-100 font-display text-[0.8rem] font-bold text-campo-700 ring-2 ring-white"
    >
      {iniciais}
    </span>
  );
}

/* ── Placar / scoreboard ──────────────────────────────────────────────────── */
export function Placar({ a, b, className }: { a: number | null; b: number | null; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-lg bg-gramado-dark px-3 py-1.5 text-white shadow-scoreboard',
        className,
      )}
    >
      <span className="placar-num text-xl text-ouro-300">{a ?? '–'}</span>
      <span className="text-xs text-white/40">×</span>
      <span className="placar-num text-xl text-ouro-300">{b ?? '–'}</span>
    </span>
  );
}

/* ── Tile de estatística ──────────────────────────────────────────────────── */
export function StatTile({ valor, rotulo }: { valor: ReactNode; rotulo: string }) {
  return (
    <div className="rounded-xl border border-tinta-line/70 bg-gramado-raised px-3 py-2.5 text-center">
      <div className="placar-num text-2xl text-campo-700">{valor}</div>
      <div className="eyebrow mt-0.5 text-[0.62rem]">{rotulo}</div>
    </div>
  );
}
