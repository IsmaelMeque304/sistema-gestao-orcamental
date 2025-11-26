"""
Serviço para criação automática e vinculação de usuários.
"""
import re
import secrets
import string
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from app.models import Usuario, UserCreationLog
from app.crud import get_password_hash


def is_valid_email(email: str) -> bool:
    """Valida formato de email."""
    if not email or not isinstance(email, str):
        return False
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email.strip()))


def generate_username_from_email(email: str) -> str:
    """Gera username baseado no email (parte antes do @)."""
    if not email:
        return ""
    username = email.split('@')[0].lower()
    # Remover caracteres inválidos
    username = re.sub(r'[^a-z0-9_]', '', username)
    # Limitar tamanho
    return username[:50]


def generate_username_from_nome(nome: str) -> str:
    """Gera username baseado no nome (lowercase, sem espaços)."""
    if not nome:
        return "user"
    # Converter para lowercase e substituir espaços por underscore
    username = nome.lower().strip().replace(" ", "_")
    # Remover caracteres especiais e acentos
    import unicodedata
    username = unicodedata.normalize('NFKD', username).encode('ascii', 'ignore').decode('ascii')
    username = re.sub(r'[^a-z0-9_]', '', username)
    # Limitar tamanho
    return username[:50] if username else "user"


def generate_temporary_password(length: int = 12) -> str:
    """Gera senha temporária segura."""
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    password = ''.join(secrets.choice(alphabet) for _ in range(length))
    return password


def find_existing_user_by_email(db: Session, email: str) -> Optional[Usuario]:
    """Busca usuário existente por email."""
    if not email or not is_valid_email(email):
        return None
    return db.query(Usuario).filter(Usuario.email == email.strip().lower()).first()


def find_existing_user_by_nuit(db: Session, nuit: str) -> Optional[Usuario]:
    """Busca usuário existente por NUIT."""
    if not nuit or not nuit.strip():
        return None
    return db.query(Usuario).filter(Usuario.nuit == nuit.strip()).first()


def find_existing_user_by_contacto(db: Session, contacto: str) -> Optional[Usuario]:
    """Busca usuário existente por contacto."""
    if not contacto or not contacto.strip():
        return None
    return db.query(Usuario).filter(Usuario.contacto == contacto.strip()).first()


def create_unique_username(db: Session, base_username: str) -> str:
    """Cria username único, adicionando sufixo numérico se necessário."""
    if not base_username:
        base_username = "user"
    
    username = base_username
    counter = 1
    
    while db.query(Usuario).filter(Usuario.username == username).first() is not None:
        suffix = f"{counter}"
        max_len = 100 - len(suffix)
        username = base_username[:max_len] + suffix
        counter += 1
        if counter > 9999:
            raise ValueError("Não foi possível gerar username único.")
    
    return username


def create_user_automatically(
    db: Session,
    email: str,
    nome: str,
    contacto: Optional[str] = None,
    nuit: Optional[str] = None,
    endereco: Optional[str] = None
) -> Tuple[Usuario, str]:
    """
    Cria usuário automaticamente com senha temporária.
    
    Args:
        email: Email do usuário (pode ser temporário se não fornecido)
        nome: Nome completo (obrigatório)
    
    Returns:
        Tuple[Usuario, str]: (usuario_criado, senha_temporaria)
    """
    if not nome or not nome.strip():
        raise ValueError("Nome é obrigatório para criar usuário automaticamente.")
    
    # Gerar username do email ou do nome
    if email and is_valid_email(email):
        base_username = generate_username_from_email(email)
    else:
        base_username = generate_username_from_nome(nome)
    
    if not base_username:
        base_username = "user"
    
    username = create_unique_username(db, base_username)
    
    # Gerar senha temporária
    senha_temporaria = generate_temporary_password()
    
    # Normalizar email (usar email fornecido ou gerar temporário)
    email_normalizado = None
    if email and is_valid_email(email):
        email_normalizado = email.strip().lower()
    # Se não tiver email válido, não definir (pode ser NULL)
    
    # Criar usuário
    usuario = Usuario(
        username=username,
        senha=get_password_hash(senha_temporaria),
        nome=nome.strip(),
        email=email_normalizado,
        contacto=contacto,
        nuit=nuit,
        endereco=endereco,
        activo=True,
        must_change_password=True
    )
    
    db.add(usuario)
    db.flush()
    
    return usuario, senha_temporaria


def handle_user_creation_for_fornecedor(
    db: Session,
    fornecedor_data: Any,
    fornecedor_id: int
) -> Dict[str, Any]:
    """
    Gerencia criação/vínculo de usuário para fornecedor.
    Sempre cria ou vincula usuário automaticamente.
    
    Returns:
        Dict com informações sobre criação/vínculo de usuário
    """
    resultado = {
        "usuario_criado": False,
        "usuario_vinculado": False,
        "usuario_id": None,
        "username": None,
        "senha_temporaria": None,
        "vinculado": False,
        "mensagem": None
    }
    
    # Validar nome (obrigatório)
    nome = getattr(fornecedor_data, 'nome', None)
    if not nome or not nome.strip():
        raise ValueError("Nome é obrigatório para criação automática de usuário")
    
    email = getattr(fornecedor_data, 'email', None) or getattr(fornecedor_data, 'email_usuario', None)
    contacto = getattr(fornecedor_data, 'contacto', None)
    nif = getattr(fornecedor_data, 'nif', None)
    endereco = getattr(fornecedor_data, 'endereco', None)
    
    # PASSO 1: Procurar por email
    usuario_existente = None
    metodo_busca = None
    
    if email and is_valid_email(email):
        usuario_existente = find_existing_user_by_email(db, email)
        if usuario_existente:
            metodo_busca = "email"
    
    # PASSO 2: Se não encontrou por email, tentar NUIT
    if not usuario_existente and nif:
        usuario_existente = find_existing_user_by_nuit(db, nif)
        if usuario_existente:
            metodo_busca = "nuit"
    
    # PASSO 3: Se não encontrou, tentar contacto
    if not usuario_existente and contacto:
        usuario_existente = find_existing_user_by_contacto(db, contacto)
        if usuario_existente:
            metodo_busca = "contacto"
    
    # Se encontrou usuário existente
    if usuario_existente:
        resultado["usuario_vinculado"] = True
        resultado["vinculado"] = True
        resultado["usuario_id"] = usuario_existente.id
        resultado["username"] = usuario_existente.username
        resultado["mensagem"] = f"Usuário existente vinculado via {metodo_busca}."
        log_user_creation(db, usuario_existente.id, "fornecedor", fornecedor_id, 
                         f"Usuário existente vinculado via {metodo_busca}")
        return resultado
    
    # Se não encontrou, criar novo usuário
    # Usar email se disponível, senão usar nome para gerar username
    email_para_criacao = email if (email and is_valid_email(email)) else None
    
    # Se não tiver email válido, gerar email temporário e verificar se já existe
    if not email_para_criacao:
        email_temp = f"{nome.lower().replace(' ', '_')}@temp.local"
        # Verificar se o email temporário já existe
        usuario_temp = find_existing_user_by_email(db, email_temp)
        if usuario_temp:
            # Usuário com email temporário encontrado - vincular
            resultado["usuario_vinculado"] = True
            resultado["vinculado"] = True
            resultado["usuario_id"] = usuario_temp.id
            resultado["username"] = usuario_temp.username
            resultado["mensagem"] = f"Usuário existente vinculado (email temporário: {email_temp})."
            log_user_creation(db, usuario_temp.id, "fornecedor", fornecedor_id, 
                             f"Usuário existente vinculado via email temporário")
            return resultado
    
    try:
        novo_usuario, senha_temporaria = create_user_automatically(
            db, email_para_criacao or f"{nome.lower().replace(' ', '_')}@temp.local", 
            nome, contacto, nif, endereco
        )
        resultado["usuario_criado"] = True
        resultado["vinculado"] = False
        resultado["usuario_id"] = novo_usuario.id
        resultado["username"] = novo_usuario.username
        resultado["senha_temporaria"] = senha_temporaria
        resultado["mensagem"] = "Usuário criado automaticamente e vinculado."
        log_user_creation(db, novo_usuario.id, "fornecedor", fornecedor_id, 
                       "Usuário criado automaticamente")
    except Exception as e:
        # Se erro de integridade (email duplicado), tentar buscar o usuário existente
        if "Duplicate entry" in str(e) and "email" in str(e):
            db.rollback()
            # Tentar buscar por email temporário
            email_temp = f"{nome.lower().replace(' ', '_')}@temp.local"
            usuario_existente = find_existing_user_by_email(db, email_temp)
            if usuario_existente:
                resultado["usuario_vinculado"] = True
                resultado["vinculado"] = True
                resultado["usuario_id"] = usuario_existente.id
                resultado["username"] = usuario_existente.username
                resultado["mensagem"] = f"Usuário existente vinculado (email temporário: {email_temp})."
                log_user_creation(db, usuario_existente.id, "fornecedor", fornecedor_id, 
                                 f"Usuário existente vinculado via email temporário (após erro de duplicação)")
                return resultado
        log_user_creation(db, None, "fornecedor", fornecedor_id, f"Erro ao criar usuário: {str(e)}")
        raise ValueError(f"Erro ao criar usuário: {str(e)}")
    
    return resultado


def handle_user_creation_for_funcionario(
    db: Session,
    funcionario_data: Any,
    funcionario_id: int
) -> Dict[str, Any]:
    """
    Gerencia criação/vínculo de usuário para funcionário.
    Sempre cria ou vincula usuário automaticamente.
    
    Returns:
        Dict com informações sobre criação/vínculo de usuário
    """
    resultado = {
        "usuario_criado": False,
        "usuario_vinculado": False,
        "usuario_id": None,
        "username": None,
        "senha_temporaria": None,
        "vinculado": False,
        "mensagem": None
    }
    
    # Validar nome (obrigatório)
    nome = getattr(funcionario_data, 'nome', None)
    if not nome or not nome.strip():
        raise ValueError("Nome é obrigatório para criação automática de usuário")
    
    email = getattr(funcionario_data, 'email', None) or getattr(funcionario_data, 'email_usuario', None)
    contacto = getattr(funcionario_data, 'contacto', None)
    
    # PASSO 1: Procurar por email
    usuario_existente = None
    metodo_busca = None
    
    if email and is_valid_email(email):
        usuario_existente = find_existing_user_by_email(db, email)
        if usuario_existente:
            metodo_busca = "email"
    
    # PASSO 2: Se não encontrou, tentar contacto
    if not usuario_existente and contacto:
        usuario_existente = find_existing_user_by_contacto(db, contacto)
        if usuario_existente:
            metodo_busca = "contacto"
    
    # Se encontrou usuário existente
    if usuario_existente:
        resultado["usuario_vinculado"] = True
        resultado["vinculado"] = True
        resultado["usuario_id"] = usuario_existente.id
        resultado["username"] = usuario_existente.username
        resultado["mensagem"] = f"Usuário existente vinculado via {metodo_busca}."
        log_user_creation(db, usuario_existente.id, "funcionario", funcionario_id, 
                         f"Usuário existente vinculado via {metodo_busca}")
        return resultado
    
    # Se não encontrou, criar novo usuário
    # Usar email se disponível, senão usar nome para gerar username
    email_para_criacao = email if (email and is_valid_email(email)) else None
    
    # Se não tiver email válido, gerar email temporário e verificar se já existe
    if not email_para_criacao:
        email_temp = f"{nome.lower().replace(' ', '_')}@temp.local"
        # Verificar se o email temporário já existe
        usuario_temp = find_existing_user_by_email(db, email_temp)
        if usuario_temp:
            # Usuário com email temporário encontrado - vincular
            resultado["usuario_vinculado"] = True
            resultado["vinculado"] = True
            resultado["usuario_id"] = usuario_temp.id
            resultado["username"] = usuario_temp.username
            resultado["mensagem"] = f"Usuário existente vinculado (email temporário: {email_temp})."
            log_user_creation(db, usuario_temp.id, "funcionario", funcionario_id, 
                             f"Usuário existente vinculado via email temporário")
            return resultado
    
    try:
        novo_usuario, senha_temporaria = create_user_automatically(
            db, email_para_criacao or f"{nome.lower().replace(' ', '_')}@temp.local", 
            nome, contacto, None, None
        )
        resultado["usuario_criado"] = True
        resultado["vinculado"] = False
        resultado["usuario_id"] = novo_usuario.id
        resultado["username"] = novo_usuario.username
        resultado["senha_temporaria"] = senha_temporaria
        resultado["mensagem"] = "Usuário criado automaticamente e vinculado."
        log_user_creation(db, novo_usuario.id, "funcionario", funcionario_id, 
                       "Usuário criado automaticamente")
    except Exception as e:
        # Se erro de integridade (email duplicado), tentar buscar o usuário existente
        if "Duplicate entry" in str(e) and "email" in str(e):
            db.rollback()
            # Tentar buscar por email temporário
            email_temp = f"{nome.lower().replace(' ', '_')}@temp.local"
            usuario_existente = find_existing_user_by_email(db, email_temp)
            if usuario_existente:
                resultado["usuario_vinculado"] = True
                resultado["vinculado"] = True
                resultado["usuario_id"] = usuario_existente.id
                resultado["username"] = usuario_existente.username
                resultado["mensagem"] = f"Usuário existente vinculado (email temporário: {email_temp})."
                log_user_creation(db, usuario_existente.id, "funcionario", funcionario_id, 
                                 f"Usuário existente vinculado via email temporário (após erro de duplicação)")
                return resultado
        log_user_creation(db, None, "funcionario", funcionario_id, f"Erro ao criar usuário: {str(e)}")
        raise ValueError(f"Erro ao criar usuário: {str(e)}")
    
    return resultado


def log_user_creation(
    db: Session,
    usuario_id: Optional[int],
    tipo: str,
    ref_id: int,
    detalhes: str
) -> None:
    """Registra log de criação/vínculo de usuário."""
    log = UserCreationLog(
        usuario_id=usuario_id,
        tipo=tipo,
        ref_id=ref_id,
        detalhes=detalhes
    )
    db.add(log)
    db.flush()

