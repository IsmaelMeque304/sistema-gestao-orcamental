-- ============================================================================
-- Script: Criação das Tabelas de Dotação Orçamental Global
-- ============================================================================
-- Descrição:
--   Este script cria as tabelas necessárias para gerenciar a dotação
--   orçamental global anual do sistema. A dotação global é o valor total
--   aprovado para o exercício, que é reduzido conforme despesas são confirmadas.
--
-- Importante:
--   - Existe apenas UMA dotação global por exercício (ano)
--   - O saldo é reduzido quando despesas são confirmadas
--   - Todos os movimentos são registrados para auditoria
--   - O sistema valida saldo antes de confirmar despesas
--
-- Como executar:
--   mysql -u seu_usuario -p sistema_contabil < scripts/create_dotacao_global.sql
-- ============================================================================

USE sistema_contabil;

-- ============================================================================
-- Tabela: dotacao_global
-- ============================================================================
-- Armazena a dotação orçamental global anual.
-- Uma única linha por exercício (ano).
-- ============================================================================

CREATE TABLE IF NOT EXISTS dotacao_global (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  
  -- Exercício orçamentário (ano)
  exercicio SMALLINT NOT NULL UNIQUE,
  
  -- Valor total aprovado para o exercício
  valor_anual DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  
  -- Saldo disponível (valor_anual - despesas confirmadas - reservado)
  saldo DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  
  -- Valor reservado (ainda não confirmado, mas comprometido)
  reservado DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  
  -- Timestamps
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Constraints
  -- UNIQUE KEY já cria índice automaticamente, não precisa de INDEX separado
  UNIQUE KEY ux_dotacao_global_exercicio (exercicio)
  
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tabela: dotacao_global_mov
-- ============================================================================
-- Registra todos os movimentos da dotação global para auditoria.
-- Tipos de movimento:
--   - 'ajuste': Ajuste manual do valor anual
--   - 'despesa_confirmada': Despesa foi confirmada (reduz saldo)
--   - 'despesa_cancelada': Despesa foi cancelada (aumenta saldo)
--   - 'reserva': Valor foi reservado (reduz saldo disponível)
--   - 'reserva_cancelada': Reserva foi cancelada (aumenta saldo disponível)
-- ============================================================================

CREATE TABLE IF NOT EXISTS dotacao_global_mov (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  
  -- Referência à dotação global
  dotacao_global_id INT UNSIGNED NOT NULL,
  
  -- Tipo de movimento
  tipo ENUM(
    'ajuste',
    'despesa_confirmada',
    'despesa_cancelada',
    'reserva',
    'reserva_cancelada'
  ) NOT NULL,
  
  -- Referência externa (ex: ID da despesa, ID da reserva)
  referencia VARCHAR(255) NULL,
  
  -- Valor do movimento (positivo ou negativo conforme o tipo)
  valor DECIMAL(18,2) NOT NULL,
  
  -- Descrição do movimento
  descricao TEXT NULL,
  
  -- Usuário que realizou o movimento (opcional)
  usuario_id INT UNSIGNED NULL,
  
  -- Timestamps
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign Keys
  CONSTRAINT fk_dotacao_global_mov_dotacao
    FOREIGN KEY (dotacao_global_id)
    REFERENCES dotacao_global(id)
    ON DELETE CASCADE,
  
  CONSTRAINT fk_dotacao_global_mov_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuario(id)
    ON DELETE SET NULL,
  
  -- Índices
  INDEX idx_dotacao_global_mov_dotacao (dotacao_global_id),
  INDEX idx_dotacao_global_mov_tipo (tipo),
  INDEX idx_dotacao_global_mov_criado (criado_em)
  
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Comentários nas Tabelas
-- ============================================================================

ALTER TABLE dotacao_global 
  COMMENT = 'Dotação orçamental global anual - valor total aprovado por exercício';

ALTER TABLE dotacao_global_mov 
  COMMENT = 'Movimentos da dotação global para auditoria e rastreabilidade';

-- ============================================================================
-- Verificação
-- ============================================================================
-- Execute para verificar se as tabelas foram criadas:
-- SHOW TABLES LIKE 'dotacao_global%';
-- DESCRIBE dotacao_global;
-- DESCRIBE dotacao_global_mov;
-- ============================================================================

