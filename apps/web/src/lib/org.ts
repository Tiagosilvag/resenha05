import { useMemo, useState } from 'react';
import { useAuth } from './auth';

/** Hook comum: organização selecionada + se o usuário é admin dela. */
export function useOrgSelecionada() {
  const { usuario } = useAuth();
  const orgs = usuario?.organizacoes ?? [];
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '');
  const org = useMemo(() => orgs.find((o) => o.id === orgId) ?? orgs[0], [orgs, orgId]);
  const admin = org?.papel === 'admin' || org?.papel === 'admin_principal';
  return { orgs, orgId: org?.id ?? '', setOrgId, org, admin };
}
