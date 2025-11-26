"""
Serviço para gerenciar confirmação de despesas e atualização de execução mensal.
"""
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import List
from decimal import Decimal
from datetime import date
from app.models import Despesa, ExecucaoMensal, Rubrica, StatusDespesa
from app.services.rubrica_service import get_ancestors, get_children


def is_rubrica_leaf(db: Session, rubrica_id: int) -> bool:
    """Verifica se rubrica é folha (não tem filhos)."""
    from app.services.rubrica_service import has_children
    return not has_children(db, rubrica_id)


def update_execucao_mensal(
    db: Session, 
    rubrica_id: int, 
    mes: int, 
    ano: int
) -> ExecucaoMensal:
    """
    Atualiza ou cria execução mensal para uma rubrica.
    Calcula gasto total de despesas confirmadas e atualiza saldo.
    """
    # Buscar rubrica
    rubrica = db.query(Rubrica).filter(Rubrica.id == rubrica_id).first()
    if not rubrica:
        raise ValueError(f"Rubrica {rubrica_id} não encontrada")
    
    # Calcular gasto total (despesas confirmadas)
    gasto_total = db.query(func.sum(Despesa.valor)).filter(
        and_(
            Despesa.rubrica_id == rubrica_id,
            Despesa.mes == mes,
            Despesa.exercicio == ano,
            Despesa.status == StatusDespesa.CONFIRMADA
        )
    ).scalar() or Decimal("0.00")
    
    # Rubricas não têm dotação própria - usar dotacao_calculada
    dotacao_valor = rubrica.dotacao_calculada or Decimal("0.00")
    
    # Buscar ou criar execução mensal
    execucao = db.query(ExecucaoMensal).filter(
        and_(
            ExecucaoMensal.rubrica_id == rubrica_id,
            ExecucaoMensal.mes == mes,
            ExecucaoMensal.ano == ano
        )
    ).first()
    
    if not execucao:
        execucao = ExecucaoMensal(
            rubrica_id=rubrica_id,
            mes=mes,
            ano=ano,
            dotacao=dotacao_valor,
            gasto=gasto_total,
            saldo=dotacao_valor - gasto_total
        )
        db.add(execucao)
    else:
        execucao.gasto = gasto_total
        execucao.saldo = execucao.dotacao - gasto_total
    
    db.flush()
    return execucao


def update_ancestors_execucao_mensal(
    db: Session,
    rubrica_id: int,
    mes: int,
    ano: int
) -> None:
    """
    Atualiza execução mensal de todas as rubricas ancestrais recursivamente.
    Para cada ancestral, soma os gastos de todos os filhos.
    """
    # Obter ancestrais (incluindo a própria rubrica)
    ancestors = get_ancestors(db, rubrica_id)
    
    # Processar cada ancestral (do mais profundo ao mais superficial)
    for ancestor in ancestors:
        # Buscar todos os filhos diretos
        children = get_children(db, ancestor.id)
        
        # Calcular gasto total somando gastos dos filhos na execução mensal
        gasto_total = Decimal("0.00")
        dotacao_total = Decimal("0.00")
        
        for child in children:
            child_exec = db.query(ExecucaoMensal).filter(
                and_(
                    ExecucaoMensal.rubrica_id == child.id,
                    ExecucaoMensal.mes == mes,
                    ExecucaoMensal.ano == ano
                )
            ).first()
            
            if child_exec:
                gasto_total += child_exec.gasto
                dotacao_total += child_exec.dotacao
        
        # Também somar despesas confirmadas diretamente na rubrica ancestral (se houver)
        despesas_diretas = db.query(func.sum(Despesa.valor)).filter(
            and_(
                Despesa.rubrica_id == ancestor.id,
                Despesa.mes == mes,
                Despesa.exercicio == ano,
                Despesa.status == StatusDespesa.CONFIRMADA
            )
        ).scalar() or Decimal("0.00")
        
        gasto_total += despesas_diretas
        
        # Atualizar execução mensal do ancestral
        ancestor_exec = db.query(ExecucaoMensal).filter(
            and_(
                ExecucaoMensal.rubrica_id == ancestor.id,
                ExecucaoMensal.mes == mes,
                ExecucaoMensal.ano == ano
            )
        ).first()
        
        # Rubricas não têm dotação própria - usar dotacao_calculada
        ancestor_dotacao = ancestor.dotacao_calculada or Decimal("0.00")
        
        if not ancestor_exec:
            ancestor_exec = ExecucaoMensal(
                rubrica_id=ancestor.id,
                mes=mes,
                ano=ano,
                dotacao=ancestor_dotacao,
                gasto=gasto_total,
                saldo=ancestor_dotacao - gasto_total
            )
            db.add(ancestor_exec)
        else:
            ancestor_exec.gasto = gasto_total
            ancestor_exec.saldo = ancestor_exec.dotacao - gasto_total
        
        db.flush()


def confirm_despesa_with_execucao(
    db: Session,
    despesa_id: int
) -> Despesa:
    """
    Confirma despesa e atualiza execução mensal.
    
    Processo:
    1. Valida que despesa não está confirmada
    2. Atualiza status para CONFIRMADA
    3. Atualiza execução mensal da rubrica
    4. Atualiza execução mensal de todas as rubricas ancestrais
    """
    despesa = db.query(Despesa).filter(Despesa.id == despesa_id).first()
    if not despesa:
        raise ValueError(f"Despesa {despesa_id} não encontrada")
    
    if despesa.status == StatusDespesa.CONFIRMADA:
        return despesa  # Já confirmada
    
    if not despesa.rubrica_id:
        raise ValueError("Despesa deve ter rubrica associada para ser confirmada")
    
    # Atualizar status
    despesa.status = StatusDespesa.CONFIRMADA
    db.flush()
    
    # Atualizar execução mensal da rubrica
    update_execucao_mensal(
        db, despesa.rubrica_id, despesa.mes, despesa.exercicio
    )
    
    # Atualizar execução mensal dos ancestrais
    update_ancestors_execucao_mensal(
        db, despesa.rubrica_id, despesa.mes, despesa.exercicio
    )
    
    db.commit()
    db.refresh(despesa)
    
    return despesa

