// Tipos do banco SisLog LHG (espelha supabase/migrations/0001_initial_schema.sql).
// Para regenerar a partir do banco real, instale Docker Desktop e rode:
//   npx supabase gen types typescript --db-url "<DB_URL>" --schema public

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type PerfilUsuario = 'admin' | 'supervisor' | 'atendente' | 'documentacao'

export type SolicitacaoStatus =
  | 'recebida'
  | 'em_cadastro'
  | 'instrucao_emitida'
  | 'oc_gerada'
  | 'oc_enviada'
  | 'finalizada'
  | 'cancelada'

export type SolicitacaoTipo = 'carregamento' | 'retorno'

export interface Database {
  public: {
    Tables: {
      perfis_usuarios: {
        Row: {
          id: string
          user_id: string
          nome_completo: string
          perfil: PerfilUsuario
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          user_id: string
          nome_completo: string
          perfil: PerfilUsuario
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['perfis_usuarios']['Insert']>
      }
      subcontratadas: {
        Row: {
          id: string
          razao_social: string
          documento: string | null
          tipo_pessoa: 'PF' | 'PJ' | null
          contato_nome: string | null
          contato_telefone: string | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          razao_social: string
          documento?: string | null
          tipo_pessoa?: 'PF' | 'PJ' | null
          contato_nome?: string | null
          contato_telefone?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['subcontratadas']['Insert']>
      }
      motoristas: {
        Row: {
          id: string
          nome_completo: string
          cpf: string
          rg: string | null
          antt: string | null
          telefone: string | null
          subcontratada_id: string | null
          observacoes: string | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          nome_completo: string
          cpf: string
          rg?: string | null
          antt?: string | null
          telefone?: string | null
          subcontratada_id?: string | null
          observacoes?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['motoristas']['Insert']>
      }
      veiculos: {
        Row: {
          id: string
          placa: string
          tipo: string | null
          subcontratada_id: string | null
          observacoes: string | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          placa: string
          tipo?: string | null
          subcontratada_id?: string | null
          observacoes?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['veiculos']['Insert']>
      }
      carretas: {
        Row: {
          id: string
          placa: string
          tipo: string | null
          capacidade_ton: number | null
          subcontratada_id: string | null
          observacoes: string | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          placa: string
          tipo?: string | null
          capacidade_ton?: number | null
          subcontratada_id?: string | null
          observacoes?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['carretas']['Insert']>
      }
      clientes: {
        Row: {
          id: string
          razao_social: string
          cnpj: string | null
          endereco: string | null
          cidade: string | null
          uf: string | null
          latitude: number | null
          longitude: number | null
          frete_ton: number | null
          frete_cacamba: number | null
          frete_graneleiro: number | null
          liberado: boolean
          aceita_cacamba: boolean
          aceita_graneleiro: boolean
          observacoes: string | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          razao_social: string
          cnpj?: string | null
          endereco?: string | null
          cidade?: string | null
          uf?: string | null
          latitude?: number | null
          longitude?: number | null
          frete_ton?: number | null
          frete_cacamba?: number | null
          frete_graneleiro?: number | null
          liberado?: boolean
          aceita_cacamba?: boolean
          aceita_graneleiro?: boolean
          observacoes?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['clientes']['Insert']>
      }
      materiais: {
        Row: {
          id: string
          nome: string
          cnpj_filial: string
          filial: string
          origem_padrao: string | null
          destino_padrao: string | null
          observacoes_padrao: string | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          nome: string
          cnpj_filial: string
          filial: string
          origem_padrao?: string | null
          destino_padrao?: string | null
          observacoes_padrao?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['materiais']['Insert']>
      }
      solicitacoes: {
        Row: {
          id: string
          numero_interno: number
          tipo: SolicitacaoTipo
          status: SolicitacaoStatus
          solicitante_nome: string | null
          solicitante_telefone: string | null
          motorista_id: string | null
          veiculo_id: string | null
          carreta_id: string | null
          cliente_id: string | null
          material_id: string | null
          numero_instrucao: string | null
          observacoes: string | null
          atendente_id: string | null
          pdf_url: string | null
          enviada_em: string | null
          finalizada_em: string | null
          cte_emitido: boolean
          mdfe_emitido: boolean
          vale_pedagio: boolean
          pamcard: boolean
          documentado_por: string | null
          documentado_em: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          numero_interno?: number
          tipo: SolicitacaoTipo
          status?: SolicitacaoStatus
          solicitante_nome?: string | null
          solicitante_telefone?: string | null
          motorista_id?: string | null
          veiculo_id?: string | null
          carreta_id?: string | null
          cliente_id?: string | null
          material_id?: string | null
          numero_instrucao?: string | null
          observacoes?: string | null
          atendente_id?: string | null
          pdf_url?: string | null
          enviada_em?: string | null
          finalizada_em?: string | null
          cte_emitido?: boolean
          mdfe_emitido?: boolean
          vale_pedagio?: boolean
          pamcard?: boolean
          documentado_por?: string | null
          documentado_em?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['solicitacoes']['Insert']>
      }
      log_auditoria: {
        Row: {
          id: string
          usuario_id: string | null
          acao: string
          tabela: string
          registro_id: string | null
          dados_antes: Json | null
          dados_depois: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          usuario_id?: string | null
          acao: string
          tabela: string
          registro_id?: string | null
          dados_antes?: Json | null
          dados_depois?: Json | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['log_auditoria']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
