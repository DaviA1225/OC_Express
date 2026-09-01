/**
 * Termo de Uso e Confidencialidade — texto e versão.
 *
 * ## Por que o texto vive aqui, e não no banco
 *
 * O aceite guarda a VERSÃO (`termos_aceite.versao`, migration 0070), e o texto
 * daquela versão precisa ser recuperável para a prova valer alguma coisa. Em
 * código, o texto está no git: dá para dizer exatamente o que a pessoa leu em
 * 2026-09-01, com data e diff. Numa tabela editável pela tela, o texto de
 * ontem some quando alguém corrige uma vírgula hoje.
 *
 * **Mudou o texto de forma relevante? Suba `TERMOS_VERSAO`.** O modal reaparece
 * para todo mundo e um aceite novo é registrado. Correção de digitação não
 * precisa de versão nova; mudança de obrigação, sim.
 *
 * ## O que este termo é — e o que ele NÃO é
 *
 * Não é consentimento do art. 8 da LGPD. Quem usa o sistema não é o titular dos
 * dados que ele guarda: o titular é o motorista. A base legal do tratamento é a
 * execução do contrato de transporte e as obrigações legais do frete (art. 7,
 * V e II), e não depende de ninguém clicar em "aceito".
 *
 * O que o aceite registra é que a pessoa que MANEJA esses dados foi instruída e
 * assumiu o dever de confidencialidade e uso mínimo — medida de segurança e
 * governança (art. 46 e 50). E, sobre os dados do próprio usuário (nome,
 * e-mail, trilha de acesso), o texto funciona como aviso de privacidade.
 *
 * ATENÇÃO: este é o texto do produto, escrito a partir de `COMPLIANCE.md`. Ele
 * não substitui parecer jurídico. As pendências 1 a 3 do COMPLIANCE (contrato
 * de operador, aviso aos motoristas, definição formal de controlador ×
 * operador) continuam abertas, e por isso o texto abaixo evita afirmar qual
 * empresa é controladora e qual é operadora — dizer isso aqui seria o sistema
 * decidindo sozinho uma questão que é do contrato.
 */

/** Versão do texto. Formato de data para ficar legível na auditoria. */
export const TERMOS_VERSAO = '2026-09-01'

export type AudienciaTermos = 'interno' | 'parceiro'

export interface SecaoTermo {
  titulo: string
  paragrafos?: string[]
  itens?: string[]
}

export interface Termo {
  titulo: string
  /** Uma frase, mostrada antes do texto rolável. */
  resumo: string
  secoes: SecaoTermo[]
}

const OBRIGACOES_COMUNS = [
  'Acessar apenas os dados necessários para a tarefa que você está executando. Curiosidade não é finalidade.',
  'Não compartilhar login nem senha. O acesso é pessoal e intransferível, e tudo o que for feito com ele é atribuído a você.',
  'Não tirar dado pessoal do sistema por canal não oficial — WhatsApp pessoal, e-mail particular, foto de tela, pen drive.',
  'Conferir o destinatário antes de enviar Ordem de Carregamento ou documento: o PDF leva nome e CPF do motorista.',
  'Não registrar dado sensível (saúde, biometria, religião, opinião política, filiação sindical, origem racial) em campos de observação nem em anexos. O sistema não foi desenhado para tratá-los.',
  'Avisar o administrador do sistema imediatamente diante de suspeita de acesso indevido, perda do dispositivo ou vazamento.',
]

const SECAO_REGISTROS: SecaoTermo = {
  titulo: 'O que o sistema registra sobre você',
  paragrafos: [
    'Seu nome, e-mail e perfil de acesso são guardados para autenticação e controle de permissão.',
    'Toda criação, alteração e exclusão de registro fica na trilha de auditoria, com autor e horário, por 5 anos — prazo que acompanha a guarda fiscal do transporte.',
    'Também ficam registradas as operações em que dado pessoal sai do sistema: exportação de listagem, download do PDF da Ordem de Carregamento, abertura de anexo e revelação de CPF. Esses registros são mantidos por 1 ano.',
    'Isso não é vigilância de produtividade: é o registro das operações de tratamento que o art. 37 da LGPD exige, e é o que permite identificar o responsável quando algo vaza.',
  ],
}

const SECAO_DIREITOS: SecaoTermo = {
  titulo: 'Seus direitos sobre os seus dados (art. 18)',
  paragrafos: [
    'Você pode pedir acesso, correção ou eliminação dos seus dados pessoais falando com o administrador do sistema.',
    'Duas ressalvas honestas: a trilha de auditoria e os registros de acesso não são apagáveis a pedido enquanto durar o prazo legal de guarda, e os dados necessários para a operação de transporte seguem enquanto o vínculo existir.',
  ],
}

const SECAO_CONSEQUENCIAS: SecaoTermo = {
  titulo: 'Se as regras não forem cumpridas',
  paragrafos: [
    'Uso indevido de dado pessoal pode levar à suspensão imediata do acesso e à responsabilização nas esferas cível, criminal e trabalhista, além de sanção da ANPD para a empresa (art. 52).',
    'Os registros descritos acima identificam quem fez o quê. Este parágrafo existe para que isso não seja surpresa para ninguém.',
  ],
}

const SECAO_ACEITE: SecaoTermo = {
  titulo: 'Sobre este aceite',
  paragrafos: [
    `Ficam registrados quem aceitou, a versão do texto (${TERMOS_VERSAO}) e a data e hora. Não são gravados IP nem dados do dispositivo — para o que este registro precisa provar, eles não seriam necessários.`,
    'Quando o texto mudar de forma relevante, esta tela aparece de novo com a versão nova. Recusar é possível, e significa sair do sistema: sem o compromisso de confidencialidade não há acesso a dado de terceiros.',
  ],
}

const TERMO_INTERNO: Termo = {
  titulo: 'Termo de Uso e Confidencialidade',
  resumo:
    'Você está prestes a acessar dados pessoais de terceiros. Leia o que pode ser feito com eles e o que fica registrado.',
  secoes: [
    {
      titulo: 'Do que se trata',
      paragrafos: [
        'O SisLog guarda dados pessoais de pessoas que não são você: motoristas (nome, CPF e telefone), solicitantes de carga e contatos de transportadoras parceiras.',
        'Este termo não é um consentimento — o tratamento desses dados se apoia na execução do contrato de transporte e nas obrigações legais do frete, e não na sua autorização nem na do motorista. O que você aceita aqui é o compromisso de como vai manejá-los.',
      ],
    },
    {
      titulo: 'Para que esses dados podem ser usados',
      paragrafos: [
        'Exclusivamente para emitir, acompanhar e comprovar o transporte: identificar quem carrega, gerar a Ordem de Carregamento, agendar a descarga no terminal e responder a obrigações fiscais e regulatórias.',
        'Qualquer outra finalidade — consulta pessoal, repasse a terceiro, uso comercial próprio — está fora do que a empresa autorizou e fora da base legal que sustenta esse tratamento.',
      ],
    },
    { titulo: 'Suas obrigações ao usar o sistema', itens: OBRIGACOES_COMUNS },
    SECAO_REGISTROS,
    SECAO_DIREITOS,
    SECAO_CONSEQUENCIAS,
    SECAO_ACEITE,
  ],
}

const TERMO_PARCEIRO: Termo = {
  titulo: 'Termo de Uso e Confidencialidade',
  resumo:
    'O portal dá acesso a dados pessoais de motoristas e a informações da operação da LHG. Leia as condições de uso antes de continuar.',
  secoes: [
    {
      titulo: 'Do que se trata',
      paragrafos: [
        'Você acessa este portal em nome da sua transportadora, para solicitar e acompanhar cargas da LHG. Nele trafegam dados pessoais de motoristas (nome, CPF e telefone) — seus e, no que a operação exigir, de terceiros envolvidos na mesma carga.',
        'Este termo não é um consentimento: o tratamento desses dados se apoia na execução do contrato de transporte, não na autorização de quem clica. O que você aceita aqui é o compromisso de como vai manejá-los.',
        'As responsabilidades de cada empresa sobre esses dados são as do contrato firmado entre elas. Este texto trata do seu uso individual do portal.',
      ],
    },
    {
      titulo: 'Para que esses dados podem ser usados',
      paragrafos: [
        'Exclusivamente para executar o transporte contratado: cadastrar o motorista e o veículo da viagem, solicitar a carga, acompanhar a Ordem de Carregamento e o agendamento da descarga.',
        'Dados da LHG e de outras empresas vistos no portal não podem ser usados para finalidade própria, repassados a terceiros ou aproveitados em outra operação.',
      ],
    },
    {
      titulo: 'Suas obrigações ao usar o portal',
      itens: [
        'Cadastrar apenas motoristas, veículos e subcontratadas da sua própria operação, com dados verdadeiros e atualizados.',
        'Garantir que o motorista saiba que os dados dele são usados para executar o transporte — a informação ao titular é dever de quem coleta.',
        ...OBRIGACOES_COMUNS,
      ],
    },
    SECAO_REGISTROS,
    SECAO_DIREITOS,
    {
      titulo: 'Se as regras não forem cumpridas',
      paragrafos: [
        'Uso indevido de dado pessoal pode levar à suspensão imediata do acesso deste usuário e da sua empresa ao portal, além da responsabilização prevista no contrato e em lei (art. 42 e 52 da LGPD).',
        'Os registros descritos acima identificam quem fez o quê. Este parágrafo existe para que isso não seja surpresa para ninguém.',
      ],
    },
    SECAO_ACEITE,
  ],
}

export function termosDeUso(audiencia: AudienciaTermos): Termo {
  return audiencia === 'interno' ? TERMO_INTERNO : TERMO_PARCEIRO
}
