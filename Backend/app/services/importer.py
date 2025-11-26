"""
Serviço de importação de CSV/XLSX com normalização e matching.
"""
import pandas as pd
import json
import re
from typing import Dict, List, Optional, Tuple, Any
from decimal import Decimal, InvalidOperation
from datetime import datetime
from pathlib import Path
from rapidfuzz import fuzz, process
from sqlalchemy.orm import Session
from app.models import (
    Fornecedor, Rubrica, Usuario, Despesa, StatusDespesa,
    TipoRubrica, StatusRubrica
)
from app.crud import (
    get_rubrica_by_codigo_exercicio, create_rubrica, get_fornecedor,
    create_despesa, create_import_batch, update_import_batch
)
from app.schemas import ColumnMapping


def normalize_name(name: str) -> str:
    """
    Normaliza nome: uppercase, remove acentos, trim, compacta espaços.
    """
    if not name or not isinstance(name, str):
        return ""
    
    # Remove acentos (simplificado)
    import unicodedata
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    
    # Uppercase, trim, compacta espaços
    name = name.upper().strip()
    name = re.sub(r'\s+', ' ', name)
    
    return name


def normalize_code(codigo: str) -> str:
    """
    Normaliza código: trim + uppercase.
    """
    if not codigo or not isinstance(codigo, str):
        return ""
    return codigo.strip().upper()


def parse_currency(valor_str: str) -> Optional[Decimal]:
    """
    Parse valor monetário suportando formatos:
    - "1.234.567,89" (formato PT)
    - "1,234,567.89" (formato EN)
    - "1234567.89"
    - "1234567,89"
    """
    if not valor_str or not isinstance(valor_str, str):
        return None
    
    # Remove espaços e símbolos de moeda
    valor_str = valor_str.strip().replace("€", "").replace("$", "").replace(" ", "")
    
    if not valor_str:
        return None
    
    # Detecta formato: se tem ponto e vírgula, verifica qual é separador decimal
    if "." in valor_str and "," in valor_str:
        # Verifica qual vem por último (geralmente é o separador decimal)
        last_dot = valor_str.rfind(".")
        last_comma = valor_str.rfind(",")
        
        if last_dot > last_comma:
            # Formato EN: 1,234,567.89
            valor_str = valor_str.replace(",", "")
        else:
            # Formato PT: 1.234.567,89
            valor_str = valor_str.replace(".", "").replace(",", ".")
    elif "," in valor_str:
        # Apenas vírgula, assume separador decimal
        valor_str = valor_str.replace(".", "").replace(",", ".")
    # Se só tem ponto ou nenhum, assume formato padrão
    
    try:
        return Decimal(valor_str)
    except (InvalidOperation, ValueError):
        return None


def parse_date(date_str: str) -> Optional[datetime]:
    """
    Tenta parsear data em vários formatos.
    """
    if not date_str or not isinstance(date_str, str):
        return None
    
    date_str = date_str.strip()
    
    # Formatos comuns
    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
        "%Y.%m.%d",
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    
    # Tenta parsear como datetime do pandas
    try:
        return pd.to_datetime(date_str).to_pydatetime()
    except:
        pass
    
    return None


class FornecedorMatcher:
    """Classe para matching de fornecedores."""
    
    def __init__(self, db: Session):
        self.db = db
        self._cache = None
    
    def _load_fornecedores(self):
        """Carrega todos os fornecedores ativos em cache."""
        if self._cache is None:
            fornecedores = self.db.query(Fornecedor).filter(
                Fornecedor.activo == True
            ).all()
            
            self._cache = []
            for f in fornecedores:
                usuario = f.usuario
                self._cache.append({
                    "id": f.id,
                    "nuit": normalize_code(usuario.nuit) if usuario.nuit else None,
                    "codigo_interno": normalize_code(f.codigo_interno) if f.codigo_interno else None,
                    "nome_normalizado": normalize_name(usuario.nome) if usuario.nome else "",
                    "nome_original": usuario.nome
                })
    
    def match(self, nome: str, nuit: Optional[str] = None, codigo: Optional[str] = None) -> Tuple[Optional[int], Dict[str, Any]]:
        """
        Faz matching de fornecedor com prioridade:
        1. nuit (exact match)
        2. codigo_interno (exact match)
        3. nome_normalizado (exact match)
        4. fuzzy match (score >= 90%)
        5. None (não encontrado)
        
        Retorna: (fornecedor_id, sugestoes)
        """
        self._load_fornecedores()
        
        nome_norm = normalize_name(nome)
        nuit_norm = normalize_code(nuit) if nuit else None
        codigo_norm = normalize_code(codigo) if codigo else None
        
        sugestoes = {
            "exact_matches": [],
            "fuzzy_matches": []
        }
        
        # 1. Match por NUIT
        if nuit_norm:
            for f in self._cache:
                if f["nuit"] and f["nuit"] == nuit_norm:
                    return f["id"], sugestoes
        
        # 2. Match por código interno
        if codigo_norm:
            for f in self._cache:
                if f["codigo_interno"] and f["codigo_interno"] == codigo_norm:
                    sugestoes["exact_matches"].append({
                        "id": f["id"],
                        "nome": f["nome_original"],
                        "tipo": "codigo_interno"
                    })
                    return f["id"], sugestoes
        
        # 3. Match exato por nome normalizado
        for f in self._cache:
            if f["nome_normalizado"] == nome_norm:
                sugestoes["exact_matches"].append({
                    "id": f["id"],
                    "nome": f["nome_original"],
                    "tipo": "nome_exato"
                })
                return f["id"], sugestoes
        
        # 4. Fuzzy match
        if nome_norm:
            matches = process.extract(
                nome_norm,
                [f["nome_normalizado"] for f in self._cache if f["nome_normalizado"]],
                limit=5,
                scorer=fuzz.ratio
            )
            
            for match_name, score, _ in matches:
                if score >= 90:
                    # Encontra o fornecedor correspondente
                    for f in self._cache:
                        if f["nome_normalizado"] == match_name:
                            sugestoes["fuzzy_matches"].append({
                                "id": f["id"],
                                "nome": f["nome_original"],
                                "score": score,
                                "tipo": "fuzzy"
                            })
                            if score >= 90:
                                return f["id"], sugestoes
                            break
        
        return None, sugestoes


class RubricaMatcher:
    """Classe para matching de rubricas."""
    
    def __init__(self, db: Session, exercicio: int):
        self.db = db
        self.exercicio = exercicio
    
    def match(self, codigo: str) -> Tuple[Optional[int], bool]:
        """
        Busca rubrica por código e exercício.
        Se não existir, cria rubrica provisória.
        
        Retorna: (rubrica_id, foi_criada)
        """
        codigo_norm = normalize_code(codigo)
        
        rubrica = get_rubrica_by_codigo_exercicio(self.db, codigo_norm, self.exercicio)
        
        if rubrica:
            return rubrica.id, False
        
        # Cria rubrica provisória
        from app.schemas import RubricaCreate
        rubrica_create = RubricaCreate(
            codigo=codigo_norm,
            designacao=f"Rubrica provisória {codigo_norm}",
            tipo=TipoRubrica.DESPESA,
            nivel=1,
            dotacao=Decimal("0.00"),
            exercicio=self.exercicio,
            status=StatusRubrica.PROVISORIA
        )
        
        nova_rubrica = create_rubrica(self.db, rubrica_create)
        return nova_rubrica.id, True


class ImportProcessor:
    """Processador de importação de arquivos."""
    
    def __init__(self, db: Session, user_id: int, exercicio: int):
        self.db = db
        self.user_id = user_id
        self.exercicio = exercicio
        self.fornecedor_matcher = FornecedorMatcher(db)
        self.rubrica_matcher = RubricaMatcher(db, exercicio)
    
    def read_file(self, file_path: str, file_type: str, sheet_name: Optional[str] = None) -> pd.DataFrame:
        """
        Lê arquivo CSV ou XLSX.
        
        Args:
            file_path: Caminho do arquivo
            file_type: Tipo do arquivo ('csv' ou 'xlsx')
            sheet_name: Nome da folha do Excel (None = primeira folha)
        """
        if file_type == "csv":
            # Tenta detectar encoding e separador
            try:
                df = pd.read_csv(file_path, encoding="utf-8")
            except:
                try:
                    df = pd.read_csv(file_path, encoding="latin-1")
                except:
                    df = pd.read_csv(file_path, encoding="iso-8859-1")
        elif file_type == "xlsx":
            # Se sheet_name não especificado, lê a primeira folha
            try:
                df = pd.read_excel(
                    file_path, 
                    engine="openpyxl", 
                    sheet_name=sheet_name,
                    header=0,  # Primeira linha como cabeçalho
                    na_values=['', ' ', 'NaN', 'N/A'],  # Valores a considerar como NaN
                    keep_default_na=True
                )
                # Se retornar dict (múltiplas folhas), pega a primeira
                if isinstance(df, dict):
                    df = list(df.values())[0] if df else pd.DataFrame()
                
                # Remove colunas completamente vazias
                if not df.empty:
                    df = df.dropna(axis=1, how='all')
                    # Remove linhas completamente vazias
                    df = df.dropna(axis=0, how='all')
                    
            except Exception as e:
                raise ValueError(f"Erro ao ler arquivo Excel: {str(e)}")
        else:
            raise ValueError(f"Tipo de arquivo não suportado: {file_type}")
        
        return df if df is not None else pd.DataFrame()
    
    def get_excel_sheets(self, file_path: str) -> List[str]:
        """
        Retorna lista de nomes das folhas de um arquivo Excel.
        """
        import os
        excel_file = None
        try:
            # Verifica se o arquivo existe
            if not os.path.exists(file_path):
                raise ValueError(f"Arquivo não encontrado: {file_path}")
            
            excel_file = pd.ExcelFile(file_path, engine="openpyxl")
            sheet_names = excel_file.sheet_names
            
            return sheet_names if sheet_names else []
        except Exception as e:
            raise ValueError(f"Erro ao ler folhas do Excel: {str(e)}")
        finally:
            # Fecha o arquivo explicitamente
            if excel_file is not None:
                try:
                    excel_file.close()
                except:
                    pass
    
    def process_row(
        self, row: Dict[str, Any], mapping: ColumnMapping, linha_numero: int
    ) -> Dict[str, Any]:
        """
        Processa uma linha do arquivo.
        Retorna dict com dados processados e erros.
        """
        resultado = {
            "linha_numero": linha_numero,
            "erros": [],
            "warnings": [],
            "despesa_data": None,
            "fornecedor_id": None,
            "rubrica_id": None,
            "fornecedor_criado": False,
            "rubrica_criada": False
        }
        
        # Extrai valores das colunas
        try:
            codigo_rubrica = str(row.get(mapping.codigo_rubrica, "")).strip()
            fornecedor_nome = str(row.get(mapping.fornecedor, "")).strip()
            valor_str = str(row.get(mapping.valor, "")).strip()
            
            # Opcionais
            data_str = str(row.get(mapping.data, "")).strip() if mapping.data else None
            ordem_pagamento = str(row.get(mapping.ordem_pagamento, "")).strip() if mapping.ordem_pagamento else None
            justificativo = str(row.get(mapping.justificativo, "")).strip() if mapping.justificativo else None
            requisicao = str(row.get(mapping.requisicao, "")).strip() if mapping.requisicao else None
        except Exception as e:
            resultado["erros"].append(f"Erro ao extrair colunas: {str(e)}")
            return resultado
        
        # Validações básicas
        if not codigo_rubrica:
            resultado["erros"].append("Código de rubrica vazio")
        
        if not fornecedor_nome:
            resultado["erros"].append("Nome de fornecedor vazio")
        
        # Parse valor
        valor = parse_currency(valor_str)
        if valor is None:
            resultado["erros"].append(f"Valor inválido: {valor_str}")
        elif valor <= 0:
            resultado["erros"].append(f"Valor deve ser positivo: {valor}")
        
        # Parse data
        data_emissao = None
        if data_str:
            data_emissao = parse_date(data_str)
            if data_emissao is None:
                resultado["warnings"].append(f"Data não reconhecida: {data_str}")
        
        # Se há erros críticos, para aqui
        if resultado["erros"]:
            return resultado
        
        # Matching de rubrica
        rubrica_id, rubrica_criada = self.rubrica_matcher.match(codigo_rubrica)
        resultado["rubrica_id"] = rubrica_id
        resultado["rubrica_criada"] = rubrica_criada
        
        if rubrica_criada:
            resultado["warnings"].append(f"Rubrica provisória criada: {codigo_rubrica}")
        
        # Matching de fornecedor
        fornecedor_id, sugestoes = self.fornecedor_matcher.match(fornecedor_nome)
        resultado["fornecedor_id"] = fornecedor_id
        resultado["sugestoes"] = sugestoes
        
        if not fornecedor_id:
            resultado["warnings"].append(f"Fornecedor não encontrado: {fornecedor_nome}")
            # Em produção, poderia criar fornecedor provisório aqui
        
        # Determina mês da despesa
        mes = data_emissao.month if data_emissao else datetime.now().month
        
        # Prepara dados da despesa
        resultado["despesa_data"] = {
            "rubrica_id": rubrica_id,
            "fornecedor_id": fornecedor_id,
            "fornecedor_text": fornecedor_nome if not fornecedor_id else None,
            "requisicao": requisicao,
            "justificativo": justificativo,
            "ordem_pagamento": ordem_pagamento,
            "valor": valor,
            "data_emissao": data_emissao,
            "exercicio": self.exercicio,
            "mes": mes,
            "status": StatusDespesa.PENDENTE
        }
        
        return resultado
    
    def execute_import(
        self, file_path: str, file_type: str, mapping: ColumnMapping, 
        batch_id: int, dry_run: bool = False, sheet_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executa importação completa.
        
        Args:
            file_path: Caminho do arquivo
            file_type: Tipo do arquivo
            mapping: Mapeamento de colunas
            batch_id: ID do batch
            dry_run: Se True, não persiste dados
            sheet_name: Nome da folha do Excel (None = primeira folha)
        """
        # Lê arquivo
        try:
            df = self.read_file(file_path, file_type, sheet_name=sheet_name)
        except Exception as e:
            return {
                "success": False,
                "error": f"Erro ao ler arquivo: {str(e)}"
            }
        
        total_rows = len(df)
        criadas = 0
        atualizadas = 0
        erros = 0
        detalhes_erros = []
        
        # Processa cada linha
        for idx, row in df.iterrows():
            linha_numero = idx + 2  # +2 porque começa em 0 e há header
            
            resultado = self.process_row(row.to_dict(), mapping, linha_numero)
            
            if resultado["erros"]:
                erros += 1
                detalhes_erros.append({
                    "linha": linha_numero,
                    "erros": resultado["erros"],
                    "warnings": resultado["warnings"]
                })
                continue
            
            # Cria despesa se não for dry_run
            if not dry_run and resultado["despesa_data"]:
                try:
                    from app.schemas import DespesaCreate
                    despesa_create = DespesaCreate(
                        **resultado["despesa_data"],
                        batch_id=batch_id
                    )
                    create_despesa(self.db, despesa_create)
                    criadas += 1
                except Exception as e:
                    erros += 1
                    detalhes_erros.append({
                        "linha": linha_numero,
                        "erros": [f"Erro ao criar despesa: {str(e)}"]
                    })
        
        # Atualiza batch
        if not dry_run:
            update_import_batch(
                self.db,
                batch_id,
                linhas_processadas=total_rows,
                criadas=criadas,
                atualizadas=atualizadas,
                erros=erros,
                detalhes=json.dumps(detalhes_erros, default=str) if detalhes_erros else None
            )
        
        return {
            "success": True,
            "total_rows": total_rows,
            "criadas": criadas,
            "atualizadas": atualizadas,
            "erros": erros,
            "detalhes": detalhes_erros
        }

