import type { Tables, PerfilUsuario } from '@/types/database.types'

export type PerfilRow = Tables<'perfis_usuarios'>

function is(profile: PerfilRow | null, ...allowed: PerfilUsuario[]): boolean {
  if (!profile || !profile.ativo) return false
  return allowed.includes(profile.perfil)
}

// ── Visualização (rotas) ────────────────────────────────────────────────────

/** Auditoria: todos exceto assistente. */
export function canViewAuditoria(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente', 'supervisor', 'analista')
}

/** Usuários: somente admin. */
export function canViewUsuarios(p: PerfilRow | null): boolean {
  return is(p, 'admin')
}

// ── Edição (capacidades por recurso) ────────────────────────────────────────

/** Solicitações: criar/editar/transit/gerar PDF. Todos os perfis. */
export function canEditSolicitacoes(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente', 'supervisor', 'analista', 'assistente')
}

/** Cadastros operacionais (motoristas, veículos, carretas, subcontratadas): todos. */
export function canEditCadastrosOperacionais(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente', 'supervisor', 'analista', 'assistente')
}

/** Clientes (tudo: dados básicos + frete + status + tipos aceitos): admin/supervisor/analista. */
export function canEditClientes(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'supervisor', 'analista')
}

/** Materiais: admin/supervisor/analista. */
export function canEditMateriais(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'supervisor', 'analista')
}

/** Cargas de Retorno: admin/supervisor/analista. */
export function canEditCargasRetorno(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'supervisor', 'analista')
}

/** Usuários: admin. */
export function canManageUsuarios(p: PerfilRow | null): boolean {
  return is(p, 'admin')
}
