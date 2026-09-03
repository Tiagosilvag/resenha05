/** Erro de aplicação com status HTTP — o error handler do Fastify traduz. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly codigo?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const erro = {
  naoAutorizado: (m = 'Faça login para continuar.') => new AppError(401, m, 'nao_autorizado'),
  proibido: (m = 'Você não tem permissão para isso.') => new AppError(403, m, 'proibido'),
  naoEncontrado: (m = 'Não encontrado.') => new AppError(404, m, 'nao_encontrado'),
  conflito: (m: string) => new AppError(409, m, 'conflito'),
  invalido: (m: string) => new AppError(422, m, 'invalido'),
};
