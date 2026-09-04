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
      'bg-gradient-to-b from-campo-200 via-campo-300 to-campo-500 text-noite shadow-ouro [box-shadow:inset_0_1px_0_rgba(255,255,255,.45),0_8px_22px_-10px_rgba(183,134,40,.6)] [text-shadow:0_1px_0_rgba(255,255,255,.3)] hover:from-campo-100 hover:via-campo-200 hover:to-campo-400',
    secundario:
      'border border-campo-300 bg-gramado-raised text-campo-800 hover:border-campo-400 hover:bg-campo-50',
    fantasma: 'text-campo-800 hover:bg-campo-100/70',
    perigo: 'border border-barro-100 bg-gramado-raised text-barro-600 hover:bg-barro-100/50',
  };
  return <button className={cn(base, estilos[variante], className)} {...props} />;
}

/* ── Campos ───────────────────────────────────────────────────────────────── */
// text-base (16px): abaixo disso o Safari/Chrome no mobile dá zoom automático ao focar o campo.
// min-w-0: sem isso o input[type=time] no mobile impõe a largura intrínseca
// dele e vaza para fora do card (itens de flex/grid nascem com min-width:auto).
const campoBase =
  'w-full min-w-0 rounded-xl border border-tinta-line bg-gramado-raised px-3.5 py-2.5 text-base text-tinta outline-none transition-colors placeholder:text-tinta-faint/70 focus:border-campo-400 focus:ring-4 focus:ring-campo-100';

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
    <label className="block min-w-0">
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
    ok: 'border-grama-200 bg-grama-50 text-grama-800',
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
  confirmado: { cls: 'bg-grama-100 text-grama-800', ponto: 'bg-grama-500' },
  pago: { cls: 'bg-campo-100 text-campo-800', ponto: 'bg-campo-500' },
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
function iniciaisDe(nome?: string | null) {
  return (nome ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function Avatar({
  src,
  nome,
  size = 40,
  recortada = false,
}: {
  src?: string | null;
  nome?: string | null;
  size?: number;
  recortada?: boolean;
}) {
  const iniciais = iniciaisDe(nome);
  const estilo = { width: size, height: size } as const;
  if (!src) {
    return (
      <span
        style={estilo}
        className="inline-flex items-center justify-center rounded-full bg-campo-100 font-display text-[0.8rem] font-bold text-campo-800 ring-2 ring-gramado-raised"
      >
        {iniciais}
      </span>
    );
  }
  return (
    <span
      style={estilo}
      className={cn(
        'inline-block overflow-hidden rounded-full ring-2 ring-gramado-raised shadow-sm',
        recortada && 'bg-gradient-to-b from-noite-raised to-noite',
      )}
    >
      <img
        src={src}
        alt={nome ?? ''}
        className={cn('h-full w-full', recortada ? 'object-cover object-top' : 'object-cover')}
      />
    </span>
  );
}

/* ── Mini cartinha ────────────────────────────────────────────────────────── */
/** Foto do jogador na moldura dourada da cartinha, para listas. */
export function MiniCartinha({
  src,
  nome,
  largura = 46,
  recortada = false,
}: {
  src?: string | null;
  nome?: string | null;
  largura?: number;
  recortada?: boolean;
}) {
  // mesma proporção da arte gerada pela API (720 × 1010)
  const estilo = { width: largura, height: Math.round((largura * 101) / 72) } as const;
  return (
    <span
      style={estilo}
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-ouro-300 bg-noite shadow-ouro"
    >
      {/* fundo: holofote no alto e faixas diagonais, como na arte da carta —
          aparece em volta de quem tem a foto recortada */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 24%, rgba(231,193,88,0.32) 0%, rgba(231,193,88,0.07) 46%, rgba(0,0,0,0) 72%), repeating-linear-gradient(115deg, rgba(231,193,88,0.12) 0 3px, rgba(231,193,88,0) 3px 11px)',
        }}
      />
      {src ? (
        <img
          src={src}
          alt={nome ?? ''}
          className={cn('relative h-full w-full object-cover', recortada && 'object-top')}
        />
      ) : (
        <span
          style={{ fontSize: Math.round(largura * 0.3) }}
          className="relative font-display font-bold text-ouro-300"
        >
          {iniciaisDe(nome)}
        </span>
      )}
      {/* filete interno dourado e base escurecida — ecoam a moldura da carta */}
      <span className="pointer-events-none absolute inset-0 rounded-[3px] bg-gradient-to-t from-noite/70 via-transparent to-transparent ring-1 ring-inset ring-ouro-200/30" />
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
