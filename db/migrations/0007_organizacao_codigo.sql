-- =============================================================================
-- Codigo curto da organizacao: o que a pessoa digita para entrar (no cadastro
-- ou depois), sem depender do link de convite nem do UUID.
--
-- Alfabeto sem O/0 e I/1 para ninguem errar ao ler ou ditar o codigo.
-- =============================================================================

create or replace function novo_codigo_org()
returns text
language plpgsql
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  tentativa text;
  i int;
begin
  loop
    tentativa := '';
    for i in 1..6 loop
      tentativa := tentativa || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from organizacoes where codigo = tentativa);
  end loop;
  return tentativa;
end;
$$;

alter table organizacoes add column codigo text;

-- Uma organizacao por vez: dentro de um mesmo UPDATE a funcao nao enxergaria
-- os codigos gerados para as outras linhas e poderia repetir.
do $$
declare
  r record;
begin
  for r in select id from organizacoes where codigo is null loop
    update organizacoes set codigo = novo_codigo_org() where id = r.id;
  end loop;
end;
$$;

alter table organizacoes alter column codigo set not null;
alter table organizacoes alter column codigo set default novo_codigo_org();
create unique index uq_organizacoes_codigo on organizacoes (codigo);
