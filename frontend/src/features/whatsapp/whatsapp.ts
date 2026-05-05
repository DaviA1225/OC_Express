import { format } from 'date-fns'
import type { SolicitacaoListRow } from '@/features/solicitacoes/useSolicitacoes'
import { formatNumeroOC } from '@/lib/utils'

const COUNTRY_BR = '55'

/**
 * Normaliza telefone para formato exigido pelo wa.me.
 * Aceita "(67) 99999-1234", "67 99999-1234", "67999991234", etc.
 * Retorna apenas dígitos com DDI 55 prefixado. Retorna null se inválido.
 */
export function normalizeWhatsAppPhone(input: string | null | undefined): string | null {
  if (!input) return null
  const digits = input.replace(/\D/g, '')
  if (digits.length < 10) return null
  if (digits.startsWith(COUNTRY_BR) && digits.length >= 12) return digits
  return COUNTRY_BR + digits
}

/**
 * Monta o link wa.me com texto pré-preenchido.
 * Se phone for null, gera link sem destinatário (usuário escolhe na hora).
 */
export function buildWhatsAppLink(phone: string | null, text: string): string {
  const encoded = encodeURIComponent(text)
  if (phone) return `https://wa.me/${phone}?text=${encoded}`
  return `https://wa.me/?text=${encoded}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return format(new Date(y, m - 1, d), 'dd/MM/yyyy')
}

/**
 * Mensagem padrão da OC para enviar pelo WhatsApp.
 * Usa marcação simples (asterisco para negrito) que o WhatsApp interpreta.
 */
export function formatOCWhatsAppMessage(s: SolicitacaoListRow): string {
  const linhas: string[] = []
  linhas.push(`*ORDEM DE CARREGAMENTO ${formatNumeroOC(s.numero_interno)}*`)
  linhas.push('')

  if (s.motorista?.nome_completo) {
    const cpf = s.motorista.cpf ? ` — CPF ${s.motorista.cpf}` : ''
    linhas.push(`Motorista: ${s.motorista.nome_completo}${cpf}`)
  }
  if (s.veiculo?.placa) linhas.push(`Cavalo: ${s.veiculo.placa}`)
  if (s.carreta?.placa) linhas.push(`Carreta: ${s.carreta.placa}`)
  if (s.subcontratada?.razao_social) linhas.push(`Empresa: ${s.subcontratada.razao_social}`)

  linhas.push('')

  if (s.local_carregamento) linhas.push(`Carregamento: ${s.local_carregamento}`)
  if (s.cliente?.razao_social) {
    const cidade = [s.cliente.cidade, s.cliente.uf].filter(Boolean).join('/')
    linhas.push(`Destino: ${s.cliente.razao_social}${cidade ? ` (${cidade})` : ''}`)
  }
  if (s.material?.nome) {
    const subtipo = s.material_subtipo ? ` — ${s.material_subtipo}` : ''
    linhas.push(`Material: ${s.material.nome}${subtipo}`)
  }
  if (s.numero_instrucao) linhas.push(`Instrução: ${s.numero_instrucao}`)

  if (s.validade_inicio || s.validade_fim) {
    linhas.push('')
    linhas.push(`Validade: ${fmtDate(s.validade_inicio)} a ${fmtDate(s.validade_fim)}`)
  }

  if (s.pdf_url) {
    linhas.push('')
    linhas.push(`PDF: ${s.pdf_url}`)
  }

  return linhas.join('\n')
}

/**
 * Opções de destinatário disponíveis numa solicitação.
 */
export interface WhatsAppDestino {
  label: string
  phone: string
  raw: string
}

export function listarDestinosWhatsApp(s: SolicitacaoListRow): WhatsAppDestino[] {
  const out: WhatsAppDestino[] = []
  const tel = s.motorista?.telefone
  if (tel) {
    const norm = normalizeWhatsAppPhone(tel)
    if (norm) out.push({ label: `Motorista — ${s.motorista?.nome_completo ?? ''}`.trim(), phone: norm, raw: tel })
  }
  if (s.solicitante_telefone) {
    const norm = normalizeWhatsAppPhone(s.solicitante_telefone)
    if (norm) {
      out.push({
        label: `Solicitante — ${s.solicitante_nome ?? 'sem nome'}`.trim(),
        phone: norm,
        raw: s.solicitante_telefone,
      })
    }
  }
  return out
}
