import { Search, Truck, FileText, Send, CalendarClock, CheckCircle2 } from 'lucide-react'

/** Os seis passos de uma carga dentro do sistema.
 *
 *  Em arquivo separado das telas por causa do Fast Refresh: um módulo que
 *  exporta componente E constante perde o hot reload do componente. */
export const FLUXO = [
  {
    icone: Search,
    titulo: 'O pedido chega',
    texto:
      'Pelo portal do parceiro, por WhatsApp (lido por IA) ou digitado pela equipe. Cai numa fila única, com o relógio correndo à vista de todos.',
  },
  {
    icone: Truck,
    titulo: 'O atendente completa',
    texto:
      'Motorista, veículo, carreta, cliente e material vêm de cadastros já existentes, escolhidos e não digitados. CPF, CNPJ e placa são conferidos na hora.',
  },
  {
    icone: FileText,
    titulo: 'A OC sai pronta',
    texto:
      'Um clique gera o PDF no padrão oficial, com numeração própria. Nada de layout montado à mão, nada de célula esquecida.',
  },
  {
    icone: Send,
    titulo: 'O motorista recebe',
    texto:
      'A OC vai por WhatsApp num link assinado que vale dias, e o motorista não tem conta, não instala nada e não depende de e-mail.',
  },
  {
    icone: CalendarClock,
    titulo: 'A descarga é agendada',
    texto:
      'Onde o terminal exige hora marcada, o pedido entra numa fila própria, a equipe confirma a janela e devolve o comprovante ao parceiro.',
  },
  {
    icone: CheckCircle2,
    titulo: 'Tudo fica registrado',
    texto:
      'Quem fez, quando e o quê. A carga vira histórico, indicador e trilha de auditoria, e não uma linha perdida numa planilha.',
  },
] as const
