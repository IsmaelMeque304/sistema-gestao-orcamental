"""
API CRUD completa de Despesas.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import datetime
from app.db import get_db
from app.api.auth import get_current_user, require_admin
from app.models import Usuario, Despesa, StatusDespesa
from app.schemas import DespesaResponse, DespesaCreate, DespesaUpdate
from app.crud import (
    get_despesa, create_despesa, update_despesa, delete_despesa,
    confirm_despesa, list_despesas, get_usuario_papeis
)

router = APIRouter()


@router.get("", response_model=List[DespesaResponse])
async def list_despesas_endpoint(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: Optional[str] = Query(None, description="Filtrar por status"),
    rubrica_id: Optional[int] = Query(None, description="Filtrar por rubrica"),
    fornecedor_id: Optional[int] = Query(None, description="Filtrar por fornecedor"),
    mes: Optional[int] = Query(None, ge=1, le=12, description="Filtrar por mês"),
    exercicio: Optional[int] = Query(None, description="Filtrar por exercício"),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista despesas com filtros."""
    from app.models import TipoFornecedor
    from app.schemas import FornecedorResponse
    
    # Converte status string para enum
    status_enum = None
    if status:
        try:
            status_enum = StatusDespesa(status.lower())
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Status inválido: {status}. Use: pendente, confirmada, cancelada"
            )
    
    despesas = list_despesas(
        db,
        skip=skip,
        limit=limit,
        status=status_enum,
        rubrica_id=rubrica_id,
        fornecedor_id=fornecedor_id,
        mes=mes,
        exercicio=exercicio
    )
    
    # Enriquecer despesas com fornecedor.nome do usuario
    result = []
    for despesa in despesas:
        # Criar dict manualmente para evitar acesso a rubrica.dotacao
        despesa_dict = {
            "id": despesa.id,
            "rubrica_id": despesa.rubrica_id,
            "fornecedor_id": despesa.fornecedor_id,
            "fornecedor_text": despesa.fornecedor_text,
            "requisicao": despesa.requisicao,
            "justificativo": despesa.justificativo,
            "ordem_pagamento": despesa.ordem_pagamento,
            "valor": despesa.valor,
            "data_emissao": despesa.data_emissao,
            "exercicio": despesa.exercicio,
            "mes": despesa.mes,
            "batch_id": despesa.batch_id,
            "status": despesa.status,
            "created_at": despesa.created_at,
            "updated_at": despesa.updated_at,
            "rubrica": None,
            "fornecedor": None
        }
        
        # Adicionar rubrica sem dotacao
        if despesa.rubrica:
            despesa_dict["rubrica"] = {
                "id": despesa.rubrica.id,
                "codigo": despesa.rubrica.codigo,
                "designacao": despesa.rubrica.designacao,
                "tipo": despesa.rubrica.tipo,
                "parent_id": despesa.rubrica.parent_id,
                "nivel": despesa.rubrica.nivel,
                "dotacao_calculada": despesa.rubrica.dotacao_calculada,
                "exercicio": despesa.rubrica.exercicio,
                "status": despesa.rubrica.status,
                "criado_em": despesa.rubrica.criado_em,
                "actualizado_em": despesa.rubrica.actualizado_em
            }
        
        # Enriquecer fornecedor com nome do usuario se existir
        if despesa.fornecedor:
            try:
                tipo_enum = TipoFornecedor(despesa.fornecedor.tipo.lower()) if despesa.fornecedor.tipo else TipoFornecedor.PESSOA_SINGULAR
            except (ValueError, KeyError):
                tipo_enum = TipoFornecedor.PESSOA_SINGULAR
            
            forn_dict = {
                "id": despesa.fornecedor.id,
                "usuario_id": despesa.fornecedor.usuario_id,
                "tipo": tipo_enum,
                "codigo_interno": despesa.fornecedor.codigo_interno,
                "activo": despesa.fornecedor.activo,
                "criado_em": despesa.fornecedor.criado_em,
                "actualizado_em": despesa.fornecedor.actualizado_em,
            }
            
            # Adicionar dados do usuario se existir
            if despesa.fornecedor.usuario:
                forn_dict["nome"] = despesa.fornecedor.usuario.nome
                forn_dict["contacto"] = despesa.fornecedor.usuario.contacto
                forn_dict["endereco"] = despesa.fornecedor.usuario.endereco
                forn_dict["nif"] = despesa.fornecedor.usuario.nuit
            
            despesa_dict["fornecedor"] = FornecedorResponse(**forn_dict).model_dump()
        
        result.append(DespesaResponse(**despesa_dict))
    
    return result


@router.get("/{despesa_id}", response_model=DespesaResponse)
async def get_despesa_endpoint(
    despesa_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Busca despesa por ID."""
    from app.models import TipoFornecedor
    from app.schemas import FornecedorResponse
    
    despesa = get_despesa(db, despesa_id)
    if not despesa:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    
    # Criar dict manualmente para evitar acesso a rubrica.dotacao
    despesa_dict = {
        "id": despesa.id,
        "rubrica_id": despesa.rubrica_id,
        "fornecedor_id": despesa.fornecedor_id,
        "fornecedor_text": despesa.fornecedor_text,
        "requisicao": despesa.requisicao,
        "justificativo": despesa.justificativo,
        "ordem_pagamento": despesa.ordem_pagamento,
        "valor": despesa.valor,
        "data_emissao": despesa.data_emissao,
        "exercicio": despesa.exercicio,
        "mes": despesa.mes,
        "batch_id": despesa.batch_id,
        "status": despesa.status,
        "created_at": despesa.created_at,
        "updated_at": despesa.updated_at,
        "rubrica": None,
        "fornecedor": None
    }
    
    # Adicionar rubrica sem dotacao
    if despesa.rubrica:
        despesa_dict["rubrica"] = {
            "id": despesa.rubrica.id,
            "codigo": despesa.rubrica.codigo,
            "designacao": despesa.rubrica.designacao,
            "tipo": despesa.rubrica.tipo,
            "parent_id": despesa.rubrica.parent_id,
            "nivel": despesa.rubrica.nivel,
            "dotacao_calculada": despesa.rubrica.dotacao_calculada,
            "exercicio": despesa.rubrica.exercicio,
            "status": despesa.rubrica.status,
            "criado_em": despesa.rubrica.criado_em,
            "actualizado_em": despesa.rubrica.actualizado_em
        }
    
    # Enriquecer fornecedor com nome do usuario se existir
    if despesa.fornecedor:
        try:
            tipo_enum = TipoFornecedor(despesa.fornecedor.tipo.lower()) if despesa.fornecedor.tipo else TipoFornecedor.PESSOA_SINGULAR
        except (ValueError, KeyError):
            tipo_enum = TipoFornecedor.PESSOA_SINGULAR
        
        forn_dict = {
            "id": despesa.fornecedor.id,
            "usuario_id": despesa.fornecedor.usuario_id,
            "tipo": tipo_enum,
            "codigo_interno": despesa.fornecedor.codigo_interno,
            "activo": despesa.fornecedor.activo,
            "criado_em": despesa.fornecedor.criado_em,
            "actualizado_em": despesa.fornecedor.actualizado_em,
        }
        
        # Adicionar dados do usuario se existir
        if despesa.fornecedor.usuario:
            forn_dict["nome"] = despesa.fornecedor.usuario.nome
            forn_dict["contacto"] = despesa.fornecedor.usuario.contacto
            forn_dict["endereco"] = despesa.fornecedor.usuario.endereco
            forn_dict["nif"] = despesa.fornecedor.usuario.nuit
        
        despesa_dict["fornecedor"] = FornecedorResponse(**forn_dict).model_dump()
    
    return DespesaResponse(**despesa_dict)


@router.post("", response_model=DespesaResponse)
async def create_despesa_endpoint(
    despesa_data: DespesaCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cria nova despesa."""
    try:
        # Validações adicionais (também validadas no CRUD, mas aqui para resposta mais rápida)
        if despesa_data.valor <= 0:
            raise HTTPException(
                status_code=400,
                detail="Valor da despesa deve ser maior que zero"
            )
        
        # Valida data_emissao dentro do exercício se fornecido
        if despesa_data.data_emissao and despesa_data.exercicio:
            if despesa_data.data_emissao.year != despesa_data.exercicio:
                raise HTTPException(
                    status_code=400,
                    detail=f"Data de emissão ({despesa_data.data_emissao.year}) deve estar dentro do exercício ({despesa_data.exercicio})"
                )
        
        despesa = create_despesa(db, despesa_data)
        
        # Notificar evento SSE
        exercicio = despesa.exercicio
        from app.api.dashboard_events import notify_event_sync
        notify_event_sync(exercicio, "despesa_criada", {
            "despesa_id": despesa.id,
            "valor": float(despesa.valor),
            "rubrica_id": despesa.rubrica_id
        })
        
        return despesa
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao criar despesa: {str(e)}")


@router.put("/{despesa_id}", response_model=DespesaResponse)
async def update_despesa_endpoint(
    despesa_id: int,
    despesa_data: DespesaUpdate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Atualiza despesa. Bloqueia se confirmada (exceto admin)."""
    # Verifica se é admin
    papeis = get_usuario_papeis(db, current_user.id)
    is_admin = "admin" in papeis
    
    try:
        despesa = update_despesa(db, despesa_id, despesa_data, is_admin=is_admin)
        if not despesa:
            raise HTTPException(status_code=404, detail="Despesa não encontrada")
        
        # Notificar evento SSE
        exercicio = despesa.exercicio
        from app.api.dashboard_events import notify_event_sync
        notify_event_sync(exercicio, "despesa_atualizada", {
            "despesa_id": despesa.id,
            "valor": float(despesa.valor),
            "rubrica_id": despesa.rubrica_id
        })
        
        return despesa
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao atualizar despesa: {str(e)}")


@router.delete("/{despesa_id}")
async def delete_despesa_endpoint(
    despesa_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove despesa. Apenas permite se status = pendente."""
    try:
        # Buscar despesa antes de remover para obter dados para notificação
        despesa = get_despesa(db, despesa_id)
        if not despesa:
            raise HTTPException(status_code=404, detail="Despesa não encontrada")
        
        # Guardar dados para notificação
        exercicio = despesa.exercicio
        valor = float(despesa.valor)
        rubrica_id = despesa.rubrica_id
        
        # Remover despesa
        deleted = delete_despesa(db, despesa_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Despesa não encontrada")
        
        # Notificar evento SSE
        from app.api.dashboard_events import notify_event_sync
        notify_event_sync(exercicio, "despesa_removida", {
            "despesa_id": despesa_id,
            "valor": valor,
            "rubrica_id": rubrica_id
        })
        
        return {"message": "Despesa removida com sucesso"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{despesa_id}/confirmar", response_model=DespesaResponse)
async def confirm_despesa_endpoint(
    despesa_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Confirma despesa e atualiza execução mensal.
    
    Processo:
    1. Valida que despesa não está confirmada
    2. Atualiza status para CONFIRMADA
    3. Atualiza execução mensal da rubrica
    4. Atualiza execução mensal de todas as rubricas ancestrais recursivamente
    """
    try:
        despesa = confirm_despesa(db, despesa_id)
        if not despesa:
            raise HTTPException(status_code=404, detail="Despesa não encontrada")
        
        # Notificar evento SSE
        exercicio = despesa.exercicio
        from app.api.dashboard_events import notify_event_sync
        notify_event_sync(exercicio, "despesa_confirmada", {
            "despesa_id": despesa.id,
            "valor": float(despesa.valor),
            "rubrica_id": despesa.rubrica_id
        })
        
        return despesa
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/pendentes/count")
async def count_pendentes(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retorna contagem de despesas pendentes."""
    count = db.query(func.count(Despesa.id)).filter(
        Despesa.status == StatusDespesa.PENDENTE
    ).scalar() or 0
    
    return {"count": count}


@router.get("/ultima-confirmada", response_model=DespesaResponse)
async def get_ultima_confirmada(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retorna a última despesa confirmada."""
    despesa = db.query(Despesa).filter(
        Despesa.status == StatusDespesa.CONFIRMADA
    ).order_by(desc(Despesa.updated_at)).first()
    
    if not despesa:
        raise HTTPException(status_code=404, detail="Nenhuma despesa confirmada encontrada")
    
    return despesa
