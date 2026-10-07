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

/**
 * Relatórios internos (produtividade nominal da equipe): só gestão —
 * admin, gerente, supervisor. Mostra desempenho pessoa a pessoa, então não é
 * exposto a analista/assistente (que aparecem no próprio relatório).
 */
export function canViewProdutividade(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente', 'supervisor')
}

/** Atividade da equipe (painel do "agora"): mesma gestão da produtividade. */
export function canViewAtividade(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente', 'supervisor')
}

/** Usuários: somente admin. */
export function canViewUsuarios(p: PerfilRow | null): boolean {
  return is(p, 'admin')
}

/** Segurança (eventos do portal): somente admin. */
export function canViewSeguranca(p: PerfilRow | null): boolean {
  return is(p, 'admin')
}

/**
 * Privacidade (LGPD): registro de acesso e fila de órfãos do storage. Mesmos
 * perfis que o RLS de `log_acesso` e `storage_remocao_pendente` (0059/0060).
 */
export function canViewPrivacidade(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente', 'supervisor')
}

/** Pedido do titular — exportar: admin e gerente (checado também na 0057). */
export function canExportarTitular(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente')
}

/** Pedido do titular — anonimizar: só admin (checado também na 0057). */
export function canAnonimizarTitular(p: PerfilRow | null): boolean {
  return is(p, 'admin')
}

/**
 * Modo ERP (0074): em piloto, só admin e analista podem ligar. Mesma regra da
 * RPC `definir_meu_layout` — a tela só esconde o que o servidor recusaria.
 */
export function canUsarLayoutErp(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'analista')
}

/** Parceiros: visualização livre para todo o time interno. */
export function canViewParceiros(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente', 'supervisor', 'analista', 'assistente')
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

/** Parceiros (criar/editar/desativar/excluir): admin, gerente, supervisor. */
export function canEditParceiros(p: PerfilRow | null): boolean {
  return is(p, 'admin', 'gerente', 'supervisor')
}

/** Bulk actions (em todas as páginas): apenas admin. */
export function canUseBulkActions(p: PerfilRow | null): boolean {
  return is(p, 'admin')
}
