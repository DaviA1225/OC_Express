import * as React from 'react'
import { PDFViewer, pdf, BlobProvider } from '@react-pdf/renderer'
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
import type { SolicitacaoListRow } from '@/features/solicitacoes/useSolicitacoes'
import type { Tables } from '@/types/database.types'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  solicitacao: SolicitacaoListRow
  material: Pick<Tables<'materiais'>, 'cnpj_filial' | 'filial' | 'origem_padrao' | 'observacoes_padrao'> | null
  subcontratada?: string | null
}

const EMPRESA_NOME = 'OC EXPRESS TRANSPORTES'
const LOGO_URL = `${window.location.origin}/Lhg-02.png`

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}
function yyyymmdd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

export function GerarOCDialog({ open, onOpenChange, solicitacao, material, subcontratada }: Props) {
  const { profile } = useAuth()
  const transit = useTransitStatus()
  const [confirmReplace, setConfirmReplace] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const today = React.useMemo(() => new Date(), [])
  const tomorrow = React.useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d
  }, [])

  const data: OCData | null = React.useMemo(() => {
    if (!material) return null
    return {
      numero: pad4(solicitacao.numero_interno),
      empresa: EMPRESA_NOME,
      cnpj_filial: material.cnpj_filial,
      filial: material.filial,
      subcontratada: subcontratada ?? null,
      motorista: solicitacao.motorista?.nome_completo ?? '',
      cavalo_placa: solicitacao.veiculo?.placa ?? '',
      ultima_carreta: solicitacao.carreta?.placa ?? '',
      carregamento: material.origem_padrao ?? '',
      destino: solicitacao.cliente?.razao_social ?? '',
      instrucao: solicitacao.numero_instrucao ?? '',
      descarga: '',
      material: solicitacao.material?.nome ?? '',
      observacoes_padrao: material.observacoes_padrao ?? '',
      autorizado_por: profile?.nome_completo ?? '',
      validade_inicio: today,
      validade_fim: tomorrow,
      logoUrl: LOGO_URL,
    }
  }, [solicitacao, material, subcontratada, profile, today, tomorrow])

  const filename = `OC_${pad4(solicitacao.numero_interno)}_${yyyymmdd(today)}.pdf`

  const doSave = async () => {
    if (!data) return
    setSaving(true)
    try {
      const blob = await pdf(<OCDocument data={data} />).toBlob()

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
      toast.success('OC salva no Storage e status atualizado')
      onOpenChange(false)
    } catch (err) {
      toast.error(traduzirErroBanco(err))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmar = () => {
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
            {data && (
              <PDFViewer
                showToolbar={false}
                style={{ width: '100%', height: '70vh', border: 'none' }}
              >
                <OCDocument data={data} />
              </PDFViewer>
            )}
          </DialogBody>
          <DialogFooter>
            <span className="text-[11px] text-muted-foreground/80">
              Esc para fechar
            </span>
            <div className="flex items-center gap-2">
              {data && (
                <BlobProvider document={<OCDocument data={data} />}>
                  {({ url, loading }) => (
                    <Button
                      asChild={!loading && !!url}
                      variant="outline"
                      disabled={loading || !url}
                    >
                      {loading || !url ? (
                        <span>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Gerando…
                        </span>
                      ) : (
                        <a href={url} download={filename}>
                          <Download className="h-4 w-4" />
                          Baixar PDF
                        </a>
                      )}
                    </Button>
                  )}
                </BlobProvider>
              )}
              <Button onClick={handleConfirmar} disabled={saving}>
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
