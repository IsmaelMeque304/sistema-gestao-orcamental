-- Script para corrigir valores inválidos no enum tipo de fornecedor
-- Converte valores em maiúsculas e 'funcionario' para 'pessoa_singular' (valor padrão)

-- Verificar registros com valores inválidos ou em maiúsculas
SELECT id, tipo, usuario_id 
FROM fornecedor 
WHERE tipo NOT IN ('pessoa_singular', 'pessoa_coletiva')
   OR tipo IN ('PESSOA_SINGULAR', 'PESSOA_COLETIVA', 'funcionario', 'FUNCIONARIO');

-- Atualizar registros com valores em maiúsculas para minúsculas
UPDATE fornecedor 
SET tipo = 'pessoa_singular' 
WHERE tipo = 'PESSOA_SINGULAR';

UPDATE fornecedor 
SET tipo = 'pessoa_coletiva' 
WHERE tipo = 'PESSOA_COLETIVA';

-- Atualizar registros com 'funcionario' (qualquer case) para 'pessoa_singular'
UPDATE fornecedor 
SET tipo = 'pessoa_singular' 
WHERE tipo IN ('funcionario', 'FUNCIONARIO', 'Funcionario');

-- Verificar se ainda há valores inválidos
SELECT id, tipo, usuario_id 
FROM fornecedor 
WHERE tipo NOT IN ('pessoa_singular', 'pessoa_coletiva');

