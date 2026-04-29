export function isValidCpf(input: string): boolean {
  const cpf = input.replace(/\D/g, '')
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const digits = cpf.split('').map(Number)
  const calc = (slice: number[]) => {
    const sum = slice.reduce((acc, n, i) => acc + n * (slice.length + 1 - i), 0)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }

  if (calc(digits.slice(0, 9)) !== digits[9]) return false
  if (calc(digits.slice(0, 10)) !== digits[10]) return false
  return true
}

export function isValidCnpj(input: string): boolean {
  const cnpj = input.replace(/\D/g, '')
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  const digits = cnpj.split('').map(Number)
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  const calc = (slice: number[], weights: number[]) => {
    const sum = slice.reduce((acc, n, i) => acc + n * weights[i], 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }

  if (calc(digits.slice(0, 12), weights1) !== digits[12]) return false
  if (calc(digits.slice(0, 13), weights2) !== digits[13]) return false
  return true
}

const placaAntiga = /^[A-Z]{3}\d{4}$/
const placaMercosul = /^[A-Z]{3}\d[A-Z]\d{2}$/

export function isValidPlaca(input: string): boolean {
  const placa = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return placaAntiga.test(placa) || placaMercosul.test(placa)
}

export function isValidTelefone(input: string): boolean {
  const digits = input.replace(/\D/g, '')
  return digits.length === 10 || digits.length === 11
}
