"""
Script para limpar registros de execucao_mensal sem despesas confirmadas.
Remove registros onde gasto = 0 e não há despesas confirmadas.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models import ExecucaoMensal, Despesa, StatusDespesa
from sqlalchemy import and_, func
from decimal import Decimal

def limpar_execucao_mensal_vazia(exercicio: int = 2025):
    """Remove registros de execucao_mensal sem despesas confirmadas."""
    
    db = SessionLocal()
    
    try:
        print("=" * 60)
        print(f"Limpar Execução Mensal Vazia - Exercício {exercicio}")
        print("=" * 60)
        
        # Contar registros antes
        total_antes = db.query(ExecucaoMensal).filter(
            ExecucaoMensal.ano == exercicio
        ).count()
        print(f"\nRegistros existentes antes: {total_antes}")
        
        # Buscar todos os registros do exercício
        execucoes = db.query(ExecucaoMensal).filter(
            ExecucaoMensal.ano == exercicio
        ).all()
        
        removidos = 0
        mantidos = 0
        
        print("\nVerificando registros...")
        for exec in execucoes:
            # Verificar se há despesas confirmadas para este mês/rubrica
            gasto_real = db.query(func.sum(Despesa.valor)).filter(
                and_(
                    Despesa.rubrica_id == exec.rubrica_id,
                    Despesa.mes == exec.mes,
                    Despesa.exercicio == exercicio,
                    Despesa.status == StatusDespesa.CONFIRMADA
                )
            ).scalar() or Decimal("0.00")
            
            # Se não há gasto real (sem despesas confirmadas), remover
            if gasto_real == 0 and exec.gasto == 0:
                print(f"  Removendo: Rubrica {exec.rubrica_id}, Mês {exec.mes} (sem despesas confirmadas)")
                db.delete(exec)
                removidos += 1
            else:
                # Atualizar gasto e saldo se necessário
                if exec.gasto != gasto_real:
                    exec.gasto = gasto_real
                    exec.saldo = exec.dotacao - gasto_real
                    print(f"  Atualizando: Rubrica {exec.rubrica_id}, Mês {exec.mes} (gasto: {exec.gasto})")
                mantidos += 1
        
        db.commit()
        
        # Contar registros depois
        total_depois = db.query(ExecucaoMensal).filter(
            ExecucaoMensal.ano == exercicio
        ).count()
        
        print("\n" + "=" * 60)
        print("RESUMO")
        print("=" * 60)
        print(f"Registros antes: {total_antes}")
        print(f"Registros depois: {total_depois}")
        print(f"Registros removidos: {removidos}")
        print(f"Registros mantidos: {mantidos}")
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
    success = limpar_execucao_mensal_vazia(exercicio)
    sys.exit(0 if success else 1)

