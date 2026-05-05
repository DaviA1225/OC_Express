-- =============================================
-- SisLog LHG — Perfis: nova hierarquia (5 níveis)
-- =============================================
-- Renomeia atendente→assistente e documentacao→analista, adiciona gerente.
-- Hierarquia final: admin > gerente > supervisor > analista > assistente.

ALTER TABLE perfis_usuarios
  DROP CONSTRAINT IF EXISTS perfis_usuarios_perfil_check;

UPDATE perfis_usuarios SET perfil = 'assistente' WHERE perfil = 'atendente';
UPDATE perfis_usuarios SET perfil = 'analista'   WHERE perfil = 'documentacao';

ALTER TABLE perfis_usuarios
  ADD CONSTRAINT perfis_usuarios_perfil_check
  CHECK (perfil IN ('admin', 'gerente', 'supervisor', 'analista', 'assistente'));
