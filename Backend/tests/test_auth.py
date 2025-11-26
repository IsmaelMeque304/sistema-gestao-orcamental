"""
Testes automatizados para autenticação.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.db import Base, get_db
from app.models import Usuario
from app.crud import get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_auth.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    """Cria banco de dados de teste."""
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
def test_user(db):
    """Cria usuário de teste."""
    usuario = Usuario(
        username="testuser",
        nome="Test User",
        senha_hash=get_password_hash("test123"),
        activo=True
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


class TestAuth:
    """Testes de autenticação."""
    
    def test_login_success(self, client, test_user):
        """Testa login bem-sucedido."""
        response = client.post(
            "/auth/login-json",
            json={"username": "testuser", "senha": "test123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "user" in data
        assert data["user"]["username"] == "testuser"
    
    def test_login_wrong_password(self, client, test_user):
        """Testa login com senha incorreta."""
        response = client.post(
            "/auth/login-json",
            json={"username": "testuser", "senha": "wrongpassword"}
        )
        assert response.status_code == 401
    
    def test_login_nonexistent_user(self, client):
        """Testa login com usuário inexistente."""
        response = client.post(
            "/auth/login-json",
            json={"username": "nonexistent", "senha": "password"}
        )
        assert response.status_code == 401
    
    def test_login_inactive_user(self, client, db):
        """Testa login com usuário inativo."""
        usuario = Usuario(
            username="inactive",
            nome="Inactive User",
            senha_hash=get_password_hash("password"),
            activo=False
        )
        db.add(usuario)
        db.commit()
        
        response = client.post(
            "/auth/login-json",
            json={"username": "inactive", "senha": "password"}
        )
        assert response.status_code == 401
    
    def test_protected_endpoint_without_token(self, client):
        """Testa acesso a endpoint protegido sem token."""
        response = client.get("/api/v1/despesas")
        assert response.status_code == 401
    
    def test_protected_endpoint_with_token(self, client, test_user):
        """Testa acesso a endpoint protegido com token válido."""
        # Login
        login_response = client.post(
            "/auth/login-json",
            json={"username": "testuser", "senha": "test123"}
        )
        token = login_response.json()["access_token"]
        
        # Acessa endpoint protegido
        response = client.get(
            "/api/v1/despesas",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200

