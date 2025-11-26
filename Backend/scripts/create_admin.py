"""
Script para criar usuário administrador inicial.
Execute: python scripts/create_admin.py
"""
import sys
from pathlib import Path

# Adiciona o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db import SessionLocal
from app.crud import create_usuario, assign_papel_to_usuario, create_papel, get_papel_by_nome
from app.schemas import UsuarioCreate, PapelCreate


def main():
    """Cria usuário admin e papéis básicos."""
    db = SessionLocal()
    
    try:
        # Criar papéis se não existirem
        papeis = ["admin", "contabilista", "visualizador"]
        papel_ids = {}
        
        for papel_nome in papeis:
            papel = get_papel_by_nome(db, papel_nome)
            if not papel:
                if papel_nome == "admin":
                    descricao = "Administrador do sistema"
                elif papel_nome == "contabilista":
                    descricao = "Contabilista - pode importar e confirmar despesas"
                else:
                    descricao = "Visualizador - apenas leitura"
                
                papel = create_papel(db, PapelCreate(nome=papel_nome, descricao=descricao))
                print(f"[OK] Papel '{papel_nome}' criado")
            else:
                print(f"[OK] Papel '{papel_nome}' ja existe")
            
            papel_ids[papel_nome] = papel.id
        
        # Criar usuário admin
        username = input("Digite o username do admin (ou Enter para 'admin'): ").strip() or "admin"
        senha = input("Digite a senha do admin (ou Enter para 'admin123'): ").strip() or "admin123"
        nome = input("Digite o nome do admin (ou Enter para 'Administrador'): ").strip() or "Administrador"
        email = input("Digite o email (ou Enter para pular): ").strip() or None
        
        from app.crud import get_usuario_by_username, get_password_hash
        existing = get_usuario_by_username(db, username)
        if existing:
            print(f"[AVISO] Usuario '{username}' ja existe. Atualizando senha...")
            existing.senha = get_password_hash(senha)
            existing.activo = True
            if email:
                existing.email = email
            db.commit()
            db.refresh(existing)
            usuario = existing
        else:
            usuario_data = UsuarioCreate(
                username=username,
                senha=senha,
                nome=nome,
                activo=True
            )
            if email:
                usuario_data.email = email
            usuario = create_usuario(db, usuario_data)
            print(f"[OK] Usuario '{username}' criado")
        
        # Atribuir papel admin
        assign_papel_to_usuario(db, usuario.id, papel_ids["admin"], usuario.id)
        print(f"[OK] Papel 'admin' atribuido ao usuario '{username}'")
        
        print("\n[OK] Setup concluido!")
        print(f"   Username: {username}")
        print(f"   Senha: {senha}")
        print("\n[AVISO] IMPORTANTE: Altere a senha apos o primeiro login!")
        
    except Exception as e:
        print(f"[ERRO] Erro: {str(e)}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    main()

