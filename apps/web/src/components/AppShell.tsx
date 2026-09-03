import type { ComponentType, ReactNode, SVGProps } from 'react';
import { NavLink } from 'react-router-dom';
import { Logo } from './Logo';
import { useOrg } from '../lib/org';
import { IconeInicio, IconeBola, IconeTrofeu, IconePerfil } from './icons';

const ITENS: { to: string; rotulo: string; Icone: ComponentType<SVGProps<SVGSVGElement>>; exact?: boolean }[] = [
  { to: '/', rotulo: 'Início', Icone: IconeInicio, exact: true },
  { to: '/peladas', rotulo: 'Peladas', Icone: IconeBola },
  { to: '/torneios', rotulo: 'Torneios', Icone: IconeTrofeu },
  { to: '/perfil', rotulo: 'Perfil', Icone: IconePerfil },
];

function SeletorOrg({ className }: { className?: string }) {
  const { orgs, orgId, setOrgId } = useOrg();
  if (orgs.length < 2) return null;
  return (
    <div className={`relative ${className ?? ''}`}>
      <select
        value={orgId}
        onChange={(e) => setOrgId(e.target.value)}
        aria-label="Trocar de organização"
        className="w-full appearance-none rounded-full border border-campo-200 bg-white/90 py-1.5 pl-3 pr-8 font-display text-xs font-semibold uppercase tracking-[0.04em] text-campo-700"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 stroke-campo-600" fill="none" strokeWidth="2" strokeLinecap="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col md:flex-row">
      {/* Sidebar — desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r linha-cal bg-white/70 px-5 pb-6 pt-7 md:flex">
        <div className="mb-5 flex items-center gap-3">
          <Logo size={38} />
          <span className="font-display text-lg font-bold uppercase tracking-tight">Resenha05</span>
        </div>
        <SeletorOrg className="mb-7" />
        <nav className="flex flex-col gap-1">
          {ITENS.map(({ to, rotulo, Icone, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.03em] transition-colors',
                  isActive
                    ? 'bg-campo-600 text-white shadow-[0_8px_18px_-10px_rgba(23,82,48,.7)]'
                    : 'text-tinta-soft hover:bg-campo-100/60 hover:text-campo-800',
                ].join(' ')
              }
            >
              <Icone width={20} height={20} />
              {rotulo}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 pb-24 md:pb-10">
        <header className="safe-top flex items-center gap-3 border-b border-campo-800 bg-campo-700 bg-gramada px-4 py-3 text-white md:hidden">
          <Logo size={30} aro />
          <span className="font-display text-base font-bold uppercase tracking-tight">Resenha05</span>
          <SeletorOrg className="ml-auto max-w-[46%]" />
        </header>
        <div className="px-4 py-5 md:px-9 md:py-9">{children}</div>
      </main>

      {/* Bottom nav — mobile */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-3xl border-t linha-cal bg-white/95 backdrop-blur md:hidden">
        {ITENS.map(({ to, rotulo, Icone, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              [
                'relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 font-display text-[0.68rem] font-semibold uppercase tracking-[0.04em] transition-colors',
                isActive ? 'text-campo-700' : 'text-tinta-faint',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-campo-600" />}
                <Icone width={22} height={22} />
                {rotulo}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
