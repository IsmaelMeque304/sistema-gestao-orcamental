INSERT INTO papel (nome, descricao) VALUES
('admin', 'Administrador do sistema — todo acesso'),
('contabilista', 'Acesso a importação, revisão e confirmação'),
('visualizador', 'Acesso somente leitura aos relatórios');

-- obtém id do utilizador recém-criado (ou substitui por ID conhecido)
INSERT INTO usuario_papel (usuario_id, papel_id)
VALUES (LAST_INSERT_ID(), (SELECT id FROM papel WHERE nome='admin'));



INSERT INTO usuario (username, senha, nome, nuit, contacto, email)
VALUES (null, null, 'Francisco Manuel', NULL, NULL, 'franciscomanuel@exemplo.com');



-- obter id do usuario e criar fornecedor/funcionario
-- supondo id = 2:
INSERT INTO fornecedor (usuario_id, tipo, codigo_interno) VALUES (2, 'funcionario', 'FUNC-001');
INSERT INTO funcionario (usuario_id, categoria, departamento) VALUES (2, 'Técnico Superior N1', 'RAF');



SHOW TABLES;


SELECT * FROM papel;


SELECT id, username, nome, email, criado_em FROM usuario WHERE username='admin';


SELECT f.id, u.username, u.nome
FROM fornecedor f
JOIN usuario u ON f.usuario_id = u.id;


