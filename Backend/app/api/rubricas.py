"""
API de rubricas orçamentais.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, text
from app.db import get_db
from app.api.auth import get_current_user, require_admin
from app.models import Usuario, Rubrica, Despesa, StatusDespesa, StatusRubrica
from app.schemas import (
    RubricaResponse, RubricaCreate, RubricaUpdate, RubricaTreeResponse,
    BalanceteResponse, BalanceteItem
)
from pydantic import BaseModel
from typing import List as ListType
from app.crud import (
    get_rubrica, create_rubrica, update_rubrica, list_rubricas,
    get_rubrica_by_codigo_exercicio
)
from decimal import Decimal

router = APIRouter()


def build_rubrica_tree(
    db: Session, parent_id: Optional[int] = None, 
    exercicio: Optional[int] = None, mes: Optional[int] = None, ano: Optional[int] = None
) -> List[RubricaTreeResponse]:
    """
    Constrói árvore de rubricas com totais calculados.
    """
    from sqlalchemy.orm import defer
    
    # Busca rubricas filhas
    # dotacao já está excluída via __mapper_args__ no modelo
    query = db.query(Rubrica)
    if parent_id is None:
        query = query.filter(Rubrica.parent_id.is_(None))
    else:
        query = query.filter(Rubrica.parent_id == parent_id)
    
    if exercicio:
        query = query.filter(Rubrica.exercicio == exercicio)
    
    rubricas = query.all()
    
    result = []
    for rubrica in rubricas:
        # Calcula gasto total (despesas confirmadas)
        gasto_query = db.query(func.sum(Despesa.valor)).filter(
            and_(
                Despesa.rubrica_id == rubrica.id,
                Despesa.status == StatusDespesa.CONFIRMADA
            )
        )
        
        if mes:
            gasto_query = gasto_query.filter(Despesa.mes == mes)
        if ano:
            gasto_query = gasto_query.filter(Despesa.exercicio == ano)
        
        gasto_total = gasto_query.scalar() or Decimal("0.00")
        
        # Busca filhos recursivamente
        children = build_rubrica_tree(
            db, parent_id=rubrica.id, exercicio=exercicio, mes=mes, ano=ano
        )
        
        # Soma gastos dos filhos
        gasto_filhos = sum(child.gasto_total for child in children)
        gasto_total = gasto_total + gasto_filhos
        
        # Rubricas não têm dotação própria - usar dotacao_calculada
        dotacao_valor = rubrica.dotacao_calculada or Decimal("0.00")
        saldo_total = dotacao_valor - gasto_total
        
        result.append(RubricaTreeResponse(
            id=rubrica.id,
            codigo=rubrica.codigo,
            designacao=rubrica.designacao,
            tipo=rubrica.tipo,
            parent_id=rubrica.parent_id,
            nivel=rubrica.nivel,
            dotacao=dotacao_valor,
            exercicio=rubrica.exercicio,
            status=rubrica.status,
            criado_em=rubrica.criado_em,
            actualizado_em=rubrica.actualizado_em,
            children=children,
            gasto_total=gasto_total,
            saldo_total=saldo_total
        ))
    
    return result


@router.get("/rubricas", response_model=List[RubricaResponse])
async def list_rubricas_flat(
    exercicio: Optional[int] = Query(None, description="Filtrar por exercício"),
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=10000),
    status: Optional[str] = Query(None, description="Filtrar por status (ativa, provisoria, inativa)"),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Lista rubricas em formato plano (lista simples) para inserção manual.
    Retorna todas as rubricas (ativas, provisórias e inativas) por padrão.
    """
    from app.models import StatusRubrica
    
    query = db.query(Rubrica)
    
    if exercicio:
        query = query.filter(Rubrica.exercicio == exercicio)
    
    # Se status foi especificado, filtrar
    if status:
        try:
            status_enum = StatusRubrica[status.upper()]
            query = query.filter(Rubrica.status == status_enum)
        except (KeyError, AttributeError):
            # Se status inválido, retorna todas
            pass
    
    # Ordenar por código
    query = query.order_by(Rubrica.codigo)
    
    # dotacao já está excluída via __mapper_args__ no modelo
    
    # Buscar todas as rubricas do exercício (sem limite) para recalcular
    all_rubricas_exercicio = query.all() if exercicio else []
    
    # Garantir que dotacao_calculada está calculada para todas as rubricas
    # Recalcular se necessário (apenas para rubricas do mesmo exercício)
    # IMPORTANTE: Não bloquear o retorno das rubricas se houver erro no recálculo
    try:
        from app.services.rubrica_service import recalculate_dotacao_chain
        if exercicio and all_rubricas_exercicio:
            # Recalcular para TODAS as rubricas do exercício
            # Processar do mais profundo para o mais alto (folhas primeiro, depois pais)
            # Ordenar por nível descendente (maior nível primeiro)
            rubricas_ordenadas = sorted(all_rubricas_exercicio, key=lambda r: r.nivel, reverse=True)
            
            for rubrica in rubricas_ordenadas:
                try:
                    recalculate_dotacao_chain(db, rubrica.id)
                except Exception as e:
                    # Log do erro mas continua
                    import logging
                    logging.warning(f"Erro ao recalcular dotação para rubrica {rubrica.id}: {e}")
            try:
                db.commit()
            except Exception as e:
                import logging
                logging.error(f"Erro ao fazer commit após recálculo: {e}")
                db.rollback()
    except Exception as e:
        # Se houver erro crítico, fazer rollback mas continuar
        import logging
        logging.error(f"Erro crítico ao recalcular dotação: {e}")
        try:
            db.rollback()
        except:
            pass
    
    # Agora buscar apenas as rubricas solicitadas (com skip/limit)
    # IMPORTANTE: Sempre retornar as rubricas, mesmo se houver erro no recálculo
    try:
        rubricas = query.offset(skip).limit(limit).all()
        return rubricas
    except Exception as e:
        import logging
        logging.error(f"Erro ao buscar rubricas: {e}")
        # Retornar lista vazia se houver erro
        return []


@router.get("/rubricas/tree-view", response_model=List[RubricaTreeResponse])
async def list_rubricas_tree(
    exercicio: Optional[int] = Query(None, description="Filtrar por exercício"),
    mes: Optional[int] = Query(None, ge=1, le=12, description="Filtrar por mês"),
    ano: Optional[int] = Query(None, description="Filtrar por ano (para despesas)"),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Lista rubricas em formato de árvore com totais (endpoint alternativo).
    """
    tree = build_rubrica_tree(db, parent_id=None, exercicio=exercicio, mes=mes, ano=ano)
    return tree


@router.get("/execucao-mensal", response_model=List[dict])
async def get_execucao_mensal(
    exercicio: int = Query(..., description="Exercício"),
    db: Session = Depends(get_db)
):
    """
    Retorna dados de execução mensal de todas as rubricas de um exercício.
    Endpoint público - não requer autenticação.
    Retorna lista de execuções mensais agrupadas por rubrica_id.
    Para rubricas pai, calcula a soma das sub-rubricas.
    """
    from app.models import ExecucaoMensal, StatusRubrica
    from decimal import Decimal
    
    # Buscar todas as rubricas ativas do exercício
    rubricas = db.query(Rubrica).filter(
        Rubrica.exercicio == exercicio,
        Rubrica.status == StatusRubrica.ATIVA
    ).all()
    
    # Buscar todas as execuções mensais do exercício
    execucoes = db.query(ExecucaoMensal).filter(
        ExecucaoMensal.ano == exercicio
    ).all()
    
    # Criar dicionário de rubricas por ID para acesso rápido
    rubricas_dict = {r.id: r for r in rubricas}
    
    # Criar mapa de filhos por parent_id
    filhos_por_pai = {}
    for rubrica in rubricas:
        if rubrica.parent_id:
            if rubrica.parent_id not in filhos_por_pai:
                filhos_por_pai[rubrica.parent_id] = []
            filhos_por_pai[rubrica.parent_id].append(rubrica.id)
    
    # Agrupar execuções por rubrica_id - usar GASTO (não dotacao)
    execucoes_por_rubrica = {}
    for exec in execucoes:
        if exec.rubrica_id not in execucoes_por_rubrica:
            execucoes_por_rubrica[exec.rubrica_id] = {}
        # Usar GASTO (soma das despesas confirmadas), não dotacao
        execucoes_por_rubrica[exec.rubrica_id][exec.mes] = float(exec.gasto)
    
    # Função recursiva para calcular total de uma rubrica (incluindo sub-rubricas)
    def calcular_total_rubrica(rubrica_id: int) -> dict:
        """Retorna meses com valores de GASTO somados das sub-rubricas."""
        meses = execucoes_por_rubrica.get(rubrica_id, {}).copy()
        
        # Se a rubrica tem filhos, somar os valores das sub-rubricas
        if rubrica_id in filhos_por_pai:
            for filho_id in filhos_por_pai[rubrica_id]:
                meses_filho = calcular_total_rubrica(filho_id)
                # Somar valores de cada mês (gastos)
                for mes in range(1, 13):
                    valor_filho = meses_filho.get(mes, 0.0)
                    valor_atual = meses.get(mes, 0.0)
                    meses[mes] = valor_atual + valor_filho
        
        return meses
    
    # Montar resposta com dados de todas as rubricas
    result = []
    for rubrica in rubricas:
        # Calcular meses (incluindo soma das sub-rubricas se houver)
        meses_calculados = calcular_total_rubrica(rubrica.id)
        
        result.append({
            "rubrica_id": rubrica.id,
            "codigo": rubrica.codigo,
            "designacao": rubrica.designacao,
            "nivel": rubrica.nivel,
            "parent_id": rubrica.parent_id,
            "meses": {
                "1": meses_calculados.get(1, 0.0),
                "2": meses_calculados.get(2, 0.0),
                "3": meses_calculados.get(3, 0.0),
                "4": meses_calculados.get(4, 0.0),
                "5": meses_calculados.get(5, 0.0),
                "6": meses_calculados.get(6, 0.0),
                "7": meses_calculados.get(7, 0.0),
                "8": meses_calculados.get(8, 0.0),
                "9": meses_calculados.get(9, 0.0),
                "10": meses_calculados.get(10, 0.0),
                "11": meses_calculados.get(11, 0.0),
                "12": meses_calculados.get(12, 0.0)
            },
            "total": sum(meses_calculados.values())
        })
    
    return result


@router.get("/rubricas/tree", response_model=List[dict])
async def get_rubricas_tree(
    exercicio: int = Query(..., description="Exercício"),
    db: Session = Depends(get_db)
):
    """
    Retorna árvore completa de rubricas para o dashboard.
    Usa dotacao_calculada (nunca dotacao).
    Não retorna rubricas inativas.
    """
    from app.models import StatusRubrica
    
    # Buscar todas as rubricas do exercício (apenas ativas)
    # dotacao já está excluída via __mapper_args__ no modelo
    all_rubricas = db.query(Rubrica).filter(
        Rubrica.exercicio == exercicio,
        Rubrica.status == StatusRubrica.ATIVA
    ).all()
    
    # Garantir que dotacao_calculada está atualizada para todas as rubricas
    # Recalcular do mais profundo para o mais alto (folhas primeiro, depois pais)
    from app.services.rubrica_service import recalculate_dotacao_chain
    if all_rubricas:
        rubricas_ordenadas = sorted(all_rubricas, key=lambda r: r.nivel, reverse=True)
        for rubrica in rubricas_ordenadas:
            try:
                recalculate_dotacao_chain(db, rubrica.id)
            except Exception as e:
                import logging
                logging.warning(f"Erro ao recalcular dotação para rubrica {rubrica.id}: {e}")
        db.commit()
    
    # Criar dicionário por ID para acesso rápido
    rubricas_dict = {r.id: r for r in all_rubricas}
    
    # Construir árvore recursivamente
    def build_tree_node(rubrica_id: int) -> Optional[dict]:
        rubrica = rubricas_dict.get(rubrica_id)
        if not rubrica:
            return None
        
        # Buscar filhos
        children = [r for r in all_rubricas if r.parent_id == rubrica_id]
        
        # Usar dotacao_calculada (sempre disponível após recálculo)
        dotacao_valor = getattr(rubrica, 'dotacao_calculada', None)
        if dotacao_valor is None:
            # Se não calculada ainda, usa 0 (rubricas não têm dotação própria)
            dotacao_valor = Decimal("0.00")
        
        # Calcular gasto total (despesas confirmadas) para esta rubrica e filhos
        gasto_query = db.query(func.sum(Despesa.valor)).filter(
            and_(
                Despesa.rubrica_id == rubrica.id,
                Despesa.status == StatusDespesa.CONFIRMADA,
                Despesa.exercicio == exercicio
            )
        )
        gasto_direto = gasto_query.scalar() or Decimal("0.00")
        
        node = {
            "id": rubrica.id,
            "codigo": rubrica.codigo,
            "designacao": rubrica.designacao,
            "tipo": rubrica.tipo.value,
            "nivel": rubrica.nivel,
            "dotacao_calculada": float(dotacao_valor),
            "dotacao": float(dotacao_valor),  # Usar dotacao_calculada (rubricas não têm dotação própria)
            "gasto": float(gasto_direto),  # Gasto direto desta rubrica
            "saldo": float(dotacao_valor - gasto_direto),  # Saldo = dotação - gasto
            "children": []
        }
        
        # Adicionar filhos recursivamente
        gasto_filhos = Decimal("0.00")
        for child in children:
            child_node = build_tree_node(child.id)
            if child_node:
                node["children"].append(child_node)
                # Somar gasto dos filhos
                gasto_filhos += Decimal(str(child_node.get("gasto", 0)))
        
        # Gasto total = gasto direto + gasto dos filhos
        gasto_total = gasto_direto + gasto_filhos
        node["gasto"] = float(gasto_total)
        node["saldo"] = float(dotacao_valor - gasto_total)
        
        return node
    
    # Encontrar raízes (rubricas sem pai)
    roots = [r for r in all_rubricas if r.parent_id is None]
    
    # Construir árvore para cada raiz
    tree = []
    for root in roots:
        root_node = build_tree_node(root.id)
        if root_node:
            tree.append(root_node)
    
    return tree


@router.get("/rubrica/{codigo}/despesas", response_model=List[dict])
async def get_rubrica_despesas(
    codigo: str,
    exercicio: int = Query(..., description="Exercício"),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retorna todas as despesas de uma rubrica e subrubricas.
    Usa CTE recursivo do MySQL 8+.
    """
    # Decodificar URL encoding e limpar espaços extras
    from urllib.parse import unquote
    codigo = unquote(codigo).strip()
    
    # Busca rubrica principal
    rubrica = get_rubrica_by_codigo_exercicio(db, codigo, exercicio)
    if not rubrica:
        raise HTTPException(status_code=404, detail="Rubrica não encontrada")
    
    # Query recursiva com CTE (MySQL 8+)
    query = text("""
        WITH RECURSIVE rubricas_tree AS (
            -- Anchor: rubrica principal
            SELECT id, codigo, parent_id, nivel
            FROM rubrica
            WHERE id = :rubrica_id
            
            UNION ALL
            
            -- Recursive: filhos
            SELECT r.id, r.codigo, r.parent_id, r.nivel
            FROM rubrica r
            INNER JOIN rubricas_tree rt ON r.parent_id = rt.id
        )
        SELECT d.*
        FROM despesa d
        INNER JOIN rubricas_tree rt ON d.rubrica_id = rt.id
        WHERE d.exercicio = :exercicio
        ORDER BY d.data_emissao DESC, d.id DESC
    """)
    
    try:
        result = db.execute(query, {"rubrica_id": rubrica.id, "exercicio": exercicio})
        despesas = []
        for row in result:
            despesa = db.query(Despesa).filter(Despesa.id == row.id).first()
            if despesa:
                despesas.append({
                    "id": despesa.id,
                    "rubrica_id": despesa.rubrica_id,
                    "fornecedor_id": despesa.fornecedor_id,
                    "fornecedor_text": despesa.fornecedor_text,
                    "valor": float(despesa.valor),
                    "data_emissao": despesa.data_emissao.isoformat() if despesa.data_emissao else None,
                    "mes": despesa.mes,
                    "status": despesa.status.value,
                    "ordem_pagamento": despesa.ordem_pagamento,
                    "requisicao": despesa.requisicao
                })
        return despesas
    except Exception as e:
        # Fallback: busca simples sem CTE (para MySQL < 8)
        despesas = db.query(Despesa).filter(
            and_(
                Despesa.rubrica_id == rubrica.id,
                Despesa.exercicio == exercicio
            )
        ).all()
        
        return [{
            "id": d.id,
            "rubrica_id": d.rubrica_id,
            "fornecedor_id": d.fornecedor_id,
            "fornecedor_text": d.fornecedor_text,
            "valor": float(d.valor),
            "data_emissao": d.data_emissao.isoformat() if d.data_emissao else None,
            "mes": d.mes,
            "status": d.status.value,
            "ordem_pagamento": d.ordem_pagamento,
            "requisicao": d.requisicao
        } for d in despesas]


@router.get("/balancete", response_model=BalanceteResponse)
async def get_balancete(
    mes: int = Query(..., ge=1, le=12, description="Mês"),
    ano: int = Query(..., description="Ano"),
    exercicio: Optional[int] = Query(None, description="Exercício da rubrica"),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retorna balancete sumarizado por mês/ano.
    """
    # Busca todas as rubricas do exercício
    exercicio_filter = exercicio or ano
    rubricas = db.query(Rubrica).filter(
        Rubrica.exercicio == exercicio_filter
    ).all()
    
    items = []
    total_dotacao = Decimal("0.00")
    total_gasto = Decimal("0.00")
    
    for rubrica in rubricas:
        # Calcula gasto do mês
        gasto = db.query(func.sum(Despesa.valor)).filter(
            and_(
                Despesa.rubrica_id == rubrica.id,
                Despesa.mes == mes,
                Despesa.exercicio == ano,
                Despesa.status == StatusDespesa.CONFIRMADA
            )
        ).scalar() or Decimal("0.00")
        
        # Rubricas não têm dotação própria - usar dotacao_calculada
        dotacao_valor = rubrica.dotacao_calculada or Decimal("0.00")
        saldo = dotacao_valor - gasto
        
        items.append(BalanceteItem(
            codigo=rubrica.codigo,
            designacao=rubrica.designacao,
            dotacao=dotacao_valor,
            gasto=gasto,
            saldo=saldo
        ))
        
        total_dotacao += dotacao_valor
        total_gasto += gasto
    
    return BalanceteResponse(
        mes=mes,
        ano=ano,
        items=items,
        total_dotacao=total_dotacao,
        total_gasto=total_gasto,
        total_saldo=total_dotacao - total_gasto
    )


@router.get("/rubricas/maior-gasto", response_model=List[BalanceteItem])
async def get_rubricas_maior_gasto(
    exercicio: int = Query(..., description="Ano do exercício"),
    limit: int = Query(3, ge=1, le=10, description="Número de rubricas a retornar"),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retorna as rubricas com maior gasto acumulado no exercício.
    Ordenado por gasto decrescente.
    """
    from sqlalchemy import func, and_
    from app.models import Despesa, StatusDespesa
    
    # Busca todas as rubricas do exercício
    rubricas = db.query(Rubrica).filter(
        Rubrica.exercicio == exercicio
    ).all()
    
    items = []
    
    for rubrica in rubricas:
        # Calcula gasto total acumulado (todas as despesas confirmadas)
        gasto = db.query(func.sum(Despesa.valor)).filter(
            and_(
                Despesa.rubrica_id == rubrica.id,
                Despesa.exercicio == exercicio,
                Despesa.status == StatusDespesa.CONFIRMADA
            )
        ).scalar() or Decimal("0.00")
        
        if gasto > 0:  # Só inclui rubricas com gasto
            # Rubricas não têm dotação própria - usar dotacao_calculada
            dotacao_valor = rubrica.dotacao_calculada or Decimal("0.00")
            saldo = dotacao_valor - gasto
            percent_gasto = (gasto / dotacao_valor * 100) if dotacao_valor > 0 else 0
            
            items.append({
                "codigo": rubrica.codigo,
                "designacao": rubrica.designacao,
                "dotacao": dotacao_valor,
                "gasto": gasto,
                "saldo": saldo,
                "percent_gasto": percent_gasto
            })
    
    # Ordena por gasto decrescente e retorna top N
    items.sort(key=lambda x: x["gasto"], reverse=True)
    return items[:limit]


# CRUD endpoints (admin only)
@router.post("/rubricas", response_model=RubricaResponse)
async def create_rubrica_endpoint(
    rubrica: RubricaCreate,
    current_user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Cria nova rubrica (admin only)."""
    from app.services.rubrica_service import has_children
    
    # Verifica se já existe
    existing = get_rubrica_by_codigo_exercicio(
        db, rubrica.codigo, rubrica.exercicio
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Rubrica {rubrica.codigo} já existe para o exercício {rubrica.exercicio}"
        )
    
    # Nota: A validação de dotação para rubricas com filhos é feita no CRUD (create_rubrica)
    # Uma rubrica só não pode ter dotação se ELA MESMA tiver filhos.
    # Como estamos criando uma nova rubrica, ela ainda não tem filhos, então pode ter dotação.
    
    try:
        return create_rubrica(db, rubrica)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# Schemas para criação em lote
# ============================================================================

class RubricaBatchItem(BaseModel):
    """Item individual para criação em lote."""
    codigo: str
    designacao: str
    dotacao: Optional[Decimal] = Decimal("0.00")


class RubricaBatchCreate(BaseModel):
    """Schema para criação em lote de subrubricas."""
    parent_id: int
    exercicio: int
    tipo: str  # "despesa" ou "receita"
    items: ListType[RubricaBatchItem]


class RubricaBatchResponse(BaseModel):
    """Resposta da criação em lote."""
    criadas: int
    erros: int
    detalhes: ListType[dict] = []  # Lista com sucessos e erros
    
    class Config:
        json_encoders = {
            Decimal: lambda v: float(v)
        }


@router.post("/rubricas/batch", response_model=RubricaBatchResponse)
async def create_rubricas_batch(
    batch_data: RubricaBatchCreate,
    current_user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Cria múltiplas subrubricas de uma vez (criação em lote).
    
    Formato esperado:
    - parent_id: ID da rubrica pai
    - exercicio: Exercício orçamentário
    - tipo: "despesa" ou "receita"
    - items: Lista de rubricas a criar (codigo, designacao, dotacao)
    """
    from app.models import TipoRubrica
    
    criadas = 0
    erros = 0
    detalhes = []
    
    # Validar tipo
    try:
        tipo_enum = TipoRubrica[batch_data.tipo.upper()]
    except (KeyError, AttributeError):
        raise HTTPException(
            status_code=400,
            detail=f"Tipo inválido: {batch_data.tipo}. Use 'despesa' ou 'receita'."
        )
    
    # Validar que o pai existe
    parent = get_rubrica(db, batch_data.parent_id)
    if not parent:
        raise HTTPException(
            status_code=404,
            detail=f"Rubrica pai (ID: {batch_data.parent_id}) não encontrada"
        )
    
    # Processar cada item
    for item in batch_data.items:
        try:
            # Verificar se já existe
            existing = get_rubrica_by_codigo_exercicio(
                db, item.codigo, batch_data.exercicio
            )
            if existing:
                erros += 1
                detalhes.append({
                    "codigo": item.codigo,
                    "designacao": item.designacao,
                    "status": "erro",
                    "mensagem": f"Rubrica {item.codigo} já existe para o exercício {batch_data.exercicio}"
                })
                continue
            
            # Criar rubrica
            # Rubricas folha podem ter dotacao_inicial (padrão 0.00)
            rubrica_create = RubricaCreate(
                codigo=item.codigo,
                designacao=item.designacao,
                tipo=tipo_enum,
                parent_id=batch_data.parent_id,
                exercicio=batch_data.exercicio,
                dotacao_inicial=Decimal("0.00"),  # Padrão: sem dotação inicial
                status=StatusRubrica.ATIVA
            )
            
            rubrica = create_rubrica(db, rubrica_create)
            criadas += 1
            detalhes.append({
                "codigo": item.codigo,
                "designacao": item.designacao,
                "status": "sucesso",
                "id": rubrica.id
            })
            
            # Após criar cada subrubrica, recalcular dotação do pai
            # Isso garante que dotacao_calculada do pai seja atualizada
            from app.services.rubrica_service import recalculate_dotacao_chain
            recalculate_dotacao_chain(db, batch_data.parent_id)
            db.commit()
            
        except Exception as e:
            erros += 1
            detalhes.append({
                "codigo": item.codigo,
                "designacao": item.designacao,
                "status": "erro",
                "mensagem": str(e)
            })
    
    return RubricaBatchResponse(
        criadas=criadas,
        erros=erros,
        detalhes=detalhes
    )


@router.get("/rubricas/{rubrica_id}", response_model=RubricaResponse)
async def get_rubrica_endpoint(
    rubrica_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Busca rubrica por ID."""
    rubrica = get_rubrica(db, rubrica_id)
    if not rubrica:
        raise HTTPException(status_code=404, detail="Rubrica não encontrada")
    return rubrica


@router.put("/rubricas/{rubrica_id}", response_model=RubricaResponse)
async def update_rubrica_endpoint(
    rubrica_id: int,
    rubrica_update: RubricaUpdate,
    current_user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Atualiza rubrica (admin only)."""
    from app.services.rubrica_service import has_children
    
    # Rubricas não têm dotação própria - dotação está em execucao_mensal
    # Remover dotacao do update_data se presente
    update_data = rubrica_update.model_dump(exclude_unset=True)
    if "dotacao" in update_data:
        # Ignorar dotacao - rubricas não têm dotação própria
        del update_data["dotacao"]
        # Criar novo objeto sem dotacao
        from app.schemas import RubricaUpdate
        rubrica_update = RubricaUpdate(**update_data)
    
    try:
        rubrica = update_rubrica(db, rubrica_id, rubrica_update)
        if not rubrica:
            raise HTTPException(status_code=404, detail="Rubrica não encontrada")
        
        # Recalcular dotacao_calculada após atualização
        from app.services.rubrica_service import recalculate_dotacao_chain
        recalculate_dotacao_chain(db, rubrica_id)
        db.commit()
        db.refresh(rubrica)
        
        # Notificar evento SSE
        from app.api.dashboard_events import notify_event_sync
        notify_event_sync(rubrica.exercicio, "rubrica_atualizada", {
            "rubrica_id": rubrica.id,
            "codigo": rubrica.codigo,
            "dotacao_calculada": float(rubrica.dotacao_calculada or 0)
        })
        
        return rubrica
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/rubricas/{rubrica_id}")
async def delete_rubrica_endpoint(
    rubrica_id: int,
    current_user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Desativa rubrica (soft delete - admin only) e recalcula dotação do pai."""
    from app.services.rubrica_service import recalculate_dotacao_chain
    
    rubrica = get_rubrica(db, rubrica_id)
    if not rubrica:
        raise HTTPException(status_code=404, detail="Rubrica não encontrada")
    
    parent_id = rubrica.parent_id
    
    # Soft delete - muda status para inativa
    from app.models import StatusRubrica
    rubrica.status = StatusRubrica.INATIVA
    db.commit()
    
    # Recalcular dotação do pai (se existir)
    if parent_id:
        recalculate_dotacao_chain(db, parent_id)
        db.commit()
    
    return {"message": "Rubrica desativada com sucesso"}


@router.post("/execucao-mensal/popular", response_model=dict)
async def popular_execucao_mensal(
    exercicio: int = Query(..., description="Exercício para popular"),
    current_user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Popula a tabela execucao_mensal com base nas despesas confirmadas existentes.
    Útil para popular dados históricos ou corrigir inconsistências.
    """
    from app.models import ExecucaoMensal, StatusDespesa, StatusRubrica
    from app.services.rubrica_service import recalculate_dotacao_chain
    from app.crud import recalculate_execucao_mensal
    
    # Primeiro, garantir que dotacao_calculada está atualizada para todas as rubricas
    rubricas = db.query(Rubrica).filter(
        Rubrica.exercicio == exercicio,
        Rubrica.status == StatusRubrica.ATIVA
    ).all()
    
    if not rubricas:
        return {
            "message": f"Nenhuma rubrica ativa encontrada para o exercício {exercicio}",
            "exercicio": exercicio,
            "criadas": 0,
            "atualizadas": 0
        }
    
    # Recalcular dotacao_calculada para todas as rubricas (do mais profundo para o mais alto)
    rubricas_ordenadas = sorted(rubricas, key=lambda r: r.nivel, reverse=True)
    for rubrica in rubricas_ordenadas:
        try:
            recalculate_dotacao_chain(db, rubrica.id)
        except Exception as e:
            import logging
            logging.warning(f"Erro ao recalcular dotação para rubrica {rubrica.id}: {e}")
    db.commit()
    
    # Buscar todas as despesas confirmadas do exercício
    despesas_confirmadas = db.query(Despesa).filter(
        Despesa.exercicio == exercicio,
        Despesa.status == StatusDespesa.CONFIRMADA,
        Despesa.rubrica_id.isnot(None)
    ).all()
    
    # Agrupar despesas por (rubrica_id, mes) para processar
    despesas_por_rubrica_mes = {}
    for despesa in despesas_confirmadas:
        key = (despesa.rubrica_id, despesa.mes)
        if key not in despesas_por_rubrica_mes:
            despesas_por_rubrica_mes[key] = []
        despesas_por_rubrica_mes[key].append(despesa)
    
    # Criar/atualizar execucao_mensal APENAS para combinações (rubrica, mês) que têm despesas confirmadas
    criadas = 0
    atualizadas = 0
    erros = []
    
    for (rubrica_id, mes), despesas_list in despesas_por_rubrica_mes.items():
        try:
            # Verificar se já existe
            execucao_existente = db.query(ExecucaoMensal).filter(
                and_(
                    ExecucaoMensal.rubrica_id == rubrica_id,
                    ExecucaoMensal.mes == mes,
                    ExecucaoMensal.ano == exercicio
                )
            ).first()
            
            # Usar recalculate_execucao_mensal que cria apenas quando há gasto > 0
            execucao = recalculate_execucao_mensal(db, rubrica_id, mes, exercicio)
            if execucao:
                if not execucao_existente:
                    criadas += 1
                else:
                    atualizadas += 1
        except Exception as e:
            erros.append(f"Rubrica {rubrica_id}, Mês {mes}: {str(e)}")
            import logging
            logging.error(f"Erro ao criar execucao_mensal para rubrica {rubrica_id}, mês {mes}: {e}")
    
    db.commit()
    
    return {
        "message": f"Execução mensal populada para exercício {exercicio}",
        "exercicio": exercicio,
        "criadas": criadas,
        "atualizadas": atualizadas,
        "erros": erros if erros else None
    }


@router.post("/rubricas/recalcular-dotacao", response_model=dict)
async def recalcular_dotacao_exercicio(
    exercicio: int = Query(..., description="Exercício para recalcular"),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Recalcula dotacao_calculada para todas as rubricas de um exercício.
    Útil para corrigir inconsistências após mudanças em execucao_mensal.
    """
    from app.models import StatusRubrica
    from sqlalchemy.orm import defer
    from app.services.rubrica_service import recalculate_dotacao_chain
    
    # Buscar todas as rubricas ativas do exercício
    all_rubricas = db.query(Rubrica).filter(
        Rubrica.exercicio == exercicio,
        Rubrica.status == StatusRubrica.ATIVA
    ).all()
    
    if not all_rubricas:
        return {
            "message": f"Nenhuma rubrica ativa encontrada para o exercício {exercicio}",
            "exercicio": exercicio,
            "recalculadas": 0
        }
    
    # Recalcular do mais profundo para o mais alto (folhas primeiro, depois pais)
    rubricas_ordenadas = sorted(all_rubricas, key=lambda r: r.nivel, reverse=True)
    recalculadas = 0
    erros = []
    
    for rubrica in rubricas_ordenadas:
        try:
            recalculate_dotacao_chain(db, rubrica.id)
            recalculadas += 1
        except Exception as e:
            erros.append(f"Rubrica {rubrica.id} ({rubrica.codigo}): {str(e)}")
            import logging
            logging.error(f"Erro ao recalcular dotação para rubrica {rubrica.id}: {e}")
    
    db.commit()
    
    # Notificar evento SSE para atualizar todas as páginas
    from app.api.dashboard_events import notify_event_sync
    notify_event_sync(exercicio, "rubricas_recalculadas", {
        "exercicio": exercicio,
        "recalculadas": recalculadas,
        "total": len(all_rubricas)
    })
    
    return {
        "message": f"Recálculo concluído para exercício {exercicio}",
        "exercicio": exercicio,
        "recalculadas": recalculadas,
        "total": len(all_rubricas),
        "erros": erros if erros else None
    }


@router.get("/rubricas/{rubrica_id}/diagnostico", response_model=dict)
async def diagnostico_rubrica(
    rubrica_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Endpoint de diagnóstico para verificar valores de uma rubrica.
    Útil para debug de problemas com dotacao_calculada.
    """
    from app.models import ExecucaoMensal, StatusRubrica
    from sqlalchemy import func
    
    rubrica = db.query(Rubrica).filter(
        Rubrica.id == rubrica_id
    ).first()
    
    if not rubrica:
        raise HTTPException(status_code=404, detail="Rubrica não encontrada")
    
    # Buscar filhos
    children = db.query(Rubrica).filter(
        Rubrica.parent_id == rubrica_id,
        Rubrica.exercicio == rubrica.exercicio,
        Rubrica.status == StatusRubrica.ATIVA
    ).all()
    
    # Calcular dotacao_calculada dos filhos
    filhos_dotacao = sum(child.dotacao_calculada or Decimal("0.00") for child in children)
    
    # Buscar execucao_mensal
    execucoes = db.query(ExecucaoMensal).filter(
        ExecucaoMensal.rubrica_id == rubrica_id,
        ExecucaoMensal.ano == rubrica.exercicio
    ).all()
    
    soma_execucoes = sum(exec.dotacao for exec in execucoes) if execucoes else Decimal("0.00")
    
    # Buscar despesas confirmadas
    from app.models import Despesa, StatusDespesa
    despesas = db.query(Despesa).filter(
        Despesa.rubrica_id == rubrica_id,
        Despesa.exercicio == rubrica.exercicio,
        Despesa.status == StatusDespesa.CONFIRMADA
    ).all()
    
    soma_despesas = sum(desp.valor for desp in despesas) if despesas else Decimal("0.00")
    
    return {
        "rubrica": {
            "id": rubrica.id,
            "codigo": rubrica.codigo,
            "designacao": rubrica.designacao,
            "exercicio": rubrica.exercicio,
            "nivel": rubrica.nivel,
            "parent_id": rubrica.parent_id,
            "status": rubrica.status.value,
            "dotacao_calculada_atual": float(rubrica.dotacao_calculada or Decimal("0.00"))
        },
        "eh_folha": len(children) == 0,
        "filhos": {
            "quantidade": len(children),
            "soma_dotacao_calculada": float(filhos_dotacao),
            "detalhes": [
                {
                    "id": child.id,
                    "codigo": child.codigo,
                    "dotacao_calculada": float(child.dotacao_calculada or Decimal("0.00"))
                }
                for child in children
            ]
        },
        "execucao_mensal": {
            "quantidade": len(execucoes),
            "soma_dotacao": float(soma_execucoes),
            "detalhes": [
                {
                    "mes": exec.mes,
                    "ano": exec.ano,
                    "dotacao": float(exec.dotacao),
                    "gasto": float(exec.gasto),
                    "saldo": float(exec.saldo)
                }
                for exec in execucoes
            ]
        },
        "despesas": {
            "quantidade": len(despesas),
            "soma_valor": float(soma_despesas),
            "detalhes": [
                {
                    "id": desp.id,
                    "valor": float(desp.valor),
                    "mes": desp.mes,
                    "status": desp.status.value
                }
                for desp in despesas[:10]  # Limitar a 10 para não sobrecarregar
            ]
        },
        "analise": {
            "valor_esperado_folha": float(soma_execucoes) if len(children) == 0 else None,
            "valor_esperado_pai": float(filhos_dotacao) if len(children) > 0 else None,
            "valor_atual": float(rubrica.dotacao_calculada or Decimal("0.00")),
            "esta_correto": (
                (len(children) == 0 and abs((rubrica.dotacao_calculada or Decimal("0.00")) - soma_execucoes) < Decimal("0.01")) or
                (len(children) > 0 and abs((rubrica.dotacao_calculada or Decimal("0.00")) - filhos_dotacao) < Decimal("0.01"))
            )
        }
    }
