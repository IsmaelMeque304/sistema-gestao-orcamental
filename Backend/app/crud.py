"""
Funções CRUD genéricas e específicas.
"""
from sqlalchemy.orm import Session
from sqlalchemy import desc
from sqlalchemy import and_, or_, func, select, desc
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, date
from decimal import Decimal
from app.models import (
    Usuario, Papel, Fornecedor, Funcionario, Rubrica, 
    Despesa, ExecucaoMensal, ImportBatch, UsuarioPapel,
    StatusDespesa
)
from app.schemas import (
    UsuarioCreate, UsuarioUpdate, PapelCreate, 
    FornecedorCreate, FuncionarioCreate, RubricaCreate, RubricaUpdate,
    DespesaCreate, DespesaUpdate
)
import bcrypt

# Usar bcrypt diretamente devido a incompatibilidade entre passlib 1.7.4 e bcrypt 5.0.0


# ========== Password utilities ==========
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica senha usando bcrypt."""
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Gera hash de senha usando bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


# ========== Usuario CRUD ==========
def get_usuario_by_username(db: Session, username: str) -> Optional[Usuario]:
    """Busca usuário por username."""
    return db.query(Usuario).filter(Usuario.username == username).first()


def get_usuario(db: Session, usuario_id: int) -> Optional[Usuario]:
    """Busca usuário por ID."""
    return db.query(Usuario).filter(Usuario.id == usuario_id).first()


def create_usuario(db: Session, usuario: UsuarioCreate) -> Usuario:
    """Cria novo usuário."""
    db_usuario = Usuario(
        username=usuario.username,
        senha=get_password_hash(usuario.senha),
        nome=usuario.nome,
        nuit=usuario.nuit,
        contacto=usuario.contacto,
        email=usuario.email,
        endereco=usuario.endereco,
        activo=usuario.activo
    )
    db.add(db_usuario)
    db.commit()
    db.refresh(db_usuario)
    return db_usuario


def update_usuario(db: Session, usuario_id: int, usuario_update: UsuarioUpdate) -> Optional[Usuario]:
    """Atualiza usuário."""
    db_usuario = get_usuario(db, usuario_id)
    if not db_usuario:
        return None
    
    update_data = usuario_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_usuario, key, value)
    
    db.commit()
    db.refresh(db_usuario)
    return db_usuario


def list_usuarios(db: Session, skip: int = 0, limit: int = 100) -> List[Usuario]:
    """Lista usuários."""
    return db.query(Usuario).offset(skip).limit(limit).all()


def get_usuario_by_normalized_name(db: Session, normalized_name: str) -> Optional[Usuario]:
    """
    Busca usuário por normalized_name usando SQL direto (compatível com fn_normalize_name).
    """
    from sqlalchemy import text
    if not normalized_name or not normalized_name.strip():
        return None
    
    # Usa SQL direto para buscar por normalized_name (coluna STORED)
    result = db.execute(
        text("SELECT id FROM usuario WHERE normalized_name = :norm_name LIMIT 1"),
        {"norm_name": normalized_name}
    ).first()
    
    if result:
        return get_usuario(db, result[0])
    return None


def get_usuario_by_email(db: Session, email: str) -> Optional[Usuario]:
    """Busca usuário por email."""
    if not email or not email.strip():
        return None
    return db.query(Usuario).filter(Usuario.email == email.strip()).first()


def get_usuario_by_nuit(db: Session, nuit: str) -> Optional[Usuario]:
    """Busca usuário por NUIT."""
    if not nuit or not nuit.strip():
        return None
    return db.query(Usuario).filter(Usuario.nuit == nuit.strip()).first()


def get_usuario_by_contacto(db: Session, contacto: str) -> Optional[Usuario]:
    """Busca usuário por contacto."""
    if not contacto or not contacto.strip():
        return None
    return db.query(Usuario).filter(Usuario.contacto == contacto.strip()).first()


def create_usuario_for_fornecedor(
    db: Session,
    nome: str,
    email: Optional[str] = None,
    nuit: Optional[str] = None,
    contacto: Optional[str] = None,
    endereco: Optional[str] = None
) -> Usuario:
    """
    Cria usuário para fornecedor (sem email obrigatório no protótipo).
    Gera username único baseado no nome normalizado.
    """
    from app.services.importer import normalize_name
    import random
    import string
    
    # Normalizar nome
    nome_norm = normalize_name(nome)
    if not nome_norm:
        raise ValueError("Nome não pode ser vazio após normalização")
    
    # Gerar username baseado no nome normalizado (sem espaços, limitado a 100 chars)
    base_username = nome_norm.replace(' ', '').lower()[:90]
    
    # Verificar se username já existe e adicionar sufixo se necessário
    username = base_username
    counter = 1
    while get_usuario_by_username(db, username):
        username = f"{base_username}{counter}"
        counter += 1
        if counter > 9999:
            # Fallback: adicionar string aleatória
            random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
            username = f"{base_username[:82]}{random_suffix}"
    
    # Gerar senha temporária aleatória
    temp_password = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
    
    # Criar usuário
    db_usuario = Usuario(
        username=username,
        senha=get_password_hash(temp_password),
        nome=nome,
        email=email,
        nuit=nuit,
        contacto=contacto,
        endereco=endereco,
        activo=True,
        must_change_password=True
    )
    db.add(db_usuario)
    db.commit()
    db.refresh(db_usuario)
    
    return db_usuario


# ========== Papel CRUD ==========
def get_papel_by_nome(db: Session, nome: str) -> Optional[Papel]:
    """Busca papel por nome."""
    return db.query(Papel).filter(Papel.nome == nome).first()


def get_papel(db: Session, papel_id: int) -> Optional[Papel]:
    """Busca papel por ID."""
    return db.query(Papel).filter(Papel.id == papel_id).first()


def create_papel(db: Session, papel: PapelCreate) -> Papel:
    """Cria novo papel."""
    db_papel = Papel(**papel.model_dump())
    db.add(db_papel)
    db.commit()
    db.refresh(db_papel)
    return db_papel


def list_papeis(db: Session) -> List[Papel]:
    """Lista papéis."""
    return db.query(Papel).all()


def assign_papel_to_usuario(
    db: Session, usuario_id: int, papel_id: int, atribuido_por: int
) -> UsuarioPapel:
    """Atribui papel a usuário."""
    # Verifica se já existe
    existing = db.query(UsuarioPapel).filter(
        and_(
            UsuarioPapel.usuario_id == usuario_id,
            UsuarioPapel.papel_id == papel_id
        )
    ).first()
    
    if existing:
        return existing
    
    usuario_papel = UsuarioPapel(
        usuario_id=usuario_id,
        papel_id=papel_id,
        atribuido_por=atribuido_por
    )
    db.add(usuario_papel)
    db.commit()
    db.refresh(usuario_papel)
    return usuario_papel


def get_usuario_papeis(db: Session, usuario_id: int) -> List[str]:
    """Retorna lista de nomes de papéis do usuário."""
    papeis = db.query(Papel.nome).join(UsuarioPapel).filter(
        UsuarioPapel.usuario_id == usuario_id
    ).all()
    return [p[0] for p in papeis]


# ========== Fornecedor CRUD ==========
def get_fornecedor(db: Session, fornecedor_id: int) -> Optional[Fornecedor]:
    """Busca fornecedor por ID."""
    return db.query(Fornecedor).filter(Fornecedor.id == fornecedor_id).first()


def get_fornecedor_by_usuario_id(db: Session, usuario_id: int) -> Optional[Fornecedor]:
    """Busca fornecedor por usuario_id."""
    return db.query(Fornecedor).filter(Fornecedor.usuario_id == usuario_id).first()


def create_fornecedor_for_usuario(
    db: Session,
    usuario_id: int,
    tipo: str = "pessoa_singular"
) -> Fornecedor:
    """
    Cria fornecedor vinculado a um usuário existente.
    """
    # Verificar se já existe fornecedor para este usuário
    existing = get_fornecedor_by_usuario_id(db, usuario_id)
    if existing:
        return existing
    
    db_fornecedor = Fornecedor(
        usuario_id=usuario_id,
        tipo=tipo,
        activo=True
    )
    db.add(db_fornecedor)
    db.commit()
    db.refresh(db_fornecedor)
    return db_fornecedor


def check_despesa_duplicate(
    db: Session,
    rubrica_id: Optional[int],
    ordem_pagamento: Optional[str],
    valor: Decimal,
    data_emissao: Optional[date],
    fornecedor_id: Optional[int]
) -> Optional[Despesa]:
    """
    Verifica se já existe despesa com os mesmos campos chave.
    Retorna a despesa duplicada se encontrada, None caso contrário.
    """
    query = db.query(Despesa)
    
    conditions = []
    if rubrica_id:
        conditions.append(Despesa.rubrica_id == rubrica_id)
    if ordem_pagamento:
        conditions.append(Despesa.ordem_pagamento == ordem_pagamento)
    if valor:
        conditions.append(Despesa.valor == valor)
    if data_emissao:
        conditions.append(Despesa.data_emissao == data_emissao)
    if fornecedor_id:
        conditions.append(Despesa.fornecedor_id == fornecedor_id)
    
    if not conditions:
        return None
    
    return query.filter(and_(*conditions)).first()


def create_fornecedor(db: Session, fornecedor_data: FornecedorCreate) -> Tuple[Fornecedor, Dict[str, Any]]:
    """
    Cria novo fornecedor e gerencia criação/vínculo de usuário.
    
    Returns:
        Tuple[Fornecedor, Dict]: (fornecedor, info_usuario)
    """
    from app.services.user_service import handle_user_creation_for_fornecedor
    
    # Converter enum para string (valor)
    tipo_str = fornecedor_data.tipo.value if hasattr(fornecedor_data.tipo, 'value') else str(fornecedor_data.tipo)
    
    # Criar fornecedor primeiro (sem usuario_id ainda)
    db_fornecedor = Fornecedor(
        usuario_id=None,  # Será definido depois
        tipo=tipo_str,
        codigo_interno=fornecedor_data.codigo_interno,
        activo=fornecedor_data.activo
    )
    db.add(db_fornecedor)
    db.flush()  # Para obter o ID
    
    # Gerir criação/vínculo de usuário
    info_usuario = handle_user_creation_for_fornecedor(db, fornecedor_data, db_fornecedor.id)
    
    # Vincular usuario_id se foi criado ou encontrado
    if info_usuario.get("usuario_id"):
        # Verificar se o usuário já está vinculado a outro fornecedor
        fornecedor_existente = db.query(Fornecedor).filter(
            Fornecedor.usuario_id == info_usuario["usuario_id"],
            Fornecedor.id != db_fornecedor.id
        ).first()
        
        if fornecedor_existente:
            db.rollback()
            nome_fornecedor = fornecedor_existente.usuario.nome if fornecedor_existente.usuario else 'N/A'
            raise ValueError(f"Este usuário já está vinculado ao fornecedor '{nome_fornecedor}'. Não é possível vincular o mesmo usuário a múltiplos fornecedores.")
        
        db_fornecedor.usuario_id = info_usuario["usuario_id"]
    
    try:
        db.commit()
        db.refresh(db_fornecedor)
    except Exception as e:
        db.rollback()
        error_str = str(e)
        # Verificar se é erro de constraint única (usuário já vinculado)
        if "Duplicate entry" in error_str and "ux_fornecedor_usuario" in error_str:
            # Tentar buscar qual fornecedor já tem esse usuário
            if info_usuario.get("usuario_id"):
                fornecedor_existente = db.query(Fornecedor).filter(
                    Fornecedor.usuario_id == info_usuario["usuario_id"]
                ).first()
                if fornecedor_existente:
                    nome_fornecedor = fornecedor_existente.usuario.nome if fornecedor_existente.usuario else 'N/A'
                    raise ValueError(f"Este usuário já está vinculado ao fornecedor '{nome_fornecedor}'. Não é possível vincular o mesmo usuário a múltiplos fornecedores.")
            raise ValueError("Este usuário já está vinculado a outro fornecedor. Não é possível vincular o mesmo usuário a múltiplos fornecedores.")
        raise
    
    return db_fornecedor, info_usuario


def update_fornecedor(db: Session, fornecedor_id: int, fornecedor_data) -> Optional[Fornecedor]:
    """Atualiza fornecedor."""
    db_fornecedor = get_fornecedor(db, fornecedor_id)
    if not db_fornecedor:
        return None
    
    update_data = fornecedor_data.model_dump(exclude_unset=True)
    
    # Se nif foi fornecido, atualizar no usuário (campo nuit)
    nif = update_data.pop('nif', None)
    if nif is not None and db_fornecedor.usuario:
        db_fornecedor.usuario.nuit = nif
    
    # Atualizar campos do fornecedor
    for key, value in update_data.items():
        if key != "usuario_id":  # Não atualiza usuario_id
            # Se for tipo, converter enum para string
            if key == "tipo" and value is not None:
                tipo_str = value.value if hasattr(value, 'value') else str(value)
                setattr(db_fornecedor, key, tipo_str)
            else:
                setattr(db_fornecedor, key, value)
    
    # Se nome foi atualizado, atualizar também no usuário
    if 'nome' in update_data and db_fornecedor.usuario:
        db_fornecedor.usuario.nome = update_data['nome']
    
    # Se contacto foi atualizado, atualizar também no usuário
    if 'contacto' in update_data and db_fornecedor.usuario:
        db_fornecedor.usuario.contacto = update_data['contacto']
    
    # Se endereco foi atualizado, atualizar também no usuário
    if 'endereco' in update_data and db_fornecedor.usuario:
        db_fornecedor.usuario.endereco = update_data['endereco']
    
    db.commit()
    db.refresh(db_fornecedor)
    return db_fornecedor


def delete_fornecedor(db: Session, fornecedor_id: int) -> bool:
    """
    Remove fornecedor permanentemente e também remove o usuário associado.
    Retorna True se removido com sucesso, False se não encontrado.
    """
    db_fornecedor = get_fornecedor(db, fornecedor_id)
    if not db_fornecedor:
        return False
    
    # Verificar se há despesas associadas
    if db_fornecedor.despesas and len(db_fornecedor.despesas) > 0:
        raise ValueError("Não é possível remover fornecedor com despesas associadas")
    
    # Guardar usuario_id antes de remover
    usuario_id = db_fornecedor.usuario_id
    
    # Remover fornecedor
    db.delete(db_fornecedor)
    db.flush()
    
    # Remover usuário associado se existir
    if usuario_id:
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if usuario:
            # Verificar se o usuário não está vinculado a outro fornecedor ou funcionário
            from app.models import Funcionario
            funcionario_com_usuario = db.query(Funcionario).filter(
                Funcionario.usuario_id == usuario_id
            ).first()
            
            if not funcionario_com_usuario:
                # Remover usuário apenas se não estiver vinculado a outro registro
                db.delete(usuario)
    
    db.commit()
    return True


def list_fornecedores(db: Session, skip: int = 0, limit: int = 100) -> List[Fornecedor]:
    """Lista fornecedores (incluindo inativos)."""
    from sqlalchemy.orm import joinedload
    
    # Agora que o modelo usa String, podemos usar query normal
    # Listar TODOS os fornecedores (ativos e inativos)
    fornecedores = db.query(Fornecedor).options(
        joinedload(Fornecedor.usuario)
    ).offset(skip).limit(limit).all()
    
    # Filtrar apenas fornecedores com tipos válidos
    valid_fornecedores = []
    from app.models import TipoFornecedor
    valid_types = [TipoFornecedor.PESSOA_SINGULAR.value, TipoFornecedor.PESSOA_COLETIVA.value]
    
    for fornecedor in fornecedores:
        # Normalizar tipo para minúsculas e verificar se é válido
        tipo_normalized = fornecedor.tipo.lower() if fornecedor.tipo else None
        if tipo_normalized in valid_types:
            valid_fornecedores.append(fornecedor)
    
    return valid_fornecedores


# ========== Funcionario CRUD ==========
def get_funcionario(db: Session, funcionario_id: int) -> Optional[Funcionario]:
    """Busca funcionário por ID."""
    return db.query(Funcionario).filter(Funcionario.id == funcionario_id).first()


def list_funcionarios(db: Session, skip: int = 0, limit: int = 100) -> List[Funcionario]:
    """Lista funcionários (incluindo inativos)."""
    from sqlalchemy.orm import joinedload
    return db.query(Funcionario).options(
        joinedload(Funcionario.usuario)
    ).offset(skip).limit(limit).all()


def create_funcionario(db: Session, funcionario_data) -> Tuple[Funcionario, Dict[str, Any]]:
    """
    Cria novo funcionário e gerencia criação/vínculo de usuário.
    
    Returns:
        Tuple[Funcionario, Dict]: (funcionario, info_usuario)
    """
    from app.services.user_service import handle_user_creation_for_funcionario
    
    # Mapeia cargo para categoria (compatibilidade com modelo)
    categoria = getattr(funcionario_data, 'cargo', None) or getattr(funcionario_data, 'categoria', None)
    
    # Criar funcionário primeiro (sem usuario_id ainda)
    db_funcionario = Funcionario(
        usuario_id=None,  # Será definido depois
        categoria=categoria,
        departamento=funcionario_data.departamento,
        activo=funcionario_data.activo
    )
    db.add(db_funcionario)
    db.flush()  # Para obter o ID
    
    # Gerir criação/vínculo de usuário
    info_usuario = handle_user_creation_for_funcionario(db, funcionario_data, db_funcionario.id)
    
    # Vincular usuario_id se foi criado ou encontrado
    if info_usuario.get("usuario_id"):
        db_funcionario.usuario_id = info_usuario["usuario_id"]
    
    db.commit()
    db.refresh(db_funcionario)
    
    return db_funcionario, info_usuario


def update_funcionario(db: Session, funcionario_id: int, funcionario_data) -> Optional[Funcionario]:
    """Atualiza funcionário."""
    db_funcionario = get_funcionario(db, funcionario_id)
    if not db_funcionario:
        return None
    
    update_data = funcionario_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "cargo":
            # Mapeia cargo para categoria
            setattr(db_funcionario, "categoria", value)
        elif key != "usuario_id" and key != "nome":  # Não atualiza usuario_id nem nome
            setattr(db_funcionario, key, value)
    
    db.commit()
    db.refresh(db_funcionario)
    return db_funcionario


def delete_funcionario(db: Session, funcionario_id: int) -> bool:
    """
    Remove funcionário permanentemente e também remove o usuário associado.
    Retorna True se removido com sucesso, False se não encontrado.
    """
    db_funcionario = get_funcionario(db, funcionario_id)
    if not db_funcionario:
        return False
    
    # Guardar usuario_id antes de remover
    usuario_id = db_funcionario.usuario_id
    
    # Remover funcionário
    db.delete(db_funcionario)
    db.flush()
    
    # Remover usuário associado se existir
    if usuario_id:
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if usuario:
            # Verificar se o usuário não está vinculado a outro fornecedor ou funcionário
            from app.models import Fornecedor
            fornecedor_com_usuario = db.query(Fornecedor).filter(
                Fornecedor.usuario_id == usuario_id
            ).first()
            
            if not fornecedor_com_usuario:
                # Remover usuário apenas se não estiver vinculado a outro registro
                db.delete(usuario)
    
    db.commit()
    return True


# ========== Rubrica CRUD ==========
def get_rubrica(db: Session, rubrica_id: int) -> Optional[Rubrica]:
    """Busca rubrica por ID."""
    return db.query(Rubrica).filter(Rubrica.id == rubrica_id).first()


def get_rubrica_by_codigo_exercicio(
    db: Session, codigo: str, exercicio: int
) -> Optional[Rubrica]:
    """Busca rubrica por código e exercício."""
    return db.query(Rubrica).filter(
        and_(
            Rubrica.codigo == codigo,
            Rubrica.exercicio == exercicio
        )
    ).first()


def create_rubrica(db: Session, rubrica: RubricaCreate) -> Rubrica:
    """Cria nova rubrica e recalcula dotação dos ancestrais."""
    from app.services.rubrica_service import is_leaf_rubrica, recalculate_dotacao_chain, has_children
    
    # Calcular nível automaticamente baseado no parent_id
    nivel = 1  # Padrão: rubrica raiz
    if rubrica.parent_id:
        parent = get_rubrica(db, rubrica.parent_id)
        if parent:
            nivel = (parent.nivel or 1) + 1
        else:
            # Se parent_id foi fornecido mas não existe, usar nível padrão
            nivel = 1
    
    # Validação: apenas rubricas folha (com parent_id) podem ter dotacao_inicial
    # Rubricas pai (parent_id IS NULL) não podem ter dotacao_inicial
    # Usar getattr para evitar erro se a coluna não existir no banco
    dotacao_inicial = getattr(rubrica, 'dotacao_inicial', None)
    if rubrica.parent_id is None and dotacao_inicial and dotacao_inicial > 0:
        raise ValueError("Rubricas pai não podem ter dotação inicial. Apenas rubricas folha podem ter dotação inicial.")
    
    # Validar dotacao_inicial >= 0
    if dotacao_inicial is not None and dotacao_inicial < 0:
        raise ValueError("Dotação inicial deve ser maior ou igual a zero.")
    
    # Criar rubrica com nível calculado
    rubrica_data = rubrica.model_dump()
    rubrica_data['nivel'] = nivel  # Sobrescrever o nível fornecido com o calculado
    
    # Se for rubrica pai (parent_id IS NULL), forçar dotacao_inicial = 0
    if rubrica_data.get('parent_id') is None:
        rubrica_data['dotacao_inicial'] = Decimal("0.00")
    
    # Garantir que dotacao_inicial seja Decimal
    if 'dotacao_inicial' in rubrica_data and rubrica_data['dotacao_inicial'] is not None:
        rubrica_data['dotacao_inicial'] = Decimal(str(rubrica_data['dotacao_inicial']))
    else:
        rubrica_data['dotacao_inicial'] = Decimal("0.00")
    
    db_rubrica = Rubrica(**rubrica_data)
    
    # Inicializar dotacao_calculada
    # Para folhas: será igual a dotacao_inicial
    # Para pais: será calculada depois pelo recalculate_dotacao_chain
    if db_rubrica.parent_id is None:
        # Rubrica pai: dotacao_calculada será calculada pelos filhos
        db_rubrica.dotacao_calculada = Decimal("0.00")
    else:
        # Rubrica folha: dotacao_calculada = dotacao_inicial
        # Usar getattr para evitar erro se a coluna não existir no banco
        dotacao_inicial_val = getattr(db_rubrica, 'dotacao_inicial', None)
        db_rubrica.dotacao_calculada = dotacao_inicial_val if dotacao_inicial_val is not None else Decimal("0.00")
    
    db.add(db_rubrica)
    db.commit()
    db.refresh(db_rubrica)
    
    # Recalcular dotação dos ancestrais (incluindo a própria rubrica se ela se tornar pai)
    if db_rubrica.id:
        # Primeiro, recalcular a cadeia (isso vai calcular dotacao_calculada corretamente)
        recalculate_dotacao_chain(db, db_rubrica.id)
        db.commit()
        db.refresh(db_rubrica)
        
        # Rubricas não têm dotação própria - dotação está em execucao_mensal
        # Garantir que dotacao seja sempre None
        if db_rubrica.dotacao is not None:
            db_rubrica.dotacao = None
            db.commit()
            db.refresh(db_rubrica)
    
    return db_rubrica


def update_rubrica(
    db: Session, rubrica_id: int, rubrica_update: RubricaUpdate
) -> Optional[Rubrica]:
    """Atualiza rubrica e recalcula dotação se necessário."""
    from app.services.rubrica_service import has_children, recalculate_dotacao_chain
    
    db_rubrica = get_rubrica(db, rubrica_id)
    if not db_rubrica:
        return None
    
    update_data = rubrica_update.model_dump(exclude_unset=True)
    
    # Validação: apenas rubricas folha podem ter dotacao_inicial
    if "dotacao_inicial" in update_data:
        if db_rubrica.parent_id is None:
            # Rubrica pai não pode ter dotacao_inicial
            raise ValueError("Rubricas pai não podem ter dotação inicial. Apenas rubricas folha podem ter dotação inicial.")
        
        # Validar dotacao_inicial >= 0
        dotacao_inicial = update_data["dotacao_inicial"]
        if dotacao_inicial is not None:
            dotacao_inicial = Decimal(str(dotacao_inicial))
            if dotacao_inicial < 0:
                raise ValueError("Dotação inicial deve ser maior ou igual a zero.")
            update_data["dotacao_inicial"] = dotacao_inicial
    
    # Atualizar campos
    for key, value in update_data.items():
        setattr(db_rubrica, key, value)
    
    # Se dotacao_inicial foi atualizada, atualizar dotacao_calculada para folhas
    if "dotacao_inicial" in update_data and db_rubrica.parent_id is not None:
        # Rubrica folha: dotacao_calculada = dotacao_inicial
        # Usar getattr para evitar erro se a coluna não existir no banco
        dotacao_inicial_val = getattr(db_rubrica, 'dotacao_inicial', None)
        db_rubrica.dotacao_calculada = dotacao_inicial_val if dotacao_inicial_val is not None else Decimal("0.00")
    
    db.commit()
    db.refresh(db_rubrica)
    
    # Recalcular dotação dos ancestrais
    recalculate_dotacao_chain(db, rubrica_id)
    db.commit()
    db.refresh(db_rubrica)
    
    return db_rubrica


def list_rubricas(
    db: Session, exercicio: Optional[int] = None, 
    skip: int = 0, limit: int = 100
) -> List[Rubrica]:
    """Lista rubricas."""
    query = db.query(Rubrica)
    if exercicio:
        query = query.filter(Rubrica.exercicio == exercicio)
    return query.offset(skip).limit(limit).all()


# ========== Despesa CRUD ==========
def create_despesa(db: Session, despesa: DespesaCreate) -> Despesa:
    """Cria nova despesa com validações."""
    from app.services.despesa_service import is_rubrica_leaf
    from app.models import StatusRubrica
    
    # Validações
    if despesa.valor <= 0:
        raise ValueError("Valor da despesa deve ser maior que zero")
    
    # Validar rubrica
    if not despesa.rubrica_id:
        raise ValueError("Rubrica é obrigatória")
    
    rubrica = get_rubrica(db, despesa.rubrica_id)
    if not rubrica:
        raise ValueError("Rubrica não encontrada")
    
    if rubrica.status != StatusRubrica.ATIVA:
        raise ValueError("Rubrica deve estar ativa")
    
    # Validar que rubrica é folha
    if not is_rubrica_leaf(db, despesa.rubrica_id):
        raise ValueError("Apenas rubricas folha podem receber despesas")
    
    # Validar fornecedor
    if despesa.fornecedor_id:
        fornecedor = get_fornecedor(db, despesa.fornecedor_id)
        if not fornecedor:
            raise ValueError("Fornecedor não encontrado")
        if not fornecedor.activo:
            raise ValueError("Fornecedor deve estar ativo")
    
    # Extrai mês e exercício da data se não fornecidos
    if despesa.data_emissao:
        if not despesa.mes:
            despesa.mes = despesa.data_emissao.month
        if not despesa.exercicio:
            despesa.exercicio = despesa.data_emissao.year
        
        # Validar que data não é futura
        if despesa.data_emissao > date.today():
            raise ValueError("Data de emissão não pode ser futura")
    
    # Valida data dentro do exercício
    if despesa.data_emissao and despesa.exercicio:
        if despesa.data_emissao.year != despesa.exercicio:
            raise ValueError(f"Data de emissão ({despesa.data_emissao.year}) deve estar dentro do exercício ({despesa.exercicio})")
    
    # Status inicial sempre pendente
    despesa_dict = despesa.model_dump()
    despesa_dict['status'] = StatusDespesa.PENDENTE
    
    db_despesa = Despesa(**despesa_dict)
    db.add(db_despesa)
    db.commit()
    db.refresh(db_despesa)
    
    # Eager load relações
    from sqlalchemy.orm import joinedload
    db_despesa = db.query(Despesa).options(
        joinedload(Despesa.rubrica),
        joinedload(Despesa.fornecedor).joinedload(Fornecedor.usuario)
    ).filter(Despesa.id == db_despesa.id).first()
    
    return db_despesa


def get_despesa(db: Session, despesa_id: int) -> Optional[Despesa]:
    """Busca despesa por ID. Inclui relações (eager loading)."""
    from sqlalchemy.orm import joinedload
    
    return db.query(Despesa).options(
        joinedload(Despesa.rubrica),
        joinedload(Despesa.fornecedor).joinedload(Fornecedor.usuario)
    ).filter(Despesa.id == despesa_id).first()


def list_despesas(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status: Optional[StatusDespesa] = None,
    rubrica_id: Optional[int] = None,
    fornecedor_id: Optional[int] = None,
    mes: Optional[int] = None,
    exercicio: Optional[int] = None
) -> List[Despesa]:
    """Lista despesas com filtros. Inclui relações (eager loading)."""
    from sqlalchemy.orm import joinedload, defer
    
    query = db.query(Despesa).options(
        joinedload(Despesa.rubrica),  # dotacao já está excluída via __mapper_args__
        joinedload(Despesa.fornecedor).joinedload(Fornecedor.usuario)
    )
    
    if status:
        query = query.filter(Despesa.status == status)
    if rubrica_id:
        query = query.filter(Despesa.rubrica_id == rubrica_id)
    if fornecedor_id:
        query = query.filter(Despesa.fornecedor_id == fornecedor_id)
    if mes:
        query = query.filter(Despesa.mes == mes)
    if exercicio:
        query = query.filter(Despesa.exercicio == exercicio)
    
    return query.order_by(desc(Despesa.created_at)).offset(skip).limit(limit).all()


def update_despesa(
    db: Session, 
    despesa_id: int, 
    despesa_update,
    is_admin: bool = False
) -> Optional[Despesa]:
    """Atualiza despesa. Bloqueia se confirmada."""
    from sqlalchemy.orm import joinedload
    from app.services.despesa_service import is_rubrica_leaf
    from app.models import StatusRubrica
    from datetime import date
    
    # Busca despesa sem eager load primeiro (para validação)
    db_despesa = db.query(Despesa).filter(Despesa.id == despesa_id).first()
    if not db_despesa:
        return None
    
    # Bloquear edição de despesa confirmada
    if db_despesa.status == StatusDespesa.CONFIRMADA:
        raise ValueError("Não é possível editar despesa confirmada")
    
    update_data = despesa_update.model_dump(exclude_unset=True)
    
    # Validações
    if "valor" in update_data and update_data["valor"] <= 0:
        raise ValueError("Valor da despesa deve ser maior que zero")
    
    # Validar rubrica se fornecida
    if "rubrica_id" in update_data:
        rubrica = get_rubrica(db, update_data["rubrica_id"])
        if not rubrica:
            raise ValueError("Rubrica não encontrada")
        if rubrica.status != StatusRubrica.ATIVA:
            raise ValueError("Rubrica deve estar ativa")
        if not is_rubrica_leaf(db, update_data["rubrica_id"]):
            raise ValueError("Apenas rubricas folha podem receber despesas")
    
    # Validar fornecedor se fornecido
    if "fornecedor_id" in update_data and update_data["fornecedor_id"]:
        fornecedor = get_fornecedor(db, update_data["fornecedor_id"])
        if not fornecedor:
            raise ValueError("Fornecedor não encontrado")
        if not fornecedor.activo:
            raise ValueError("Fornecedor deve estar ativo")
    
    # Atualiza mês e exercício se data for atualizada
    exercicio_atual = update_data.get("exercicio", db_despesa.exercicio)
    if "data_emissao" in update_data and update_data["data_emissao"]:
        # Validar que data não é futura
        if update_data["data_emissao"] > date.today():
            raise ValueError("Data de emissão não pode ser futura")
        
        if "mes" not in update_data:
            update_data["mes"] = update_data["data_emissao"].month
        if "exercicio" not in update_data:
            update_data["exercicio"] = update_data["data_emissao"].year
            exercicio_atual = update_data["exercicio"]
        
        # Valida data dentro do exercício
        if update_data["data_emissao"].year != exercicio_atual:
            raise ValueError(f"Data de emissão ({update_data['data_emissao'].year}) deve estar dentro do exercício ({exercicio_atual})")
    
    for key, value in update_data.items():
        setattr(db_despesa, key, value)
    
    db.commit()
    
    # Eager load relações
    db_despesa = db.query(Despesa).options(
        joinedload(Despesa.rubrica),
        joinedload(Despesa.fornecedor).joinedload(Fornecedor.usuario)
    ).filter(Despesa.id == despesa_id).first()
    
    return db_despesa


def delete_despesa(db: Session, despesa_id: int) -> Optional[Despesa]:
    """Remove despesa. Apenas permite se status = pendente."""
    db_despesa = get_despesa(db, despesa_id)
    if not db_despesa:
        return None
    
    # Bloquear remoção de despesa confirmada
    if db_despesa.status == StatusDespesa.CONFIRMADA:
        raise ValueError("Não pode remover despesas confirmadas")
    
    # Remover fisicamente (não soft delete)
    db.delete(db_despesa)
    db.commit()
    return db_despesa


def confirm_despesa(db: Session, despesa_id: int) -> Optional[Despesa]:
    """Confirma despesa e atualiza execução mensal."""
    from app.services.despesa_service import confirm_despesa_with_execucao
    
    try:
        despesa = confirm_despesa_with_execucao(db, despesa_id)
        
        # Eager load relações
        from sqlalchemy.orm import joinedload
        despesa = db.query(Despesa).options(
            joinedload(Despesa.rubrica),
            joinedload(Despesa.fornecedor).joinedload(Fornecedor.usuario)
        ).filter(Despesa.id == despesa_id).first()
        
        return despesa
    except ValueError as e:
        raise ValueError(str(e))


def recalculate_execucao_mensal(
    db: Session, rubrica_id: int, mes: int, ano: int
) -> ExecucaoMensal:
    """
    Recalcula execução mensal para uma rubrica/mês.
    
    Se execucao_mensal não existe, cria usando dotacao_calculada distribuída pelos meses.
    Se já existe, mantém a dotacao existente e atualiza apenas gasto e saldo.
    """
    # Buscar rubrica
    rubrica = get_rubrica(db, rubrica_id)
    if not rubrica:
        raise ValueError(f"Rubrica {rubrica_id} não encontrada")
    
    # Garantir que dotacao_calculada está atualizada
    from app.services.rubrica_service import recalculate_dotacao_chain
    try:
        recalculate_dotacao_chain(db, rubrica_id)
        db.commit()
        db.refresh(rubrica)
    except Exception as e:
        import logging
        logging.warning(f"Erro ao recalcular dotacao_calculada para rubrica {rubrica_id}: {e}")
    
    # Calcular gasto total (despesas confirmadas)
    gasto_total = db.query(func.sum(Despesa.valor)).filter(
        and_(
            Despesa.rubrica_id == rubrica_id,
            Despesa.mes == mes,
            Despesa.exercicio == ano,
            Despesa.status == StatusDespesa.CONFIRMADA
        )
    ).scalar() or Decimal("0.00")
    
    # Buscar ou criar execução mensal
    execucao = db.query(ExecucaoMensal).filter(
        and_(
            ExecucaoMensal.rubrica_id == rubrica_id,
            ExecucaoMensal.mes == mes,
            ExecucaoMensal.ano == ano
        )
    ).first()
    
    # Rubricas não têm dotação própria - dotação está em execucao_mensal
    # IMPORTANTE: Criar execucao_mensal APENAS quando há despesas confirmadas (gasto > 0)
    # ou quando já existe (para manter valores manuais)
    if not execucao:
        # Só criar se houver gasto (despesas confirmadas)
        if gasto_total > 0:
            # Usar dotacao_calculada da rubrica e distribuir pelos 12 meses
            dotacao_calculada = rubrica.dotacao_calculada or Decimal("0.00")
            # Distribuir igualmente pelos 12 meses
            dotacao_mensal = dotacao_calculada / Decimal("12.00")
            
            execucao = ExecucaoMensal(
                rubrica_id=rubrica_id,
                mes=mes,
                ano=ano,
                dotacao=dotacao_mensal,  # Usar dotacao_calculada / 12
                gasto=gasto_total,
                saldo=dotacao_mensal - gasto_total
            )
            db.add(execucao)
        else:
            # Não há despesas confirmadas, não criar registro
            # Retornar None para indicar que não foi criado
            return None
    else:
        # Se já existe, atualizar gasto e saldo
        execucao.gasto = gasto_total
        execucao.saldo = execucao.dotacao - gasto_total
    
    db.commit()
    db.refresh(execucao)
    return execucao


# ========== Import Batch CRUD ==========
def create_import_batch(
    db: Session, file_name: str, tipo: str, user_id: int
) -> ImportBatch:
    """Cria novo batch de importação."""
    batch = ImportBatch(
        file_name=file_name,
        tipo=tipo,
        user_id=user_id
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def get_import_batch(db: Session, batch_id: int) -> Optional[ImportBatch]:
    """Busca batch por ID."""
    return db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()


def update_import_batch(
    db: Session, batch_id: int, **kwargs
) -> Optional[ImportBatch]:
    """Atualiza batch."""
    batch = get_import_batch(db, batch_id)
    if not batch:
        return None
    
    for key, value in kwargs.items():
        setattr(batch, key, value)
    
    db.commit()
    db.refresh(batch)
    return batch

