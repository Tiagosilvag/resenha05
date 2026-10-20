import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { conectarMercadoPagoSchema, type ModoPagamentoJogador } from '@resenha05/shared';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { api, ApiError } from '../lib/api';
import { Aviso, Button, Card, Field, Input, Spinner, Textarea } from '../components/ui';

interface Organizacao {
  id: string;
  nome: string;
}

interface Config {
  souDono: boolean;
  modo: ModoPagamentoJogador;
  pix: { chave: string | null; favorecido: string | null; instrucoes: string | null };
  mercadoPago: {
    conectado: boolean;
    origem: 'oauth' | 'token' | null;
    conectadoEm: string | null;
    venceEm: string | null;
    oauthDisponivel: boolean;
  };
}

const OPCOES: { modo: ModoPagamentoJogador; titulo: string; texto: string }[] = [
  {
    modo: 'manual',
    titulo: 'Eu controlo por fora',
    texto: 'Os jogadores pagam como você combinar (dinheiro, Pix direto) e você marca quem pagou na lista.',
  },
  {
    modo: 'pix',
    titulo: 'Pix para a minha chave',
    texto: 'O jogador vê sua chave Pix (e o código “copia e cola” com o valor), paga e toca em “Já paguei”. Você confirma na lista.',
  },
  {
    modo: 'mercadopago',
    titulo: 'Automático pelo Mercado Pago',
    texto: 'O jogador paga por Pix ou cartão, sem precisar de conta, e o “pago” é marcado sozinho. O dinheiro cai na sua conta.',
  },
];

export function OrganizacaoMercadoPago() {
  const { orgId = '' } = useParams();
  const { usuario } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  // Esta tela é da organização que está na URL — alinha o seletor do topo a ela.
  const { orgId: orgSelecionada, setOrgId } = useOrg();
  useEffect(() => {
    if (orgId && orgId !== orgSelecionada) setOrgId(orgId);
  }, [orgId, orgSelecionada, setOrgId]);

  const { data: org, isLoading } = useQuery({
    queryKey: ['organizacao', orgId],
    queryFn: () => api<Organizacao>(`/organizacoes/${orgId}`),
    enabled: Boolean(orgId),
  });
  const vinculo = usuario?.organizacoes.find((o) => o.id === orgId);
  const souAdmin = vinculo?.papel === 'admin' || vinculo?.papel === 'admin_principal';

  const { data: cfg } = useQuery({
    queryKey: ['pagamento-jogadores', orgId],
    queryFn: () => api<Config>(`/organizacoes/${orgId}/pagamento-jogadores`),
    enabled: Boolean(orgId) && souAdmin,
  });

  const [modo, setModo] = useState<ModoPagamentoJogador>('manual');
  const [chave, setChave] = useState('');
  const [favorecido, setFavorecido] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!cfg) return;
    setModo(cfg.modo);
    setChave(cfg.pix.chave ?? '');
    setFavorecido(cfg.pix.favorecido ?? '');
    setInstrucoes(cfg.pix.instrucoes ?? '');
  }, [cfg]);

  // Volta do Mercado Pago depois de autorizar (ou negar) a conexão.
  useEffect(() => {
    if (params.get('conectado')) {
      setOk('Conta do Mercado Pago conectada!');
      qc.invalidateQueries({ queryKey: ['pagamento-jogadores', orgId] });
    } else if (params.get('erro')) {
      setErro(
        params.get('erro') === 'negado'
          ? 'A conexão não foi autorizada no Mercado Pago.'
          : 'Não foi possível concluir a conexão. Tente de novo.',
      );
    }
    if (params.get('conectado') || params.get('erro')) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const depois = () => {
    setErro(null);
    qc.invalidateQueries({ queryKey: ['pagamento-jogadores', orgId] });
    qc.invalidateQueries({ queryKey: ['organizacao', orgId] });
  };
  const falhou = (e: unknown) => setErro(e instanceof ApiError ? e.message : 'Não foi possível concluir.');

  const salvar = useMutation({
    mutationFn: () =>
      api(`/organizacoes/${orgId}/pagamento-jogadores`, {
        method: 'PUT',
        json: { modo, pixChave: chave, pixFavorecido: favorecido, pixInstrucoes: instrucoes },
      }),
    onSuccess: () => {
      depois();
      setOk('Salvo!');
      setTimeout(() => setOk(null), 2500);
    },
    onError: falhou,
  });

  const conectar = useMutation({
    mutationFn: () => api<{ url: string }>(`/organizacoes/${orgId}/mercadopago/oauth/iniciar`, { method: 'POST' }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: falhou,
  });
  const desconectar = useMutation({
    mutationFn: () => api(`/organizacoes/${orgId}/mercadopago/oauth`, { method: 'DELETE' }),
    onSuccess: depois,
    onError: falhou,
  });
  const colarToken = useMutation({
    mutationFn: () => api(`/organizacoes/${orgId}/mercadopago`, { method: 'POST', json: { accessToken } }),
    onSuccess: () => {
      setAccessToken('');
      depois();
      setOk('Conta conectada.');
    },
    onError: falhou,
  });

  if (isLoading || (souAdmin && !cfg)) return <Spinner className="h-6 w-6 text-campo-600" />;
  if (!org) return <Aviso tipo="erro">Organização não encontrada.</Aviso>;

  if (!souAdmin || !cfg) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Pagamento dos jogadores</h1>
        <Aviso tipo="info">Só os administradores da organização veem esta tela.</Aviso>
      </div>
    );
  }

  const souDono = cfg.souDono;
  const mp = cfg.mercadoPago;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Pagamento dos jogadores</h1>
        <p className="text-sm text-tinta-soft">
          {org.nome} · como os jogadores pagam a pelada.
          {!souDono && ' Só o administrador principal altera.'}
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Como os jogadores pagam">
        {OPCOES.map((o) => (
          <label
            key={o.modo}
            className={`flex cursor-pointer gap-3 rounded-2xl border p-3.5 transition-colors ${
              modo === o.modo ? 'border-campo-400 bg-campo-50' : 'border-tinta-line bg-gramado-raised'
            } ${souDono ? '' : 'cursor-not-allowed opacity-70'}`}
          >
            <input
              type="radio"
              name="modo"
              checked={modo === o.modo}
              disabled={!souDono}
              onChange={() => setModo(o.modo)}
              className="mt-1 accent-campo-600"
            />
            <span>
              <span className="block font-display text-sm font-bold uppercase tracking-[0.04em]">{o.titulo}</span>
              <span className="block text-sm text-tinta-soft">{o.texto}</span>
            </span>
          </label>
        ))}
      </div>

      {modo === 'pix' && (
        <Card className="flex flex-col gap-3">
          <p className="eyebrow">Seus dados do Pix</p>
          <Field label="Chave Pix" dica="E-mail, telefone, CPF/CNPJ ou chave aleatória.">
            <Input value={chave} disabled={!souDono} onChange={(e) => setChave(e.target.value)} placeholder="sua chave Pix" />
          </Field>
          <Field label="Nome de quem recebe" dica="Aparece para o jogador conferir antes de pagar.">
            <Input value={favorecido} disabled={!souDono} onChange={(e) => setFavorecido(e.target.value)} placeholder="ex.: Tiago Silva" />
          </Field>
          <Field label="Recado para os jogadores (opcional)">
            <Textarea
              value={instrucoes}
              disabled={!souDono}
              onChange={(e) => setInstrucoes(e.target.value)}
              rows={2}
              placeholder="ex.: mande o comprovante no grupo"
            />
          </Field>
        </Card>
      )}

      {modo === 'mercadopago' && (
        <Card className="flex flex-col gap-3">
          <p className="eyebrow">Sua conta do Mercado Pago</p>
          <p className="text-sm text-tinta-soft">
            {mp.conectado
              ? mp.origem === 'oauth'
                ? `Conectada${mp.conectadoEm ? ` em ${new Date(mp.conectadoEm).toLocaleDateString('pt-BR')}` : ''}.`
                : 'Conectada por Access Token.'
              : 'Ainda não conectada. Sem ela, os jogadores não conseguem pagar por aqui.'}
          </p>
          {souDono && mp.oauthDisponivel && (
            <>
              <Button variante={mp.origem === 'oauth' ? 'secundario' : 'primario'} disabled={conectar.isPending} onClick={() => conectar.mutate()}>
                {conectar.isPending ? <Spinner /> : mp.origem === 'oauth' ? 'Reconectar com Mercado Pago' : 'Conectar com Mercado Pago'}
              </Button>
              <p className="text-xs text-tinta-faint">
                Você entra na sua conta do Mercado Pago e autoriza. Não precisa copiar nenhuma senha ou chave.
              </p>
              {mp.origem === 'oauth' && (
                <Button
                  variante="fantasma"
                  disabled={desconectar.isPending}
                  onClick={() => {
                    if (confirm('Desconectar sua conta do Mercado Pago?')) desconectar.mutate();
                  }}
                >
                  Desconectar
                </Button>
              )}
            </>
          )}
          {souDono && !mp.oauthDisponivel && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setErro(null);
                const parsed = conectarMercadoPagoSchema.safeParse({ accessToken });
                if (!parsed.success) {
                  setErro(parsed.error.issues[0]?.message ?? 'Confira o Access Token.');
                  return;
                }
                colarToken.mutate();
              }}
            >
              <Field label="Access Token de produção" dica="Da sua conta no Mercado Pago (Suas integrações → Credenciais).">
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="APP_USR-..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                />
              </Field>
              <Button type="submit" variante="secundario" disabled={colarToken.isPending}>
                {colarToken.isPending ? <Spinner /> : 'Salvar token'}
              </Button>
            </form>
          )}
        </Card>
      )}

      {souDono && (
        <Button
          disabled={salvar.isPending || (modo === 'pix' && !chave.trim())}
          onClick={() => {
            setErro(null);
            salvar.mutate();
          }}
        >
          {salvar.isPending ? <Spinner /> : 'Salvar'}
        </Button>
      )}

      <button
        className="font-display text-sm font-semibold uppercase tracking-[0.03em] text-campo-700"
        onClick={() => nav(-1)}
      >
        Voltar
      </button>
    </div>
  );
}
