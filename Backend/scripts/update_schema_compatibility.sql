-- Script para garantir compatibilidade entre SQL e modelos SQLAlchemy
-- Execute este script se já tiver criado as tabelas

USE sistema_contabil;

-- Ajusta tamanho do codigo na rubrica (já deve estar em 128, mas garante)
ALTER TABLE rubrica MODIFY COLUMN codigo VARCHAR(128) NOT NULL;

-- Ajusta tamanhos de campos na despesa
ALTER TABLE despesa MODIFY COLUMN requisicao VARCHAR(128);
ALTER TABLE despesa MODIFY COLUMN ordem_pagamento VARCHAR(128);
ALTER TABLE despesa MODIFY COLUMN justificativo VARCHAR(255);
ALTER TABLE despesa MODIFY COLUMN valor DECIMAL(18,2) NOT NULL;

-- Ajusta exercicio para SMALLINT
ALTER TABLE rubrica MODIFY COLUMN exercicio SMALLINT;
ALTER TABLE despesa MODIFY COLUMN exercicio SMALLINT;
ALTER TABLE execucao_mensal MODIFY COLUMN ano SMALLINT;

-- Ajusta data_emissao para DATE (se ainda não estiver)
ALTER TABLE despesa MODIFY COLUMN data_emissao DATE;

-- Ajusta dotacao, gasto, saldo para DECIMAL(18,2)
ALTER TABLE rubrica MODIFY COLUMN dotacao DECIMAL(18,2) DEFAULT 0.00;
ALTER TABLE execucao_mensal MODIFY COLUMN dotacao DECIMAL(18,2) DEFAULT 0.00;
ALTER TABLE execucao_mensal MODIFY COLUMN gasto DECIMAL(18,2) DEFAULT 0.00;
ALTER TABLE execucao_mensal MODIFY COLUMN saldo DECIMAL(18,2) DEFAULT 0.00;
ALTER TABLE reconciliation_issue MODIFY COLUMN valor_diferenca DECIMAL(18,2);

-- Verifica se created_at e updated_at existem (se não, cria)
-- Se as colunas já existem com nomes diferentes (criado_em/actualizado_em), 
-- você pode renomeá-las ou ajustar o modelo SQLAlchemy
-- Para manter consistência, vamos verificar:

-- Se a tabela despesa tem created_at e updated_at, está correto
-- Se tem criado_em e actualizado_em, execute:
-- ALTER TABLE despesa CHANGE COLUMN criado_em created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- ALTER TABLE despesa CHANGE COLUMN actualizado_em updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

