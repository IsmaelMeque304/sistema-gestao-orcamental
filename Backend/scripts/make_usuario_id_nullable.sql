-- Script para tornar usuario_id nullable nas tabelas fornecedor e funcionario
-- Execute este script para permitir criar fornecedores/funcionários sem usuário vinculado

-- Alterar tabela fornecedor
ALTER TABLE fornecedor 
MODIFY COLUMN usuario_id INT NULL;

-- Alterar tabela funcionario
ALTER TABLE funcionario 
MODIFY COLUMN usuario_id INT NULL;

-- Verificar alterações
DESCRIBE fornecedor;
DESCRIBE funcionario;

