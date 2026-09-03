import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Card, Estrelas, Button } from '../components/ui';

interface ExtraResp {
  progresso: number;
  extra: unknown | null;
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
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-extrabold tracking-tight">Olá, {primeiroNome} 👋</h1>

      {progresso < 100 && (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Complete seu cadastro</h2>
              <p className="text-sm text-black/55">
                Alguns dados a mais ajudam nas campanhas e no uniforme.
              </p>
            </div>
            <span className="text-sm font-bold text-campo-700">{progresso}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-campo-100">
            <div className="h-full rounded-full bg-campo-600 transition-all" style={{ width: `${progresso}%` }} />
          </div>
          <Link to="/completar-cadastro" className="mt-3 inline-block">
            <Button variante="secundario">Completar</Button>
          </Link>
        </Card>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/45">
          Minhas organizações
        </h2>
        {usuario?.organizacoes.length ? (
          <div className="flex flex-col gap-2">
            {usuario.organizacoes.map((o) => (
              <Card key={o.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{o.nome}</p>
                    <p className="text-xs capitalize text-black/50">{o.papel.replace('_', ' ')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Estrelas n={o.estrelas} />
                    {(o.papel === 'admin' || o.papel === 'admin_principal') && (
                      <Link to={`/org/${o.id}/admins`} className="text-sm font-semibold text-campo-700">
                        Gerir
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-sm text-black/55">
              Você ainda não está em nenhuma pelada. Peça o link de convite ao organizador.
            </p>
          </Card>
        )}
      </section>

      <Link to="/peladas">
        <Button className="w-full">Ver peladas</Button>
      </Link>
    </div>
  );
}
