import { useEffect } from 'react';
import { Aviso, Button, Estrelas, Select } from '../../components/ui';

export interface TimeParaEditar {
  numero: number;
  totalEstrelas: number;
  jogadores: { profileId: string; nome: string | null; estrelas: number }[];
}

/**
 * Edição manual de um time do sorteio (rascunho): mandar jogadores do time para
 * outro e trazer jogadores de outros times. Cada movimento vale na hora.
 */
export function EditarTimeModal({
  numero,
  times,
  aoMover,
  movendo,
  erro,
  onFechar,
}: {
  numero: number;
  times: TimeParaEditar[];
  aoMover: (profileId: string, timeNumero: number) => void;
  movendo: boolean;
  erro: string | null;
  onFechar: () => void;
}) {
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  const time = times.find((t) => t.numero === numero);
  const outros = times.filter((t) => t.numero !== numero);
  if (!time) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Editar time ${time.numero}`}
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-gramado-raised shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-gramado-dark px-4 py-3 text-white">
          <h2 className="font-display text-base font-bold uppercase tracking-[0.05em] text-white">
            Editar time {time.numero}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onFechar}
            className="grid h-7 w-7 place-items-center rounded-full text-white/80 hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M6 18 18 6" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <p className="text-sm text-tinta-soft">
            As mudanças valem na hora. Quando terminar, volte e confirme o sorteio.
          </p>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <section>
            <p className="eyebrow mb-1.5">No time {time.numero} ({time.jogadores.length})</p>
            {time.jogadores.length === 0 && (
              <p className="text-sm text-tinta-faint">Time vazio. Traga jogadores dos outros times abaixo.</p>
            )}
            <ul className="divide-y divide-tinta-line/50 overflow-hidden rounded-xl border border-tinta-line/70 text-sm">
              {time.jogadores.map((j) => (
                <li key={j.profileId} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{j.nome ?? 'Jogador'}</span>
                    <Estrelas n={j.estrelas} className="mt-0.5" />
                  </span>
                  <Select
                    aria-label={`Enviar ${j.nome ?? 'jogador'} para outro time`}
                    value=""
                    disabled={movendo}
                    className="!w-auto !py-1.5 !text-sm"
                    onChange={(e) => {
                      if (e.target.value) aoMover(j.profileId, Number(e.target.value));
                    }}
                  >
                    <option value="">Enviar para…</option>
                    {outros.map((o) => (
                      <option key={o.numero} value={o.numero}>
                        Time {o.numero}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </section>

          {outros.map((o) => (
            <section key={o.numero}>
              <p className="eyebrow mb-1.5">Do time {o.numero}</p>
              {o.jogadores.length === 0 ? (
                <p className="text-sm text-tinta-faint">Ninguém neste time.</p>
              ) : (
                <ul className="divide-y divide-tinta-line/50 overflow-hidden rounded-xl border border-tinta-line/70 text-sm">
                  {o.jogadores.map((j) => (
                    <li key={j.profileId} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate">{j.nome ?? 'Jogador'}</span>
                        <Estrelas n={j.estrelas} className="mt-0.5" />
                      </span>
                      <Button
                        variante="secundario"
                        className="shrink-0 !px-3 !py-1.5 !text-[0.8rem]"
                        disabled={movendo}
                        onClick={() => aoMover(j.profileId, time.numero)}
                      >
                        Trazer
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="border-t border-tinta-line/60 p-3">
          <Button className="w-full" onClick={onFechar}>
            Concluir
          </Button>
        </div>
      </div>
    </div>
  );
}
