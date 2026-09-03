import { useEffect, useState } from 'react';
import { tokens } from '../lib/api';
import { Spinner } from './ui';

const cache = new Map<string, string>();

async function carregar(url: string): Promise<string> {
  const existente = cache.get(url);
  if (existente) return existente;
  const headers = new Headers();
  if (tokens.access) headers.set('authorization', `Bearer ${tokens.access}`);
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error('Não foi possível gerar a cartinha.');
  const objectUrl = URL.createObjectURL(await r.blob());
  cache.set(url, objectUrl);
  return objectUrl;
}

/** Cartinha de um jogador. Busca o PNG com o token e mostra a imagem. */
export function Cartinha({
  profileId,
  orgId,
  nome,
  baixavel = false,
  chave,
}: {
  profileId: string;
  orgId: string;
  nome?: string | null;
  baixavel?: boolean;
  /** muda quando a foto/estrelas do jogador mudam — força rebuscar */
  chave?: string | null;
}) {
  const sufixo = chave ? `&v=${encodeURIComponent(chave)}` : '';
  const url = `/api/jogadores/${profileId}/cartinha.png?org=${orgId}${sufixo}`;
  const [src, setSrc] = useState<string | null>(cache.get(url) ?? null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setErro(false);
    carregar(url)
      .then((u) => vivo && setSrc(u))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [url]);

  if (erro) return <p className="py-6 text-center text-sm text-tinta-faint">Cartinha indisponível.</p>;
  if (!src)
    return (
      <div className="grid aspect-[72/101] w-full max-w-[320px] place-items-center rounded-2xl bg-gramado-dark">
        <Spinner className="h-6 w-6 text-ouro-500" />
      </div>
    );

  return (
    <div className="flex flex-col items-center gap-3">
      <img src={src} alt={`Cartinha de ${nome ?? 'jogador'}`} className="w-full max-w-[320px] rounded-2xl" />
      {baixavel && (
        <a
          href={src}
          download={`cartinha-${(nome ?? 'jogador').toLowerCase().replace(/\s+/g, '-')}.png`}
          className="inline-flex items-center gap-2 rounded-xl border border-ouro-500/40 bg-gramado-dark px-4 py-2 font-display text-sm font-semibold uppercase tracking-[0.04em] text-ouro-300"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
          </svg>
          Baixar cartinha
        </a>
      )}
    </div>
  );
}

/** Modal simples para ver a cartinha de um jogador a partir de qualquer lista. */
export function CartinhaModal({
  profileId,
  orgId,
  nome,
  onFechar,
}: {
  profileId: string;
  orgId: string;
  nome?: string | null;
  onFechar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onFechar}
      role="dialog"
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Cartinha profileId={profileId} orgId={orgId} nome={nome} baixavel />
      </div>
    </div>
  );
}
