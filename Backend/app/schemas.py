"""
Schemas Pydantic para validação e serialização.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
from app.models import (
    TipoFornecedor, TipoRubrica, StatusRubrica, 
    StatusDespesa, TipoReconciliationIssue
)


# ========== Auth Schemas ==========
# Token será definido depois de UsuarioResponse


class LoginRequest(BaseModel):
    """Schema de requisição de login."""
    username: str
    senha: str


# ========== Usuario Schemas ==========
class UsuarioBase(BaseModel):
    """Schema base de usuário."""
    username: str
    nome: str
    nuit: Optional[str] = None
    contacto: Optional[str] = None
    email: Optional[EmailStr] = None
    endereco: Optional[str] = None
    activo: bool = True


class UsuarioCreate(UsuarioBase):
    """Schema para criar usuário."""
    senha: str


class UsuarioUpdate(BaseModel):
    """Schema para atualizar usuário."""
    nome: Optional[str] = None
    nuit: Optional[str] = None
    contacto: Optional[str] = None
    email: Optional[EmailStr] = None
    endereco: Optional[str] = None
    activo: Optional[bool] = None


class UsuarioResponse(UsuarioBase):
    """Schema de resposta de usuário."""
    id: int
    criado_em: datetime
    actualizado_em: datetime
    
    class Config:
        from_attributes = True


# Token definido aqui para poder referenciar UsuarioResponse
class Token(BaseModel):
    """Schema de resposta de token."""
    access_token: str
    token_type: str = "bearer"
    user: Optional[UsuarioResponse] = None  # Adicionado conforme plano Fase-1


# ========== Papel Schemas ==========
class PapelBase(BaseModel):
    """Schema base de papel."""
    nome: str
    descricao: Optional[str] = None


class PapelCreate(PapelBase):
    pass


class PapelResponse(PapelBase):
    """Schema de resposta de papel."""
    id: int
    criado_em: datetime
    actualizado_em: datetime
    
    class Config:
        from_attributes = True


# ========== Fornecedor Schemas ==========
class FornecedorBase(BaseModel):
    """Schema base de fornecedor."""
    tipo: TipoFornecedor
    codigo_interno: Optional[str] = None
    activo: bool = True


class FornecedorCreate(BaseModel):
    """Schema para criar fornecedor (pode criar sem usuario_id)."""
    nome: str
    tipo: TipoFornecedor
    contacto: Optional[str] = None
    nif: Optional[str] = None
    endereco: Optional[str] = None
    codigo_interno: Optional[str] = None
    email: Optional[str] = None  # Email para criação automática de usuário
    usuario_id: Optional[int] = None  # Opcional conforme plano
    criar_usuario: bool = True  # Checkbox "Criar usuário automaticamente"
    activo: bool = True


class FornecedorUpdate(BaseModel):
    """Schema para atualizar fornecedor."""
    nome: Optional[str] = None
    tipo: Optional[TipoFornecedor] = None
    contacto: Optional[str] = None
    nif: Optional[str] = None
    endereco: Optional[str] = None
    codigo_interno: Optional[str] = None
    activo: Optional[bool] = None


class FornecedorResponse(BaseModel):
    """Schema de resposta de fornecedor."""
    id: int
    usuario_id: Optional[int] = None
    tipo: TipoFornecedor
    codigo_interno: Optional[str] = None
    activo: bool
    criado_em: datetime
    actualizado_em: datetime
    # Campos do usuário (se vinculado)
    nome: Optional[str] = None
    contacto: Optional[str] = None
    nif: Optional[str] = None
    endereco: Optional[str] = None
    
    class Config:
        from_attributes = True


# ========== Funcionario Schemas ==========
class FuncionarioBase(BaseModel):
    """Schema base de funcionário."""
    categoria: Optional[str] = None
    departamento: Optional[str] = None
    activo: bool = True


class FuncionarioCreate(BaseModel):
    """Schema para criar funcionário."""
    usuario_id: Optional[int] = None  # Opcional conforme plano
    codigo_funcionario: Optional[str] = None
    nome: Optional[str] = None  # Se não tiver usuario_id
    cargo: Optional[str] = None
    categoria: Optional[str] = None  # Mapeado para categoria no modelo
    departamento: Optional[str] = None
    documento_id: Optional[str] = None
    contacto: Optional[str] = None
    email: Optional[str] = None  # Email para criação automática de usuário
    criar_usuario: bool = True  # Checkbox "Criar usuário automaticamente"
    activo: bool = True


class FuncionarioUpdate(BaseModel):
    """Schema para atualizar funcionário."""
    codigo_funcionario: Optional[str] = None
    cargo: Optional[str] = None
    departamento: Optional[str] = None
    documento_id: Optional[str] = None
    activo: Optional[bool] = None


class FuncionarioResponse(BaseModel):
    """Schema de resposta de funcionário."""
    id: int
    usuario_id: Optional[int] = None
    categoria: Optional[str] = None
    departamento: Optional[str] = None
    activo: bool
    criado_em: datetime
    actualizado_em: datetime
    # Campos do usuário (se vinculado)
    nome: Optional[str] = None
    codigo_funcionario: Optional[str] = None
    cargo: Optional[str] = None
    documento_id: Optional[str] = None
    
    class Config:
        from_attributes = True


# ========== Rubrica Schemas ==========
class RubricaBase(BaseModel):
    """Schema base de rubrica."""
    codigo: str
    designacao: str
    tipo: TipoRubrica
    parent_id: Optional[int] = None
    nivel: int = 1
    dotacao_inicial: Optional[Decimal] = Decimal("0.00")  # Dotação inicial (apenas para rubricas folha)
    exercicio: int
    status: StatusRubrica = StatusRubrica.ATIVA


class RubricaCreate(RubricaBase):
    pass


class RubricaUpdate(BaseModel):
    """Schema para atualizar rubrica."""
    designacao: Optional[str] = None
    dotacao_inicial: Optional[Decimal] = None  # Dotação inicial (apenas para rubricas folha)
    status: Optional[StatusRubrica] = None


class RubricaResponse(RubricaBase):
    """Schema de resposta de rubrica."""
    id: int
    dotacao_calculada: Optional[Decimal] = None
    criado_em: datetime
    actualizado_em: datetime
    
    class Config:
        from_attributes = True


class RubricaTreeResponse(RubricaResponse):
    """Schema de rubrica com filhos e totais."""
    children: List["RubricaTreeResponse"] = []
    gasto_total: Decimal = Decimal("0.00")
    saldo_total: Decimal = Decimal("0.00")


RubricaTreeResponse.model_rebuild()


# ========== Import Schemas ==========
class ImportUploadResponse(BaseModel):
    """Schema de resposta de upload."""
    batch_id: int
    file_name: str
    preview: List[dict]  # Primeiras 10 linhas
    total_rows: int
    sheets: Optional[List[str]] = None  # Lista de folhas do Excel (se aplicável)
    current_sheet: Optional[str] = None  # Folha atual sendo visualizada


class ColumnMapping(BaseModel):
    """Schema de mapeamento de colunas."""
    codigo_rubrica: str
    fornecedor: str
    valor: str
    data: Optional[str] = None
    ordem_pagamento: Optional[str] = None
    justificativo: Optional[str] = None
    requisicao: Optional[str] = None


class ImportExecuteRequest(BaseModel):
    """Schema de requisição de execução de import."""
    batch_id: int
    mapping: ColumnMapping
    dry_run: bool = False  # Se True, não persiste, apenas valida


class ImportBatchResponse(BaseModel):
    """Schema de resposta de batch."""
    id: int
    file_name: str
    tipo: str
    user_id: int
    linhas_processadas: int
    criadas: int
    atualizadas: int
    erros: int
    detalhes: Optional[str] = None
    criado_em: datetime
    
    class Config:
        from_attributes = True


class ImportLineResponse(BaseModel):
    """Schema de linha importada."""
    linha_numero: int
    despesa_id: Optional[int] = None  # ID da despesa (para confirmação)
    codigo_rubrica: str
    fornecedor: str
    valor: Decimal
    data: Optional[datetime] = None
    ordem_pagamento: Optional[str] = None
    status: str
    mensagem_erro: Optional[str] = None
    fornecedor_match_id: Optional[int] = None
    rubrica_match_id: Optional[int] = None
    sugestoes: Optional[dict] = None


# ========== Despesa Schemas ==========
class DespesaBase(BaseModel):
    """Schema base de despesa."""
    rubrica_id: int  # Obrigatório
    fornecedor_id: Optional[int] = None
    fornecedor_text: Optional[str] = None
    requisicao: Optional[str] = None
    justificativo: Optional[str] = None
    ordem_pagamento: Optional[str] = None
    valor: Decimal
    data_emissao: Optional[date] = None  # date em vez de datetime
    exercicio: Optional[int] = None  # Opcional, será derivado da data
    mes: Optional[int] = Field(None, ge=1, le=12)  # Opcional, será derivado da data


class DespesaCreate(DespesaBase):
    pass


class DespesaUpdate(BaseModel):
    """Schema para atualizar despesa."""
    rubrica_id: Optional[int] = None
    fornecedor_id: Optional[int] = None
    fornecedor_text: Optional[str] = None
    requisicao: Optional[str] = None
    justificativo: Optional[str] = None
    ordem_pagamento: Optional[str] = None
    valor: Optional[Decimal] = None
    data_emissao: Optional[date] = None  # date em vez de datetime
    exercicio: Optional[int] = None
    mes: Optional[int] = Field(None, ge=1, le=12)


class DespesaResponse(DespesaBase):
    """Schema de resposta de despesa."""
    id: int
    batch_id: Optional[int] = None
    status: StatusDespesa
    created_at: datetime  # Corresponde ao SQL created_at
    updated_at: datetime  # Corresponde ao SQL updated_at
    # Relações opcionais (incluídas quando disponíveis)
    rubrica: Optional["RubricaResponse"] = None
    fornecedor: Optional["FornecedorResponse"] = None
    
    class Config:
        from_attributes = True


# ========== Execucao Mensal Schemas ==========
class ExecucaoMensalResponse(BaseModel):
    """Schema de resposta de execução mensal."""
    id: int
    rubrica_id: int
    mes: int
    ano: int
    dotacao: Decimal
    gasto: Decimal
    saldo: Decimal
    criado_em: datetime
    actualizado_em: datetime
    
    class Config:
        from_attributes = True


# ========== Balancete Schema ==========
class BalanceteItem(BaseModel):
    """Item do balancete."""
    codigo: str
    designacao: str
    dotacao: Decimal
    gasto: Decimal
    saldo: Decimal


class BalanceteResponse(BaseModel):
    """Schema de resposta do balancete."""
    mes: int
    ano: int
    items: List[BalanceteItem]
    total_dotacao: Decimal
    total_gasto: Decimal
    total_saldo: Decimal

