// Rótulos dos perfis INTERNOS — fonte única. Antes duplicado em Sidebar,
// Header, BarraStatusErp, PerfilPage e UsuariosPage (estes dois migram na Fase C).
// Perfis do PARCEIRO têm rótulos próprios (ParceiroUsuariosPage).

export const PERFIL_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  supervisor: 'Supervisor',
  analista: 'Analista',
  assistente: 'Assistente',
}

/** Rótulo do perfil; desconhecido volta como veio, ausente vira "—". */
export function labelPerfil(perfil: string | null | undefined): string {
  if (!perfil) return '—'
  return PERFIL_LABELS[perfil] ?? perfil
}

/** Iniciais do nome para avatar: "Davi A. Souza" → "DS"; "Davi" → "DA". */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}
