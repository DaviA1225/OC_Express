// Tipos do banco SisLog (espelha as migrations em supabase/migrations,
// até 0061 — módulo de agendamentos).
// Para regenerar a partir do banco real, instale Docker Desktop e rode:
//   npx supabase gen types typescript --db-url "<DB_URL>" --schema public

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type PerfilUsuario = 'admin' | 'gerente' | 'supervisor' | 'analista' | 'assistente'

export type SolicitacaoStatus =
  | 'recebida'
  | 'em_cadastro'
  | 'instrucao_emitida'
  | 'oc_gerada'
  | 'oc_enviada'
  | 'finalizada'
  | 'cancelada'

export type SolicitacaoTipo = 'carregamento' | 'retorno'

export type MaterialSubtipo = 'SINTER' | 'HEMATITA' | 'LUMP'

// 'nao_necessario' (migration 0037): pagamento por outro meio (regra nova ANTT),
// não exige cartão e não entra na fila de "cartão pendente" da equipe interna.
export type PamcardStatus = 'tem_cartao' | 'nao_tem_cartao' | 'nao_necessario'

export type SolicitacaoOrigem = 'interno' | 'parceiro' | 'email'

export type ParceiroPerfil = 'admin_parceiro' | 'operador_parceiro'

export type SolicitacaoPendenciaStatus = 'aberta' | 'resolvida'

// 0061 — agendamento de descarga em terminal.
// 'substituido' e 'cancelado' sao terminais; reagendar nunca sobrescreve, cria
// uma linha nova apontando para a anterior.
export type AgendamentoStatus =
  | 'solicitado'
  | 'em_andamento'
  | 'agendado'
  | 'substituido'
  | 'cancelado'

export type NotaFiscalOrigem = 'automatica' | 'manual'

export type TipoEventoPortal =
  | 'portal_login'
  | 'portal_login_falha'
  | 'portal_logout'
  | 'portal_solicitacao_criada'
  | 'portal_solicitacao_editada'
  | 'portal_solicitacao_cancelada'
  | 'portal_senha_alterada'
  | 'portal_usuario_convidado'
  | 'portal_usuario_excluido'
  | 'portal_agendamento_solicitado'
  | 'portal_agendamento_cancelado'
  | 'portal_agendamento_reagendado'

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
          razao_social_unaccent: string
          documento: string | null
          tipo_pessoa: 'PF' | 'PJ' | null
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
          nome_completo_unaccent: string
          cpf: string
          telefone: string | null
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
          telefone?: string | null
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
          razao_social_unaccent: string
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
          cliente_minerio: boolean
          cliente_retorno: boolean
          // 0061 — agendamento de descarga (SPEC-AGENDAMENTOS 2.5: e atributo
          // do cliente, nao da rota).
          requer_agendamento: boolean
          terminal_nome: string | null
          antecedencia_minima_horas: number | null
          observacoes_agendamento: string | null
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
          cliente_minerio?: boolean
          cliente_retorno?: boolean
          requer_agendamento?: boolean
          terminal_nome?: string | null
          antecedencia_minima_horas?: number | null
          observacoes_agendamento?: string | null
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
          nome_unaccent: string
          cnpj_filial: string
          filial: string
          origem_padrao: string | null
          destino_padrao: string | null
          observacoes_padrao: string | null
          requer_instrucao: boolean
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
          requer_instrucao?: boolean
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
          solicitante_nome_unaccent: string | null
          solicitante_telefone: string | null
          motorista_id: string | null
          veiculo_id: string | null
          carreta_id: string | null
          primeira_carreta_id: string | null
          dolly_id: string | null
          subcontratada_id: string | null
          cliente_id: string | null
          material_id: string | null
          material_subtipo: MaterialSubtipo | null
          local_carregamento: string | null
          validade_inicio: string | null
          validade_fim: string | null
          numero_instrucao: string | null
          observacoes: string | null
          atendente_id: string | null
          pdf_url: string | null
          enviada_em: string | null
          finalizada_em: string | null
          cte_emitido: boolean
          mdfe_emitido: boolean
          vale_pedagio: boolean
          pamcard_status: PamcardStatus
          pamcard_numero: string | null
          pamcard_providenciado_em: string | null
          pamcard_providenciado_por: string | null
          origem: SolicitacaoOrigem
          parceiro_id: string | null
          parceiro_usuario_id: string | null
          parceiro_motorista_id: string | null
          parceiro_veiculo_id: string | null
          parceiro_carreta_id: string | null
          parceiro_primeira_carreta_id: string | null
          parceiro_dolly_id: string | null
          parceiro_subcontratada_id: string | null
          observacoes_internas: string | null
          external_msg_id: string | null
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
          primeira_carreta_id?: string | null
          dolly_id?: string | null
          subcontratada_id?: string | null
          cliente_id?: string | null
          material_id?: string | null
          material_subtipo?: MaterialSubtipo | null
          local_carregamento?: string | null
          validade_inicio?: string | null
          validade_fim?: string | null
          numero_instrucao?: string | null
          observacoes?: string | null
          atendente_id?: string | null
          pdf_url?: string | null
          enviada_em?: string | null
          finalizada_em?: string | null
          cte_emitido?: boolean
          mdfe_emitido?: boolean
          vale_pedagio?: boolean
          pamcard_status?: PamcardStatus
          pamcard_numero?: string | null
          pamcard_providenciado_em?: string | null
          pamcard_providenciado_por?: string | null
          origem?: SolicitacaoOrigem
          parceiro_id?: string | null
          parceiro_usuario_id?: string | null
          parceiro_motorista_id?: string | null
          parceiro_veiculo_id?: string | null
          parceiro_carreta_id?: string | null
          parceiro_primeira_carreta_id?: string | null
          parceiro_dolly_id?: string | null
          parceiro_subcontratada_id?: string | null
          observacoes_internas?: string | null
          external_msg_id?: string | null
          documentado_por?: string | null
          documentado_em?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['solicitacoes']['Insert']>
      }
      cargas_retorno: {
        Row: {
          id: string
          cliente_id: string
          local_carregamento: string
          observacoes: string | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          cliente_id: string
          local_carregamento: string
          observacoes?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['cargas_retorno']['Insert']>
      }
      solicitacao_anexos: {
        Row: {
          id: string
          solicitacao_id: string
          filename: string
          storage_path: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          solicitacao_id: string
          filename: string
          storage_path: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['solicitacao_anexos']['Insert']>
      }
      solicitacao_pendencias: {
        Row: {
          id: string
          solicitacao_id: string
          // Nullable (migration 0046): NULL em pendência de origem interna (sem parceiro).
          parceiro_id: string | null
          motivo: string
          status: SolicitacaoPendenciaStatus
          resposta_parceiro: string | null
          criada_por: string | null
          resolvida_por: string | null
          created_at: string
          updated_at: string
          resolvida_em: string | null
          vista_equipe_em: string | null
        }
        // parceiro_id, criada_por, status e resolvida_* são preenchidos por
        // triggers (migration 0035) — o cliente só envia solicitacao_id e motivo.
        Insert: {
          id?: string
          solicitacao_id: string
          parceiro_id?: string | null
          motivo: string
          status?: SolicitacaoPendenciaStatus
          resposta_parceiro?: string | null
          criada_por?: string | null
          resolvida_por?: string | null
          created_at?: string
          updated_at?: string
          resolvida_em?: string | null
          vista_equipe_em?: string | null
        }
        Update: Partial<Database['public']['Tables']['solicitacao_pendencias']['Insert']>
      }
      // 0061 — grade de slots de cada terminal. Uma linha por horário: os dois
      // padrões (9 slots de 1h × 3 janelas de 6h) não cabem em janela_inicio/fim.
      terminal_janelas: {
        Row: {
          id: string
          cliente_id: string
          hora: string
          duracao_minutos: number
          capacidade: number | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          cliente_id: string
          hora: string
          duracao_minutos?: number
          capacidade?: number | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['terminal_janelas']['Insert']>
      }
      agendamentos: {
        Row: {
          id: string
          numero_interno: number
          solicitacao_id: string
          // Denormalizado pelo trigger a partir da solicitação — é a chave do
          // RLS do parceiro. NULL em agendamento de solicitação interna.
          parceiro_id: string | null
          parceiro_usuario_id: string | null
          status: AgendamentoStatus
          data_preferida: string
          hora_preferida: string | null
          observacoes: string | null
          nota_fiscal: string | null
          nota_fiscal_origem: NotaFiscalOrigem | null
          data_agendada: string | null
          hora_agendada: string | null
          // Calculado no servidor ao concluir: a hora confirmada não existe na
          // grade ativa do terminal. Aviso, não bloqueio.
          hora_fora_da_grade: boolean
          comprovante_path: string | null
          nf_pdf_path: string | null
          // 0064 — sai antes do comprovante e volta ao parceiro junto com ele.
          contrato_frete_path: string | null
          substitui_agendamento_id: string | null
          motivo_reagendamento: string | null
          assumido_por: string | null
          assumido_em: string | null
          agendado_por: string | null
          agendado_em: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        // status, parceiro_id, created_by e os carimbos são preenchidos por
        // trigger (0061) — o cliente só envia o pedido.
        Insert: {
          id?: string
          solicitacao_id: string
          data_preferida: string
          hora_preferida?: string | null
          observacoes?: string | null
          nota_fiscal?: string | null
          nota_fiscal_origem?: NotaFiscalOrigem | null
          parceiro_usuario_id?: string | null
          substitui_agendamento_id?: string | null
          motivo_reagendamento?: string | null
        }
        Update: {
          status?: AgendamentoStatus
          data_preferida?: string
          hora_preferida?: string | null
          observacoes?: string | null
          nota_fiscal?: string | null
          nota_fiscal_origem?: NotaFiscalOrigem | null
          data_agendada?: string | null
          hora_agendada?: string | null
          comprovante_path?: string | null
          nf_pdf_path?: string | null
          contrato_frete_path?: string | null
          motivo_reagendamento?: string | null
        }
      }
      eventos_portal: {
        Row: {
          id: string
          tipo_evento: TipoEventoPortal
          user_id: string | null
          parceiro_id: string | null
          parceiro_usuario_id: string | null
          email_tentado: string | null
          solicitacao_id: string | null
          ip: string | null
          user_agent: string | null
          metadata: Json | null
          created_at: string
        }
        // Apenas a função registrar_evento_portal escreve. Mantemos um tipo
        // valido (vs. `never`) para nao quebrar a inferencia do supabase-js.
        Insert: Record<string, never>
        Update: Record<string, never>
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
      parceiros: {
        Row: {
          id: string
          razao_social: string
          documento: string
          tipo_pessoa: 'PF' | 'PJ' | null
          contato_principal_nome: string | null
          contato_principal_telefone: string | null
          contato_principal_email: string | null
          codigo_interno: string | null
          ativo: boolean
          solicitacoes_bloqueadas: boolean
          solicitacoes_bloqueadas_em: string | null
          observacoes_internas: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          razao_social: string
          documento: string
          tipo_pessoa?: 'PF' | 'PJ' | null
          contato_principal_nome?: string | null
          contato_principal_telefone?: string | null
          contato_principal_email?: string | null
          codigo_interno?: string | null
          ativo?: boolean
          solicitacoes_bloqueadas?: boolean
          solicitacoes_bloqueadas_em?: string | null
          observacoes_internas?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['parceiros']['Insert']>
      }
      parceiro_usuarios: {
        Row: {
          id: string
          user_id: string
          parceiro_id: string
          nome_completo: string
          email: string
          perfil: ParceiroPerfil
          ativo: boolean
          convite_aceito_em: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          user_id: string
          parceiro_id: string
          nome_completo: string
          email: string
          perfil: ParceiroPerfil
          ativo?: boolean
          convite_aceito_em?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['parceiro_usuarios']['Insert']>
      }
      parceiro_subcontratadas: {
        Row: {
          id: string
          parceiro_id: string
          razao_social: string
          documento: string | null
          tipo_pessoa: 'PF' | 'PJ' | null
          // contato_nome/contato_telefone foram dropadas pela 0055: eram
          // "colunas dormentes" desde a Fase 8.4 e as 427 linhas estavam todas
          // nulas — dado pessoal guardado sem finalidade (LGPD art. 6, III).
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          parceiro_id: string
          razao_social: string
          documento?: string | null
          tipo_pessoa?: 'PF' | 'PJ' | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['parceiro_subcontratadas']['Insert']>
      }
      parceiro_motoristas: {
        Row: {
          id: string
          parceiro_id: string
          nome_completo: string
          cpf: string
          telefone: string | null
          subcontratada_parceiro_id: string | null
          observacoes: string | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          parceiro_id: string
          nome_completo: string
          cpf: string
          telefone?: string | null
          subcontratada_parceiro_id?: string | null
          observacoes?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['parceiro_motoristas']['Insert']>
      }
      parceiro_veiculos: {
        Row: {
          id: string
          parceiro_id: string
          placa: string
          tipo: string | null
          subcontratada_parceiro_id: string | null
          observacoes: string | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          parceiro_id: string
          placa: string
          tipo?: string | null
          subcontratada_parceiro_id?: string | null
          observacoes?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['parceiro_veiculos']['Insert']>
      }
      parceiro_carretas: {
        Row: {
          id: string
          parceiro_id: string
          placa: string
          tipo: string | null
          subcontratada_parceiro_id: string | null
          // Coluna dormente (Fase 8.4): mantida no banco; sem UI no portal.
          capacidade_ton: number | null
          observacoes: string | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          parceiro_id: string
          placa: string
          tipo?: string | null
          subcontratada_parceiro_id?: string | null
          capacidade_ton?: number | null
          observacoes?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['parceiro_carretas']['Insert']>
      }
      parceiro_pamcards: {
        Row: {
          id: string
          parceiro_id: string
          numero: string
          apelido: string | null
          ativo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          parceiro_id: string
          numero: string
          apelido?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['parceiro_pamcards']['Insert']>
      }
      // 0045 — linha única do kill switch / modo manutenção compartilhado.
      system_status: {
        Row: {
          id: number
          maintenance: boolean
          message: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          maintenance?: boolean
          message?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['system_status']['Insert']>
      }
    }
    Views: {
      // Views SECURITY DEFINER do Portal de Parceiros (migrations 0017/0018).
      // Colunas anuláveis: views não carregam as garantias NOT NULL das tabelas.
      clientes_publicos: {
        Row: {
          id: string | null
          razao_social: string | null
          cidade: string | null
          uf: string | null
          // 0061 — o portal decide por estas colunas se oferece o pedido de
          // agendamento e qual antecedência exigir no seletor de data.
          // `observacoes_agendamento` NÃO entra (0062): é texto livre da equipe
          // e a view responde ao `anon`.
          requer_agendamento: boolean | null
          terminal_nome: string | null
          antecedencia_minima_horas: number | null
        }
      }
      portal_solicitacoes: {
        Row: {
          id: string | null
          numero_interno: number | null
          tipo: SolicitacaoTipo | null
          status: SolicitacaoStatus | null
          origem: SolicitacaoOrigem | null
          parceiro_id: string | null
          parceiro_usuario_id: string | null
          parceiro_motorista_id: string | null
          parceiro_veiculo_id: string | null
          parceiro_carreta_id: string | null
          parceiro_primeira_carreta_id: string | null
          parceiro_dolly_id: string | null
          parceiro_subcontratada_id: string | null
          cliente_id: string | null
          pamcard_status: PamcardStatus | null
          pamcard_numero: string | null
          observacoes: string | null
          created_at: string | null
          enviada_em: string | null
          finalizada_em: string | null
        }
      }
    }
    Functions: {
      registrar_evento_portal: {
        Args: { p_tipo_evento: TipoEventoPortal; p_payload: Record<string, unknown> | null }
        Returns: string | null
      }
      atualizar_meu_nome: {
        Args: { novo_nome: string }
        Returns: undefined
      }
      marcar_meu_convite_aceito: {
        Args: Record<string, never>
        Returns: string | null
      }
      portal_editar_solicitacao: {
        Args: {
          p_id: string
          p_motorista: string
          p_veiculo: string
          p_carreta: string | null
          p_primeira_carreta: string | null
          p_dolly: string | null
          p_subcontratada: string | null
          p_cliente: string
          p_pamcard_status: string
          p_pamcard_numero: string | null
          p_observacoes: string | null
        }
        Returns: string
      }
      portal_cancelar_solicitacao: {
        Args: { p_id: string }
        Returns: string
      }
      // 0059 — registro de acesso a dado pessoal (LGPD art. 37). Chamada
      // fire-and-forget por `lib/acesso.ts` nos dois apps.
      registrar_acesso: {
        Args: { p_acao: string; p_recurso?: string | null; p_detalhe?: Json | null }
        Returns: string | null
      }
      // 0060 — baixa na fila de remoção do storage, após o app apagar (ou
      // falhar ao apagar) o arquivo do anexo.
      marcar_storage_removido: {
        Args: { p_path: string; p_erro?: string | null }
        Returns: undefined
      }
      // 0061 — agendamentos. O parceiro escreve só por RPC (não tem SELECT em
      // `solicitacoes`, então UPDATE direto afetaria zero linhas em silêncio).
      portal_solicitar_agendamento: {
        Args: {
          p_solicitacao_id: string
          p_data_preferida: string
          p_hora_preferida: string | null
          p_observacoes: string | null
        }
        Returns: string
      }
      portal_cancelar_agendamento: {
        Args: { p_id: string }
        Returns: string
      }
      portal_reagendar_agendamento: {
        Args: {
          p_id: string
          p_motivo: string | null
          p_nova_data: string
          p_nova_hora: string | null
        }
        Returns: string
      }
      agendamento_reagendar: {
        Args: {
          p_agendamento_id: string
          p_motivo: string | null
          p_nova_data: string
          p_nova_hora: string | null
        }
        Returns: string
      }
      // Trava de concorrência: resolve a corrida numa única instrução. Quem
      // chegar depois recebe PT409.
      agendamento_assumir: {
        Args: { p_id: string }
        Returns: string
      }
      // Referência PARCIAL: conta só os veículos da própria LHG no slot. A vaga
      // real vive no sistema do terminal (SPEC-AGENDAMENTOS 3.1.2).
      agendamentos_ocupacao_slot: {
        Args: { p_cliente_id: string; p_data: string }
        Returns: {
          hora: string
          duracao_minutos: number
          capacidade: number | null
          ocupados: number
        }[]
      }
      // Não é mais chamada pela tela: o cadastro passou a gerar a grade a partir
      // da faixa informada pelo terminal (início/fim/duração/vagas), porque cada
      // terminal novo trouxe números próprios — a MRS foi descrita como "padrão
      // do TCI" e veio com 30 min e 3 vagas. Fica no banco por documentar os
      // dois presets que os seeds das 0061/0063 usam.
      terminal_aplicar_grade_padrao: {
        Args: { p_cliente_id: string; p_modelo: 'horaria' | 'janela_longa' }
        Returns: number
      }
      // 0057 — direitos do titular. Sem UI ainda: chamadas pelo SQL Editor.
      // Tipadas aqui para quando a tela existir e para documentar a assinatura.
      exportar_dados_titular: {
        Args: { p_cpf: string }
        Returns: Json
      }
      anonimizar_titular: {
        Args: { p_cpf: string; p_confirmar?: boolean }
        Returns: Json
      }
    }
    Enums: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row']
