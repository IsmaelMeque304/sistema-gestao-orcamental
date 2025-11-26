-- Script para adicionar coluna dotacao_inicial à tabela rubrica
-- Execute este script para adicionar suporte a dotação inicial para rubricas folha

USE sistema_contabil;

-- Adicionar coluna dotacao_inicial
ALTER TABLE rubrica 
ADD COLUMN dotacao_inicial DECIMAL(18,2) DEFAULT 0.00 NULL 
AFTER nivel;

-- Atualizar dotacao_calculada para rubricas folha baseado em dotacao_inicial
-- (se dotacao_inicial estiver definida)
UPDATE rubrica r1
SET r1.dotacao_calculada = COALESCE(r1.dotacao_inicial, 0.00)
WHERE r1.parent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rubrica r2 
    WHERE r2.parent_id = r1.id
  );

-- Comentário: Rubricas pai terão dotacao_calculada recalculada automaticamente
-- pela função recalculate_dotacao_chain que soma as dotacoes_calculadas dos filhos

