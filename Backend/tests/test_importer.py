"""
Testes para o serviço de importação (dry-run).
"""
import pytest
from decimal import Decimal
from datetime import datetime
from app.services.importer import ImportProcessor, FornecedorMatcher, RubricaMatcher
from app.schemas import ColumnMapping
from sqlalchemy.orm import Session


@pytest.fixture
def mock_db_session(mocker):
    """Mock de sessão do banco."""
    return mocker.Mock(spec=Session)


@pytest.fixture
def sample_mapping():
    """Mapping de exemplo."""
    return ColumnMapping(
        codigo_rubrica="codigo",
        fornecedor="fornecedor",
        valor="valor",
        data="data",
        ordem_pagamento="op",
        justificativo="justificativo",
        requisicao="requisicao"
    )


class TestFornecedorMatcher:
    """Testes para matching de fornecedores."""
    
    def test_match_by_nuit(self, mock_db_session):
        """Testa matching por NUIT."""
        matcher = FornecedorMatcher(mock_db_session)
        # Mock seria necessário para testar completamente
        # Por enquanto, apenas verifica que a classe pode ser instanciada
        assert matcher is not None


class TestRubricaMatcher:
    """Testes para matching de rubricas."""
    
    def test_match_existing_rubrica(self, mock_db_session):
        """Testa matching de rubrica existente."""
        matcher = RubricaMatcher(mock_db_session, exercicio=2024)
        # Mock seria necessário
        assert matcher is not None


class TestImportProcessor:
    """Testes para processador de importação."""
    
    def test_process_row_valid(self, mock_db_session, sample_mapping):
        """Testa processamento de linha válida."""
        processor = ImportProcessor(mock_db_session, user_id=1, exercicio=2024)
        
        row = {
            "codigo": "1.1.1",
            "fornecedor": "Fornecedor Teste",
            "valor": "1.234,56",
            "data": "15/01/2024",
            "op": "OP001",
            "justificativo": "Teste",
            "requisicao": "REQ001"
        }
        
        resultado = processor.process_row(row, sample_mapping, linha_numero=1)
        
        assert resultado["despesa_data"] is not None
        assert resultado["despesa_data"]["valor"] == Decimal("1234.56")
        assert len(resultado["erros"]) == 0
    
    def test_process_row_missing_required(self, mock_db_session, sample_mapping):
        """Testa processamento de linha com campos obrigatórios faltando."""
        processor = ImportProcessor(mock_db_session, user_id=1, exercicio=2024)
        
        row = {
            "codigo": "",
            "fornecedor": "",
            "valor": "abc"
        }
        
        resultado = processor.process_row(row, sample_mapping, linha_numero=1)
        
        assert len(resultado["erros"]) > 0
        assert resultado["despesa_data"] is None
    
    def test_process_row_invalid_value(self, mock_db_session, sample_mapping):
        """Testa processamento com valor inválido."""
        processor = ImportProcessor(mock_db_session, user_id=1, exercicio=2024)
        
        row = {
            "codigo": "1.1.1",
            "fornecedor": "Fornecedor",
            "valor": "invalid"
        }
        
        resultado = processor.process_row(row, sample_mapping, linha_numero=1)
        
        assert len(resultado["erros"]) > 0

