-- Script para adicionar campo must_change_password na tabela usuario
-- Execute este script se a coluna ainda não existir

ALTER TABLE usuario
ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 1;

-- Criar tabela de log de criação de usuários
CREATE TABLE IF NOT EXISTS user_creation_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT,
  tipo VARCHAR(20) NOT NULL,
  ref_id INT NOT NULL,
  detalhes TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE SET NULL,
  INDEX idx_tipo_ref (tipo, ref_id),
  INDEX idx_usuario (usuario_id)
);

