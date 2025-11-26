"""
Testes automatizados para CRUD de Despesas.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.db import Base, get_db
from app.models import Usuario, Rubrica, Fornecedor, Despesa, StatusDespesa, TipoRubrica, StatusRubrica, TipoFornecedor
from app.crud import create_usuario, create_rubrica, create_fornecedor, get_password_hash
from datetime import date, datetime

# Banco de dados de teste em memória
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    """Cria banco de dados de teste para cada teste."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db):
    """Cria cliente de teste."""
    def override_get_db():
        try:
            yield db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def admin_user(db):
    """Cria usuário admin para testes."""
    usuario = Usuario(
        username="admin_test",
        nome="Admin Test",
        senha_hash=get_password_hash("admin123"),
        activo=True
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


@pytest.fixture(scope="function")
def auth_token(client, admin_user):
    """Obtém token de autenticação."""
    response = client.post(
        "/auth/login-json",
        json={"username": "admin_test", "senha": "admin123"}
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture(scope="function")
def rubrica(db, admin_user):
    """Cria rubrica para testes."""
    rubrica = Rubrica(
        codigo="47/H000/1.1.2.1.01",
        designacao="Material de Escritório",
        tipo=TipoRubrica.DESPESA,
        nivel=1,
        dotacao=100000.00,
        exercicio=2024,
        status=StatusRubrica.ATIVA
    )
    db.add(rubrica)
    db.commit()
    db.refresh(rubrica)
    return rubrica


@pytest.fixture(scope="function")
def fornecedor(db, admin_user):
    """Cria fornecedor para testes."""
    usuario = Usuario(
        username="fornecedor_test",
        nome="Fornecedor Test",
        senha_hash=get_password_hash("temp123"),
        activo=True
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    
    fornecedor = Fornecedor(
        usuario_id=usuario.id,
        tipo=TipoFornecedor.PESSOA_COLETIVA,
        activo=True
    )
    db.add(fornecedor)
    db.commit()
    db.refresh(fornecedor)
    return fornecedor


class TestDespesaCRUD:
    """Testes de CRUD de despesas."""
    
    def test_create_despesa(self, client, auth_token, rubrica, fornecedor):
        """Testa criação de despesa."""
        response = client.post(
            "/api/v1/despesas",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "rubrica_id": rubrica.id,
                "fornecedor_id": fornecedor.id,
                "valor": 5000.00,
                "data_emissao": "2024-03-15",
                "exercicio": 2024,
                "mes": 3
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valor"] == 5000.00
        assert data["status"] == "pendente"
        assert data["rubrica_id"] == rubrica.id
        assert data["fornecedor_id"] == fornecedor.id
    
    def test_create_despesa_valor_zero_fails(self, client, auth_token, rubrica):
        """Testa que criação com valor zero falha."""
        response = client.post(
            "/api/v1/despesas",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "rubrica_id": rubrica.id,
                "valor": 0,
                "exercicio": 2024,
                "mes": 3
            }
        )
        assert response.status_code == 400
    
    def test_create_despesa_data_fora_exercicio_fails(self, client, auth_token, rubrica):
        """Testa que criação com data fora do exercício falha."""
        response = client.post(
            "/api/v1/despesas",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "rubrica_id": rubrica.id,
                "valor": 5000.00,
                "data_emissao": "2023-03-15",  # Ano diferente do exercício
                "exercicio": 2024,
                "mes": 3
            }
        )
        assert response.status_code == 400
        assert "exercício" in response.json()["detail"].lower()
    
    def test_update_despesa(self, client, auth_token, rubrica, fornecedor, db):
        """Testa atualização de despesa."""
        # Cria despesa
        despesa = Despesa(
            rubrica_id=rubrica.id,
            fornecedor_id=fornecedor.id,
            valor=5000.00,
            data_emissao=date(2024, 3, 15),
            exercicio=2024,
            mes=3,
            status=StatusDespesa.PENDENTE
        )
        db.add(despesa)
        db.commit()
        db.refresh(despesa)
        
        # Atualiza
        response = client.put(
            f"/api/v1/despesas/{despesa.id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "valor": 6000.00
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valor"] == 6000.00
    
    def test_update_despesa_confirmada_blocked(self, client, auth_token, rubrica, fornecedor, db):
        """Testa que edição de despesa confirmada é bloqueada (não admin)."""
        # Cria despesa confirmada
        despesa = Despesa(
            rubrica_id=rubrica.id,
            fornecedor_id=fornecedor.id,
            valor=5000.00,
            data_emissao=date(2024, 3, 15),
            exercicio=2024,
            mes=3,
            status=StatusDespesa.CONFIRMADA
        )
        db.add(despesa)
        db.commit()
        db.refresh(despesa)
        
        # Tenta atualizar (deve falhar para não-admin)
        response = client.put(
            f"/api/v1/despesas/{despesa.id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "valor": 6000.00
            }
        )
        # Pode retornar 400 ou 403 dependendo da implementação
        assert response.status_code in [400, 403]
    
    def test_confirm_despesa(self, client, auth_token, rubrica, fornecedor, db):
        """Testa confirmação de despesa."""
        # Cria despesa pendente
        despesa = Despesa(
            rubrica_id=rubrica.id,
            fornecedor_id=fornecedor.id,
            valor=5000.00,
            data_emissao=date(2024, 3, 15),
            exercicio=2024,
            mes=3,
            status=StatusDespesa.PENDENTE
        )
        db.add(despesa)
        db.commit()
        db.refresh(despesa)
        
        # Confirma
        response = client.post(
            f"/api/v1/despesas/{despesa.id}/confirm",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "confirmada"
    
    def test_delete_despesa(self, client, auth_token, rubrica, fornecedor, db):
        """Testa cancelamento (soft delete) de despesa."""
        # Cria despesa
        despesa = Despesa(
            rubrica_id=rubrica.id,
            fornecedor_id=fornecedor.id,
            valor=5000.00,
            data_emissao=date(2024, 3, 15),
            exercicio=2024,
            mes=3,
            status=StatusDespesa.PENDENTE
        )
        db.add(despesa)
        db.commit()
        db.refresh(despesa)
        
        # Cancela
        response = client.delete(
            f"/api/v1/despesas/{despesa.id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        # Verifica que status mudou para cancelada
        response = client.get(
            f"/api/v1/despesas/{despesa.id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "cancelada"
    
    def test_list_despesas_with_filters(self, client, auth_token, rubrica, fornecedor, db):
        """Testa listagem de despesas com filtros."""
        # Cria despesas
        for i in range(3):
            despesa = Despesa(
                rubrica_id=rubrica.id,
                fornecedor_id=fornecedor.id,
                valor=1000.00 * (i + 1),
                data_emissao=date(2024, 3, 15 + i),
                exercicio=2024,
                mes=3,
                status=StatusDespesa.PENDENTE if i < 2 else StatusDespesa.CONFIRMADA
            )
            db.add(despesa)
        db.commit()
        
        # Lista todas
        response = client.get(
            "/api/v1/despesas",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        assert len(response.json()) >= 3
        
        # Filtra por status
        response = client.get(
            "/api/v1/despesas?status=pendente",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert all(d["status"] == "pendente" for d in data)
        
        # Filtra por rubrica
        response = client.get(
            f"/api/v1/despesas?rubrica_id={rubrica.id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert all(d["rubrica_id"] == rubrica.id for d in data)

