/** CRC16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), o que o Pix usa no fim do código. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

/** Sem acento, sem símbolos, em caixa alta e no tamanho que o padrão do Pix aceita. */
function textoPix(texto: string, max: number): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, max);
}

export interface EntradaPixCopiaECola {
  /** Chave Pix de quem recebe (e-mail, telefone, CPF/CNPJ ou chave aleatória). */
  chave: string;
  /** Nome de quem recebe, como aparece para quem paga. */
  favorecido: string;
  /** Valor em reais; sem ele, quem paga digita. */
  valor?: number | null;
  /** Identificador da cobrança (letras e números, até 25); sem ele vale "***". */
  txid?: string;
}

/**
 * Código "Pix copia e cola" (estático) com o valor já preenchido: o jogador cola no
 * banco e só confirma. Segue o padrão BR Code do Banco Central.
 */
export function gerarPixCopiaECola(e: EntradaPixCopiaECola): string {
  const chave = e.chave.trim();
  const conta = campo('00', 'BR.GOV.BCB.PIX') + campo('01', chave);
  const txid = (e.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const partes = [
    campo('00', '01'),
    campo('01', '11'),
    campo('26', conta),
    campo('52', '0000'),
    campo('53', '986'),
    ...(e.valor && e.valor > 0 ? [campo('54', e.valor.toFixed(2))] : []),
    campo('58', 'BR'),
    campo('59', textoPix(e.favorecido, 25) || 'RECEBEDOR'),
    campo('60', 'BRASIL'),
    campo('62', campo('05', txid)),
  ];
  const semCrc = partes.join('') + '6304';
  return semCrc + crc16(semCrc);
}
