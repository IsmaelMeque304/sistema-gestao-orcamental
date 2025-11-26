"""
Testes para funções de normalização.
"""
import pytest
from decimal import Decimal
from app.services.importer import normalize_name, normalize_code, parse_currency, parse_date
from datetime import datetime


class TestNormalizeName:
    """Testes para normalize_name."""
    
    def test_basic_normalization(self):
        assert normalize_name("João Silva") == "JOAO SILVA"
        assert normalize_name("  Maria  Santos  ") == "MARIA SANTOS"
    
    def test_remove_accents(self):
        assert normalize_name("José") == "JOSE"
        assert normalize_name("São Paulo") == "SAO PAULO"
        assert normalize_name("Açúcar") == "ACUCAR"
    
    def test_compact_spaces(self):
        assert normalize_name("João    Silva") == "JOAO SILVA"
        assert normalize_name("  Teste   com   espaços  ") == "TESTE COM ESPACOS"
    
    def test_empty_string(self):
        assert normalize_name("") == ""
        assert normalize_name("   ") == ""
    
    def test_none(self):
        assert normalize_name(None) == ""


class TestNormalizeCode:
    """Testes para normalize_code."""
    
    def test_basic_normalization(self):
        assert normalize_code("ABC123") == "ABC123"
        assert normalize_code("  xyz  ") == "XYZ"
    
    def test_uppercase(self):
        assert normalize_code("abc") == "ABC"
        assert normalize_code("Test123") == "TEST123"
    
    def test_empty_string(self):
        assert normalize_code("") == ""
        assert normalize_code("   ") == ""
    
    def test_none(self):
        assert normalize_code(None) == ""


class TestParseCurrency:
    """Testes para parse_currency."""
    
    def test_pt_format(self):
        assert parse_currency("1.234.567,89") == Decimal("1234567.89")
        assert parse_currency("123,45") == Decimal("123.45")
        assert parse_currency("0,50") == Decimal("0.50")
    
    def test_en_format(self):
        assert parse_currency("1,234,567.89") == Decimal("1234567.89")
        assert parse_currency("123.45") == Decimal("123.45")
    
    def test_simple_format(self):
        assert parse_currency("1234.56") == Decimal("1234.56")
        assert parse_currency("1234,56") == Decimal("1234.56")
    
    def test_with_currency_symbol(self):
        assert parse_currency("€1.234,56") == Decimal("1234.56")
        assert parse_currency("$1,234.56") == Decimal("1234.56")
        assert parse_currency("1.234,56 €") == Decimal("1234.56")
    
    def test_with_spaces(self):
        assert parse_currency("1 234,56") == Decimal("1234.56")
        assert parse_currency("  1234.56  ") == Decimal("1234.56")
    
    def test_invalid(self):
        assert parse_currency("abc") is None
        assert parse_currency("") is None
        assert parse_currency("   ") is None
        assert parse_currency(None) is None


class TestParseDate:
    """Testes para parse_date."""
    
    def test_iso_format(self):
        result = parse_date("2024-01-15")
        assert result == datetime(2024, 1, 15)
    
    def test_pt_format(self):
        result = parse_date("15/01/2024")
        assert result == datetime(2024, 1, 15)
        result = parse_date("15-01-2024")
        assert result == datetime(2024, 1, 15)
    
    def test_invalid(self):
        assert parse_date("invalid") is None
        assert parse_date("") is None
        assert parse_date("   ") is None
        assert parse_date(None) is None

