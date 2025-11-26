-- Script para adicionar coluna dotacao_calculada à tabela rubrica
-- Execute este script se a coluna ainda não existir

USE sistema_contabil;

-- Adicionar coluna dotacao_calculada se não existir
ALTER TABLE rubrica 
ADD COLUMN IF NOT EXISTS dotacao_calculada DECIMAL(18,2) NULL AFTER dotacao;

-- Inicializar dotacao_calculada com valor de dotacao para todas as rubricas
-- (será recalculado depois pela lógica do sistema)
UPDATE rubrica 
SET dotacao_calculada = COALESCE(dotacao, 0) 
WHERE dotacao_calculada IS NULL;

-- Tornar dotacao nullable (rubricas pai não têm dotação manual)
ALTER TABLE rubrica 
MODIFY COLUMN dotacao DECIMAL(18,2) NULL DEFAULT 0;

