import { useEffect } from 'react';
import { Aviso, Button, Estrelas, Select } from '../../components/ui';

export interface TimeParaEditar {
  numero: number;
  jogadores: { profileId: string; nome: string | null; estrelas: number }[];
}

/**
 * Edição manual dos times do sorteio (rascunho): todos os times numa tela só,
 * cada jogador com um "mover para" — um mecanismo só, sem repetir a lista de
 * cada time duas vezes. Cada movimento vale na hora.
 */
export function EditarTimesModal({
  times,
  aoMover,
  movendo,
  erro,
  onFechar,
}: {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Editar times"
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-gramado-raised shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-gramado-dark px-4 py-3 text-white">
          <h2 className="font-display text-base font-bold uppercase tracking-[0.05em] text-white">Editar times</h2>
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

          {times.map((t) => (
            <section key={t.numero}>
              <p className="eyebrow mb-1.5">
                Time {t.numero} ({t.jogadores.length})
              </p>
              {t.jogadores.length === 0 ? (
                <p className="text-sm text-tinta-faint">Time vazio.</p>
              ) : (
                <ul className="divide-y divide-tinta-line/50 overflow-hidden rounded-xl border border-tinta-line/70 text-sm">
                  {t.jogadores.map((j) => (
                    <li key={j.profileId} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate">{j.nome ?? 'Jogador'}</span>
                        <Estrelas n={j.estrelas} className="mt-0.5" />
                      </span>
                      <Select
                        aria-label={`Mover ${j.nome ?? 'jogador'} para outro time`}
                        value=""
                        disabled={movendo}
                        className="!w-auto !py-1.5 !text-sm"
                        onChange={(e) => {
                          if (e.target.value) aoMover(j.profileId, Number(e.target.value));
                        }}
                      >
                        <option value="">Mover para…</option>
                        {times
                          .filter((o) => o.numero !== t.numero)
                          .map((o) => (
                            <option key={o.numero} value={o.numero}>
                              Time {o.numero}
                            </option>
                          ))}
                      </Select>
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
