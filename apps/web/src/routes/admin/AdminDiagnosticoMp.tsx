import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AchadoDiagnostico } from '@resenha05/shared';
import { api, ApiError } from '../../lib/api';
import { Aviso, Button, Card, Input, Spinner } from '../../components/ui';

interface Resposta {
  conta: { id: string | null; nickname: string | null; email: string | null; siteId: string | null; ehTeste: boolean };
  ultimaAssinatura: {
    preapprovalId: string;
    organizacao: string;
    statusLocal: string;
    criadoEm: string;
    mp: {
      status: string;
      payerId: string | null;
      payerEmail: string | null;
      collectorId: string | null;
      valor: number | null;
      criadaEm: string | null;
    } | null;
    erro: string | null;
  } | null;
  pagamento: {
    operacao: string;
    mp: {
      status: string;
      statusDetail: string | null;
      meio: string | null;
      valor: number | null;
      payerId: string | null;
      payerEmail: string | null;
      criadoEm: string | null;
    } | null;
    erro: string | null;
  } | null;
  achados: AchadoDiagnostico[];
}

const TOM: Record<AchadoDiagnostico['tipo'], 'erro' | 'info' | 'ok'> = {
  problema: 'erro',
  atencao: 'info',
  info: 'ok',
};

function Linha({ rotulo, valor }: { rotulo: string; valor: string | number | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="shrink-0 text-tinta-faint">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{valor ?? '—'}</dd>
    </div>
  );
}

/** Pergunta ao Mercado Pago o que aconteceu com a última assinatura e com uma operação recusada. */
export function AdminDiagnosticoMp() {
  const [operacao, setOperacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const consultar = useMutation({
    mutationFn: () =>
      api<Resposta>(`/admin/diagnostico-mp${operacao.trim() ? `?operacao=${encodeURIComponent(operacao.trim())}` : ''}`),
    onMutate: () => setErro(null),
    onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível consultar agora.'),
  });
  const r = consultar.data;

  return (
    <Card>
      <p className="eyebrow mb-1">Diagnóstico de cobrança</p>
      <p className="mb-3 text-sm text-tinta-soft">
        Consulta o Mercado Pago com a credencial da plataforma. Se um pagamento foi recusado, cole o número da
        operação (o “#” da tela de recusa) para ver o motivo.
      </p>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          consultar.mutate();
        }}
      >
        <Input
          inputMode="numeric"
          placeholder="Nº da operação (opcional)"
          value={operacao}
          onChange={(e) => setOperacao(e.target.value.replace(/\D/g, ''))}
        />
        <Button type="submit" variante="secundario" disabled={consultar.isPending}>
          {consultar.isPending ? <Spinner /> : 'Consultar'}
        </Button>
      </form>

      {erro && <div className="mt-3"><Aviso tipo="erro">{erro}</Aviso></div>}

      {r && (
        <div className="mt-4 flex flex-col gap-4">
          {r.achados.length > 0 && (
            <div className="flex flex-col gap-2">
              {r.achados.map((a, i) => (
                <Aviso key={i} tipo={TOM[a.tipo]}>
                  {a.texto}
                </Aviso>
              ))}
            </div>
          )}

          <section>
            <p className="eyebrow mb-1">Conta vendedora (credencial salva)</p>
            <dl className="flex flex-col gap-1">
              <Linha rotulo="Apelido" valor={r.conta.nickname} />
              <Linha rotulo="E-mail" valor={r.conta.email} />
              <Linha rotulo="ID" valor={r.conta.id} />
              <Linha rotulo="País" valor={r.conta.siteId} />
              <Linha rotulo="Tipo" valor={r.conta.ehTeste ? 'TESTE' : 'Real'} />
            </dl>
          </section>

          <section>
            <p className="eyebrow mb-1">Última assinatura criada</p>
            {!r.ultimaAssinatura ? (
              <p className="text-sm text-tinta-faint">Nenhuma assinatura foi criada ainda.</p>
            ) : (
              <>
                <dl className="flex flex-col gap-1">
                  <Linha rotulo="Organização" valor={r.ultimaAssinatura.organizacao} />
                  <Linha rotulo="Criada em" valor={new Date(r.ultimaAssinatura.criadoEm).toLocaleString('pt-BR')} />
                  <Linha rotulo="Status no sistema" valor={r.ultimaAssinatura.statusLocal} />
                  <Linha rotulo="Status no Mercado Pago" valor={r.ultimaAssinatura.mp?.status} />
                  <Linha rotulo="E-mail do pagador" valor={r.ultimaAssinatura.mp?.payerEmail} />
                  <Linha rotulo="ID do pagador" valor={r.ultimaAssinatura.mp?.payerId} />
                  <Linha rotulo="Valor" valor={r.ultimaAssinatura.mp?.valor != null ? `R$ ${r.ultimaAssinatura.mp.valor.toFixed(2)}` : null} />
                </dl>
                {r.ultimaAssinatura.erro && (
                  <div className="mt-2"><Aviso tipo="erro">Mercado Pago: {r.ultimaAssinatura.erro}</Aviso></div>
                )}
              </>
            )}
          </section>

          {r.pagamento && (
            <section>
              <p className="eyebrow mb-1">Operação #{r.pagamento.operacao}</p>
              {r.pagamento.mp ? (
                <dl className="flex flex-col gap-1">
                  <Linha rotulo="Status" valor={r.pagamento.mp.status} />
                  <Linha rotulo="Motivo" valor={r.pagamento.mp.statusDetail} />
                  <Linha rotulo="Meio" valor={r.pagamento.mp.meio} />
                  <Linha rotulo="Valor" valor={r.pagamento.mp.valor != null ? `R$ ${r.pagamento.mp.valor.toFixed(2)}` : null} />
                  <Linha rotulo="E-mail do pagador" valor={r.pagamento.mp.payerEmail} />
                  <Linha rotulo="Data" valor={r.pagamento.mp.criadoEm ? new Date(r.pagamento.mp.criadoEm).toLocaleString('pt-BR') : null} />
                </dl>
              ) : (
                <Aviso tipo="erro">Mercado Pago: {r.pagamento.erro}</Aviso>
              )}
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
