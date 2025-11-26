"""
Script para verificar registros de execucao_mensal criados.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models import ExecucaoMensal, Rubrica, Despesa, StatusDespesa
from sqlalchemy import func, and_

def verificar_execucao_mensal(exercicio: int = 2025):
    """Verifica registros de execucao_mensal."""
    
    db = SessionLocal()
    
    try:
        print("=" * 60)
        print(f"Verificação Execução Mensal - Exercício {exercicio}")
        print("=" * 60)
        
        # Contar registros
        total = db.query(ExecucaoMensal).filter(
            ExecucaoMensal.ano == exercicio
        ).count()
        print(f"\nTotal de registros: {total}")
        
        # Mostrar alguns exemplos com despesas
        print("\nExemplos de registros com despesas confirmadas:")
        print("-" * 60)
        
        # Buscar execucao_mensal que têm gasto > 0
        execucoes_com_gasto = db.query(ExecucaoMensal).filter(
            and_(
                ExecucaoMensal.ano == exercicio,
                ExecucaoMensal.gasto > 0
            )
        ).limit(5).all()
        
        for exec in execucoes_com_gasto:
            rubrica = db.query(Rubrica).filter(Rubrica.id == exec.rubrica_id).first()
            # Verificar despesas confirmadas
            despesas = db.query(Despesa).filter(
                and_(
                    Despesa.rubrica_id == exec.rubrica_id,
                    Despesa.mes == exec.mes,
                    Despesa.exercicio == exercicio,
                    Despesa.status == StatusDespesa.CONFIRMADA
                )
            ).all()
            
            print(f"\nRubrica: {rubrica.codigo if rubrica else 'N/A'} - {rubrica.designacao[:50] if rubrica else 'N/A'}")
            print(f"  Mês: {exec.mes}/{exec.ano}")
            print(f"  Dotação: {exec.dotacao:,.2f}")
            print(f"  Gasto: {exec.gasto:,.2f}")
            print(f"  Saldo: {exec.saldo:,.2f}")
            print(f"  Despesas confirmadas: {len(despesas)}")
            if despesas:
                soma_despesas = sum(d.valor for d in despesas)
                print(f"  Soma das despesas: {soma_despesas:,.2f}")
                print(f"  ✅ Gasto coincide: {exec.gasto == soma_despesas}")
        
        # Estatísticas gerais
        print("\n" + "=" * 60)
        print("Estatísticas Gerais:")
        print("-" * 60)
        
        total_dotacao = db.query(func.sum(ExecucaoMensal.dotacao)).filter(
            ExecucaoMensal.ano == exercicio
        ).scalar() or 0
        
        total_gasto = db.query(func.sum(ExecucaoMensal.gasto)).filter(
            ExecucaoMensal.ano == exercicio
        ).scalar() or 0
        
        total_saldo = db.query(func.sum(ExecucaoMensal.saldo)).filter(
            ExecucaoMensal.ano == exercicio
        ).scalar() or 0
        
        print(f"Total de Dotação (soma de todos os meses): {total_dotacao:,.2f}")
        print(f"Total de Gasto: {total_gasto:,.2f}")
        print(f"Total de Saldo: {total_saldo:,.2f}")
        
        # Verificar se dotacao_calculada / 12 está sendo usado corretamente
        print("\n" + "=" * 60)
        print("Verificação: Dotação Mensal = Dotação Calculada / 12")
        print("-" * 60)
        
        rubricas_com_dotacao = db.query(Rubrica).filter(
            Rubrica.exercicio == exercicio,
            Rubrica.dotacao_calculada.isnot(None),
            Rubrica.dotacao_calculada > 0
        ).limit(3).all()
        
        for rubrica in rubricas_com_dotacao:
            execucoes = db.query(ExecucaoMensal).filter(
                and_(
                    ExecucaoMensal.rubrica_id == rubrica.id,
                    ExecucaoMensal.ano == exercicio
                )
            ).all()
            
            if execucoes:
                dotacao_mensal_esperada = rubrica.dotacao_calculada / 12
                dotacao_mensal_real = execucoes[0].dotacao
                
                print(f"\nRubrica: {rubrica.codigo}")
                print(f"  Dotação Calculada Anual: {rubrica.dotacao_calculada:,.2f}")
                print(f"  Dotação Mensal Esperada: {dotacao_mensal_esperada:,.2f}")
                print(f"  Dotação Mensal Real: {dotacao_mensal_real:,.2f}")
                print(f"  ✅ Coincide: {abs(dotacao_mensal_esperada - dotacao_mensal_real) < 0.01}")
        
        print("\n" + "=" * 60)
        print("✅ Verificação concluída!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Erro durante verificação: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    exercicio = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
    verificar_execucao_mensal(exercicio)

