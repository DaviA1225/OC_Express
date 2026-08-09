import { format } from 'date-fns'
import type { SolicitacaoListRow } from '@/features/solicitacoes/useSolicitacoes'
import { formatNumeroOC, maskCpf } from '@/lib/utils'

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
 *
 * `pdfUrl` é a signed URL temporária do PDF (gerada pelo chamador, validade de
 * 7 dias). Não usamos mais `s.pdf_url` direto porque agora ele guarda só o path
 * do bucket privado, que não abre sem assinatura.
 */
export function formatOCWhatsAppMessage(s: SolicitacaoListRow, pdfUrl?: string | null): string {
  const linhas: string[] = []
  linhas.push(`*ORDEM DE CARREGAMENTO ${formatNumeroOC(s.numero_interno)}*`)
  linhas.push('')

  if (s.motorista?.nome_completo) {
    // CPF mascarado de propósito (auditoria LGPD 08/2026). A mensagem sai por
    // WhatsApp — canal fora do controle da empresa e trivialmente encaminhável.
    // Os seis dígitos centrais bastam para o conferente casar a pessoa com o
    // documento em mãos; o CPF completo permanece no PDF da OC, que só abre por
    // link assinado. maskCpf devolve '' se o dado não for um CPF completo, e
    // nesse caso o campo é omitido em vez de cair no valor cru.
    const cpfMascarado = maskCpf(s.motorista.cpf)
    const cpf = cpfMascarado ? `, CPF ${cpfMascarado}` : ''
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
    const subtipo = s.material_subtipo ? `, ${s.material_subtipo}` : ''
    linhas.push(`Material: ${s.material.nome}${subtipo}`)
  }
  if (s.numero_instrucao) linhas.push(`Instrução: ${s.numero_instrucao}`)

  if (s.validade_inicio || s.validade_fim) {
    linhas.push('')
    linhas.push(`Validade: ${fmtDate(s.validade_inicio)} a ${fmtDate(s.validade_fim)}`)
  }

  if (pdfUrl) {
    linhas.push('')
    linhas.push(`PDF: ${pdfUrl}`)
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
    if (norm) out.push({ label: `Motorista, ${s.motorista?.nome_completo ?? ''}`.trim(), phone: norm, raw: tel })
  }
  if (s.solicitante_telefone) {
    const norm = normalizeWhatsAppPhone(s.solicitante_telefone)
    if (norm) {
      out.push({
        label: `Solicitante, ${s.solicitante_nome ?? 'sem nome'}`.trim(),
        phone: norm,
        raw: s.solicitante_telefone,
      })
    }
  }
  return out
}
