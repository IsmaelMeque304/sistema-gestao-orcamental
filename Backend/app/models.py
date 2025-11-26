"""
Modelos SQLAlchemy 2.x que mapeiam o schema MySQL.
"""
from sqlalchemy import (
    Column, Integer, String, DateTime, Date, Boolean, ForeignKey, 
    Numeric, Text, Enum as SQLEnum, UniqueConstraint, Index, SmallInteger
)
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db import Base
import enum


class TipoFornecedor(str, enum.Enum):
    """Tipos de fornecedor."""
    PESSOA_SINGULAR = "pessoa_singular"
    PESSOA_COLETIVA = "pessoa_coletiva"


class TipoRubrica(str, enum.Enum):
    """Tipos de rubrica."""
    RECEITA = "receita"
    DESPESA = "despesa"


class StatusRubrica(str, enum.Enum):
    """Status da rubrica."""
    ATIVA = "ativa"
    PROVISORIA = "provisoria"
    INATIVA = "inativa"


class StatusDespesa(str, enum.Enum):
    """Status da despesa."""
    PENDENTE = "pendente"
    CONFIRMADA = "confirmada"
    CANCELADA = "cancelada"


class TipoReconciliationIssue(str, enum.Enum):
    """Tipos de problemas de reconciliação."""
    DIVERGENCIA = "divergencia"
    DUPLICADO = "duplicado"
    VALOR_INCORRETO = "valor_incorreto"


class TipoDotacaoGlobalMov(str, enum.Enum):
    """Tipos de movimento da dotação global."""
    AJUSTE = "ajuste"
    DESPESA_CONFIRMADA = "despesa_confirmada"
    DESPESA_CANCELADA = "despesa_cancelada"
    RESERVA = "reserva"
    RESERVA_CANCELADA = "reserva_cancelada"


class TipoDotacaoGlobalMovType(TypeDecorator):
    """TypeDecorator para converter corretamente os valores do enum."""
    impl = String
    cache_ok = True
    
    def __init__(self):
        super().__init__(length=50)
    
    def process_bind_param(self, value, dialect):
        """Converter enum para string ao salvar no banco."""
        if value is None:
            return None
        if isinstance(value, TipoDotacaoGlobalMov):
            return value.value
        if isinstance(value, str):
            # Validar se é um valor válido
            try:
                TipoDotacaoGlobalMov(value)
                return value
            except ValueError:
                raise ValueError(f"Valor inválido para TipoDotacaoGlobalMov: {value}")
        return str(value)
    
    def process_result_value(self, value, dialect):
        """Converter string do banco para enum ao ler."""
        if value is None:
            return None
        if isinstance(value, TipoDotacaoGlobalMov):
            return value
        if isinstance(value, str):
            # Tentar converter pelo valor (minúsculas)
            try:
                return TipoDotacaoGlobalMov(value)
            except ValueError:
                # Se não encontrar, tentar pelo nome do membro (maiúsculas)
                for member in TipoDotacaoGlobalMov:
                    if member.name == value.upper():
                        return member
                # Se ainda não encontrar, tentar converter para minúsculas
                try:
                    return TipoDotacaoGlobalMov(value.lower())
                except ValueError:
                    raise ValueError(f"Valor inválido para TipoDotacaoGlobalMov: {value}")
        return value


class Usuario(Base):
    """Modelo de usuário do sistema."""
    __tablename__ = "usuario"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    senha = Column(String(255), nullable=False)  # Hash bcrypt
    nome = Column(String(200), nullable=False)
    nuit = Column(String(20), unique=True, nullable=True)
    contacto = Column(String(50), unique=True, nullable=True)
    email = Column(String(200), unique=True, nullable=True)
    endereco = Column(Text, nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    must_change_password = Column(Boolean, default=True, nullable=False)
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    actualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    fornecedor = relationship("Fornecedor", back_populates="usuario", uselist=False)
    funcionario = relationship("Funcionario", back_populates="usuario", uselist=False)
    papeis = relationship(
        "UsuarioPapel", 
        foreign_keys="UsuarioPapel.usuario_id",
        back_populates="usuario"
    )
    import_batches = relationship("ImportBatch", back_populates="user")


class Fornecedor(Base):
    """Modelo de fornecedor."""
    __tablename__ = "fornecedor"
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuario.id"), unique=True, nullable=True)
    # Usar String em vez de SQLEnum porque o banco tem VARCHAR, não ENUM
    # A validação será feita manualmente no código
    tipo = Column(String(30), nullable=False)
    codigo_interno = Column(String(50), nullable=True, index=True)
    activo = Column(Boolean, default=True, nullable=False)
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    actualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    usuario = relationship("Usuario", back_populates="fornecedor")
    despesas = relationship("Despesa", back_populates="fornecedor")
    
    @property
    def tipo_enum(self) -> TipoFornecedor:
        """Retorna o tipo como enum."""
        try:
            return TipoFornecedor(self.tipo.lower())
        except (ValueError, KeyError):
            # Se não conseguir converter, retornar padrão
            return TipoFornecedor.PESSOA_SINGULAR
    
    @tipo_enum.setter
    def tipo_enum(self, value: TipoFornecedor):
        """Define o tipo a partir de um enum."""
        self.tipo = value.value


class Funcionario(Base):
    """Modelo de funcionário."""
    __tablename__ = "funcionario"
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuario.id"), unique=True, nullable=True)
    categoria = Column(String(100), nullable=True)
    departamento = Column(String(100), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    actualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    usuario = relationship("Usuario", back_populates="funcionario")


class Papel(Base):
    """Modelo de papel/role."""
    __tablename__ = "papel"
    
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(50), unique=True, nullable=False, index=True)
    descricao = Column(Text, nullable=True)
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    actualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    usuarios = relationship("UsuarioPapel", back_populates="papel")


class UsuarioPapel(Base):
    """Tabela de associação usuário-papel."""
    __tablename__ = "usuario_papel"
    
    usuario_id = Column(Integer, ForeignKey("usuario.id"), primary_key=True)
    papel_id = Column(Integer, ForeignKey("papel.id"), primary_key=True)
    atribuido_por = Column(Integer, ForeignKey("usuario.id"), nullable=True)
    atribuido_em = Column(DateTime, server_default=func.now(), nullable=False)
    
    # Relationships - especificar foreign_keys explicitamente
    usuario = relationship(
        "Usuario", 
        foreign_keys=[usuario_id], 
        back_populates="papeis"
    )
    papel = relationship("Papel", back_populates="usuarios")


class Rubrica(Base):
    """Modelo de rubrica orçamental."""
    __tablename__ = "rubrica"
    
    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(128), nullable=False, index=True)  # Suporta formato completo (ex: 47/H000/1.1.2.1.01)
    designacao = Column(String(255), nullable=False)  # Ajustado para corresponder ao SQL
    tipo = Column(SQLEnum(TipoRubrica), nullable=False)
    parent_id = Column(Integer, ForeignKey("rubrica.id"), nullable=True)
    nivel = Column(Integer, nullable=False, default=1)
    # dotacao = Column(Numeric(18, 2), nullable=True, default=0)  # REMOVIDO: Coluna não existe no banco
    dotacao_inicial = Column(Numeric(18, 2), nullable=True, default=0)  # DECIMAL(18,2) - dotação inicial para rubricas folha
    dotacao_calculada = Column(Numeric(18, 2), nullable=True)  # DECIMAL(18,2) - calculada automaticamente
    exercicio = Column(SmallInteger, nullable=False, index=True)  # SMALLINT no SQL
    status = Column(SQLEnum(StatusRubrica), default=StatusRubrica.ATIVA, nullable=False)
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    actualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Constraints
    __table_args__ = (
        UniqueConstraint("codigo", "exercicio", name="uq_rubrica_codigo_exercicio"),
        Index("idx_rubrica_parent", "parent_id"),
    )
    
    # Excluir propriedade dotacao que não existe no banco
    __mapper_args__ = {
        'exclude_properties': ['dotacao']
    }
    
    # Relationships
    parent = relationship("Rubrica", remote_side=[id], backref="children")
    despesas = relationship("Despesa", back_populates="rubrica")
    execucoes_mensais = relationship("ExecucaoMensal", back_populates="rubrica")
    reconciliation_issues = relationship("ReconciliationIssue", back_populates="rubrica")


class UserCreationLog(Base):
    """Log de criação automática de usuários."""
    __tablename__ = "user_creation_log"
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuario.id"), nullable=True)
    tipo = Column(String(20), nullable=False)  # "fornecedor" ou "funcionario"
    ref_id = Column(Integer, nullable=False)  # ID do fornecedor ou funcionario
    detalhes = Column(Text, nullable=True)
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    
    # Relationships
    usuario = relationship("Usuario", foreign_keys=[usuario_id])


class ImportBatch(Base):
    """Modelo de lote de importação."""
    __tablename__ = "import_batch"
    
    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String(255), nullable=False)
    tipo = Column(String(50), nullable=False)  # 'csv' ou 'xlsx'
    user_id = Column(Integer, ForeignKey("usuario.id"), nullable=False)
    linhas_processadas = Column(Integer, default=0, nullable=False)
    criadas = Column(Integer, default=0, nullable=False)
    atualizadas = Column(Integer, default=0, nullable=False)
    erros = Column(Integer, default=0, nullable=False)
    detalhes = Column(Text, nullable=True)  # JSON com detalhes de erros
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    
    # Relationships
    user = relationship("Usuario", back_populates="import_batches")
    despesas = relationship("Despesa", back_populates="batch")


class Despesa(Base):
    """Modelo de despesa."""
    __tablename__ = "despesa"
    
    id = Column(Integer, primary_key=True, index=True)
    rubrica_id = Column(Integer, ForeignKey("rubrica.id"), nullable=True, index=True)
    fornecedor_id = Column(Integer, ForeignKey("fornecedor.id"), nullable=True, index=True)
    fornecedor_text = Column(String(500), nullable=True)  # Nome do fornecedor quando não há match
    requisicao = Column(String(128), nullable=True)  # VARCHAR(128) no SQL
    justificativo = Column(String(255), nullable=True)  # VARCHAR(255) no SQL
    ordem_pagamento = Column(String(128), nullable=True, index=True)  # VARCHAR(128) no SQL
    valor = Column(Numeric(18, 2), nullable=False)  # Ajustado para DECIMAL(18,2) do SQL
    data_emissao = Column(Date, nullable=True, index=True)  # DATE no SQL
    exercicio = Column(SmallInteger, nullable=False, index=True)  # SMALLINT no SQL
    mes = Column(Integer, nullable=False, index=True)  # TINYINT no SQL (Integer funciona)
    batch_id = Column(Integer, ForeignKey("import_batch.id"), nullable=True)
    status = Column(SQLEnum(StatusDespesa), default=StatusDespesa.PENDENTE, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)  # created_at no SQL
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)  # updated_at no SQL
    
    # Relationships
    rubrica = relationship("Rubrica", back_populates="despesas")
    fornecedor = relationship("Fornecedor", back_populates="despesas")
    batch = relationship("ImportBatch", back_populates="despesas")


class ExecucaoMensal(Base):
    """Modelo de execução mensal por rubrica."""
    __tablename__ = "execucao_mensal"
    
    id = Column(Integer, primary_key=True, index=True)
    rubrica_id = Column(Integer, ForeignKey("rubrica.id"), nullable=False, index=True)
    mes = Column(Integer, nullable=False)  # 1-12 (TINYINT no SQL)
    ano = Column(SmallInteger, nullable=False, index=True)  # SMALLINT no SQL
    dotacao = Column(Numeric(18, 2), nullable=False, default=0)  # DECIMAL(18,2) no SQL
    gasto = Column(Numeric(18, 2), nullable=False, default=0)  # DECIMAL(18,2) no SQL
    saldo = Column(Numeric(18, 2), nullable=False, default=0)  # DECIMAL(18,2) no SQL
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    actualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Constraints
    __table_args__ = (
        UniqueConstraint("rubrica_id", "mes", "ano", name="uq_execucao_rubrica_mes_ano"),
    )
    
    # Relationships
    rubrica = relationship("Rubrica", back_populates="execucoes_mensais")


class ReconciliationIssue(Base):
    """Modelo de problemas de reconciliação."""
    __tablename__ = "reconciliation_issue"
    
    id = Column(Integer, primary_key=True, index=True)
    rubrica_id = Column(Integer, ForeignKey("rubrica.id"), nullable=False, index=True)
    tipo = Column(SQLEnum(TipoReconciliationIssue), nullable=False)
    descricao = Column(Text, nullable=False)
    valor_diferenca = Column(Numeric(18, 2), nullable=True)  # DECIMAL(18,2) no SQL
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    resolvido = Column(Boolean, default=False, nullable=False, index=True)
    resolvido_em = Column(DateTime, nullable=True)
    resolvido_por = Column(Integer, ForeignKey("usuario.id"), nullable=True)
    
    # Relationships
    rubrica = relationship("Rubrica", back_populates="reconciliation_issues")


class DotacaoGlobal(Base):
    """Modelo de dotação orçamental global anual."""
    __tablename__ = "dotacao_global"
    
    id = Column(Integer, primary_key=True, index=True)
    exercicio = Column(SmallInteger, unique=True, nullable=False, index=True)
    valor_anual = Column(Numeric(18, 2), nullable=False, default=0)
    saldo = Column(Numeric(18, 2), nullable=False, default=0)  # valor_anual - despesas - reservado
    reservado = Column(Numeric(18, 2), nullable=False, default=0)  # Valores reservados mas não confirmados
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)
    actualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    movimentos = relationship("DotacaoGlobalMov", back_populates="dotacao_global", cascade="all, delete-orphan")


class DotacaoGlobalMov(Base):
    """Modelo de movimento da dotação global (auditoria)."""
    __tablename__ = "dotacao_global_mov"
    
    id = Column(Integer, primary_key=True, index=True)
    dotacao_global_id = Column(Integer, ForeignKey("dotacao_global.id", ondelete="CASCADE"), nullable=False, index=True)
    # Usar TypeDecorator para converter corretamente os valores do enum
    tipo = Column(TipoDotacaoGlobalMovType(), nullable=False, index=True)
    referencia = Column(String(255), nullable=True)  # ID da despesa, reserva, etc.
    valor = Column(Numeric(18, 2), nullable=False)
    descricao = Column(Text, nullable=True)
    usuario_id = Column(Integer, ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)
    criado_em = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    
    # Relationships
    dotacao_global = relationship("DotacaoGlobal", back_populates="movimentos")
    usuario = relationship("Usuario")

