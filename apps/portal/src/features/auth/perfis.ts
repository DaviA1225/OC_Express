import type { ParceiroPerfil } from '@sislog/shared/types'

// Rótulos dos perfis do PARCEIRO — fonte única (antes duplicados no menu do
// usuário e em Usuários). Espelha apps/interno/src/features/auth/perfis.ts.

export const PERFIL_LABELS: Record<ParceiroPerfil, string> = {
  admin_parceiro: 'Administrador',
  operador_parceiro: 'Operador',
}

/** Rótulo do perfil; desconhecido volta como veio, ausente vira "—". */
export function labelPerfil(perfil: string | null | undefined): string {
  if (!perfil) return '—'
  return PERFIL_LABELS[perfil as ParceiroPerfil] ?? perfil
}

/** Iniciais do nome para avatar: "Davi A. Souza" → "DS"; "Davi" → "DA". */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}
