CREATE DATABASE IF NOT EXISTS `sistema_contabil`
  CHARACTER SET = 'utf8mb4'
  COLLATE = 'utf8mb4_unicode_ci';
USE `sistema_contabil`;

DROP TABLE IF EXISTS usuario;
CREATE TABLE usuario (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(128) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  nome VARCHAR(255),

  nuit VARCHAR(30) unique,
  contacto VARCHAR(50) unique,
  email VARCHAR(150) unique,
  endereco TEXT,

  activo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


CREATE TABLE fornecedor (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'fornecedor',   -- fornecedor, outro
  codigo_interno VARCHAR(50),

  activo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY ux_fornecedor_usuario (usuario_id),

  CONSTRAINT fk_fornecedor_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuario(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE funcionario (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  categoria VARCHAR(100),
  departamento VARCHAR(150),

  activo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY ux_funcionario_usuario (usuario_id),

  CONSTRAINT fk_funcionario_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuario(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;




CREATE TABLE papel (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(64) NOT NULL UNIQUE,
  descricao VARCHAR(255),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE usuario_papel (
  usuario_id INT UNSIGNED NOT NULL,
  papel_id INT UNSIGNED NOT NULL,
  atribuido_por INT, 
  atribuido_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, papel_id),

  CONSTRAINT fk_up_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuario(id) ON DELETE CASCADE,

  CONSTRAINT fk_up_papel FOREIGN KEY (papel_id)
    REFERENCES papel(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE rubrica (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(128) NOT NULL,
  designacao VARCHAR(255) NOT NULL,
  tipo VARCHAR(32) DEFAULT 'subcategoria',
  parent_id INT UNSIGNED NULL,
  nivel TINYINT DEFAULT 1,
  dotacao DECIMAL(18,2) DEFAULT 0.00,
  exercicio SMALLINT,
  status VARCHAR(32) DEFAULT 'active',

  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY ux_rubrica_codigo_exercicio (codigo, exercicio),

  CONSTRAINT fk_rubrica_parent
    FOREIGN KEY (parent_id) REFERENCES rubrica(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Execute este comando no MySQL
ALTER TABLE rubrica MODIFY COLUMN codigo VARCHAR(100) NOT NULL;


CREATE TABLE import_batch (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255),
  tipo VARCHAR(32),
  user_id INT UNSIGNED,
  linhas_processadas INT DEFAULT 0,
  criadas INT DEFAULT 0,
  atualizadas INT DEFAULT 0,
  erros INT DEFAULT 0,
  detalhes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_import_user
    FOREIGN KEY (user_id) REFERENCES usuario(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;








CREATE TABLE despesa (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rubrica_id INT UNSIGNED,
  fornecedor_id INT UNSIGNED,
  fornecedor_text VARCHAR(500),
  requisicao VARCHAR(128),
  justificativo VARCHAR(255),
  ordem_pagamento VARCHAR(128),
  valor DECIMAL(18,2) NOT NULL,
  data_emissao DATE,
  exercicio SMALLINT,
  mes TINYINT,
  batch_id INT UNSIGNED,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_despesa_rubrica FOREIGN KEY (rubrica_id)
    REFERENCES rubrica(id) ON DELETE SET NULL,

  CONSTRAINT fk_despesa_fornecedor FOREIGN KEY (fornecedor_id)
    REFERENCES fornecedor(id) ON DELETE SET NULL,

  CONSTRAINT fk_despesa_batch FOREIGN KEY (batch_id)
    REFERENCES import_batch(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE execucao_mensal (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rubrica_id INT UNSIGNED NOT NULL,
  mes TINYINT NOT NULL,
  ano SMALLINT NOT NULL,
  dotacao DECIMAL(18,2) DEFAULT 0.00,
  gasto DECIMAL(18,2) DEFAULT 0.00,
  saldo DECIMAL(18,2) DEFAULT 0.00,

  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY ux_execucao_rubrica_mes_ano (rubrica_id, mes, ano),

  CONSTRAINT fk_execucao_rubrica FOREIGN KEY (rubrica_id) REFERENCES rubrica(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE reconciliation_issue (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rubrica_id INT UNSIGNED,
  tipo VARCHAR(64),
  descricao TEXT,
  valor_diferenca DECIMAL(18,2),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  resolvido TINYINT(1) DEFAULT 0,
  resolvido_em TIMESTAMP NULL,
  resolvido_por INT UNSIGNED,

  CONSTRAINT fk_issue_rubrica FOREIGN KEY (rubrica_id)
    REFERENCES rubrica(id) ON DELETE SET NULL,

  CONSTRAINT fk_issue_resolved FOREIGN KEY (resolvido_por)
    REFERENCES usuario(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE user_creation_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT,
  tipo VARCHAR(20),    -- fornecedor | funcionario
  ref_id INT,
  detalhes TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);























































































































































