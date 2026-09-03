import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Logo } from './Logo';
import { useOrg } from '../lib/org';

const ITENS = [
  { to: '/', rotulo: 'Início', icone: '🏠', exact: true },
  { to: '/peladas', rotulo: 'Peladas', icone: '⚽' },
  { to: '/torneios', rotulo: 'Torneios', icone: '🏆' },
  { to: '/perfil', rotulo: 'Perfil', icone: '👤' },
];

function linkClasses({ isActive }: { isActive: boolean }) {
  return [
    'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition',
    isActive ? 'text-campo-700' : 'text-black/45 hover:text-black/70',
  ].join(' ');
}

function SeletorOrg({ className }: { className?: string }) {
  const { orgs, orgId, setOrgId } = useOrg();
  if (orgs.length < 2) return null;
  return (
    <select
      value={orgId}
      onChange={(e) => setOrgId(e.target.value)}
      className={`rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium ${className ?? ''}`}
      aria-label="Trocar de organização"
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nome}
        </option>
      ))}
    </select>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col md:flex-row">
      {/* Sidebar — desktop */}
      <aside className="hidden w-56 shrink-0 border-r border-black/5 bg-white p-5 md:block">
        <div className="mb-4 flex items-center gap-2.5">
          <Logo size={34} />
          <span className="font-extrabold tracking-tight">Resenha05</span>
        </div>
        <SeletorOrg className="mb-6 w-full" />
        <nav className="flex flex-col gap-1">
          {ITENS.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.exact}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-campo-50 text-campo-700' : 'text-black/60 hover:bg-black/[0.03]',
                ].join(' ')
              }
            >
              <span aria-hidden>{i.icone}</span>
              {i.rotulo}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 pb-20 md:pb-8">
        <header className="safe-top flex items-center gap-2.5 px-4 py-3 md:hidden">
          <Logo size={30} />
          <span className="font-extrabold tracking-tight">Resenha05</span>
          <SeletorOrg className="ml-auto max-w-[45%]" />
        </header>
        <div className="px-4 py-2 md:px-8 md:py-8">{children}</div>
      </main>

      {/* Bottom nav — mobile */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 flex border-t border-black/5 bg-white/95 backdrop-blur md:hidden">
        {ITENS.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.exact} className={linkClasses}>
            <span aria-hidden className="text-base">
              {i.icone}
            </span>
            {i.rotulo}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
