-- Script para atualizar o tamanho da coluna codigo na tabela rubrica
-- Formato suportado: 47/H000/1.1.2.1.01 (até 100 caracteres)

-- MySQL
ALTER TABLE rubrica MODIFY COLUMN codigo VARCHAR(100) NOT NULL;

-- Verifica se a alteração foi aplicada
-- SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_SCHEMA = DATABASE() 
--   AND TABLE_NAME = 'rubrica' 
--   AND COLUMN_NAME = 'codigo';

