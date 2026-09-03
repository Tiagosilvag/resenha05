import type { ColumnType, Generated } from 'kysely';

type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface ProfilesTable {
  id: Generated<string>;
  nome: string | null;
  telefone: string;
  senha_hash: string;
  telefone_verificado_em: Timestamp | null;
  foto_url: string | null;
  time_coracao: string | null;
  created_at: Generated<Timestamp>;
  atualizado_em: Generated<Timestamp>;
}

export interface SessoesTable {
  id: Generated<string>;
  profile_id: string;
  token_hash: string;
  user_agent: string | null;
  criado_em: Generated<Timestamp>;
  expira_em: Timestamp;
  revogado_em: Timestamp | null;
}

export interface PerfilExtraTable {
  profile_id: string;
  data_nascimento: string | null;
  email: string | null;
  cidade: string | null;
  posicao: string | null;
  pe_preferido: string | null;
  tamanho_camisa: string | null;
  aceite_marketing: Generated<boolean>;
  atualizado_em: Generated<Timestamp>;
}

export interface OrganizacoesTable {
  id: Generated<string>;
  nome: string;
  dono_id: string;
  mp_token_cipher: Buffer | null;
  mp_token_nonce: Buffer | null;
  mp_token_atualizado_em: Timestamp | null;
  status_assinatura: Generated<string>;
  criado_em: Generated<Timestamp>;
}

export interface OrganizacaoMembrosTable {
  id: Generated<string>;
  organizacao_id: string;
  profile_id: string;
  papel: 'jogador' | 'admin' | 'admin_principal';
  estrelas: Generated<number>;
  ativo: Generated<boolean>;
  entrou_em: Generated<Timestamp>;
}

export interface PeladaConfiguracoesTable {
  id: Generated<string>;
  organizacao_id: string;
  nome: string;
  dia_semana: number;
  horario_jogo: string;
  horario_lista: string;
  local: string | null;
  valor_padrao: string | null;
  ativo: Generated<boolean>;
  criado_em: Generated<Timestamp>;
}

export interface PeladasTable {
  id: Generated<string>;
  organizacao_id: string;
  config_id: string | null;
  tipo: Generated<'pelada' | 'torneio' | 'campeonato'>;
  data: string;
  hora: string | null;
  local: string | null;
  valor: string | null;
  status: Generated<'aberta' | 'fechada' | 'realizada' | 'cancelada'>;
  criado_em: Generated<Timestamp>;
}

export interface PresencasTable {
  id: Generated<string>;
  pelada_id: string;
  profile_id: string;
  status: Generated<'confirmado' | 'pago' | 'desistiu'>;
  confirmado_em: Generated<Timestamp>;
  atualizado_em: Generated<Timestamp>;
}

export interface SorteiosTable {
  id: Generated<string>;
  pelada_id: string;
  n_times: number;
  criado_em: Generated<Timestamp>;
  criado_por: string | null;
}

export interface TimesTable {
  id: Generated<string>;
  sorteio_id: string;
  numero: number;
  nome: string | null;
}

export interface TimeJogadoresTable {
  time_id: string;
  profile_id: string;
  estrelas: number;
}

export interface Database {
  profiles: ProfilesTable;
  sessoes: SessoesTable;
  perfil_extra: PerfilExtraTable;
  organizacoes: OrganizacoesTable;
  organizacao_membros: OrganizacaoMembrosTable;
  pelada_configuracoes: PeladaConfiguracoesTable;
  peladas: PeladasTable;
  presencas: PresencasTable;
  sorteios: SorteiosTable;
  times: TimesTable;
  time_jogadores: TimeJogadoresTable;
}
