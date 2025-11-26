# 📊 Sistema Contabil - Sistema de Gestão Orçamentária

Sistema completo de gestão orçamentária e contabilística desenvolvido para gestão de despesas públicas, rubricas orçamentárias, fornecedores e funcionários. Permite importação de arquivos Excel/CSV, controle de dotação orçamental global, confirmação de despesas e geração de balancetes.

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104.1-green.svg)](https://fastapi.tiangolo.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-orange.svg)](https://www.mysql.com/)
[![License](https://img.shields.io/badge/License-Internal-red.svg)](LICENSE)

---

## 📋 Índice

- [Características](#-características)
- [Tecnologias](#-tecnologias)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Requisitos](#-requisitos)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Execução](#-execução)
- [Funcionalidades](#-funcionalidades)
- [API Endpoints](#-api-endpoints)
- [Documentação](#-documentação)
- [Testes](#-testes)
- [Contribuição](#-contribuição)

---

## ✨ Características

- ✅ **Gestão Completa de Despesas**: CRUD completo com confirmação e validação de saldo
- ✅ **Sistema de Dotação Global**: Controle de dotação orçamental anual com auditoria
- ✅ **Importação Inteligente**: Upload de CSV/XLSX com matching automático e normalização
- ✅ **Rubricas Hierárquicas**: Gestão de rubricas em árvore com cálculo automático
- ✅ **Autenticação Segura**: JWT com bcrypt e sistema de roles (admin, contabilista, visualizador)
- ✅ **Dashboard em Tempo Real**: Eventos Server-Sent Events (SSE) para atualizações automáticas
- ✅ **Interface Moderna**: Frontend responsivo com vanilla JavaScript
- ✅ **Execução Mensal**: Cálculo automático de dotação, gasto e saldo por mês
- ✅ **Balancete**: Geração de balancete por mês/ano
- ✅ **Gestão de Usuários**: CRUD completo com criação automática para fornecedores/funcionários

---

## 🛠️ Tecnologias

### Backend
- **Framework**: FastAPI 0.104.1
- **ORM**: SQLAlchemy 2.0.23
- **Banco de Dados**: MySQL 8.0+ (com suporte a CTE recursivo)
- **Autenticação**: JWT (python-jose) + bcrypt
- **Validação**: Pydantic 2.5.0
- **Processamento**: Pandas 2.1.3, openpyxl 3.1.2
- **Matching**: rapidfuzz 3.5.2 (fuzzy matching)

### Frontend
- **Tecnologia**: HTML5, CSS3, JavaScript ES6+ (Vanilla)
- **Arquitetura**: SPA (Single Page Application)
- **Design**: Responsivo e moderno

---

## 📁 Estrutura do Projeto

```
Sistema/
├── Backend/                    # Aplicação principal
│   ├── app/                    # Código da aplicação
│   │   ├── api/                # Endpoints REST
│   │   │   ├── auth.py         # Autenticação JWT
│   │   │   ├── usuarios.py     # CRUD usuários
│   │   │   ├── funcionarios.py # CRUD funcionários
│   │   │   ├── fornecedores.py # CRUD fornecedores
│   │   │   ├── rubricas.py     # CRUD rubricas
│   │   │   ├── despesas.py     # CRUD despesas
│   │   │   ├── dotacao_global.py # Dotação orçamental
│   │   │   └── import_api.py   # Importação de arquivos
│   │   ├── services/           # Lógica de negócio
│   │   │   ├── importer.py     # Serviço de importação
│   │   │   ├── despesa_service.py
│   │   │   └── rubrica_service.py
│   │   ├── models.py           # Modelos SQLAlchemy
│   │   ├── schemas.py          # Schemas Pydantic
│   │   ├── crud.py             # Operações CRUD
│   │   ├── db.py               # Configuração do banco
│   │   ├── config.py           # Configurações
│   │   └── main.py             # Aplicação FastAPI
│   ├── frontend/               # Interface web
│   │   ├── *.html              # Páginas HTML
│   │   ├── css/                # Estilos CSS
│   │   ├── js/                 # JavaScript
│   │   └── img/                # Imagens
│   ├── scripts/                # Scripts SQL e Python
│   │   ├── init_database.sql   # Schema inicial
│   │   ├── create_dotacao_global.sql
│   │   └── create_admin.py     # Criar usuário admin
│   ├── tests/                  # Testes automatizados
│   ├── uploads/                # Arquivos importados
│   ├── requirements.txt        # Dependências Python
│   └── README.md               # Documentação do backend
├── Banco de dados/             # Scripts SQL
│   ├── Tabelas.sql            # Schema completo
│   └── Insercoes.sql          # Dados iniciais
├── Prototipo/                 # Protótipo inicial
└── README.md                  # Este arquivo
```

---

## 📋 Requisitos

- **Python**: 3.11 ou superior
- **MySQL**: 8.0 ou superior (para suporte a CTE recursivo)
- **pip**: Gerenciador de pacotes Python
- **Git**: Para clonar o repositório (opcional)

---

## 🚀 Instalação

### 1. Clonar o repositório

```bash
git clone git@github.com:IsmaelMeque304/sistema-gestao-orcamental.git
cd Sistema
```

### 2. Criar ambiente virtual

```bash
# Windows
cd Backend
python -m venv venv
venv\Scripts\activate

# Linux/Mac
cd Backend
python3 -m venv venv
source venv/bin/activate
```

### 3. Instalar dependências

```bash
cd Backend
pip install -r requirements.txt
```

### 4. Configurar banco de dados

1. **Criar banco de dados MySQL:**

```sql
CREATE DATABASE sistema_contabil 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;
```

2. **Executar scripts SQL:**

```bash
# Schema inicial
mysql -u seu_usuario -p sistema_contabil < Backend/scripts/init_database.sql

# Dotação global
mysql -u seu_usuario -p sistema_contabil < Backend/scripts/create_dotacao_global.sql
```

Ou use os arquivos em `Banco de dados/`:
```bash
mysql -u seu_usuario -p sistema_contabil < "Banco de dados/Tabelas.sql"
```

### 5. Configurar variáveis de ambiente

1. **Copiar arquivo de exemplo:**

```bash
cd Backend
cp env.reference.txt .env
```

2. **Editar `.env` com suas credenciais:**

```env
DATABASE_URL=mysql+pymysql://usuario:senha@localhost:3306/sistema_contabil
SECRET_KEY=sua-chave-secreta-aqui
```

**Importante**: Gere uma chave secreta forte:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 6. Criar usuário administrador

```bash
cd Backend
python scripts/create_admin.py
```

Ou via Python interativo:

```python
from app.db import SessionLocal
from app.crud import create_usuario, assign_papel_to_usuario, create_papel
from app.schemas import UsuarioCreate, PapelCreate

db = SessionLocal()

# Criar papéis
papel_admin = create_papel(db, PapelCreate(nome="admin", descricao="Administrador"))
papel_contabilista = create_papel(db, PapelCreate(nome="contabilista", descricao="Contabilista"))
papel_visualizador = create_papel(db, PapelCreate(nome="visualizador", descricao="Visualizador"))

# Criar usuário admin
usuario = create_usuario(db, UsuarioCreate(
    username="admin",
    senha="admin123",  # Altere em produção!
    nome="Administrador",
    activo=True
))

# Atribuir papel
assign_papel_to_usuario(db, usuario.id, papel_admin.id, usuario.id)

db.close()
```

---

## ⚙️ Configuração

### Variáveis de Ambiente

O arquivo `.env` deve conter:

```env
# Banco de Dados
DATABASE_URL=mysql+pymysql://usuario:senha@localhost:3306/sistema_contabil

# Segurança
SECRET_KEY=sua-chave-secreta-aqui
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Uploads
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=52428800  # 50MB
```

### Configuração de Produção

⚠️ **Importante para produção:**

1. Altere `SECRET_KEY` para um valor seguro
2. Configure CORS adequadamente (não use `allow_origins=["*"]`)
3. Use HTTPS
4. Configure backup automático do banco de dados
5. Configure logs adequados

---

## 🏃 Execução

### Desenvolvimento

```bash
cd Backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Produção

```bash
cd Backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Scripts de Inicialização

**Windows:**
```bash
Backend\start_server.bat
```

**Linux/Mac:**
```bash
chmod +x Backend/start_server.sh
Backend/start_server.sh
```

### Acessos

Após iniciar o servidor:

- **API**: http://localhost:8000
- **Documentação Swagger**: http://localhost:8000/docs
- **Frontend**: http://localhost:8000/
- **Health Check**: http://localhost:8000/health

---

## 🎯 Funcionalidades

### 1. Autenticação e Autorização

- Login com JWT
- Sistema de roles (admin, contabilista, visualizador)
- Hash de senhas com bcrypt
- Tokens com expiração configurável

### 2. Gestão de Usuários

- CRUD completo (admin only)
- Criação automática para fornecedores/funcionários
- Gestão de papeis
- Validação: username único, senha mínima 8 caracteres

### 3. Gestão de Funcionários e Fornecedores

- CRUD completo
- Criação sem usuario_id (cria usuário automaticamente)
- Filtros avançados
- Tipos: Pessoa Singular/Coletiva

### 4. Gestão de Rubricas

- CRUD completo
- Hierarquia (árvore)
- Código único por exercício (ex: `47/H000/1.1.2.1.01`)
- Cálculo automático de dotação (soma filhos)
- Status: Ativa, Provisória, Inativa

### 5. Gestão de Despesas

- CRUD completo
- Importação em lote
- Confirmação de despesas
- Validação de saldo (dotação global)
- Recalculo automático de execução mensal
- Filtros: rubrica, fornecedor, status, exercicio, mes

### 6. Sistema de Dotação Global

- Dotação orçamental global anual
- Valor único por exercício
- Controle de saldo disponível
- Sistema de reservas
- Auditoria completa de movimentos

### 7. Importação de Arquivos

- Formatos: CSV, XLSX
- Suporte a múltiplas folhas Excel
- Preview das primeiras 10 linhas
- Auto-detecção de colunas
- Normalização automática:
  - Nomes: remove acentos, uppercase, trim
  - Códigos: trim + uppercase
  - Valores: suporta formatos PT e EN
  - Datas: múltiplos formatos
- Matching inteligente:
  - Fornecedores: NUIT, código interno, nome exato, fuzzy matching
  - Rubricas: código + exercício (cria provisórias se não existir)

### 8. Execução Mensal

- Cálculo automático por rubrica/mês/ano
- Dotação, Gasto, Saldo
- Recalculado ao confirmar despesas
- Visualização em tabela mensal

### 9. Balancete

- Geração por mês/ano
- Agrupamento por rubrica
- Cálculo de totais
- Filtro por exercício

### 10. Dashboard

- Eventos em tempo real (Server-Sent Events)
- Atualização automática
- Métricas: dotação, gasto, saldo, execução %

---

## 🔌 API Endpoints

### Autenticação

- `POST /auth/login` - Login (form data)
- `POST /auth/login-json` - Login (JSON)

### Usuários

- `GET /api/v1/usuarios` - Lista usuários (admin)
- `POST /api/v1/usuarios` - Cria usuário (admin)
- `GET /api/v1/usuarios/{id}` - Busca usuário
- `PUT /api/v1/usuarios/{id}` - Atualiza usuário (admin)
- `DELETE /api/v1/usuarios/{id}` - Desativa usuário (admin)

### Funcionários

- `GET /api/v1/funcionarios` - Lista funcionários
- `POST /api/v1/funcionarios` - Cria funcionário
- `GET /api/v1/funcionarios/{id}` - Busca funcionário
- `PUT /api/v1/funcionarios/{id}` - Atualiza funcionário
- `DELETE /api/v1/funcionarios/{id}` - Desativa funcionário

### Fornecedores

- `GET /api/v1/fornecedores` - Lista fornecedores
- `POST /api/v1/fornecedores` - Cria fornecedor
- `GET /api/v1/fornecedores/{id}` - Busca fornecedor
- `PUT /api/v1/fornecedores/{id}` - Atualiza fornecedor
- `DELETE /api/v1/fornecedores/{id}` - Desativa fornecedor

### Rubricas

- `GET /api/v1/rubricas` - Lista rubricas em árvore
- `POST /api/v1/rubricas` - Cria rubrica (admin)
- `GET /api/v1/rubricas/{id}` - Busca rubrica
- `PUT /api/v1/rubricas/{id}` - Atualiza rubrica (admin)
- `DELETE /api/v1/rubricas/{id}` - Deleta rubrica (admin)
- `GET /api/v1/rubrica/{codigo}/despesas` - Despesas da rubrica

### Despesas

- `GET /api/v1/despesas` - Lista despesas (com filtros)
- `POST /api/v1/despesas` - Cria despesa
- `GET /api/v1/despesas/{id}` - Busca despesa
- `PUT /api/v1/despesas/{id}` - Atualiza despesa
- `POST /api/v1/despesas/{id}/confirm` - Confirma despesa

### Dotação Global

- `GET /api/v1/dotacao_global?exercicio=2024` - Busca dotação
- `POST /api/v1/dotacao_global` - Cria/atualiza dotação
- `GET /api/v1/dotacao_global/movimentos?exercicio=2024` - Lista movimentos
- `POST /api/v1/dotacao_global/reserva` - Cria reserva
- `POST /api/v1/dotacao_global/reserva/cancel` - Cancela reserva

### Importação

- `POST /api/v1/import/upload` - Upload de arquivo
- `POST /api/v1/import/execute` - Executar importação
- `GET /api/v1/import/{batch_id}` - Detalhes do batch
- `GET /api/v1/import/{batch_id}/lines` - Linhas importadas

### Balancete

- `GET /api/v1/balancete?mes=X&ano=Y` - Gera balancete

### Dashboard

- `GET /api/v1/dashboard/events?exercicio=2024` - Eventos SSE

---

## 📚 Documentação

### Documentação Adicional

- **[Análise Completa do Projeto](Backend/ANALISE_COMPLETA_PROJETO.md)** - Análise detalhada do sistema
- **[Resumo do Projeto](Backend/RESUMO_COMPLETO_PROJETO.md)** - Resumo executivo
- **[Guia de Importação](Backend/GUIA_IMPORTACAO.md)** - Como importar arquivos
- **[Fase 1 - Resumo Final](Backend/FASE1_RESUMO_FINAL.md)** - Status da Fase 1 MVP

### Documentação da API

Acesse a documentação interativa Swagger em:
- http://localhost:8000/docs

---

## 🧪 Testes

### Executar Testes

```bash
cd Backend
pytest tests/ -v
```

### Cobertura de Testes

```bash
cd Backend
pytest tests/ --cov=app --cov-report=html
```

### Testes Disponíveis

- `test_auth.py` - Autenticação
- `test_despesas.py` - Despesas
- `test_dotacao_global.py` - Dotação global (inclui concorrência)
- `test_importer.py` - Importação
- `test_normalizers.py` - Normalização

---

## 🔒 Segurança

### Implementado

- ✅ Hash de senhas com bcrypt
- ✅ JWT para autenticação
- ✅ Sistema de roles/permissões
- ✅ Validações server-side
- ✅ Proteção contra SQL injection (SQLAlchemy ORM)
- ✅ Validação de dados com Pydantic

### Recomendações para Produção

- ⚠️ Configure CORS adequadamente
- ⚠️ Use HTTPS
- ⚠️ Configure rate limiting
- ⚠️ Implemente backup automático
- ⚠️ Configure logs de segurança
- ⚠️ Use variáveis de ambiente para secrets

---

## 🐛 Resolução de Problemas

### Erro de Conexão com Banco

- Verifique se o MySQL está rodando
- Confirme as credenciais no `.env`
- Verifique se o banco `sistema_contabil` existe

### Erro de Importação

- Verifique o formato do arquivo (CSV/XLSX)
- Confirme o mapeamento de colunas
- Verifique os logs do servidor

### Erro de Autenticação

- Verifique se o token JWT está válido
- Confirme se o usuário tem as permissões necessárias
- Verifique a expiração do token

---

## 🤝 Contribuição

### Como Contribuir

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

### Padrões de Código

- Siga PEP 8 para Python
- Use type hints
- Documente funções e classes
- Escreva testes para novas funcionalidades

---

## 📝 Licença

Este projeto é um MVP (Minimum Viable Product) para uso interno.

---

## 👥 Autores

- **Equipe de Desenvolvimento** - Desenvolvimento inicial

---

## 🙏 Agradecimentos

- FastAPI pela excelente documentação
- Comunidade Python pelo suporte
- Todos os contribuidores do projeto

---

## 📞 Suporte

Para questões ou problemas:

1. Consulte a [documentação completa](Backend/ANALISE_COMPLETA_PROJETO.md)
2. Verifique os [issues do projeto](https://github.com/seu-repo/issues)
3. Entre em contato com a equipe de desenvolvimento

---

## 🔄 Changelog

### Versão 1.0.0 (2024)

- ✅ Fase 1 MVP completa
- ✅ CRUD completo de todas as entidades
- ✅ Sistema de importação
- ✅ Dotação global
- ✅ Dashboard em tempo real
- ✅ Frontend completo

---

**Última atualização**: 2024
**Versão**: 1.0.0
**Status**: ✅ Operacional

