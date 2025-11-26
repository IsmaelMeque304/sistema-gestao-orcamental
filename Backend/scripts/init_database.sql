-- Script SQL para inicializar o banco de dados
-- Execute este script após criar o schema principal

-- 1. Criar papéis
INSERT INTO papel (nome, descricao) VALUES
('admin', 'Administrador do sistema — todo acesso'),
('contabilista', 'Acesso a importação, revisão e confirmação'),
('visualizador', 'Acesso somente leitura aos relatórios')
ON DUPLICATE KEY UPDATE descricao = VALUES(descricao);

-- 2. Criar usuário administrador
-- NOTA: A senha precisa ser um hash bcrypt. 
-- Use o script Python create_admin.py para criar usuários com senha corretamente hasheada
-- Ou gere um hash manualmente: python -c "from passlib.context import CryptContext; pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto'); print(pwd_context.hash('sua_senha'))"

-- Exemplo de criação manual (substitua o hash pela senha que você quer):
-- INSERT INTO usuario (username, senha, nome, nuit, contacto, email, activo)
-- VALUES (
--     'admin',
--     '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqBWVHxkd0', -- Substitua por hash real
--     'Administrador',
--     NULL,
--     NULL,
--     'admin@exemplo.com',
--     1
-- );

-- 3. Atribuir papel admin ao usuário (substitua o ID pelo ID do usuário criado)
-- INSERT INTO usuario_papel (usuario_id, papel_id, atribuido_por)
-- VALUES (
--     (SELECT id FROM usuario WHERE username = 'admin'),
--     (SELECT id FROM papel WHERE nome = 'admin'),
--     (SELECT id FROM usuario WHERE username = 'admin')
-- );

