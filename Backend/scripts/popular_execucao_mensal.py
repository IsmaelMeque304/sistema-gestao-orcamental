"""
Script para popular execucao_mensal diretamente no banco de dados.
Uso: python scripts/popular_execucao_mensal.py [exercicio]
"""
import sys
import os

# Adicionar o diretório do projeto ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models import ExecucaoMensal, Rubrica, Despesa, StatusDespesa, StatusRubrica
from app.services.rubrica_service import recalculate_dotacao_chain
from app.crud import recalculate_execucao_mensal
from sqlalchemy import func, and_
from decimal import Decimal

def popular_execucao_mensal_script(exercicio: int = 2025):
    """Popula execucao_mensal para um exercício."""
    
    db = SessionLocal()
    
    try:
        print("=" * 60)
        print(f"Popular Execução Mensal - Exercício {exercicio}")
        print("=" * 60)
        
        # Verificar estado antes
        count_antes = db.query(ExecucaoMensal).filter(
            ExecucaoMensal.ano == exercicio
        ).count()
        print(f"\nRegistros existentes antes: {count_antes}")
        
        # Buscar todas as rubricas ativas do exercício
        rubricas = db.query(Rubrica).filter(
            Rubrica.exercicio == exercicio,
            Rubrica.status == StatusRubrica.ATIVA
        ).all()
        
        if not rubricas:
            print(f"\n❌ Nenhuma rubrica ativa encontrada para o exercício {exercicio}")
            return False
        
        print(f"Rubricas encontradas: {len(rubricas)}")
        
        # Primeiro, garantir que dotacao_calculada está atualizada
        print("\n1. Recalculando dotacao_calculada para todas as rubricas...")
        rubricas_ordenadas = sorted(rubricas, key=lambda r: r.nivel, reverse=True)
        for i, rubrica in enumerate(rubricas_ordenadas, 1):
            try:
                recalculate_dotacao_chain(db, rubrica.id)
                if i % 50 == 0:
                    print(f"   Processadas {i}/{len(rubricas_ordenadas)} rubricas...")
            except Exception as e:
                print(f"   ⚠️  Erro ao recalcular dotação para rubrica {rubrica.id}: {e}")
        db.commit()
        print(f"   ✅ Dotação recalculada para {len(rubricas_ordenadas)} rubricas")
        
        # Buscar todas as despesas confirmadas do exercício
        print("\n2. Buscando despesas confirmadas...")
        despesas_confirmadas = db.query(Despesa).filter(
            Despesa.exercicio == exercicio,
            Despesa.status == StatusDespesa.CONFIRMADA,
            Despesa.rubrica_id.isnot(None)
        ).all()
        print(f"   Despesas confirmadas encontradas: {len(despesas_confirmadas)}")
        
        # Agrupar despesas por (rubrica_id, mes)
        despesas_por_rubrica_mes = {}
        for despesa in despesas_confirmadas:
            key = (despesa.rubrica_id, despesa.mes)
            if key not in despesas_por_rubrica_mes:
                despesas_por_rubrica_mes[key] = []
            despesas_por_rubrica_mes[key].append(despesa)
        
        print(f"   Combinações (rubrica, mês) com despesas: {len(despesas_por_rubrica_mes)}")
        
        # Criar/atualizar execucao_mensal APENAS para combinações (rubrica, mês) que têm despesas confirmadas
        print("\n3. Criando/atualizando execucao_mensal APENAS para rubricas/meses com despesas confirmadas...")
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
                print(f"   ⚠️  Erro: Rubrica {rubrica_id}, Mês {mes}: {e}")
        
        print(f"   ✅ Criadas: {criadas}, Atualizadas: {atualizadas}")
        
        db.commit()
        
        # Verificar estado depois
        count_depois = db.query(ExecucaoMensal).filter(
            ExecucaoMensal.ano == exercicio
        ).count()
        
        print(f"\n" + "=" * 60)
        print(f"RESUMO")
        print("=" * 60)
        print(f"Registros antes: {count_antes}")
        print(f"Registros depois: {count_depois}")
        print(f"Novos registros criados: {count_depois - count_antes}")
        print(f"Total criadas: {criadas}")
        print(f"Total atualizadas: {atualizadas}")
        if erros:
            print(f"Erros: {len(erros)}")
            for erro in erros[:10]:  # Mostrar apenas os 10 primeiros
                print(f"  - {erro}")
            if len(erros) > 10:
                print(f"  ... e mais {len(erros) - 10} erros")
        else:
            print(f"✅ Nenhum erro encontrado")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n❌ Erro durante execução: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    exercicio = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
    success = popular_execucao_mensal_script(exercicio)
    sys.exit(0 if success else 1)

