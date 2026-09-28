import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { cn } from '../components/ui';
import { AdminOrganizacoes } from './admin/AdminOrganizacoes';
import { AdminParticipantes } from './admin/AdminParticipantes';
import { AdminConfiguracoes } from './admin/AdminConfiguracoes';
import { AdminAdmins } from './admin/AdminAdmins';

type Aba = 'organizacoes' | 'participantes' | 'configuracoes' | 'admins';

export function Admin() {
  const { usuario } = useAuth();
  const [aba, setAba] = useState<Aba>('organizacoes');

  // A entrada no menu já só aparece pra quem tem papelPlataforma — isto é
  // defesa extra caso a rota seja aberta direto pela URL.
  if (!usuario?.papelPlataforma) return <Navigate to="/" replace />;
  const souDev = usuario.papelPlataforma === 'dev';

  const ABAS: { id: Aba; rotulo: string }[] = [
    { id: 'organizacoes', rotulo: 'Organizações' },
    { id: 'participantes', rotulo: 'Participantes' },
    { id: 'configuracoes', rotulo: 'Configurações' },
    ...(souDev ? [{ id: 'admins' as const, rotulo: 'Admins' }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Administração da plataforma</h1>
        <p className="text-sm text-tinta-soft">
          {souDev ? 'Você é o desenvolvedor da plataforma.' : 'Você é administrador da plataforma.'}
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-tinta-line/70 bg-gramado-raised p-1">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-lg px-3 py-2 font-display text-[0.8rem] font-semibold uppercase tracking-[0.03em] transition-colors',
              aba === a.id
                ? 'bg-gradient-to-b from-campo-300 to-campo-500 text-noite shadow-ouro'
                : 'text-tinta-soft hover:bg-campo-100/70',
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'organizacoes' && <AdminOrganizacoes />}
      {aba === 'participantes' && <AdminParticipantes />}
      {aba === 'configuracoes' && <AdminConfiguracoes />}
      {aba === 'admins' && souDev && <AdminAdmins />}
    </div>
  );
}
