import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { formatarCentavos } from '../../lib/dinheiro';
import { Aviso, Button, Card, Input, Spinner } from '../../components/ui';

interface Configuracoes {
  mensalidadeValorCentavos: number;
  mercadoPagoConectado: boolean;
  mpGeralAtualizadoEm: string | null;
  webhookConfigurado: boolean;
  webhookAtualizadoEm: string | null;
}

export function AdminConfiguracoes() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-configuracoes'],
    queryFn: () => api<Configuracoes>('/admin/configuracoes'),
  });

  const [valorReais, setValorReais] = useState('');
  const [erroValor, setErroValor] = useState<string | null>(null);
  const [okValor, setOkValor] = useState(false);

  useEffect(() => {
    if (data) setValorReais((data.mensalidadeValorCentavos / 100).toFixed(2));
  }, [data]);

  const salvarValor = useMutation({
    mutationFn: (valorCentavos: number) =>
      api('/admin/configuracoes', { method: 'PUT', json: { valorCentavos } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-configuracoes'] });
      setOkValor(true);
      setTimeout(() => setOkValor(false), 2500);
    },
    onError: (e) => setErroValor(e instanceof ApiError ? e.message : 'Não foi possível salvar.'),
  });

  const [accessToken, setAccessToken] = useState('');
  const [erroToken, setErroToken] = useState<string | null>(null);
  const [okToken, setOkToken] = useState(false);

  const salvarToken = useMutation({
    mutationFn: () => api('/admin/mercadopago', { method: 'POST', json: { accessToken } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-configuracoes'] });
      setAccessToken('');
      setOkToken(true);
      setTimeout(() => setOkToken(false), 2500);
    },
    onError: (e) => setErroToken(e instanceof ApiError ? e.message : 'Não foi possível conectar.'),
  });

  const [webhookSecret, setWebhookSecret] = useState('');
  const [erroWebhook, setErroWebhook] = useState<string | null>(null);
  const [okWebhook, setOkWebhook] = useState(false);

  const salvarWebhook = useMutation({
    mutationFn: () => api('/admin/mercadopago/webhook-secret', { method: 'POST', json: { webhookSecret } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-configuracoes'] });
      setWebhookSecret('');
      setOkWebhook(true);
      setTimeout(() => setOkWebhook(false), 2500);
    },
    onError: (e) => setErroWebhook(e instanceof ApiError ? e.message : 'Não foi possível salvar.'),
  });

  if (isLoading) return <Spinner className="h-5 w-5 text-campo-600" />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="eyebrow mb-1">Mensalidade</p>
        <p className="mb-3 text-sm text-tinta-soft">
          Valor cobrado de cada organização por mês. Hoje: {data && formatarCentavos(data.mensalidadeValorCentavos)}.
        </p>
        {erroValor && <Aviso tipo="erro">{erroValor}</Aviso>}
        {okValor && <Aviso tipo="ok">Valor atualizado.</Aviso>}
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErroValor(null);
            const reais = Number(valorReais.replace(',', '.'));
            if (!Number.isFinite(reais) || reais < 1) {
              setErroValor('Valor mínimo de R$ 1,00.');
              return;
            }
            salvarValor.mutate(Math.round(reais * 100));
          }}
        >
          <Input inputMode="decimal" value={valorReais} onChange={(e) => setValorReais(e.target.value)} />
          <Button type="submit" variante="secundario" disabled={salvarValor.isPending}>
            {salvarValor.isPending ? <Spinner /> : 'Salvar'}
          </Button>
        </form>
      </Card>

      <Card>
        <p className="eyebrow mb-1">Conta Mercado Pago da plataforma</p>
        <p className="mb-3 text-sm text-tinta-soft">
          {data?.mercadoPagoConectado
            ? `Conectada${
                data.mpGeralAtualizadoEm
                  ? ` desde ${new Date(data.mpGeralAtualizadoEm).toLocaleDateString('pt-BR')}`
                  : ''
              }.`
            : 'Ainda não conectada — as organizações não conseguem pagar a mensalidade até isso ser feito.'}
        </p>
        {erroToken && <Aviso tipo="erro">{erroToken}</Aviso>}
        {okToken && <Aviso tipo="ok">Conta conectada.</Aviso>}
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErroToken(null);
            salvarToken.mutate();
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            placeholder="Access Token de produção"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
          <Button
            type="submit"
            variante="secundario"
            disabled={salvarToken.isPending || accessToken.trim().length < 20}
          >
            {salvarToken.isPending ? <Spinner /> : 'Salvar'}
          </Button>
        </form>
      </Card>

      <Card>
        <p className="eyebrow mb-1">Segredo do webhook</p>
        <p className="mb-3 text-sm text-tinta-soft">
          {data?.webhookConfigurado
            ? `Configurado${
                data.webhookAtualizadoEm
                  ? ` desde ${new Date(data.webhookAtualizadoEm).toLocaleDateString('pt-BR')}`
                  : ''
              }.`
            : 'Ainda não configurado — sem ele, o webhook de assinatura recusa tudo.'}{' '}
          Cadastre a URL do webhook no painel do Mercado Pago e cole aqui o segredo que ele gerar.
        </p>
        {erroWebhook && <Aviso tipo="erro">{erroWebhook}</Aviso>}
        {okWebhook && <Aviso tipo="ok">Segredo salvo.</Aviso>}
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErroWebhook(null);
            salvarWebhook.mutate();
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            placeholder="Segredo do webhook"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
          />
          <Button
            type="submit"
            variante="secundario"
            disabled={salvarWebhook.isPending || webhookSecret.trim().length < 10}
          >
            {salvarWebhook.isPending ? <Spinner /> : 'Salvar'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
