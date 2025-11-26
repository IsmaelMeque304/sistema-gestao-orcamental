-- Script SQL para criar usuário e atribuir papel
-- IMPORTANTE: A senha precisa ser um hash bcrypt, não texto plano!
-- 
-- Para gerar um hash bcrypt, use Python:
-- python -c "from passlib.context import CryptContext; pwd = CryptContext(schemes=['bcrypt'], deprecated='auto'); print(pwd.hash('sua_senha_aqui'))"
--
-- Ou use o script Python: python scripts/create_admin.py

-- 1. Criar papéis (se ainda não existirem)
INSERT INTO papel (nome, descricao) VALUES
('admin', 'Administrador do sistema — todo acesso'),
('contabilista', 'Acesso a importação, revisão e confirmação'),
('visualizador', 'Acesso somente leitura aos relatórios')
ON DUPLICATE KEY UPDATE descricao = VALUES(descricao);

-- 2. Criar usuário
-- NOTA: Substitua o hash da senha abaixo por um hash bcrypt real!
-- Hash de exemplo para senha "admin123": $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqBWVHxkd0
INSERT INTO usuario (username, senha, nome, nuit, contacto, email, activo)
VALUES (
    'admin',  -- Altere o username se necessário
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqBWVHxkd0',  -- Hash bcrypt de "admin123" - SUBSTITUA!
    'Administrador',
    NULL,
    NULL,
    'admin@exemplo.com',  -- Altere o email
    1
)
ON DUPLICATE KEY UPDATE 
    nome = VALUES(nome),
    email = VALUES(email),
    activo = 1;

-- 3. Atribuir papel admin ao usuário
-- Usa o username para encontrar o usuário (mais seguro que LAST_INSERT_ID)
INSERT INTO usuario_papel (usuario_id, papel_id, atribuido_por)
SELECT 
    u.id,
    p.id,
    u.id
FROM usuario u
CROSS JOIN papel p
WHERE u.username = 'admin'  -- Altere se usou outro username
  AND p.nome = 'admin'
ON DUPLICATE KEY UPDATE 
    atribuido_em = CURRENT_TIMESTAMP;

-- Verificar se foi criado corretamente
SELECT 
    u.id,
    u.username,
    u.nome,
    u.email,
    u.activo,
    p.nome as papel
FROM usuario u
LEFT JOIN usuario_papel up ON u.id = up.usuario_id
LEFT JOIN papel p ON up.papel_id = p.id
WHERE u.username = 'admin';

