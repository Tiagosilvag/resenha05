import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

function cn(...c: (string | false | undefined | null)[]) {
  return c.filter(Boolean).join(' ');
}

export function Button({
  variante = 'primario',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'fantasma' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-campo-600';
  const estilos = {
    primario: 'bg-campo-600 text-white hover:bg-campo-700 active:bg-campo-900',
    secundario: 'border border-campo-200 bg-white text-campo-700 hover:bg-campo-50',
    fantasma: 'text-campo-700 hover:bg-campo-50',
  } as const;
  return <button className={cn(base, estilos[variante], className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none',
        'focus:border-campo-400 focus:ring-2 focus:ring-campo-100',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none',
        'focus:border-campo-400 focus:ring-2 focus:ring-campo-100',
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  erro,
  children,
  dica,
}: {
  label: string;
  erro?: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-campo-900">{label}</span>
      {children}
      {dica && !erro && <span className="mt-1 block text-xs text-black/50">{dica}</span>}
      {erro && <span className="mt-1 block text-xs text-red-600">{erro}</span>}
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-black/5 bg-white p-4 shadow-[0_1px_2px_rgba(20,32,26,0.05),0_8px_24px_rgba(20,32,26,0.04)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      role="status"
      aria-label="carregando"
    />
  );
}

export function Estrelas({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn('text-amber-500', className)} aria-label={`${n} de 5 estrelas`}>
      {'★'.repeat(Math.round(n))}
      <span className="text-black/15">{'★'.repeat(5 - Math.round(n))}</span>
    </span>
  );
}

export function Avatar({ src, nome, size = 40 }: { src?: string | null; nome?: string | null; size?: number }) {
  const iniciais = (nome ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return src ? (
    <img
      src={src}
      alt={nome ?? ''}
      width={size}
      height={size}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="inline-flex items-center justify-center rounded-full bg-campo-100 text-xs font-bold text-campo-700"
      style={{ width: size, height: size }}
    >
      {iniciais}
    </span>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'erro' | 'ok'; children: ReactNode }) {
  const estilos = {
    info: 'bg-campo-50 text-campo-900 border-campo-200',
    erro: 'bg-red-50 text-red-800 border-red-200',
    ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  } as const;
  return <div className={cn('rounded-xl border px-3.5 py-2.5 text-sm', estilos[tipo])}>{children}</div>;
}
