import * as React from 'react'
import { MessageCircle, ExternalLink, Copy, Check } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useTransitStatus } from '@/features/solicitacoes/useSolicitacoes'
import type { SolicitacaoListRow } from '@/features/solicitacoes/useSolicitacoes'
import {
  buildWhatsAppLink,
  formatOCWhatsAppMessage,
  listarDestinosWhatsApp,
  normalizeWhatsAppPhone,
  type WhatsAppDestino,
} from './whatsapp'
import { getOcPdfSignedUrl, OC_PDF_WHATSAPP_EXPIRES } from '@/features/pdf-generator/ocPdf'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  solicitacao: SolicitacaoListRow
}

export function WhatsAppEnvioDialog({ open, onOpenChange, solicitacao }: Props) {
  const transit = useTransitStatus()
  const destinos = React.useMemo(() => listarDestinosWhatsApp(solicitacao), [solicitacao])

  const [destinoIdx, setDestinoIdx] = React.useState<number>(destinos.length > 0 ? 0 : -1)
  const [telefoneManual, setTelefoneManual] = React.useState('')
  // Mensagem inicial sem o link do PDF — ele é injetado pelo efeito abaixo
  // assim que a signed URL (7 dias) é gerada.
  const [mensagem, setMensagem] = React.useState(() => formatOCWhatsAppMessage(solicitacao, null))
  const [copied, setCopied] = React.useState(false)
  // Se o usuário editar a mensagem, não sobrescrevemos com o link do PDF.
  const editedRef = React.useRef(false)

  const [lastSol, setLastSol] = React.useState(solicitacao.id)
  if (lastSol !== solicitacao.id) {
    setLastSol(solicitacao.id)
    setMensagem(formatOCWhatsAppMessage(solicitacao, null))
    setDestinoIdx(destinos.length > 0 ? 0 : -1)
    setTelefoneManual('')
  }

  // PDF em bucket privado: gera signed URL de 7 dias e injeta na mensagem.
  React.useEffect(() => {
    editedRef.current = false
    if (!open || !solicitacao.pdf_url) return
    let cancelled = false
    getOcPdfSignedUrl(solicitacao.pdf_url, OC_PDF_WHATSAPP_EXPIRES)
      .then((url) => {
        if (cancelled || editedRef.current) return
        setMensagem(formatOCWhatsAppMessage(solicitacao, url))
      })
      .catch(() => {
        /* sem link no PDF; a mensagem segue sem ele */
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, solicitacao.id, solicitacao.pdf_url])

  const destinoSelecionado: WhatsAppDestino | null =
    destinoIdx >= 0 ? destinos[destinoIdx] : null
  const telefoneFinal: string | null = destinoSelecionado
    ? destinoSelecionado.phone
    : normalizeWhatsAppPhone(telefoneManual)

  const link = buildWhatsAppLink(telefoneFinal, mensagem)

  const podeEnviar = !!telefoneFinal || !destinoSelecionado // sem destino, abre wa.me sem número

  const handleAbrir = () => {
    window.open(link, '_blank', 'noopener,noreferrer')
    if (solicitacao.status === 'oc_gerada') {
      transit.mutate({
        id: solicitacao.id,
        status: 'oc_enviada',
        extra: { enviada_em: new Date().toISOString() },
      })
    }
    onOpenChange(false)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopied(true)
      toast.success('Mensagem copiada')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-600" />
            Enviar pelo WhatsApp
          </DialogTitle>
          <DialogDescription>
            Escolha o destinatário e revise a mensagem. Ao clicar em "Abrir WhatsApp", a conversa
            já abre com o texto pronto.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
              Destinatário
            </Label>
            <div className="flex flex-wrap gap-2">
              {destinos.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDestinoIdx(i)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-left text-[12px] transition-colors',
                    destinoIdx === i
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border bg-background text-foreground/80 hover:bg-muted',
                  )}
                >
                  <div className="font-medium">{d.label}</div>
                  <div className="text-[11px] text-muted-foreground">{d.raw}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDestinoIdx(-1)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-left text-[12px] transition-colors',
                  destinoIdx === -1
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border bg-background text-foreground/80 hover:bg-muted',
                )}
              >
                <div className="font-medium">Outro número</div>
                <div className="text-[11px] text-muted-foreground">Digitar manualmente</div>
              </button>
            </div>
          </div>

          {destinoIdx === -1 && (
            <div className="space-y-1.5">
              <Label htmlFor="wa-tel">Telefone (opcional)</Label>
              <Input
                id="wa-tel"
                value={telefoneManual}
                onChange={(e) => setTelefoneManual(e.target.value)}
                placeholder="(67) 99999-9999  ·  deixe em branco para escolher no WhatsApp"
              />
              <p className="text-[11px] text-muted-foreground">
                Se vazio, o WhatsApp abre na aba de "Nova conversa" com a mensagem pronta.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="wa-msg">Mensagem</Label>
            <Textarea
              id="wa-msg"
              value={mensagem}
              onChange={(e) => {
                editedRef.current = true
                setMensagem(e.target.value)
              }}
              rows={12}
              className="font-mono text-[12px]"
            />
            <p className="text-[11px] text-muted-foreground">
              Edite à vontade — a mensagem aparece exatamente assim no WhatsApp.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado' : 'Copiar mensagem'}
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleAbrir} disabled={!podeEnviar}>
              <ExternalLink className="h-4 w-4" />
              Abrir WhatsApp
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
