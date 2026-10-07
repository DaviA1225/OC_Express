import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { skipToken, useQuery } from '@tanstack/react-query'
import { FileText, LayoutDashboard, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn, formatNumeroOC } from '@/lib/utils'
import type { SolicitacaoListRow } from '@/features/solicitacoes/useSolicitacoes'

// Modo ERP, fase 3: várias solicitações abertas ao mesmo tempo, em abas.
//
// Modelo: uma aba FIXA de "área de trabalho", que acompanha a tela de módulo
// em que a pessoa está (Dashboard, Solicitações com os filtros, Cadastros…), e
// uma aba por solicitação aberta em tela cheia. Trocar de aba é navegar; a aba
// guarda o endereço completo, então os filtros e o `?sel=` voltam junto.
//
// As abas abertas ficam no navegador, por usuário: são conveniência da
// estação de trabalho, não preferência que precise seguir a pessoa.

const MAX_JANELAS = 8
const ROTA_DOCUMENTO = /^\/solicitacoes\/([0-9a-f-]{36})$/i

const MODULOS: [prefixo: string, nome: string][] = [
  ['/dashboard', 'Dashboard'],
  ['/solicitacoes', 'Solicitações'],
  ['/agendamentos', 'Agendamentos'],
  ['/cargas-retorno', 'Cargas de retorno'],
  ['/conferencia-viagem', 'Conferência de viagem'],
  ['/cadastros/usuarios', 'Usuários'],
  ['/cadastros/parceiros', 'Parceiros'],
  ['/cadastros/', 'Cadastros'],
  ['/relatorios-internos', 'Relatórios internos'],
  ['/relatorios', 'Relatórios'],
  ['/atividade', 'Atividade da equipe'],
  ['/auditoria', 'Auditoria'],
  ['/seguranca', 'Segurança'],
  ['/privacidade', 'Privacidade'],
  ['/perfil', 'Meu perfil'],
]

function nomeDoModulo(pathname: string): string {
  return MODULOS.find(([p]) => pathname === p || pathname.startsWith(p))?.[1] ?? 'Área de trabalho'
}

interface Estado {
  /** Endereço da tela de módulo (pathname + search). */
  trabalho: string
  /** Solicitações abertas, na ordem das abas. */
  documentos: string[]
}

function chave(userId: string) {
  return `sislog.erp.janelas.${userId}`
}

function ler(userId: string | undefined): Estado {
  const vazio: Estado = { trabalho: '/solicitacoes', documentos: [] }
  if (!userId) return vazio
  try {
    const bruto = window.localStorage.getItem(chave(userId))
    if (!bruto) return vazio
    const e = JSON.parse(bruto) as Partial<Estado>
    return {
      trabalho: typeof e.trabalho === 'string' && e.trabalho.startsWith('/') ? e.trabalho : vazio.trabalho,
      documentos: Array.isArray(e.documentos)
        ? e.documentos.filter((d): d is string => typeof d === 'string' && /^[0-9a-f-]{36}$/i.test(d)).slice(0, MAX_JANELAS)
        : [],
    }
  } catch {
    return vazio
  }
}

export function JanelasErp() {
  const { user } = useAuth()
  const userId = user?.id
  const location = useLocation()
  const navigate = useNavigate()
  const [estado, setEstado] = React.useState<Estado>(() => ler(userId))

  // Troca de usuário na mesma aba do navegador: recarrega as janelas dele.
  const [userCarregado, setUserCarregado] = React.useState(userId)
  if (userCarregado !== userId) {
    setUserCarregado(userId)
    setEstado(ler(userId))
  }

  const docAtual = ROTA_DOCUMENTO.exec(location.pathname)?.[1] ?? null
  const endereco = location.pathname + location.search

  // A rota manda: abrir uma solicitação cria (ou ativa) a aba dela; qualquer
  // outra tela passa a ser a área de trabalho.
  React.useEffect(() => {
    setEstado((e) => {
      if (docAtual) {
        if (e.documentos.includes(docAtual)) return e
        // Passou do teto: a aba mais antiga sai para dar lugar à nova.
        const documentos = [...e.documentos, docAtual].slice(-MAX_JANELAS)
        return { ...e, documentos }
      }
      return e.trabalho === endereco ? e : { ...e, trabalho: endereco }
    })
  }, [docAtual, endereco])

  React.useEffect(() => {
    if (!userId) return
    try {
      window.localStorage.setItem(chave(userId), JSON.stringify(estado))
    } catch {
      /* sem storage: as abas valem só até recarregar */
    }
  }, [estado, userId])

  const fechar = (id: string) => {
    const idx = estado.documentos.indexOf(id)
    const documentos = estado.documentos.filter((d) => d !== id)
    setEstado((e) => ({ ...e, documentos: e.documentos.filter((d) => d !== id) }))
    if (id === docAtual) {
      // Fechar a aba ativa leva para a vizinha, ou de volta à área de trabalho.
      const vizinha = documentos[Math.min(idx, documentos.length - 1)]
      navigate(vizinha ? `/solicitacoes/${vizinha}` : estado.trabalho)
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Janelas abertas"
      className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b bg-muted/60 px-3 pt-1.5 print:hidden"
    >
      <Aba
        ativa={!docAtual}
        onAbrir={() => navigate(estado.trabalho)}
        icone={<LayoutDashboard className="h-3.5 w-3.5" />}
        rotulo={nomeDoModulo(estado.trabalho.split('?')[0])}
      />
      {estado.documentos.map((id) => (
        <AbaDocumento
          key={id}
          id={id}
          ativa={id === docAtual}
          onAbrir={() => navigate(`/solicitacoes/${id}`)}
          onFechar={() => fechar(id)}
        />
      ))}
    </div>
  )
}

function AbaDocumento({ id, ativa, onAbrir, onFechar }: {
  id: string
  ativa: boolean
  onAbrir: () => void
  onFechar: () => void
}) {
  // Lê o número da OC do cache do detalhe sem disparar busca: a aba só mostra
  // o que a tela de detalhe já carregou.
  const { data } = useQuery<SolicitacaoListRow>({ queryKey: ['solicitacao', id], queryFn: skipToken })
  const rotulo = data ? formatNumeroOC(data.numero_interno) : 'Solicitação'
  return (
    <Aba
      ativa={ativa}
      onAbrir={onAbrir}
      onFechar={onFechar}
      icone={<FileText className="h-3.5 w-3.5" />}
      rotulo={rotulo}
    />
  )
}

function Aba({ ativa, onAbrir, onFechar, icone, rotulo }: {
  ativa: boolean
  onAbrir: () => void
  onFechar?: () => void
  icone: React.ReactNode
  rotulo: string
}) {
  return (
    <div
      className={cn(
        'group flex h-9 shrink-0 items-center rounded-t-md border border-b-0 text-[13px]',
        ativa
          ? '-mb-px h-[38px] border-border bg-background font-medium text-foreground shadow-[inset_0_2px_0_hsl(var(--primary))]'
          : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground',
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={ativa}
        onClick={onAbrir}
        onAuxClick={(e) => { if (e.button === 1 && onFechar) { e.preventDefault(); onFechar() } }}
        className="flex h-full items-center gap-1.5 pl-3 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {icone}
        <span className="max-w-[160px] truncate">{rotulo}</span>
      </button>
      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label={`Fechar ${rotulo}`}
          className="mr-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
