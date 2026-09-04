import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { useOrg } from '../lib/org';
import { cn } from './ui';
import { IconeInicio, IconeBola, IconeTrofeu, IconePerfil } from './icons';

/**
 * Com o teclado virtual aberto, `position: fixed` fica instável em muitos
 * navegadores mobile (o elemento "flutua" fora do lugar). Escondemos a barra
 * inferior enquanto o teclado ocupa uma fatia grande da tela.
 */
function useTecladoAberto() {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const verificar = () => setAberto(window.innerHeight - vv.height > 150);
    vv.addEventListener('resize', verificar);
    verificar();
    return () => vv.removeEventListener('resize', verificar);
  }, []);
  return aberto;
}

const ITENS: { to: string; rotulo: string; Icone: ComponentType<SVGProps<SVGSVGElement>>; exact?: boolean }[] = [
  { to: '/', rotulo: 'Início', Icone: IconeInicio, exact: true },
  { to: '/peladas', rotulo: 'Peladas', Icone: IconeBola },
  { to: '/torneios', rotulo: 'Torneios', Icone: IconeTrofeu },
  { to: '/perfil', rotulo: 'Perfil', Icone: IconePerfil },
];

function SeletorOrg({ className, escuro = false }: { className?: string; escuro?: boolean }) {
  const { orgs, orgId, setOrgId } = useOrg();
  const nav = useNavigate();
  const loc = useLocation();

  // Rotas que levam a organização na URL (ex.: /org/<id>/admins) não seguem só
  // o contexto — precisam trocar o id no caminho junto com o seletor.
  function trocar(novo: string) {
    setOrgId(novo);
    const resto = loc.pathname.match(/^\/org\/[^/]+(\/.*)?$/)?.[1] ?? null;
    if (resto !== null) nav(`/org/${novo}${resto}`, { replace: true });
  }

  if (orgs.length < 2) return null;
  return (
    <div className={`relative ${className ?? ''}`}>
      <select
        value={orgId}
        onChange={(e) => trocar(e.target.value)}
        aria-label="Trocar de organização"
        className={[
          'w-full appearance-none rounded-full border py-1.5 pl-3 pr-8 font-display text-xs font-semibold uppercase tracking-[0.04em]',
          escuro
            ? 'border-white/20 bg-white/10 text-white'
            : 'border-campo-200 bg-gramado-raised/90 text-campo-700',
        ].join(' ')}
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id} className="text-tinta">
            {o.nome}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        className={`pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 ${escuro ? 'stroke-white/70' : 'stroke-campo-600'}`}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const tecladoAberto = useTecladoAberto();
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col md:flex-row">
      {/* Sidebar — desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r linha-cal bg-gramado-raised/70 px-5 pb-6 pt-10 md:flex">
        <div className="mb-6 flex justify-center border-b border-campo-500/20 pb-6">
          <Logo size={104} />
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
                    ? 'bg-gradient-to-b from-campo-300 to-campo-500 text-noite shadow-ouro'
                    : 'text-tinta-soft hover:bg-campo-100/70 hover:text-campo-800',
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
        <header className="relative flex items-center justify-center border-b border-campo-500/25 bg-noite bg-brasao px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] text-white md:hidden">
          <Logo size={48} />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 max-w-[44%]">
            <SeletorOrg escuro />
          </div>
        </header>
        <div className="px-4 py-5 md:px-9 md:py-9">{children}</div>
      </main>

      {/* Bottom nav — mobile (escondida com o teclado aberto, ver useTecladoAberto) */}
      <nav
        className={cn(
          'safe-bottom fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-3xl border-t border-campo-500/20 bg-noite/95 backdrop-blur md:hidden',
          tecladoAberto && 'hidden',
        )}
      >
        {ITENS.map(({ to, rotulo, Icone, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              [
                'relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 font-display text-[0.68rem] font-semibold uppercase tracking-[0.04em] transition-colors',
                isActive ? 'text-campo-300' : 'text-white/45',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-campo-400" />}
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
