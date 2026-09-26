# Escudos dos times

Opcional. Se existir `<id>.png` aqui, a cartinha usa esse escudo no canto em vez
do escudo genérico (cores do time + sigla). O repositório **não** traz escudos:
são marca registrada — coloque só os que você tem direito de usar.

- `<id>` é o `id` do time em `packages/shared/src/times.ts` (ex.: `flamengo`,
  `sao-paulo`, `atletico-mg`, `boca`).
- PNG com fundo transparente, de preferência ~256 px de altura.
- Depois de adicionar, suba o `VERSAO_LAYOUT` em
  `apps/api/src/modules/cartinha/rotas.ts` (ou apague `avatars/cards/` no volume)
  para regerar as cartas.
