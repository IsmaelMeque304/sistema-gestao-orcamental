"""
API CRUD de Usuários (admin only).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db import get_db
from app.api.auth import get_current_user, require_admin
from app.models import Usuario
from app.schemas import UsuarioCreate, UsuarioUpdate, UsuarioResponse
from app.crud import (
    create_usuario, update_usuario, get_usuario, list_usuarios,
    get_usuario_by_username
)

router = APIRouter()


@router.get("", response_model=List[UsuarioResponse])
async def list_usuarios_endpoint(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Lista usuários (admin only)."""
    usuarios = list_usuarios(db, skip=skip, limit=limit)
    return usuarios


@router.get("/{usuario_id}", response_model=UsuarioResponse)
async def get_usuario_endpoint(
    usuario_id: int,
    current_user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Busca usuário por ID (admin only)."""
    usuario = get_usuario(db, usuario_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return usuario


@router.post("", response_model=UsuarioResponse)
async def create_usuario_endpoint(
    usuario_data: UsuarioCreate,
    current_user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Cria novo usuário (admin only)."""
    # Validações
    if len(usuario_data.senha) < 8:
        raise HTTPException(
            status_code=400,
            detail="Senha deve ter no mínimo 8 caracteres"
        )
    
    # Verifica se username já existe
    existing = get_usuario_by_username(db, usuario_data.username)
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Username já existe"
        )
    
    usuario = create_usuario(db, usuario_data)
    return usuario


@router.put("/{usuario_id}", response_model=UsuarioResponse)
async def update_usuario_endpoint(
    usuario_id: int,
    usuario_data: UsuarioUpdate,
    current_user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Atualiza usuário (admin only)."""
    usuario = update_usuario(db, usuario_id, usuario_data)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return usuario


@router.delete("/{usuario_id}")
async def delete_usuario_endpoint(
    usuario_id: int,
    current_user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Desativa usuário (soft delete - admin only)."""
    usuario = get_usuario(db, usuario_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Soft delete - apenas desativa
    usuario.activo = False
    db.commit()
    
    return {"message": "Usuário desativado com sucesso"}

