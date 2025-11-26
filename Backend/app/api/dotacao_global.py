"""
API de Dotação Orçamental Global.
Gerencia a dotação global anual e seus movimentos.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from decimal import Decimal
from typing import Optional, List
from datetime import datetime
from app.db import get_db
from app.api.auth import get_current_user
from app.models import Usuario, DotacaoGlobal, DotacaoGlobalMov, TipoDotacaoGlobalMov
from pydantic import BaseModel

router = APIRouter()


# ============================================================================
# Schemas Pydantic para Dotação Global
# ============================================================================

class DotacaoGlobalBase(BaseModel):
    """Schema base de dotação global."""
    exercicio: int
    valor_anual: Decimal


class DotacaoGlobalCreate(DotacaoGlobalBase):
    """Schema para criar/atualizar dotação global."""
    pass


class DotacaoGlobalResponse(DotacaoGlobalBase):
    """Schema de resposta de dotação global."""
    id: int
    saldo: Decimal
    reservado: Decimal
    gasto_total: Optional[Decimal] = Decimal("0.00")  # Gasto total acumulado
    criado_em: datetime
    actualizado_em: datetime
    
    class Config:
        from_attributes = True


class DotacaoGlobalMovResponse(BaseModel):
    """Schema de resposta de movimento."""
    id: int
    tipo: str
    referencia: Optional[str]
    valor: Decimal
    descricao: Optional[str]
    usuario_id: Optional[int]
    criado_em: datetime
    
    class Config:
        from_attributes = True


class ReservaRequest(BaseModel):
    """Schema para criar reserva."""
    exercicio: int
    valor: Decimal
    descricao: Optional[str] = None
    referencia: Optional[str] = None


class ReservaCancelRequest(BaseModel):
    """Schema para cancelar reserva."""
    exercicio: int
    reserva_id: Optional[int] = None  # ID do movimento de reserva
    valor: Decimal
    descricao: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.get("", response_model=DotacaoGlobalResponse)
async def get_dotacao_global(
    exercicio: int = Query(..., description="Ano do exercício"),
    db: Session = Depends(get_db)
):
    """
    Busca a dotação global de um exercício.
    Retorna valor anual, saldo e reservado.
    Calcula o gasto total somando todas as despesas confirmadas do exercício.
    O saldo é calculado dinamicamente: valor_anual - gasto_total - reservado
    """
    from app.models import Despesa, StatusDespesa
    from sqlalchemy import func
    
    dotacao = db.query(DotacaoGlobal).filter(
        DotacaoGlobal.exercicio == exercicio
    ).first()
    
    # Calcular gasto total de despesas confirmadas do exercício
    gasto_total = db.query(func.sum(Despesa.valor)).filter(
        Despesa.exercicio == exercicio,
        Despesa.status == StatusDespesa.CONFIRMADA
    ).scalar() or Decimal("0.00")
    
    if not dotacao:
        # Retorna valores zerados se não existir, mas com gasto calculado
        now = datetime.now()
        return DotacaoGlobalResponse(
            id=0,
            exercicio=exercicio,
            valor_anual=Decimal("0.00"),
            saldo=Decimal("0.00") - gasto_total,  # Saldo negativo se houver gastos sem dotação
            reservado=Decimal("0.00"),
            gasto_total=gasto_total,  # Incluir gasto_total na resposta
            criado_em=now,
            actualizado_em=now
        )
    
    # Calcular saldo dinamicamente baseado no gasto real
    # Saldo = valor_anual - gasto_total - reservado
    # Não atualizamos o campo no banco, apenas retornamos o valor calculado
    saldo_calculado = dotacao.valor_anual - gasto_total - dotacao.reservado
    
    # Criar resposta com saldo calculado e gasto_total
    response = DotacaoGlobalResponse(
        id=dotacao.id,
        exercicio=dotacao.exercicio,
        valor_anual=dotacao.valor_anual,
        saldo=saldo_calculado,
        reservado=dotacao.reservado,
        gasto_total=gasto_total,  # Incluir gasto_total na resposta
        criado_em=dotacao.criado_em,
        actualizado_em=dotacao.actualizado_em
    )
    
    return response


@router.post("", response_model=DotacaoGlobalResponse)
async def create_or_update_dotacao_global(
    data: DotacaoGlobalCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Cria ou atualiza a dotação global de um exercício.
    
    Se já existir:
    - Calcula diferença (delta) entre novo e antigo valor
    - Ajusta saldo = saldo + delta
    - Registra movimento tipo 'ajuste'
    
    Se não existir:
    - Cria nova dotação
    - Saldo inicial = valor_anual
    """
    # Busca dotação existente
    dotacao = db.query(DotacaoGlobal).filter(
        DotacaoGlobal.exercicio == data.exercicio
    ).first()
    
    if dotacao:
        # Atualizar existente
        valor_antigo = dotacao.valor_anual
        delta = data.valor_anual - valor_antigo
        
        dotacao.valor_anual = data.valor_anual
        dotacao.saldo = dotacao.saldo + delta  # Ajusta saldo
        
        # Registra movimento de ajuste
        if delta != 0:
            movimento = DotacaoGlobalMov(
                dotacao_global_id=dotacao.id,
                tipo=TipoDotacaoGlobalMov.AJUSTE,
                valor=delta,
                descricao=f"Ajuste de dotação: {valor_antigo} → {data.valor_anual}",
                usuario_id=current_user.id
            )
            db.add(movimento)
    else:
        # Criar nova
        dotacao = DotacaoGlobal(
            exercicio=data.exercicio,
            valor_anual=data.valor_anual,
            saldo=data.valor_anual,  # Saldo inicial = valor anual
            reservado=Decimal("0.00")
        )
        db.add(dotacao)
        db.flush()  # Para obter o ID
        
        # Registra movimento inicial
        movimento = DotacaoGlobalMov(
            dotacao_global_id=dotacao.id,
            tipo=TipoDotacaoGlobalMov.AJUSTE,
            valor=data.valor_anual,
            descricao=f"Criação de dotação global para exercício {data.exercicio}",
            usuario_id=current_user.id
        )
        db.add(movimento)
    
    db.commit()
    db.refresh(dotacao)
    
    # Notificar evento SSE
    from app.api.dashboard_events import notify_event_sync
    notify_event_sync(data.exercicio, "dotacao_atualizada", {
        "dotacao_id": dotacao.id,
        "valor_anual": float(dotacao.valor_anual),
        "saldo": float(dotacao.saldo),
        "reservado": float(dotacao.reservado)
    })
    
    return dotacao


@router.get("/movimentos", response_model=List[DotacaoGlobalMovResponse])
async def list_movimentos(
    exercicio: int = Query(..., description="Ano do exercício"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    tipo: Optional[str] = Query(None, description="Filtrar por tipo de movimento"),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Lista movimentos da dotação global de um exercício.
    Ordenado por data (mais recente primeiro).
    """
    # Busca dotação
    dotacao = db.query(DotacaoGlobal).filter(
        DotacaoGlobal.exercicio == exercicio
    ).first()
    
    if not dotacao:
        return []
    
    # Busca movimentos
    query = db.query(DotacaoGlobalMov).filter(
        DotacaoGlobalMov.dotacao_global_id == dotacao.id
    )
    
    # Filtrar por tipo se especificado
    if tipo:
        try:
            tipo_enum = TipoDotacaoGlobalMov(tipo)
            query = query.filter(DotacaoGlobalMov.tipo == tipo_enum)
        except ValueError:
            # Tipo inválido, retornar vazio ou todos
            pass
    
    movimentos = query.order_by(
        DotacaoGlobalMov.criado_em.desc()
    ).offset(skip).limit(limit).all()
    
    # Converter enum para string explicitamente
    result = []
    for mov in movimentos:
        result.append(DotacaoGlobalMovResponse(
            id=mov.id,
            tipo=mov.tipo.value if hasattr(mov.tipo, 'value') else str(mov.tipo),
            referencia=mov.referencia,
            valor=mov.valor,
            descricao=mov.descricao,
            usuario_id=mov.usuario_id,
            criado_em=mov.criado_em
        ))
    
    return result


@router.post("/reserva")
async def criar_reserva(
    data: ReservaRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Reserva um valor da dotação global.
    Incrementa o campo 'reservado' e reduz o 'saldo' disponível.
    """
    # Busca dotação com lock (SELECT FOR UPDATE)
    dotacao = db.query(DotacaoGlobal).filter(
        DotacaoGlobal.exercicio == data.exercicio
    ).with_for_update().first()
    
    if not dotacao:
        raise HTTPException(
            status_code=404,
            detail=f"Dotacao global para exercício {data.exercicio} não encontrada"
        )
    
    # Valida saldo disponível (saldo - reservado)
    saldo_disponivel = dotacao.saldo - dotacao.reservado
    
    if data.valor > saldo_disponivel:
        raise HTTPException(
            status_code=400,
            detail=f"Saldo insuficiente. Disponível: {saldo_disponivel}, Solicitado: {data.valor}"
        )
    
    # Atualiza reservado
    dotacao.reservado = dotacao.reservado + data.valor
    
    # Registra movimento
    movimento = DotacaoGlobalMov(
        dotacao_global_id=dotacao.id,
        tipo=TipoDotacaoGlobalMov.RESERVA,
        valor=-data.valor,  # Negativo porque reduz saldo disponível
        referencia=data.referencia,
        descricao=data.descricao or f"Reserva de {data.valor}",
        usuario_id=current_user.id
    )
    db.add(movimento)
    
    db.commit()
    db.refresh(dotacao)
    
    return {
        "message": "Reserva criada com sucesso",
        "saldo_disponivel": dotacao.saldo - dotacao.reservado,
        "reservado": dotacao.reservado
    }


@router.post("/reserva/cancel")
async def cancelar_reserva(
    data: ReservaCancelRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Cancela uma reserva.
    Reduz o campo 'reservado' e aumenta o 'saldo' disponível.
    """
    # Busca dotação com lock
    dotacao = db.query(DotacaoGlobal).filter(
        DotacaoGlobal.exercicio == data.exercicio
    ).with_for_update().first()
    
    if not dotacao:
        raise HTTPException(
            status_code=404,
            detail=f"Dotacao global para exercício {data.exercicio} não encontrada"
        )
    
    # Valida se há reserva suficiente
    if data.valor > dotacao.reservado:
        raise HTTPException(
            status_code=400,
            detail=f"Valor a cancelar ({data.valor}) maior que reservado ({dotacao.reservado})"
        )
    
    # Reduz reservado
    dotacao.reservado = dotacao.reservado - data.valor
    
    # Registra movimento
    movimento = DotacaoGlobalMov(
        dotacao_global_id=dotacao.id,
        tipo=TipoDotacaoGlobalMov.RESERVA_CANCELADA,
        valor=data.valor,  # Positivo porque aumenta saldo disponível
        referencia=str(data.reserva_id) if data.reserva_id else None,
        descricao=data.descricao or f"Cancelamento de reserva de {data.valor}",
        usuario_id=current_user.id
    )
    db.add(movimento)
    
    db.commit()
    db.refresh(dotacao)
    
    return {
        "message": "Reserva cancelada com sucesso",
        "saldo_disponivel": dotacao.saldo - dotacao.reservado,
        "reservado": dotacao.reservado
    }

