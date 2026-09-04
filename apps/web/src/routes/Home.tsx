import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Card, Estrelas, Button, Eyebrow } from '../components/ui';

interface ExtraResp {
  progresso: number;
  extra: unknown | null;
}

function AnelProgresso({ pct }: { pct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-campo-100" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className="text-campo-600 transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}

export function Home() {
  const { usuario } = useAuth();
  const { data } = useQuery({
    queryKey: ['perfil-extra'],
    queryFn: () => api<ExtraResp>('/perfil/extra'),
  });

  const primeiroNome = usuario?.nome?.split(' ')[0] ?? 'jogador';
  const progresso = data?.progresso ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-bold tracking-tight">
        E aí, <span className="text-campo-700">{primeiroNome}</span>
      </h1>

      {progresso < 100 && (
        <Link to="/completar-cadastro" className="block">
          <Card className="flex items-center gap-4 transition-shadow hover:shadow-pop">
            <div className="relative grid place-items-center">
              <AnelProgresso pct={progresso} />
              <span className="placar-num absolute text-xs text-campo-700">{progresso}%</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold uppercase tracking-[0.02em]">Complete seu cadastro</p>
              <p className="text-sm text-tinta-soft">Dados a mais ajudam nas campanhas e no uniforme.</p>
            </div>
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 stroke-tinta-faint" fill="none" strokeWidth="2" strokeLinecap="round">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Card>
        </Link>
      )}

      <section>
        <Eyebrow>Minhas organizações</Eyebrow>
        {usuario?.organizacoes.length ? (
          <div className="flex flex-col gap-2">
            {usuario.organizacoes.map((o) => (
              <Card key={o.id} className="flex items-center gap-3 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-campo-100 font-display text-base font-bold text-campo-700">
                  {o.nome.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{o.nome}</p>
                  <p className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-tinta-faint">
                    {o.papel.replace('_', ' ')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Estrelas n={o.estrelas} />
                  <Link
                    to={`/org/${o.id}/admins`}
                    className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-campo-700"
                  >
                    {o.papel === 'jogador' ? 'Ver' : 'Gerir'}
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-sm text-tinta-soft">
              Você ainda não está em nenhuma pelada. Peça o link de convite ao organizador — ou crie a sua.
            </p>
          </Card>
        )}
        <Link
          to="/nova-organizacao"
          className="mt-2.5 inline-flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-[0.04em] text-campo-700"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Criar minha organização
        </Link>
      </section>

      <Link to="/peladas">
        <Button className="w-full">Ver peladas</Button>
      </Link>
    </div>
  );
}
