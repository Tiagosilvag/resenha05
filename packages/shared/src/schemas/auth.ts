import { z } from 'zod';
import { normalizarTelefone, telefoneCelularValido } from '../telefone.js';
import { codigoOrganizacao } from './organizacao.js';

const telefone = z
  .string()
  .trim()
  .transform(normalizarTelefone)
  .refine(telefoneCelularValido, {
    message: 'Digite o número completo com DDD: (XX) XXXXX-XXXX.',
  });

const senha = z
  .string()
  .min(8, 'A senha precisa de pelo menos 8 caracteres.')
  .max(200);

export const cadastroSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome.').max(120),
  telefone,
  senha,
  timeCoracao: z.string().trim().max(60).optional().nullable(),
  /** Entra direto numa organização já no cadastro. */
  codigoOrganizacao: codigoOrganizacao.optional(),
});
export type CadastroInput = z.infer<typeof cadastroSchema>;

export const loginSchema = z.object({
  telefone,
  senha: z.string().min(1, 'Informe a senha.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1),
  senhaNova: senha,
});

/** Admin cadastra um jogador (ex.: de um evento) só com nome e telefone. */
export const criarJogadorEventoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  telefone,
});

export const redefinirSenhaJogadorSchema = z.object({
  profileId: z.string().uuid(),
});

/** Quem entrou com a senha provisória define a própria senha. */
export const definirSenhaSchema = z.object({
  senhaNova: senha,
});
