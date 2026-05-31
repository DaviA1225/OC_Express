import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const LARANJA = '#FF3300'
const AMARELO = '#FFFFA7'
const CINZA_CLARO = '#F0F0F0'
const VERMELHO = '#CC0000'

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 34,
    paddingVertical: 28,
    fontFamily: 'Helvetica',
    fontSize: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    gap: 8,
  },
  logo: { width: 220, height: 60, objectFit: 'contain', alignSelf: 'center' },
  cnpjEmpresa: { fontSize: 11, textAlign: 'center', marginTop: 2, marginBottom: 10 },
  titulo: {
    backgroundColor: LARANJA,
    color: 'white',
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    textAlign: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  numeroLinha: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 4,
    gap: 3,
  },
  numeroLabel: { fontFamily: 'Helvetica', fontSize: 6, color: '#999999' },
  numeroVal: { fontFamily: 'Helvetica-Bold', fontSize: 6, color: '#999999' },
  asterisco: { color: VERMELHO, fontFamily: 'Helvetica-Bold' },

  tabela: {
    borderWidth: 0.5,
    borderColor: '#CCCCCC',
    marginBottom: 10,
  },
  linha: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#CCCCCC' },
  linhaSemBorda: { flexDirection: 'row' },
  cellLabel: {
    backgroundColor: CINZA_CLARO,
    paddingVertical: 9,
    paddingHorizontal: 5,
    fontFamily: 'Helvetica-Bold',
    borderRightWidth: 0.5,
    borderRightColor: '#CCCCCC',
  },
  cellAst: {
    width: 14,
    paddingVertical: 9,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#CCCCCC',
  },
  cellValor: {
    paddingVertical: 9,
    paddingHorizontal: 5,
    fontFamily: 'Helvetica-Bold',
  },
  cellValorSm: {
    paddingVertical: 9,
    paddingHorizontal: 5,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  cellValorBordaDireita: {
    paddingVertical: 9,
    paddingHorizontal: 5,
    fontFamily: 'Helvetica-Bold',
    borderRightWidth: 0.5,
    borderRightColor: '#CCCCCC',
  },
  cellValorBordaDireitaSm: {
    paddingVertical: 9,
    paddingHorizontal: 5,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    borderRightWidth: 0.5,
    borderRightColor: '#CCCCCC',
  },

  importanteTitulo: {
    backgroundColor: LARANJA,
    color: 'white',
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 5,
  },
  importanteBox: {
    backgroundColor: AMARELO,
    borderWidth: 0.5,
    borderColor: '#E0E000',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  destaque: {
    fontFamily: 'Helvetica-Bold',
    color: VERMELHO,
    fontSize: 10,
    marginBottom: 1,
  },
  notaNormal: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, marginBottom: 1 },

  rodape: {
    marginTop: 14,
    borderTopWidth: 0.5,
    borderTopColor: '#999999',
    paddingTop: 4,
    textAlign: 'center',
    fontSize: 8,
    color: '#666666',
  },
})

function formatDateBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export interface OCData {
  numero: string                     // ex: "0042"
  empresa: string                    // ex: "OC EXPRESS TRANSPORTES"
  cnpj_filial: string
  filial: string
  subcontratada?: string | null
  motorista: string
  cavalo_placa: string
  primeira_carreta?: string | null
  dolly?: string | null
  ultima_carreta?: string | null
  carregamento?: string | null
  destino: string
  instrucao?: string | null
  descarga?: string | null
  material: string
  observacoes_padrao?: string | null
  autorizado_por: string
  validade_inicio: Date
  validade_fim: Date
  logoUrl: string
}

export function OCDocument({ data }: { data: OCData }) {
  type Linha = {
    label: string
    ast?: boolean
    valor: string
    valorSm?: boolean
    rightLabel?: string
    rightAst?: boolean
    rightValor?: string
    rightValorSm?: boolean
  }

  // Composição veicular na ordem física exigida pela ANTT:
  //   Cavalo → 1ª Carreta → Dolly → Última Carreta.
  // 1ª Carreta e Dolly são opcionais: quando vazios, as linhas são omitidas e
  // a OC traz apenas Cavalo e Última Carreta. As placas são pareadas duas por
  // linha mantendo a sequência (esquerda→direita, cima→baixo).
  const placas: { label: string; ast?: boolean; valor: string }[] = [
    { label: 'Cavalo', ast: true, valor: data.cavalo_placa },
  ]
  if ((data.primeira_carreta ?? '').trim()) {
    placas.push({ label: '1ª Carreta', valor: (data.primeira_carreta ?? '').trim() })
  }
  if ((data.dolly ?? '').trim()) {
    placas.push({ label: 'Dolly', valor: (data.dolly ?? '').trim() })
  }
  placas.push({ label: 'Última Carreta', ast: true, valor: data.ultima_carreta ?? '' })

  const placaRows: Linha[] = []
  for (let i = 0; i < placas.length; i += 2) {
    const left = placas[i]
    const right = placas[i + 1]
    placaRows.push({
      label: left.label, ast: left.ast, valor: left.valor,
      ...(right
        ? { rightLabel: right.label, rightAst: right.ast, rightValor: right.valor }
        : {}),
    })
  }

  const linhas: Linha[] = [
    { label: 'Filial', valor: data.filial },
    { label: 'Subcontratada', ast: true, valor: data.subcontratada ?? '' },
    { label: 'Motorista', ast: true, valor: data.motorista, valorSm: true },
    ...placaRows,
    {
      label: 'Carregamento', valor: data.carregamento ?? '',
      rightLabel: 'Destino', rightValor: data.destino,
    },
    {
      label: 'Instrução', valor: (data.instrucao ?? '').trim() || '-',
      rightLabel: 'Descarga', rightValor: data.descarga ?? '', rightValorSm: true,
    },
    { label: 'Material', valor: data.material },
    { label: 'Autorizado', valor: data.autorizado_por },
    {
      label: 'Validade',
      valor: `${formatDateBR(data.validade_inicio)}   a   ${formatDateBR(data.validade_fim)}`,
    },
  ]

  return (
    <Document title={`OC ${data.numero}`}>
      <Page size="A4" style={styles.page}>
        {/* Cabeçalho */}
        <View style={styles.header}>
          <Image src={data.logoUrl} style={styles.logo} />
        </View>
        <Text style={styles.cnpjEmpresa}>CNPJ {data.cnpj_filial}</Text>

        {/* Título */}
        <Text style={styles.titulo}>ORDEM DE CARREGAMENTO</Text>

        {/* N° OC */}
        <View style={styles.numeroLinha}>
          <Text style={styles.asterisco}>*</Text>
          <Text style={styles.numeroLabel}>N° OC:</Text>
          <Text style={styles.numeroVal}>{data.numero}</Text>
        </View>

        {/* Tabela de campos */}
        <View style={styles.tabela}>
          {linhas.map((row, i) => {
            const isLast = i === linhas.length - 1
            const linhaStyle = isLast ? styles.linhaSemBorda : styles.linha
            const split = row.rightLabel != null
            return (
              <View key={i} style={linhaStyle}>
                <View style={[styles.cellLabel, { width: split ? '18%' : '18%' }]}>
                  <Text>{row.label}</Text>
                </View>
                <View style={styles.cellAst}>
                  <Text style={styles.asterisco}>{row.ast ? '*' : ''}</Text>
                </View>
                <View
                  style={[
                    split
                      ? row.valorSm
                        ? styles.cellValorBordaDireitaSm
                        : styles.cellValorBordaDireita
                      : row.valorSm
                        ? styles.cellValorSm
                        : styles.cellValor,
                    { width: split ? '29%' : '79%' },
                  ]}
                >
                  <Text>{row.valor || ' '}</Text>
                </View>
                {split && (
                  <>
                    <View style={[styles.cellLabel, { width: '18%' }]}>
                      <Text>{row.rightLabel}</Text>
                    </View>
                    <View style={styles.cellAst}>
                      <Text style={styles.asterisco}>{row.rightAst ? '*' : ''}</Text>
                    </View>
                    <View style={[row.rightValorSm ? styles.cellValorSm : styles.cellValor, { width: '29%' }]}>
                      <Text>{row.rightValor || ' '}</Text>
                    </View>
                  </>
                )}
              </View>
            )
          })}
        </View>

        {/* IMPORTANTE */}
        <Text style={styles.importanteTitulo}>IMPORTANTE — LEIA COM ATENÇÃO</Text>
        <View style={styles.importanteBox}>
          <Text style={styles.destaque}>
            Após descarregar, enviar Foto do comprovante para baixa do MDFE.
          </Text>
          <Text style={styles.destaque}>
            ENVIAR COMPROVANTE DE DESCARGA PARA O NÚMERO (67) 99632-9066
          </Text>
          <Text> </Text>
          {(data.observacoes_padrao ?? '').split('\n').filter((l) => l.trim().length > 0).map((linha, i) => (
            <Text key={`obs-${i}`} style={styles.notaNormal}>{linha}</Text>
          ))}
          <Text style={styles.notaNormal}>2° Proibido: Acompanhantes dentro do pátio de carregamento.</Text>
          <Text style={styles.notaNormal}>     Erguer báscula dentro dos pátios.</Text>
          <Text style={styles.notaNormal}>3° Confira seus dados (*) na OC e as placas da composição (cavalo, carretas e dolly).</Text>
          <Text style={styles.notaNormal}>4° Antes de deixar a Mina, certifique-se:</Text>
          <Text style={styles.notaNormal}>     Nota Fiscal, CTE e MDFE estejam emitidos corretamente.</Text>
          <Text style={styles.notaNormal}>5° Certifique-se: recebimento valor do frete assim como o pedágio.</Text>
          <Text style={styles.notaNormal}>6° Organize seu agendamento de descarga com nossa filial mais próxima.</Text>
        </View>

        <Text style={styles.rodape}>
          Documento gerado eletronicamente — {data.empresa}
        </Text>
      </Page>
    </Document>
  )
}
