"""
API de autenticação com JWT.
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from app.db import get_db
from app.crud import (
    get_usuario_by_username, verify_password, get_usuario_papeis
)
from app.schemas import Token, LoginRequest
from app.config import settings

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Cria token JWT."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Dependency para obter usuário atual do token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = get_usuario_by_username(db, username=username)
    if user is None:
        raise credentials_exception
    
    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    
    return user


async def require_role(required_role: str):
    """Dependency factory para verificar role."""
    async def role_checker(
        current_user = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        papeis = get_usuario_papeis(db, current_user.id)
        if required_role not in papeis:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {required_role}"
            )
        return current_user
    return role_checker


async def require_admin(current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    """Dependency para verificar se usuário é admin."""
    papeis = get_usuario_papeis(db, current_user.id)
    if "admin" not in papeis:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires admin role"
        )
    return current_user


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Endpoint de login.
    Aceita OAuth2PasswordRequestForm (username/password) ou JSON.
    """
    user = get_usuario_by_username(db, username=form_data.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not verify_password(form_data.password, user.senha):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    # Incluir nome do usuário no token para facilitar acesso no frontend
    access_token = create_access_token(
        data={
            "sub": user.username,
            "nome": user.nome if hasattr(user, 'nome') else None,
            "user_id": user.id
        }, 
        expires_delta=access_token_expires
    )
    
    # Retornar também o objeto user para facilitar acesso no frontend
    from app.schemas import UsuarioResponse
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": UsuarioResponse.model_validate(user)
    }


@router.post("/login-json", response_model=Token)
async def login_json(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Endpoint de login alternativo que aceita JSON.
    Retorna token e dados do usuário.
    """
    from app.schemas import UsuarioResponse
    
    user = get_usuario_by_username(db, username=login_data.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not verify_password(login_data.senha, user.senha):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    # Retorna token e user conforme plano
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UsuarioResponse.model_validate(user)
    }

