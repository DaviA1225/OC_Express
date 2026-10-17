-- 0078 — Agente de IA do WhatsApp: conversas, mensagens, histórico e ações
--
-- Base de dados do agente (docs/SPEC-AGENTE-IA.md). O agente entra no sistema
-- com o próprio login (perfil `assistente`), então tudo aqui é lido e escrito
-- pela RLS de interno, como qualquer atendente. Nada de service_role.
--
--   * agente_config      — linha única com o MODO do agente: desligado, sombra
--                          ou autônomo. Trocar o modo não pede deploy.
--   * agente_conversas   — uma por número de WhatsApp. Guarda quem está
--                          atendendo (agente ou humano), a sessão atual e o
--                          "cadeado" de processamento.
--   * agente_mensagens   — cada mensagem que entrou ou saiu, com a mídia no
--                          bucket privado `agente-midia` e a transcrição do
--                          áudio. `wamid` único = a Meta pode reentregar o
--                          webhook à vontade sem duplicar nada.
--   * agente_historico   — a conversa no formato da API do Claude, só com
--                          INSERT (append-only). Reescrever o passado
--                          invalidaria o cache de prompt e os blocos de
--                          raciocínio do modelo.
--   * agente_acoes       — toda ferramenta de escrita que o agente chamou: o
--                          que pediu, o que aconteceu e, no modo sombra, o
--                          rascunho que espera aprovação da equipe.
--
-- Idempotente.

-- ============================================================
-- Configuração (linha única)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agente_config (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modo        text NOT NULL DEFAULT 'desligado'
              CHECK (modo IN ('desligado', 'sombra', 'autonomo')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.agente_config (id, modo) VALUES (1, 'desligado')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.agente_config IS
  'Modo do agente de WhatsApp (0078). desligado = ignora mensagens; sombra = '
  'le e monta rascunhos sem responder nem gravar; autonomo = atende sozinho.';

-- ============================================================
-- Conversas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agente_conversas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone            text NOT NULL UNIQUE CHECK (telefone ~ '^[0-9]{10,15}$'),
  nome_contato        text,
  estado              text NOT NULL DEFAULT 'agente' CHECK (estado IN ('agente', 'humano')),
  assumida_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assumida_em         timestamptz,
  sessao              integer NOT NULL DEFAULT 1,
  -- Última mensagem RECEBIDA: a Meta só deixa responder em texto livre até 24 h
  -- depois dela. Fora disso, só modelo de mensagem aprovado.
  ultima_entrada_em   timestamptz,
  ultima_atividade_em timestamptz NOT NULL DEFAULT now(),
  -- Cadeado de processamento: uma conversa é processada por uma execução de
  -- cada vez, e as mensagens saem na ordem em que chegaram.
  processando_ate     timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agente_conversas_atividade_idx
  ON public.agente_conversas (ultima_atividade_em DESC);

-- ============================================================
-- Mensagens
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agente_mensagens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id       uuid NOT NULL REFERENCES public.agente_conversas(id) ON DELETE CASCADE,
  sessao            integer NOT NULL,
  direcao           text NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  autor             text NOT NULL CHECK (autor IN ('contato', 'agente', 'humano')),
  wamid             text UNIQUE,
  tipo              text NOT NULL CHECK (tipo IN ('texto', 'audio', 'documento', 'imagem', 'outro')),
  texto             text,
  -- Id da mídia na Meta. O download acontece no processamento, fora dos 5 s
  -- que a Meta dá para o webhook responder.
  meta_media_id     text,
  midia_path        text,
  midia_mime        text,
  midia_nome        text,
  transcricao       text,
  -- Arquivo na Files API da Anthropic (PDF/imagem), para o histórico citar o
  -- documento por id em vez de carregar o base64 a cada turno.
  anthropic_file_id text,
  -- Só para entrada: já foi entregue ao agente?
  processada        boolean NOT NULL DEFAULT false,
  -- Só para saída: o que aconteceu com o envio. 'sombra' = o agente escreveu,
  -- mas o modo sombra não deixa mandar.
  envio             text CHECK (envio IN ('enviada', 'sombra', 'falhou')),
  enviada_por       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  erro              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agente_mensagens_conversa_idx
  ON public.agente_mensagens (conversa_id, created_at);
CREATE INDEX IF NOT EXISTS agente_mensagens_pendentes_idx
  ON public.agente_mensagens (conversa_id)
  WHERE direcao = 'entrada' AND processada = false;

-- ============================================================
-- Histórico no formato da API (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agente_historico (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id uuid NOT NULL REFERENCES public.agente_conversas(id) ON DELETE CASCADE,
  sessao      integer NOT NULL,
  seq         integer NOT NULL,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversa_id, sessao, seq)
);

-- ============================================================
-- Ações (auditoria das ferramentas + rascunhos do modo sombra)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agente_acoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id  uuid NOT NULL REFERENCES public.agente_conversas(id) ON DELETE CASCADE,
  ferramenta   text NOT NULL,
  entrada      jsonb NOT NULL,
  resultado    jsonb,
  status       text NOT NULL
               CHECK (status IN ('executada', 'rascunho', 'aprovada', 'rejeitada', 'erro')),
  decidido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decidido_em  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agente_acoes_conversa_idx
  ON public.agente_acoes (conversa_id, created_at);
CREATE INDEX IF NOT EXISTS agente_acoes_rascunhos_idx
  ON public.agente_acoes (created_at) WHERE status = 'rascunho';

-- ============================================================
-- RLS: interno lê e escreve (o agente é um usuário interno); só admin muda
-- o modo do agente.
-- ============================================================
ALTER TABLE public.agente_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agente_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agente_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agente_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agente_acoes     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agente_config, public.agente_conversas, public.agente_mensagens,
              public.agente_historico, public.agente_acoes FROM anon;

DROP POLICY IF EXISTS agente_config_select ON public.agente_config;
CREATE POLICY agente_config_select ON public.agente_config FOR SELECT TO authenticated
  USING ((SELECT is_interno()));
DROP POLICY IF EXISTS agente_config_update ON public.agente_config;
CREATE POLICY agente_config_update ON public.agente_config FOR UPDATE TO authenticated
  USING ((SELECT meu_perfil_interno()) = 'admin')
  WITH CHECK ((SELECT meu_perfil_interno()) = 'admin');

DROP POLICY IF EXISTS agente_conversas_interno_all ON public.agente_conversas;
CREATE POLICY agente_conversas_interno_all ON public.agente_conversas FOR ALL TO authenticated
  USING ((SELECT is_interno())) WITH CHECK ((SELECT is_interno()));

DROP POLICY IF EXISTS agente_mensagens_interno_all ON public.agente_mensagens;
CREATE POLICY agente_mensagens_interno_all ON public.agente_mensagens FOR ALL TO authenticated
  USING ((SELECT is_interno())) WITH CHECK ((SELECT is_interno()));

-- Histórico: só leitura e inserção. Sem UPDATE/DELETE de propósito.
DROP POLICY IF EXISTS agente_historico_select ON public.agente_historico;
CREATE POLICY agente_historico_select ON public.agente_historico FOR SELECT TO authenticated
  USING ((SELECT is_interno()));
DROP POLICY IF EXISTS agente_historico_insert ON public.agente_historico;
CREATE POLICY agente_historico_insert ON public.agente_historico FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_interno()));

DROP POLICY IF EXISTS agente_acoes_interno_all ON public.agente_acoes;
CREATE POLICY agente_acoes_interno_all ON public.agente_acoes FOR ALL TO authenticated
  USING ((SELECT is_interno())) WITH CHECK ((SELECT is_interno()));

-- ============================================================
-- Cadeado de processamento
-- ============================================================
-- Um UPDATE condicional só: duas execuções concorrentes não conseguem pegar a
-- mesma conversa. Devolve true para quem pegou.
CREATE OR REPLACE FUNCTION public.agente_reivindicar_conversa(p_conversa_id uuid, p_segundos integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  UPDATE agente_conversas
     SET processando_ate = now() + make_interval(secs => greatest(p_segundos, 10))
   WHERE id = p_conversa_id
     AND (processando_ate IS NULL OR processando_ate < now())
  RETURNING true INTO v_ok;
  RETURN coalesce(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.agente_reivindicar_conversa(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agente_reivindicar_conversa(uuid, integer) TO authenticated;

-- ============================================================
-- Storage: mídia recebida (áudio, PDF, foto) — privado, só interno
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('agente-midia', 'agente-midia', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "agente_midia_select" ON storage.objects;
DROP POLICY IF EXISTS "agente_midia_insert" ON storage.objects;
CREATE POLICY "agente_midia_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agente-midia' AND (SELECT is_interno()));
CREATE POLICY "agente_midia_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agente-midia' AND (SELECT is_interno()));

NOTIFY pgrst, 'reload schema';
