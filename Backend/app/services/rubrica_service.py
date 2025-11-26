"""
Serviço para gerenciar dotação agregada de rubricas por hierarquia.
"""
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from decimal import Decimal
from app.models import Rubrica


def get_children(session: Session, rubrica_id: int) -> List[Rubrica]:
    """Retorna todas as rubricas filhas diretas."""
    return session.query(Rubrica).filter(
        Rubrica.parent_id == rubrica_id
    ).all()


def get_all_descendants(session: Session, rubrica_id: int) -> List[Rubrica]:
    """Retorna todas as rubricas descendentes (filhas, netas, etc.) usando CTE recursivo."""
    try:
        query = text("""
            WITH RECURSIVE descendants AS (
                -- Anchor: rubrica inicial
                SELECT id, parent_id, codigo, designacao
                FROM rubrica
                WHERE parent_id = :rubrica_id
                
                UNION ALL
                
                -- Recursive: filhos dos filhos
                SELECT r.id, r.parent_id, r.codigo, r.designacao
                FROM rubrica r
                INNER JOIN descendants d ON r.parent_id = d.id
            )
            SELECT id FROM descendants
        """)
        
        result = session.execute(query, {"rubrica_id": rubrica_id})
        ids = [row[0] for row in result]
        
        if ids:
            return session.query(Rubrica).filter(Rubrica.id.in_(ids)).all()
        return []
    except Exception:
        # Fallback: busca simples sem CTE (para MySQL < 8 ou erro)
        return get_children(session, rubrica_id)


def get_ancestors(session: Session, rubrica_id: int) -> List[Rubrica]:
    """
    Retorna todos os ancestrais de uma rubrica (pai, avô, etc.) incluindo a própria rubrica.
    Usa CTE recursivo do MySQL 8+.
    """
    try:
        query = text("""
            WITH RECURSIVE ancestors AS (
                -- Anchor: rubrica inicial
                SELECT id, parent_id, codigo, designacao
                FROM rubrica
                WHERE id = :rubrica_id
                
                UNION ALL
                
                -- Recursive: pai do pai
                SELECT r.id, r.parent_id, r.codigo, r.designacao
                FROM rubrica r
                INNER JOIN ancestors a ON r.id = a.parent_id
            )
            SELECT id FROM ancestors
        """)
        
        result = session.execute(query, {"rubrica_id": rubrica_id})
        ids = [row[0] for row in result]
        
        if ids:
            return session.query(Rubrica).filter(Rubrica.id.in_(ids)).all()
        return []
    except Exception:
        # Fallback: busca iterativa sem CTE
        ancestors = []
        current_id = rubrica_id
        
        while current_id:
            rubrica = session.query(Rubrica).filter(Rubrica.id == current_id).first()
            if not rubrica:
                break
            ancestors.append(rubrica)
            current_id = rubrica.parent_id
        
        return ancestors


def recalculate_dotacao_chain(session: Session, rubrica_id: int) -> None:
    """
    Recalcula dotacao_calculada para uma rubrica e todos os seus ancestrais.
    
    Lógica:
    - Se rubrica tem filhos → dotacao_calculada = soma(dotacao_calculada dos filhos)
    - Se rubrica é folha → dotacao_calculada = dotacao_inicial (ou 0 se None)
    
    Atualiza todos os ancestrais recursivamente.
    Processa do mais profundo para o mais alto (folhas primeiro).
    """
    try:
        # Obter todos os ancestrais (incluindo a própria rubrica)
        ancestors = get_ancestors(session, rubrica_id)
        
        if not ancestors:
            # Se não há ancestrais, buscar a própria rubrica
            rubrica = session.query(Rubrica).filter(Rubrica.id == rubrica_id).first()
            if not rubrica:
                return
            ancestors = [rubrica]
    except Exception as e:
        import logging
        logging.warning(f"Erro ao buscar ancestrais para rubrica {rubrica_id}: {e}")
        # Se houver erro, buscar apenas a própria rubrica
        try:
            rubrica = session.query(Rubrica).filter(Rubrica.id == rubrica_id).first()
            if not rubrica:
                return
            ancestors = [rubrica]
        except:
            return
    
    # Buscar todas as rubricas do mesmo exercício para garantir que temos filhos atualizados
    from app.models import StatusRubrica
    if ancestors:
        exercicio = ancestors[0].exercicio
        from sqlalchemy.orm import defer
        # Buscar TODAS as rubricas do exercício (ativas e inativas) para cálculo correto
        # Mas apenas calcular dotacao_calculada para ativas
        all_rubricas = session.query(Rubrica).filter(
            Rubrica.exercicio == exercicio
        ).all()
    else:
        all_rubricas = []
    
    # Criar dicionário por ID
    rubricas_dict = {r.id: r for r in all_rubricas}
    
    # Processar do mais profundo para o mais alto (folhas primeiro, depois pais)
    # Ordenar por nível descendente (maior nível primeiro)
    ancestors_sorted = sorted(ancestors, key=lambda r: r.nivel, reverse=True)
    
    # Cache para evitar recálculos desnecessários dentro da mesma execução
    calculated_cache = {}
    
    def calculate_node(node_id: int) -> Decimal:
        """Calcula dotacao_calculada de um nó recursivamente."""
        # Verificar cache primeiro
        if node_id in calculated_cache:
            return calculated_cache[node_id]
        
        node = rubricas_dict.get(node_id)
        if not node:
            return Decimal("0.00")
        
        # Buscar filhos diretos (apenas do mesmo exercício e ativos)
        from app.models import StatusRubrica
        children = [
            r for r in all_rubricas 
            if r.parent_id == node_id 
            and r.exercicio == node.exercicio
            and r.status == StatusRubrica.ATIVA
        ]
        
        if children:
            # Rubrica pai: soma das dotacoes_calculadas dos filhos
            # IMPORTANTE: Recalcular cada filho primeiro para garantir valores atualizados
            total = Decimal("0.00")
            for child in children:
                # Sempre recalcular o filho para garantir valor atualizado
                child_calc = calculate_node(child.id)
                # Atualizar no dicionário e no cache
                child.dotacao_calculada = child_calc
                calculated_cache[child.id] = child_calc
                session.add(child)
                total += child_calc
            
            node.dotacao_calculada = total
            calculated_cache[node_id] = total
        else:
            # Rubrica folha: dotacao_calculada = dotacao_inicial
            # dotacao_inicial é a dotação anual inicial da rubrica folha
            # Usar getattr para evitar erro se a coluna não existir no banco
            dotacao_inicial = getattr(node, 'dotacao_inicial', None)
            result = dotacao_inicial if dotacao_inicial is not None else Decimal("0.00")
            node.dotacao_calculada = result
            calculated_cache[node_id] = result
        
        session.add(node)
        return calculated_cache[node_id]
    
    # Calcular para todos os ancestrais
    for ancestor in ancestors_sorted:
        calculate_node(ancestor.id)
    
    session.flush()


def is_leaf_rubrica(session: Session, rubrica_id: int) -> bool:
    """Verifica se uma rubrica é folha (não tem filhos)."""
    children = get_children(session, rubrica_id)
    return len(children) == 0


def has_children(session: Session, rubrica_id: int) -> bool:
    """Verifica se uma rubrica tem filhos."""
    return not is_leaf_rubrica(session, rubrica_id)

