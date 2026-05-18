// Formatadores de apresentação compartilhados entre o sistema interno e o
// portal de parceiros. Funções puras: recebem string/number e devolvem o
// texto formatado para exibição — nunca alteram o dado armazenado.

export function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function formatPlaca(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
}

export function formatDocumento(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) return formatCpf(digits)
  return formatCnpj(digits)
}

export function formatTelefone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

export function formatNumeroOC(numero: number): string {
  return `#${numero.toString().padStart(4, '0')}`
}

/**
 * Formata um número de Pamcard para exibição visual, agrupando de 4 em 4
 * dígitos. NÃO altera o dado armazenado — apenas a apresentação.
 *
 * Exemplo: '441781209999' -> '4417 8120 9999'
 *
 * Usado APENAS na visualização (cards, telas de detalhe). No input do
 * formulário e no banco, o valor permanece somente dígitos sem separadores.
 */
export function formatarPamcardParaExibicao(numero: string | null): string {
  if (!numero) return ''
  return numero.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}
