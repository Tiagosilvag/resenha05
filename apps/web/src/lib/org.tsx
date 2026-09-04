import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { OrganizacaoDoUsuario } from '@resenha05/shared';
import { useAuth } from './auth';

interface OrgCtx {
  orgs: OrganizacaoDoUsuario[];
  orgId: string;
  setOrgId: (id: string) => void;
  org: OrganizacaoDoUsuario | undefined;
  admin: boolean;
}

const Ctx = createContext<OrgCtx | null>(null);
const CHAVE = 'r5.org';

export function OrgProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const orgs = usuario?.organizacoes ?? [];
  const [orgId, setOrgIdState] = useState<string>(() => localStorage.getItem(CHAVE) ?? '');

  // Garante que o orgId selecionado existe na lista atual do usuário.
  useEffect(() => {
    if (orgs.length === 0) return;
    if (!orgs.some((o) => o.id === orgId)) {
      setOrgIdState(orgs[0]!.id);
    }
  }, [orgs, orgId]);

  const setOrgId = useCallback((id: string) => {
    setOrgIdState(id);
    localStorage.setItem(CHAVE, id);
  }, []);

  const valor = useMemo<OrgCtx>(() => {
    const org = orgs.find((o) => o.id === orgId) ?? orgs[0];
    return {
      orgs,
      orgId: org?.id ?? '',
      setOrgId,
      org,
      admin: org?.papel === 'admin' || org?.papel === 'admin_principal',
    };
  }, [orgs, orgId, setOrgId]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useOrg(): OrgCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useOrg fora do OrgProvider');
  return c;
}
