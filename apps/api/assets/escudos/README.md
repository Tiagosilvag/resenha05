# Escudos dos times

Se existir `<id>.png` aqui, a cartinha usa esse escudo no canto em vez do
genérico (sigla + cores do time). `<id>` é o `id` do time em
`packages/shared/src/times.ts` (ex.: `flamengo`, `sao-paulo`, `atletico-mg`,
`boca`).

## De onde vêm

31 dos ~38 times do catálogo já têm escudo aqui, baixado do **Wikimedia
Commons** pelo `scripts/buscar-escudos.mjs`. Cada arquivo do Commons carrega
um metadado de licença explícito (`extmetadata.LicenseShortName`); a maioria
dos brasões de clube está marcada `Public domain` (forma geométrica/texto
simples, "PD-textlogo"/"PD-shape") + `Restrictions: trademarked` — pode
reproduzir a imagem, mas ela continua sendo marca do clube: não implica
endosso do clube ao app, não é pra revender nem usar fora daqui.

A maioria é `Public domain`/`CC0` (não pede atribuição). Três são
`CC BY-SA`, que pede — os créditos:

| arquivo | licença | autor/fonte |
|---|---|---|
| `vasco.png` | CC BY-SA 3.0 | [File:CR Vasco da Gama.svg](https://commons.wikimedia.org/wiki/File:CR_Vasco_da_Gama.svg) |
| `gremio.png` | CC BY-SA 3.0 | LonEMedia — [File:Grêmio FB Porto-Alegrense.svg](https://commons.wikimedia.org/wiki/File:Gr%C3%AAmio_FB_Porto-Alegrense.svg) |
| `remo.png` | CC BY-SA 4.0 | Clube do Remo — [File:Clube-do-remo-2008.png](https://commons.wikimedia.org/wiki/File:Clube-do-remo-2008.png) |

**Faltam** (ficam no genérico sigla+cores): `vitoria`, `bragantino`,
`barcelona`, `manchester-united`, `liverpool`, `milan`, `inter-milao`. Nesses
casos o Commons só tinha versão não-livre (o escudo atual, mais elaborado,
vive só na Wikipédia em inglês sob uso justo — não dá pra reaproveitar fora
de lá) ou nenhuma imagem confiável. `real-madrid` usa o escudo de 1931–1941
(sem coroa) por ser o único livre — não é o atual.

## Adicionar/trocar um

```bash
node scripts/buscar-escudos.mjs                # tenta todos os que faltam
node scripts/buscar-escudos.mjs vitoria boca    # só os ids passados
node scripts/buscar-escudos.mjs --arquivo vitoria "Nome do arquivo no Commons.svg"
```

A busca automática erra de vez em quando (nome de time bate com cidade,
santo, outro clube etc.) — sempre olhe o PNG antes de subir. Pra usar uma
fonte diferente (comprou/tem direito a um escudo oficial em alta
resolução), é só colocar o PNG com fundo transparente direto aqui.

Depois de mexer nos arquivos, suba o `VERSAO_LAYOUT` em
`apps/api/src/modules/cartinha/rotas.ts` (ou apague `avatars/cards/` no
volume) para regerar as cartas já em cache.
