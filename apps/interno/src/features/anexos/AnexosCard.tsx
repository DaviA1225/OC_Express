import * as React from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'
import {
  useAnexos,
  useUploadAnexo,
  useDeleteAnexo,
  getAnexoSignedUrl,
  ACCEPTED_MIME_PREFIXES,
  MAX_FILE_BYTES,
  type Anexo,
} from './useAnexos'

interface Props {
  solicitacaoId: string
  editable: boolean
}

const ACCEPT_ATTR = ACCEPTED_MIME_PREFIXES.map((p) => (p.endsWith('/') ? `${p}*` : p)).join(',')

export function AnexosCard({ solicitacaoId, editable }: Props) {
  const list = useAnexos(solicitacaoId)
  const upload = useUploadAnexo()
  const remove = useDeleteAnexo()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [confirmRemove, setConfirmRemove] = React.useState<Anexo | null>(null)

  const handleFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files)
      for (const file of arr) {
        await upload.mutateAsync({ solicitacaoId, file }).catch(() => {})
      }
    },
    [solicitacaoId, upload],
  )

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleFiles(e.target.files)
    }
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (!editable) return
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files)
    }
  }

  const items = list.data ?? []

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[14px] font-medium text-foreground">Anexos</h2>
          {items.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {items.length}
            </span>
          )}
          {upload.isPending && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-strong">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Enviando…
            </span>
          )}
        </div>
        {editable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
          >
            <Upload className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPT_ATTR}
          multiple
          onChange={onPickFile}
        />
      </header>

      <div
        className={cn(
          'p-4',
          editable && 'transition-colors',
          editable && dragOver && 'bg-primary/5',
        )}
        onDragOver={(e) => {
          if (!editable) return
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {list.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!list.isLoading && items.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center">
            <Paperclip className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-[13px] text-foreground">Nenhum anexo ainda.</p>
            <p className="text-[11px] text-muted-foreground">
              {editable
                ? 'Arraste imagens ou PDF aqui, ou clique em "Adicionar".'
                : 'Sem permissão para anexar.'}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Limite {(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)}MB · imagens e PDF
            </p>
          </div>
        )}

        {!list.isLoading && items.length > 0 && (
          <ul className="divide-y">
            {items.map((anexo) => (
              <AnexoRow
                key={anexo.id}
                anexo={anexo}
                canDelete={editable}
                onRequestDelete={() => setConfirmRemove(anexo)}
              />
            ))}
          </ul>
        )}
      </div>

      {confirmRemove && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirmRemove(null)}
          title="Remover anexo?"
          description={`O arquivo "${confirmRemove.filename}" será excluído. Esta ação é irreversível.`}
          confirmLabel="Sim, remover"
          destructive
          onConfirm={async () => {
            await remove.mutateAsync({ anexo: confirmRemove })
            setConfirmRemove(null)
          }}
        />
      )}
    </section>
  )
}

interface RowProps {
  anexo: Anexo
  canDelete: boolean
  onRequestDelete: () => void
}

function AnexoRow({ anexo, canDelete, onRequestDelete }: RowProps) {
  const [opening, setOpening] = React.useState(false)
  const isImage = (anexo.mime_type ?? '').startsWith('image/')
  const isPdf = anexo.mime_type === 'application/pdf'

  const open = async () => {
    setOpening(true)
    try {
      const url = await getAnexoSignedUrl(anexo.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setOpening(false)
    }
  }

  const Icon = isImage ? ImageIcon : isPdf ? FileText : FileIcon
  const sizeLabel = anexo.size_bytes != null ? formatBytes(anexo.size_bytes) : null
  const dateLabel = format(new Date(anexo.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

  return (
    <li className="flex items-center gap-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-foreground" title={anexo.filename}>
          {anexo.filename}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {dateLabel}
          {sizeLabel ? ` · ${sizeLabel}` : ''}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={open} disabled={opening}>
        {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
        Abrir
      </Button>
      {canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRequestDelete}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Remover ${anexo.filename}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
