import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { Aviso, Spinner } from '../components/ui';

export function EntrarOrg() {
  const { orgId = '' } = useParams();
  const { recarregar } = useAuth();
  const nav = useNavigate();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await api(`/organizacoes/${orgId}/entrar`, { method: 'POST' });
        await recarregar();
        nav('/peladas', { replace: true });
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : 'Não foi possível entrar nesta organização.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  return (
    <div className="grid place-items-center py-16">
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : <Spinner className="h-6 w-6 text-campo-600" />}
    </div>
  );
}
