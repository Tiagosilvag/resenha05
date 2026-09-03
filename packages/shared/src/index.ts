export * from './telefone.js';
export * from './sorteio.js';
export * from './schemas/auth.js';
export * from './schemas/perfil.js';
export * from './schemas/organizacao.js';
export * from './schemas/pelada.js';

/** Formato do usuário logado devolvido pela API em /auth/* e /perfil. */
export interface SessaoUsuario {
  id: string;
  nome: string | null;
  telefone: string;
  fotoUrl: string | null;
  timeCoracao: string | null;
  telefoneVerificado: boolean;
  organizacoes: OrganizacaoDoUsuario[];
}

export interface OrganizacaoDoUsuario {
  id: string;
  nome: string;
  papel: 'jogador' | 'admin' | 'admin_principal';
  estrelas: number;
}
