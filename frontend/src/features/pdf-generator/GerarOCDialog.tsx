import * as React from 'react'
import { pdf } from '@react-pdf/renderer'
import { Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useTransitStatus } from '@/features/solicitacoes/useSolicitacoes'
import { traduzirErroBanco } from '@/features/crud/useCrudQueries'
import { OCDocument, type OCData } from './OCDocument'
import { LOGO_DATA_URL } from './logo'
import type { SolicitacaoListRow } from '@/features/solicitacoes/useSolicitacoes'
import type { Tables } from '@/types/database.types'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  solicitacao: SolicitacaoListRow
  material: Pick<Tables<'materiais'>, 'cnpj_filial' | 'filial' | 'origem_padrao' | 'observacoes_padrao'> | null
  /** Chamado após upload + transição de status terem sucesso. */
  onSaved?: () => void
}

const EMPRESA_NOME = 'OC EXPRESS TRANSPORTES'

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}
function yyyymmdd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function GerarOCDialog({ open, onOpenChange, solicitacao, material, onSaved }: Props) {
  const { profile } = useAuth()
  const transit = useTransitStatus()
  const [confirmReplace, setConfirmReplace] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [blob, setBlob] = React.useState<Blob | null>(null)
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null)
  const [building, setBuilding] = React.useState(false)

  const validadeInicio = solicitacao.validade_inicio ?? todayISO()
  const validadeFim = solicitacao.validade_fim ?? addDaysISO(validadeInicio, 1)

  const motoristaNome = solicitacao.motorista?.nome_completo ?? ''
  const motoristaCpf = solicitacao.motorista?.cpf ?? ''
  const cavaloPlaca = solicitacao.veiculo?.placa ?? ''
  const ultimaCarreta = solicitacao.carreta?.placa ?? ''
  const subcontratadaNome = solicitacao.subcontratada?.razao_social ?? ''
  const clienteRazao = solicitacao.cliente?.razao_social ?? ''
  const clienteCidade = solicitacao.cliente?.cidade ?? ''
  const clienteUf = solicitacao.cliente?.uf ?? ''
  const materialNome = solicitacao.material?.nome ?? ''
  const numeroInstrucao = solicitacao.numero_instrucao ?? ''
  const localCarregamento = solicitacao.local_carregamento ?? material?.origem_padrao ?? ''
  const subtipo = solicitacao.material_subtipo ?? null
  const profileNome = profile?.nome_completo ?? ''
  const matCnpj = material?.cnpj_filial ?? ''
  const matFilial = material?.filial ?? ''
  const matObs = material?.observacoes_padrao ?? ''

  const data: OCData | null = React.useMemo(() => {
    if (!material) return null
    const cidadeUf = [clienteCidade, clienteUf].filter(Boolean).join('/')
    const isMinerio = /MIN[ÉE]RIO/i.test(materialNome)
    const materialFinal = subtipo
      ? isMinerio
        ? subtipo
        : `${materialNome} - ${subtipo}`
      : materialNome
    const motoristaLinha = motoristaCpf
      ? `${motoristaNome} — CPF ${motoristaCpf}`
      : motoristaNome
    return {
      numero: pad4(solicitacao.numero_interno),
      empresa: EMPRESA_NOME,
      cnpj_filial: matCnpj,
      filial: matFilial,
      subcontratada: subcontratadaNome || null,
      motorista: motoristaLinha,
      cavalo_placa: cavaloPlaca,
      ultima_carreta: ultimaCarreta,
      carregamento: localCarregamento,
      destino: cidadeUf,
      instrucao: numeroInstrucao,
      descarga: clienteRazao,
      material: materialFinal,
      observacoes_padrao: matObs,
      autorizado_por: profileNome,
      validade_inicio: isoToDate(validadeInicio),
      validade_fim: isoToDate(validadeFim),
      logoUrl: LOGO_DATA_URL,
    }
  }, [
    material, solicitacao.numero_interno, subcontratadaNome, motoristaNome, motoristaCpf,
    cavaloPlaca, ultimaCarreta, clienteRazao, clienteCidade, clienteUf, materialNome,
    subtipo, numeroInstrucao, localCarregamento, profileNome, matCnpj, matFilial, matObs,
    validadeInicio, validadeFim,
  ])

  const [lastTrigger, setLastTrigger] = React.useState<{ open: boolean; data: OCData | null }>({ open: false, data: null })
  if (lastTrigger.open !== open || lastTrigger.data !== data) {
    const wasOpen = lastTrigger.open
    setLastTrigger({ open, data })
    if (open && data && !building) setBuilding(true)
    if (!open && wasOpen) {
      if (blob) setBlob(null)
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }

  React.useEffect(() => {
    if (!open || !data) return
    let cancelled = false
    pdf(<OCDocument data={data} />).toBlob().then((b) => {
      if (cancelled) return
      setBlob(b)
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(b)
      })
      setBuilding(false)
    }).catch((err) => {
      if (cancelled) return
      setBuilding(false)
      toast.error(traduzirErroBanco(err))
    })
    return () => { cancelled = true }
  }, [open, data])

  React.useEffect(() => {
    return () => {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [])

  const filename = `OC_${pad4(solicitacao.numero_interno)}_${yyyymmdd(new Date())}.pdf`

  const doSave = async () => {
    if (!blob) return
    setSaving(true)
    try {
      const { error: upErr } = await supabase.storage
        .from('ocs-pdf')
        .upload(filename, blob, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw upErr

      const { data: pub } = supabase.storage.from('ocs-pdf').getPublicUrl(filename)
      const pdfUrl = pub.publicUrl

      await transit.mutateAsync({
        id: solicitacao.id,
        status: 'oc_gerada',
        extra: { pdf_url: pdfUrl },
      })
      onOpenChange(false)
      if (onSaved) onSaved()
      else toast.success('OC salva no Storage e status atualizado')
    } catch (err) {
      toast.error(traduzirErroBanco(err))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmar = () => {
    if (!blob) return
    if (solicitacao.pdf_url) setConfirmReplace(true)
    else void doSave()
  }

  if (!material) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Material não vinculado</DialogTitle>
            <DialogDescription>
              Vincule um material à solicitação antes de gerar a OC — o CNPJ e a filial vêm do material.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[860px] grid-rows-[auto_1fr_auto]">
          <DialogHeader>
            <DialogTitle>Pré-visualização da OC nº {data?.numero}</DialogTitle>
            <DialogDescription>
              Confira o conteúdo. Ao confirmar, o PDF será salvo no Storage e o status irá para "OC gerada".
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="max-h-[70vh] p-0">
            {blobUrl ? (
              <iframe
                src={blobUrl}
                title="Pré-visualização da OC"
                style={{ width: '100%', height: '70vh', border: 'none' }}
              />
            ) : (
              <div className="flex h-[70vh] items-center justify-center text-[13px] text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando pré-visualização…
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <span className="text-[11px] text-muted-foreground/80">
              Esc para fechar
            </span>
            <div className="flex items-center gap-2">
              <Button
                asChild={!!blobUrl}
                variant="outline"
                disabled={!blobUrl || building}
              >
                {blobUrl ? (
                  <a href={blobUrl} download={filename}>
                    <Download className="h-4 w-4" />
                    Baixar PDF
                  </a>
                ) : (
                  <span>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando…
                  </span>
                )}
              </Button>
              <Button onClick={handleConfirmar} disabled={saving || !blob || building}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar e salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title="Substituir PDF existente?"
        description="Já existe uma OC gerada para essa solicitação. Confirmar irá sobrescrever o arquivo anterior."
        confirmLabel="Sim, substituir"
        destructive
        onConfirm={async () => {
          await doSave()
          setConfirmReplace(false)
        }}
      />
    </>
  )
}
