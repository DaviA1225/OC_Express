import * as React from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Paperclip, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SolicitacaoForm } from '@/components/solicitacoes/SolicitacaoForm'
import {
  SOLICITACAO_FORM_DEFAULTS,
  type SolicitacaoFormValues,
} from '@/components/solicitacoes/solicitacaoForm.schema'
import { useAuth } from '@/hooks/useAuth'
import { useCriarSolicitacao } from '@/features/solicitacoes/useSolicitacoes'
import { PageHeader } from '@/components/layout/PageHeader'
import { fmtDec, fmtInt } from '@/lib/format'
import {
  uploadAnexoFile,
  isMimeAccepted,
  MAX_FILE_BYTES,
  ACCEPTED_MIME_PREFIXES,
} from '@/features/anexos/useAnexos'

const ANEXO_ACCEPT_ATTR = ACCEPTED_MIME_PREFIXES
  .map((p) => (p.endsWith('/') ? `${p}*` : p))
  .join(',')

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${fmtDec(bytes / 1024)} KB`
  return `${fmtDec(bytes / 1024 / 1024)} MB`
}

export default function NovaSolicitacaoPage() {
  const navigate = useNavigate()
  const { parceiro } = useAuth()
  const parceiroId = parceiro?.id ?? null
  const criar = useCriarSolicitacao()

  // Anexos coletados localmente; sao enviados apos a solicitacao ser criada
  // (precisam do solicitacao_id como prefixo no storage path).
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([])
  const [enviandoAnexos, setEnviandoAnexos] = React.useState(false)
  const anexoInputRef = React.useRef<HTMLInputElement>(null)

  const addPendingFiles = (files: FileList | File[]) => {
    const aceitos: File[] = []
    const erros: string[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_BYTES) {
        erros.push(`${f.name}: maior que ${fmtInt(MAX_FILE_BYTES / 1024 / 1024)} MB.`)
        continue
      }
      if (f.type && !isMimeAccepted(f.type)) {
        erros.push(`${f.name}: tipo não suportado (apenas imagens e PDF)`)
        continue
      }
      aceitos.push(f)
    }
    if (aceitos.length) setPendingFiles((prev) => [...prev, ...aceitos])
    if (erros.length) toast.error(erros.join('\n'))
  }
  const removePendingFile = (i: number) =>
    setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))

  const onSubmit = async (v: SolicitacaoFormValues) => {
    let novoId: string | null = null
    try {
      novoId = await criar.mutateAsync({
        tipo: v.tipo,
        local_carregamento: v.tipo === 'retorno' ? v.local_carregamento : null,
        parceiro_motorista_id: v.parceiro_motorista_id,
        parceiro_veiculo_id: v.parceiro_veiculo_id,
        parceiro_carreta_id: v.parceiro_carreta_id || null,
        parceiro_primeira_carreta_id: v.parceiro_primeira_carreta_id || null,
        parceiro_dolly_id: v.parceiro_dolly_id || null,
        parceiro_subcontratada_id: v.parceiro_subcontratada_id || null,
        cliente_id: v.cliente_id,
        pamcard_status: v.pamcard_status,
        pamcard_numero:
          v.pamcard_status === 'tem_cartao' ? (v.pamcard_numero ?? '').trim() : null,
        observacoes: v.observacoes?.trim() || null,
      })
    } catch {
      // o toast de erro é exibido pelo onError da mutation
      return
    }

    // Anexos: sobe em paralelo apos a solicitacao existir (o storage path
    // precisa do solicitacao_id). Falhas individuais nao bloqueiam — o
    // parceiro pode reenviar pelo detalhe.
    if (pendingFiles.length > 0) {
      setEnviandoAnexos(true)
      const results = await Promise.allSettled(
        pendingFiles.map((f) => uploadAnexoFile(novoId as string, f)),
      )
      setEnviandoAnexos(false)
      const falhas = results.filter((r) => r.status === 'rejected').length
      if (falhas > 0) {
        toast.warning(
          `${falhas} anexo(s) não foram enviados. Envie novamente pelo detalhe da solicitação.`,
        )
      }
    }

    toast.success(
      'Solicitação enviada. A equipe LHG processa em breve e a OC chega pelo WhatsApp ou e-mail.',
    )
    navigate(`/solicitacoes/${novoId}`, { replace: true })
  }

  // Backstop pro caso do parceiro digitar a URL direto: a lista ja' esconde o
  // botao quando solicitacoes_bloqueadas=true; aqui voltamos pra lista.
  if (parceiro?.solicitacoes_bloqueadas) {
    return <Navigate to="/solicitacoes" replace />
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <Link
        to="/solicitacoes"
        className="mb-3 inline-flex items-center gap-1.5 rounded-sm text-body font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para solicitações
      </Link>

      <PageHeader
        className="mb-0"
        title="Nova solicitação"
        description="Dados do carregamento, de minério ou de retorno. A equipe da LHG define o material e processa a solicitação."
      />

      <SolicitacaoForm
        defaultValues={SOLICITACAO_FORM_DEFAULTS}
        parceiroId={parceiroId}
        onSubmit={onSubmit}
        submitLabel="Enviar solicitação"
        submittingLabel="Enviando anexos…"
        submitting={criar.isPending || enviandoAnexos}
        cancelTo="/solicitacoes"
      >
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-title-sm font-semibold text-foreground">Anexos</h2>
          <p className="mt-0.5 text-body-sm text-muted-foreground">
            {`Imagens ou PDF até ${fmtInt(MAX_FILE_BYTES / 1024 / 1024)} MB cada, ex.: documentos do motorista ou da subcontratada para cadastro na J&F. Os arquivos aparecem na seção de anexos da solicitação.`}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => anexoInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Adicionar arquivo
            </Button>
            <span className="text-body-sm text-muted-foreground">
              {pendingFiles.length === 0
                ? 'Nenhum arquivo selecionado'
                : `${pendingFiles.length} arquivo${pendingFiles.length === 1 ? '' : 's'} pronto${pendingFiles.length === 1 ? '' : 's'} para envio`}
            </span>
            <input
              ref={anexoInputRef}
              type="file"
              className="hidden"
              accept={ANEXO_ACCEPT_ATTR}
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) addPendingFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          {pendingFiles.length > 0 && (
            <ul className="mt-3 divide-y rounded-md border">
              {pendingFiles.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
                  <Paperclip className="h-4 w-4 shrink-0 text-tertiary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-foreground" title={f.name}>
                      {f.name}
                    </p>
                    <p className="text-meta text-muted-foreground">{formatBytes(f.size)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePendingFile(i)}
                    className="text-destructive hover:bg-danger-subtle hover:text-destructive"
                    aria-label={`Remover ${f.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </SolicitacaoForm>
    </div>
  )
}
