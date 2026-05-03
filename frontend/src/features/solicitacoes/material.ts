export function isMineralMaterial(nome: string | null | undefined): boolean {
  if (!nome) return false
  const upper = nome.toUpperCase()
  return upper.includes('MINÉRIO') || upper.includes('MINERIO')
}
