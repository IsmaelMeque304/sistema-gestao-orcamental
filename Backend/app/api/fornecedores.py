"""
API CRUD de Fornecedores.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.api.auth import get_current_user
from app.models import Usuario, Fornecedor
from app.schemas import FornecedorCreate, FornecedorUpdate, FornecedorResponse
from app.crud import (
    create_fornecedor, update_fornecedor, get_fornecedor, list_fornecedores, delete_fornecedor
)

router = APIRouter()


@router.get("", response_model=List[FornecedorResponse])
async def list_fornecedores_endpoint(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista fornecedores."""
    from app.models import TipoFornecedor
    
    fornecedores = list_fornecedores(db, skip=skip, limit=limit)
    # Enriquecer com dados do usuário
    result = []
    for forn in fornecedores:
        # Converter tipo string para enum
        try:
            tipo_enum = TipoFornecedor(forn.tipo.lower()) if forn.tipo else TipoFornecedor.PESSOA_SINGULAR
        except (ValueError, KeyError):
            tipo_enum = TipoFornecedor.PESSOA_SINGULAR
        
        forn_dict = {
            "id": forn.id,
            "usuario_id": forn.usuario_id,
            "tipo": tipo_enum,
            "codigo_interno": forn.codigo_interno,
            "activo": forn.activo,
            "criado_em": forn.criado_em,
            "actualizado_em": forn.actualizado_em,
        }
        if forn.usuario:
            forn_dict["nome"] = forn.usuario.nome
            forn_dict["contacto"] = forn.usuario.contacto
            forn_dict["endereco"] = forn.usuario.endereco
            forn_dict["nif"] = forn.usuario.nuit  # NIF vem do campo nuit do usuário
        result.append(FornecedorResponse(**forn_dict))
    return result


@router.get("/{fornecedor_id}", response_model=FornecedorResponse)
async def get_fornecedor_endpoint(
    fornecedor_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Busca fornecedor por ID."""
    from app.models import TipoFornecedor
    
    fornecedor = get_fornecedor(db, fornecedor_id)
    if not fornecedor:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    
    # Converter tipo string para enum
    try:
        tipo_enum = TipoFornecedor(fornecedor.tipo.lower()) if fornecedor.tipo else TipoFornecedor.PESSOA_SINGULAR
    except (ValueError, KeyError):
        tipo_enum = TipoFornecedor.PESSOA_SINGULAR
    
    forn_dict = {
        "id": fornecedor.id,
        "usuario_id": fornecedor.usuario_id,
        "tipo": tipo_enum,
        "codigo_interno": fornecedor.codigo_interno,
        "activo": fornecedor.activo,
        "criado_em": fornecedor.criado_em,
        "actualizado_em": fornecedor.actualizado_em,
    }
    if fornecedor.usuario:
        forn_dict["nome"] = fornecedor.usuario.nome
        forn_dict["contacto"] = fornecedor.usuario.contacto
        forn_dict["endereco"] = fornecedor.usuario.endereco
        forn_dict["nif"] = fornecedor.usuario.nuit
    
    return FornecedorResponse(**forn_dict)


@router.post("", response_model=FornecedorResponse)
async def create_fornecedor_endpoint(
    fornecedor_data: FornecedorCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cria novo fornecedor."""
    from app.models import TipoFornecedor
    
    try:
        fornecedor, info_usuario = create_fornecedor(db, fornecedor_data)
        
        # Converter tipo string para enum
        try:
            tipo_enum = TipoFornecedor(fornecedor.tipo.lower()) if fornecedor.tipo else TipoFornecedor.PESSOA_SINGULAR
        except (ValueError, KeyError):
            tipo_enum = TipoFornecedor.PESSOA_SINGULAR
        
        forn_dict = {
            "id": fornecedor.id,
            "usuario_id": fornecedor.usuario_id,
            "tipo": tipo_enum,
            "codigo_interno": fornecedor.codigo_interno,
            "activo": fornecedor.activo,
            "criado_em": fornecedor.criado_em,
            "actualizado_em": fornecedor.actualizado_em,
        }
        if fornecedor.usuario:
            forn_dict["nome"] = fornecedor.usuario.nome
            forn_dict["contacto"] = fornecedor.usuario.contacto
            forn_dict["endereco"] = fornecedor.usuario.endereco
            forn_dict["nif"] = fornecedor.usuario.nuit  # NIF vem do campo nuit do usuário
        
        # Adicionar informações de criação de usuário na resposta
        response_data = FornecedorResponse(**forn_dict).model_dump()
        response_data["username"] = info_usuario.get("username")
        response_data["senha_temporaria"] = info_usuario.get("senha_temporaria")
        response_data["vinculado"] = info_usuario.get("vinculado", False)
        response_data["usuario_existente"] = info_usuario.get("usuario_vinculado", False)
        response_data["mensagem_usuario"] = info_usuario.get("mensagem")
        
        # Se usuário foi vinculado, adicionar informações do usuário existente
        if info_usuario.get("vinculado") and fornecedor.usuario:
            response_data["usuario_info"] = {
                "id": fornecedor.usuario.id,
                "username": fornecedor.usuario.username,
                "nome": fornecedor.usuario.nome,
                "email": fornecedor.usuario.email,
                "contacto": fornecedor.usuario.contacto,
                "nuit": fornecedor.usuario.nuit
            }
        
        return response_data
    except ValueError as e:
        # Erros de validação do serviço de usuário
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        error_msg = str(e)
        # Verificar se é erro de integridade (usuário já vinculado a outro fornecedor)
        if "Duplicate entry" in error_msg and "ux_fornecedor_usuario" in error_msg:
            raise HTTPException(
                status_code=400, 
                detail="Este usuário já está vinculado a outro fornecedor. Não é possível vincular o mesmo usuário a múltiplos fornecedores."
            )
        # Verificar se é erro de duplicação de email
        if "Duplicate entry" in error_msg and "email" in error_msg:
            raise HTTPException(
                status_code=400,
                detail="Este email já está em uso por outro usuário. Por favor, use um email diferente ou verifique se o usuário já existe."
            )
        raise HTTPException(status_code=400, detail=f"Erro ao criar fornecedor: {error_msg}")


@router.put("/{fornecedor_id}", response_model=FornecedorResponse)
async def update_fornecedor_endpoint(
    fornecedor_id: int,
    fornecedor_data: FornecedorUpdate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Atualiza fornecedor."""
    from app.models import TipoFornecedor
    
    fornecedor = update_fornecedor(db, fornecedor_id, fornecedor_data)
    if not fornecedor:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    
    # Converter tipo string para enum
    try:
        tipo_enum = TipoFornecedor(fornecedor.tipo.lower()) if fornecedor.tipo else TipoFornecedor.PESSOA_SINGULAR
    except (ValueError, KeyError):
        tipo_enum = TipoFornecedor.PESSOA_SINGULAR
    
    forn_dict = {
        "id": fornecedor.id,
        "usuario_id": fornecedor.usuario_id,
        "tipo": tipo_enum,
        "codigo_interno": fornecedor.codigo_interno,
        "activo": fornecedor.activo,
        "criado_em": fornecedor.criado_em,
        "actualizado_em": fornecedor.actualizado_em,
    }
    if fornecedor.usuario:
        forn_dict["nome"] = fornecedor.usuario.nome
        forn_dict["contacto"] = fornecedor.usuario.contacto
        forn_dict["endereco"] = fornecedor.usuario.endereco
        forn_dict["nif"] = fornecedor.usuario.nuit  # NIF vem do campo nuit do usuário
    
    return FornecedorResponse(**forn_dict)


@router.delete("/{fornecedor_id}")
async def delete_fornecedor_endpoint(
    fornecedor_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove fornecedor permanentemente e também remove o usuário associado.
    """
    from app.crud import delete_fornecedor
    
    try:
        success = delete_fornecedor(db, fornecedor_id)
        if not success:
            raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
        
        return {"message": "Fornecedor removido permanentemente com sucesso"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{fornecedor_id}/ativar")
async def ativar_fornecedor_endpoint(
    fornecedor_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reativa fornecedor."""
    fornecedor = get_fornecedor(db, fornecedor_id)
    if not fornecedor:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    
    fornecedor.activo = True
    db.commit()
    
    return {"message": "Fornecedor reativado com sucesso"}

