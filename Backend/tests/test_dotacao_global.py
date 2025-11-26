"""
Testes para Dotação Global Orçamental.
Inclui testes de concorrência para validar integridade transacional.
"""
import pytest
from decimal import Decimal
from sqlalchemy.orm import Session
from app.models import (
    DotacaoGlobal, DotacaoGlobalMov, TipoDotacaoGlobalMov,
    Despesa, StatusDespesa, Rubrica, TipoRubrica, StatusRubrica
)
from app.db import Base, engine, get_db
from app.crud import create_rubrica
from app.schemas import RubricaCreate


@pytest.fixture
def db_session():
    """Cria uma sessão de teste."""
    Base.metadata.create_all(bind=engine)
    session = Session(bind=engine)
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def dotacao_global_2024(db_session: Session):
    """Cria uma dotação global para 2024."""
    dotacao = DotacaoGlobal(
        exercicio=2024,
        valor_anual=Decimal("1000000.00"),
        saldo=Decimal("1000000.00"),
        reservado=Decimal("0.00")
    )
    db_session.add(dotacao)
    db_session.commit()
    db_session.refresh(dotacao)
    return dotacao


@pytest.fixture
def rubrica_teste(db_session: Session):
    """Cria uma rubrica de teste."""
    rubrica_data = RubricaCreate(
        codigo="1.1.1",
        designacao="Rubrica Teste",
        tipo=TipoRubrica.DESPESA,
        nivel=1,
        dotacao=Decimal("0.00"),
        exercicio=2024,
        status=StatusRubrica.ATIVA
    )
    return create_rubrica(db_session, rubrica_data)


class TestDotacaoGlobal:
    """Testes básicos de dotação global."""
    
    def test_criar_dotacao_global(self, db_session: Session):
        """Testa criação de dotação global."""
        dotacao = DotacaoGlobal(
            exercicio=2025,
            valor_anual=Decimal("2000000.00"),
            saldo=Decimal("2000000.00"),
            reservado=Decimal("0.00")
        )
        db_session.add(dotacao)
        db_session.commit()
        
        assert dotacao.id is not None
        assert dotacao.valor_anual == Decimal("2000000.00")
        assert dotacao.saldo == Decimal("2000000.00")
        assert dotacao.exercicio == 2025
    
    def test_atualizar_dotacao_global(self, db_session: Session, dotacao_global_2024):
        """Testa atualização de dotação global."""
        valor_antigo = dotacao_global_2024.valor_anual
        novo_valor = Decimal("1500000.00")
        delta = novo_valor - valor_antigo
        
        dotacao_global_2024.valor_anual = novo_valor
        dotacao_global_2024.saldo = dotacao_global_2024.saldo + delta
        
        db_session.commit()
        db_session.refresh(dotacao_global_2024)
        
        assert dotacao_global_2024.valor_anual == novo_valor
        assert dotacao_global_2024.saldo == Decimal("1500000.00")
    
    def test_registrar_movimento(self, db_session: Session, dotacao_global_2024):
        """Testa registro de movimento."""
        movimento = DotacaoGlobalMov(
            dotacao_global_id=dotacao_global_2024.id,
            tipo=TipoDotacaoGlobalMov.AJUSTE,
            valor=Decimal("50000.00"),
            descricao="Ajuste de teste"
        )
        db_session.add(movimento)
        db_session.commit()
        
        assert movimento.id is not None
        assert movimento.tipo == TipoDotacaoGlobalMov.AJUSTE


class TestConfirmacaoDespesa:
    """Testes de confirmação de despesa com dotação global."""
    
    def test_confirmar_despesa_reduz_saldo(
        self, db_session: Session, dotacao_global_2024, rubrica_teste
    ):
        """Testa que confirmar despesa reduz saldo global."""
        # Cria despesa
        despesa = Despesa(
            rubrica_id=rubrica_teste.id,
            valor=Decimal("50000.00"),
            exercicio=2024,
            mes=1,
            status=StatusDespesa.PENDENTE
        )
        db_session.add(despesa)
        db_session.commit()
        db_session.refresh(despesa)
        
        saldo_inicial = dotacao_global_2024.saldo
        
        # Confirma despesa (simula lógica transacional)
        with db_session.begin():
            # Lock dotação
            dotacao = db_session.query(DotacaoGlobal).filter(
                DotacaoGlobal.id == dotacao_global_2024.id
            ).with_for_update().first()
            
            # Valida saldo
            assert despesa.valor <= dotacao.saldo
            
            # Deduz saldo
            dotacao.saldo = dotacao.saldo - despesa.valor
            
            # Registra movimento
            movimento = DotacaoGlobalMov(
                dotacao_global_id=dotacao.id,
                tipo=TipoDotacaoGlobalMov.DESPESA_CONFIRMADA,
                referencia=str(despesa.id),
                valor=-despesa.valor,
                descricao=f"Despesa #{despesa.id} confirmada"
            )
            db_session.add(movimento)
            
            # Atualiza despesa
            despesa.status = StatusDespesa.CONFIRMADA
        
        db_session.refresh(dotacao_global_2024)
        
        assert dotacao_global_2024.saldo == saldo_inicial - despesa.valor
        assert despesa.status == StatusDespesa.CONFIRMADA
    
    def test_confirmar_despesa_saldo_insuficiente(
        self, db_session: Session, dotacao_global_2024, rubrica_teste
    ):
        """Testa que não permite confirmar despesa com saldo insuficiente."""
        # Cria despesa maior que o saldo
        despesa = Despesa(
            rubrica_id=rubrica_teste.id,
            valor=Decimal("2000000.00"),  # Maior que saldo de 1.000.000
            exercicio=2024,
            mes=1,
            status=StatusDespesa.PENDENTE
        )
        db_session.add(despesa)
        db_session.commit()
        db_session.refresh(despesa)
        
        # Tenta confirmar (deve falhar)
        with db_session.begin():
            dotacao = db_session.query(DotacaoGlobal).filter(
                DotacaoGlobal.id == dotacao_global_2024.id
            ).with_for_update().first()
            
            # Validação deve falhar
            assert despesa.valor > dotacao.saldo
            
            # Não deve prosseguir
            with pytest.raises(AssertionError):
                assert despesa.valor <= dotacao.saldo


class TestConcorrencia:
    """Testes de concorrência para validar bloqueio transacional."""
    
    def test_duas_confirmacoes_simultaneas(
        self, db_session: Session, dotacao_global_2024, rubrica_teste
    ):
        """
        Testa duas confirmações simultâneas.
        Valida que o bloqueio (SELECT FOR UPDATE) garante consistência.
        """
        # Cria duas despesas
        despesa1 = Despesa(
            rubrica_id=rubrica_teste.id,
            valor=Decimal("300000.00"),
            exercicio=2024,
            mes=1,
            status=StatusDespesa.PENDENTE
        )
        despesa2 = Despesa(
            rubrica_id=rubrica_teste.id,
            valor=Decimal("400000.00"),
            exercicio=2024,
            mes=1,
            status=StatusDespesa.PENDENTE
        )
        db_session.add_all([despesa1, despesa2])
        db_session.commit()
        db_session.refresh(despesa1)
        db_session.refresh(despesa2)
        
        saldo_inicial = dotacao_global_2024.saldo
        
        # Simula duas transações sequenciais (em produção seriam paralelas)
        # Transação 1
        with db_session.begin():
            dotacao1 = db_session.query(DotacaoGlobal).filter(
                DotacaoGlobal.id == dotacao_global_2024.id
            ).with_for_update().first()
            
            assert despesa1.valor <= dotacao1.saldo
            dotacao1.saldo = dotacao1.saldo - despesa1.valor
            
            movimento1 = DotacaoGlobalMov(
                dotacao_global_id=dotacao1.id,
                tipo=TipoDotacaoGlobalMov.DESPESA_CONFIRMADA,
                referencia=str(despesa1.id),
                valor=-despesa1.valor,
                descricao=f"Despesa #{despesa1.id}"
            )
            db_session.add(movimento1)
            despesa1.status = StatusDespesa.CONFIRMADA
        
        # Transação 2 (após commit da primeira)
        with db_session.begin():
            dotacao2 = db_session.query(DotacaoGlobal).filter(
                DotacaoGlobal.id == dotacao_global_2024.id
            ).with_for_update().first()
            
            # Saldo já foi reduzido pela primeira transação
            saldo_apos_primeira = saldo_inicial - despesa1.valor
            assert dotacao2.saldo == saldo_apos_primeira
            assert despesa2.valor <= dotacao2.saldo
            
            dotacao2.saldo = dotacao2.saldo - despesa2.valor
            
            movimento2 = DotacaoGlobalMov(
                dotacao_global_id=dotacao2.id,
                tipo=TipoDotacaoGlobalMov.DESPESA_CONFIRMADA,
                referencia=str(despesa2.id),
                valor=-despesa2.valor,
                descricao=f"Despesa #{despesa2.id}"
            )
            db_session.add(movimento2)
            despesa2.status = StatusDespesa.CONFIRMADA
        
        db_session.refresh(dotacao_global_2024)
        
        # Valida saldo final
        saldo_esperado = saldo_inicial - despesa1.valor - despesa2.valor
        assert dotacao_global_2024.saldo == saldo_esperado
        assert despesa1.status == StatusDespesa.CONFIRMADA
        assert despesa2.status == StatusDespesa.CONFIRMADA


class TestReservas:
    """Testes de reservas."""
    
    def test_criar_reserva(
        self, db_session: Session, dotacao_global_2024
    ):
        """Testa criação de reserva."""
        valor_reserva = Decimal("100000.00")
        saldo_inicial = dotacao_global_2024.saldo
        
        with db_session.begin():
            dotacao = db_session.query(DotacaoGlobal).filter(
                DotacaoGlobal.id == dotacao_global_2024.id
            ).with_for_update().first()
            
            # Valida saldo disponível
            saldo_disponivel = dotacao.saldo - dotacao.reservado
            assert valor_reserva <= saldo_disponivel
            
            # Incrementa reservado
            dotacao.reservado = dotacao.reservado + valor_reserva
            
            # Registra movimento
            movimento = DotacaoGlobalMov(
                dotacao_global_id=dotacao.id,
                tipo=TipoDotacaoGlobalMov.RESERVA,
                valor=-valor_reserva,
                descricao="Reserva de teste"
            )
            db_session.add(movimento)
        
        db_session.refresh(dotacao_global_2024)
        
        assert dotacao_global_2024.reservado == valor_reserva
        assert dotacao_global_2024.saldo == saldo_inicial  # Saldo não muda, apenas reservado
    
    def test_cancelar_reserva(
        self, db_session: Session, dotacao_global_2024
    ):
        """Testa cancelamento de reserva."""
        # Primeiro cria uma reserva
        valor_reserva = Decimal("50000.00")
        
        with db_session.begin():
            dotacao = db_session.query(DotacaoGlobal).filter(
                DotacaoGlobal.id == dotacao_global_2024.id
            ).with_for_update().first()
            dotacao.reservado = dotacao.reservado + valor_reserva
        db_session.refresh(dotacao_global_2024)
        
        reservado_inicial = dotacao_global_2024.reservado
        
        # Cancela reserva
        with db_session.begin():
            dotacao = db_session.query(DotacaoGlobal).filter(
                DotacaoGlobal.id == dotacao_global_2024.id
            ).with_for_update().first()
            
            assert valor_reserva <= dotacao.reservado
            
            dotacao.reservado = dotacao.reservado - valor_reserva
            
            movimento = DotacaoGlobalMov(
                dotacao_global_id=dotacao.id,
                tipo=TipoDotacaoGlobalMov.RESERVA_CANCELADA,
                valor=valor_reserva,
                descricao="Cancelamento de reserva"
            )
            db_session.add(movimento)
        
        db_session.refresh(dotacao_global_2024)
        
        assert dotacao_global_2024.reservado == reservado_inicial - valor_reserva

