import type { Tables, PerfilUsuario } from '@/types/database.types'

export type PerfilRow = Tables<'perfis_usuarios'>

function is(profile: PerfilRow | null, ...allowed: PerfilUsuario[]): boolean {
  if (!profile || !profile.ativo) return false
  return allowed.includes(profile.perfil)
}

// ── Visualização (rotas) ────────────────────────────────────────────────────

/** Auditoria: admin, gerente, supervisor. Analista e assistente não veem. */
export function canViewAuditoria(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente', 'supervisor')
}

/** Relatórios: admin, gerente, supervisor, analista. Assistente não vê. */
export function canViewRelatorios(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente', 'supervisor', 'analista')
}

/** Usuários: somente admin. */
export function canViewUsuarios(p: PerfilRow | null): boolean {
  return is(p, 'admin')
}

// ── Edição (capacidades por recurso) ────────────────────────────────────────

/** Solicitações: criar/editar/transit/gerar PDF. admin, analista, assistente. */
export function canEditSolicitacoes(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'analista', 'assistente')
}

/** Cadastros operacionais (motoristas, veículos, carretas, subcontratadas). */
export function canEditCadastrosOperacionais(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'analista', 'assistente')
}

/** Clientes (dados básicos + frete + status + tipos). admin, gerente, supervisor, analista. */
export function canEditClientes(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente', 'supervisor', 'analista')
}

/** Materiais. admin, supervisor, analista. */
export function canEditMateriais(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'supervisor', 'analista')
}

/** Cargas de Retorno. admin, supervisor, analista. */
export function canEditCargasRetorno(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'supervisor', 'analista')
}

/** Usuários: admin. */
export function canManageUsuarios(p: PerfilRow | null): boolean {
  return is(p, 'admin')
}

/** Bulk actions (em todas as páginas): apenas admin. */
export function canUseBulkActions(p: PerfilRow | null): boolean {
  return is(p, 'admin')
}
