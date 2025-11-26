"""
API de confirmação de despesas com validação de dotação global.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from decimal import Decimal
from app.db import get_db
from app.api.auth import get_current_user
from app.models import (
    Usuario, Despesa, DotacaoGlobal, DotacaoGlobalMov, 
    TipoDotacaoGlobalMov, StatusDespesa
)
from app.schemas import DespesaResponse
from app.crud import recalculate_execucao_mensal

router = APIRouter()


@router.post("/{despesa_id}/confirm", response_model=dict)
async def confirm_despesa_with_dotacao(
    despesa_id: int,
    override: bool = Query(False, description="Permitir confirmação mesmo sem saldo (apenas admin)"),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Confirma despesa com validação de dotação global.
    
    Lógica transacional:
    1. SELECT dotacao_global FOR UPDATE (lock)
    2. Verifica saldo disponível
    3. Se override=False e saldo insuficiente → erro
    4. Deduz valor do saldo global
    5. Registra movimento tipo 'despesa_confirmada'
    6. Atualiza status da despesa
    7. Recalcula execução mensal
    8. Commit transação
    
    Retorna:
    - despesa confirmada
    - saldo_restante da dotação global
    """
    # Inicia transação
    with db.begin():
        # 1. Busca despesa
        despesa = db.query(Despesa).filter(Despesa.id == despesa_id).first()
        
        if not despesa:
            raise HTTPException(status_code=404, detail="Despesa não encontrada")
        
        if despesa.status == StatusDespesa.CONFIRMADA:
            # Já confirmada, busca dotação para retornar saldo
            dotacao = db.query(DotacaoGlobal).filter(
                DotacaoGlobal.exercicio == despesa.exercicio
            ).first()
            
            return {
                "message": "Despesa já estava confirmada",
                "despesa_id": despesa.id,
                "saldo_restante": dotacao.saldo - dotacao.reservado if dotacao else Decimal("0.00")
            }
        
        if despesa.status == StatusDespesa.CANCELADA:
            raise HTTPException(
                status_code=400,
                detail="Não é possível confirmar uma despesa cancelada"
            )
        
        # 2. Busca dotação global com lock (SELECT FOR UPDATE)
        dotacao = db.query(DotacaoGlobal).filter(
            DotacaoGlobal.exercicio == despesa.exercicio
        ).with_for_update().first()
        
        if not dotacao:
            raise HTTPException(
                status_code=404,
                detail=f"Dotacao global para exercício {despesa.exercicio} não encontrada. "
                       f"Crie a dotação global antes de confirmar despesas."
            )
        
        # 3. Calcula saldo disponível (saldo - reservado)
        saldo_disponivel = dotacao.saldo - dotacao.reservado
        
        # 4. Valida saldo (a menos que seja override e admin)
        if not override and despesa.valor > saldo_disponivel:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Saldo insuficiente na dotação global. "
                    f"Disponível: {saldo_disponivel}, "
                    f"Necessário: {despesa.valor}, "
                    f"Saldo total: {dotacao.saldo}, "
                    f"Reservado: {dotacao.reservado}. "
                    f"Use ?override=true para forçar (apenas admin)."
                )
            )
        
        # Verifica se é admin para override
        if override:
            # Verifica se usuário tem papel de admin
            from app.models import UsuarioPapel, Papel
            is_admin = db.query(UsuarioPapel).join(Papel).filter(
                and_(
                    UsuarioPapel.usuario_id == current_user.id,
                    Papel.nome == "admin"
                )
            ).first()
            
            if not is_admin:
                raise HTTPException(
                    status_code=403,
                    detail="Apenas administradores podem usar override"
                )
        
        # 5. Deduz valor do saldo global
        dotacao.saldo = dotacao.saldo - despesa.valor
        
        # 6. Registra movimento de auditoria
        movimento = DotacaoGlobalMov(
            dotacao_global_id=dotacao.id,
            tipo=TipoDotacaoGlobalMov.DESPESA_CONFIRMADA,
            referencia=str(despesa_id),
            valor=-despesa.valor,  # Negativo porque reduz saldo
            descricao=f"Despesa #{despesa_id} confirmada: {despesa.valor}",
            usuario_id=current_user.id
        )
        db.add(movimento)
        
        # 7. Atualiza status da despesa
        despesa.status = StatusDespesa.CONFIRMADA
        db.flush()  # Para garantir que está salvo antes de recalcular
        
        # 8. Recalcula execução mensal (se houver rubrica)
        if despesa.rubrica_id:
            recalculate_execucao_mensal(
                db, despesa.rubrica_id, despesa.mes, despesa.exercicio
            )
            # Recalcular dotacao_calculada após atualizar execucao_mensal
            from app.services.rubrica_service import recalculate_dotacao_chain
            recalculate_dotacao_chain(db, despesa.rubrica_id)
        
        # Commit acontece automaticamente ao sair do with db.begin()
    
    # Refresh para obter dados atualizados
    db.refresh(despesa)
    db.refresh(dotacao)
    
    return {
        "message": "Despesa confirmada com sucesso",
        "despesa_id": despesa.id,
        "valor": despesa.valor,
        "saldo_restante": dotacao.saldo - dotacao.reservado,
        "saldo_total": dotacao.saldo,
        "reservado": dotacao.reservado
    }

