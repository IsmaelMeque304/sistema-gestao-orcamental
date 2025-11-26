"""
API CRUD de Funcionários.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.api.auth import get_current_user
from app.models import Usuario, Funcionario
from app.schemas import FuncionarioCreate, FuncionarioUpdate, FuncionarioResponse
from app.crud import (
    create_funcionario, update_funcionario, get_funcionario, list_funcionarios, delete_funcionario
)

router = APIRouter()


@router.get("", response_model=List[FuncionarioResponse])
async def list_funcionarios_endpoint(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista funcionários."""
    funcionarios = list_funcionarios(db, skip=skip, limit=limit)
    # Enriquecer com dados do usuário
    result = []
    for func in funcionarios:
        func_dict = {
            "id": func.id,
            "usuario_id": func.usuario_id,
            "categoria": func.categoria,
            "departamento": func.departamento,
            "activo": func.activo,
            "criado_em": func.criado_em,
            "actualizado_em": func.actualizado_em,
        }
        if func.usuario:
            func_dict["nome"] = func.usuario.nome
        result.append(FuncionarioResponse(**func_dict))
    return result


@router.get("/{funcionario_id}", response_model=FuncionarioResponse)
async def get_funcionario_endpoint(
    funcionario_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Busca funcionário por ID."""
    funcionario = get_funcionario(db, funcionario_id)
    if not funcionario:
        raise HTTPException(status_code=404, detail="Funcionário não encontrado")
    
    func_dict = {
        "id": funcionario.id,
        "usuario_id": funcionario.usuario_id,
        "categoria": funcionario.categoria,
        "departamento": funcionario.departamento,
        "activo": funcionario.activo,
        "criado_em": funcionario.criado_em,
        "actualizado_em": funcionario.actualizado_em,
    }
    if funcionario.usuario:
        func_dict["nome"] = funcionario.usuario.nome
    
    return FuncionarioResponse(**func_dict)


@router.post("", response_model=FuncionarioResponse)
async def create_funcionario_endpoint(
    funcionario_data: FuncionarioCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cria novo funcionário."""
    try:
        funcionario, info_usuario = create_funcionario(db, funcionario_data)
        func_dict = {
            "id": funcionario.id,
            "usuario_id": funcionario.usuario_id,
            "categoria": funcionario.categoria,
            "departamento": funcionario.departamento,
            "activo": funcionario.activo,
            "criado_em": funcionario.criado_em,
            "actualizado_em": funcionario.actualizado_em,
        }
        if funcionario.usuario:
            func_dict["nome"] = funcionario.usuario.nome
        
        # Adicionar informações de criação de usuário na resposta
        response_data = FuncionarioResponse(**func_dict).model_dump()
        response_data["username"] = info_usuario.get("username")
        response_data["senha_temporaria"] = info_usuario.get("senha_temporaria")
        response_data["vinculado"] = info_usuario.get("vinculado", False)
        response_data["usuario_existente"] = info_usuario.get("usuario_vinculado", False)
        response_data["mensagem_usuario"] = info_usuario.get("mensagem")
        
        # Se usuário foi vinculado, adicionar informações do usuário existente
        if info_usuario.get("vinculado") and funcionario.usuario:
            response_data["usuario_info"] = {
                "id": funcionario.usuario.id,
                "username": funcionario.usuario.username,
                "nome": funcionario.usuario.nome,
                "email": funcionario.usuario.email,
                "contacto": funcionario.usuario.contacto
            }
        
        return response_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao criar funcionário: {str(e)}")


@router.put("/{funcionario_id}", response_model=FuncionarioResponse)
async def update_funcionario_endpoint(
    funcionario_id: int,
    funcionario_data: FuncionarioUpdate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Atualiza funcionário."""
    funcionario = update_funcionario(db, funcionario_id, funcionario_data)
    if not funcionario:
        raise HTTPException(status_code=404, detail="Funcionário não encontrado")
    
    func_dict = {
        "id": funcionario.id,
        "usuario_id": funcionario.usuario_id,
        "categoria": funcionario.categoria,
        "departamento": funcionario.departamento,
        "activo": funcionario.activo,
        "criado_em": funcionario.criado_em,
        "actualizado_em": funcionario.actualizado_em,
    }
    if funcionario.usuario:
        func_dict["nome"] = funcionario.usuario.nome
    
    return FuncionarioResponse(**func_dict)


@router.delete("/{funcionario_id}")
async def delete_funcionario_endpoint(
    funcionario_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove funcionário permanentemente e também remove o usuário associado.
    """
    from app.crud import delete_funcionario
    
    try:
        success = delete_funcionario(db, funcionario_id)
        if not success:
            raise HTTPException(status_code=404, detail="Funcionário não encontrado")
        
        return {"message": "Funcionário removido permanentemente com sucesso"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{funcionario_id}/ativar")
async def ativar_funcionario_endpoint(
    funcionario_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reativa funcionário."""
    funcionario = get_funcionario(db, funcionario_id)
    if not funcionario:
        raise HTTPException(status_code=404, detail="Funcionário não encontrado")
    
    funcionario.activo = True
    db.commit()
    
    return {"message": "Funcionário reativado com sucesso"}

