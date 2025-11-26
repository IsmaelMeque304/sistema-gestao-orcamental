"""
API de importação de arquivos CSV/XLSX.
"""
import os
import uuid
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.db import get_db
from app.api.auth import get_current_user
from app.models import Usuario, ImportBatch, Despesa
from app.schemas import (
    ImportUploadResponse, ImportExecuteRequest, ImportBatchResponse,
    ImportLineResponse, ColumnMapping
)
from app.crud import create_import_batch, get_import_batch
from app.services.importer import ImportProcessor
from app.config import settings
import pandas as pd
import json

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/upload", response_model=ImportUploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload de arquivo CSV/XLSX.
    Retorna preview (primeiras 10 linhas) e batch_id.
    """
    try:
        logger.info(f"Iniciando upload: {file.filename}")
    except:
        pass  # Se logging falhar, continua
    
    # Valida tipo de arquivo
    try:
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in [".csv", ".xlsx", ".xls"]:
            raise HTTPException(
                status_code=400,
                detail="Tipo de arquivo não suportado. Use CSV ou XLSX."
            )
        
        file_type = "csv" if file_ext == ".csv" else "xlsx"
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao validar arquivo: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao processar arquivo: {str(e)}"
        )
    
    # Cria batch primeiro para ter o ID
    try:
        logger.info("Criando batch...")
        batch = create_import_batch(
            db=db,
            file_name=file.filename,
            tipo=file_type,
            user_id=current_user.id
        )
        logger.info(f"Batch criado: {batch.id}")
    except Exception as e:
        logger.error(f"Erro ao criar batch: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao criar batch: {str(e)}"
        )
    
    # Gera nome único para o arquivo usando batch_id
    file_name = f"batch_{batch.id}{file_ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, file_name)
    logger.info(f"Salvando arquivo em: {file_path}")
    
    # Salva arquivo
    try:
        with open(file_path, "wb") as f:
            logger.info("Lendo conteúdo do arquivo...")
            content = await file.read()
            logger.info(f"Conteúdo lido: {len(content)} bytes")
            if len(content) > settings.MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"Arquivo muito grande. Máximo: {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB"
                )
            logger.info("Escrevendo arquivo...")
            f.write(content)
            logger.info("Arquivo salvo com sucesso")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao salvar arquivo: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao salvar arquivo: {str(e)}"
        )
    
    # Lê preview (primeiras 10 linhas)
    sheets = None
    current_sheet = None
    preview = []
    total_rows = 0
    
    try:
        logger.info(f"Processando upload: {file.filename}, tipo: {file_type}")
        processor = ImportProcessor(db, current_user.id, exercicio=2024)
        
        # Se for Excel, detecta folhas disponíveis
        if file_type == "xlsx":
            try:
                logger.info(f"Lendo folhas do Excel: {file_path}")
                sheets = processor.get_excel_sheets(file_path)
                logger.info(f"Folhas encontradas: {sheets}")
                current_sheet = sheets[0] if sheets else None
                # Lê a primeira folha por padrão
                if current_sheet:
                    logger.info(f"Lendo folha: {current_sheet}")
                    df = processor.read_file(file_path, file_type, sheet_name=current_sheet)
                else:
                    logger.info("Lendo primeira folha (padrão)")
                    df = processor.read_file(file_path, file_type)
            except Exception as e:
                # Se erro ao ler folhas, tenta ler sem especificar folha
                import traceback
                logger.error(f"Erro ao ler folhas do Excel: {str(e)}")
                logger.error(traceback.format_exc())
                try:
                    logger.info("Tentando ler sem especificar folha")
                    df = processor.read_file(file_path, file_type)
                except Exception as e2:
                    logger.error(f"Erro ao ler arquivo Excel: {str(e2)}")
                    logger.error(traceback.format_exc())
                    # Não levanta exceção, apenas retorna batch_id
                    df = None
        else:
            logger.info(f"Lendo arquivo CSV: {file_path}")
            df = processor.read_file(file_path, file_type)
        
        if df is not None and not df.empty:
            try:
                logger.info(f"Convertendo preview, {len(df)} linhas, {len(df.columns)} colunas")
                # Limita a 10 linhas
                preview_df = df.head(10).copy()
                
                # Converte todos os valores NaN/nan para None (JSON serializable)
                def clean_value(val):
                    """Limpa valores para serialização JSON."""
                    if pd.isna(val) or (isinstance(val, float) and (val != val or val == float('inf') or val == float('-inf'))):
                        return None
                    # Converte outros tipos problemáticos
                    if isinstance(val, (pd.Timestamp, pd.DatetimeTZDtype)):
                        return str(val)
                    return val
                
                # Aplica limpeza em todas as células
                for col in preview_df.columns:
                    preview_df[col] = preview_df[col].apply(clean_value)
                
                # Converte para dict
                preview = preview_df.to_dict(orient="records")
                
                # Limpa recursivamente qualquer valor nan restante
                def clean_dict(d):
                    """Limpa dict recursivamente."""
                    if isinstance(d, dict):
                        return {k: clean_dict(v) for k, v in d.items()}
                    elif isinstance(d, list):
                        return [clean_dict(item) for item in d]
                    elif pd.isna(d) or (isinstance(d, float) and (d != d or d == float('inf') or d == float('-inf'))):
                        return None
                    return d
                
                preview = clean_dict(preview)
                total_rows = len(df)
                logger.info(f"Preview convertido com sucesso, {len(preview)} linhas")
            except Exception as e:
                import traceback
                logger.error(f"Erro ao converter preview: {str(e)}")
                logger.error(traceback.format_exc())
                preview = []
                total_rows = 0
        else:
            logger.warning("DataFrame vazio ou None")
            preview = []
            total_rows = 0
    except HTTPException:
        raise
    except Exception as e:
        # Se erro ao ler, ainda retorna batch_id mas loga o erro
        import traceback
        logger.error(f"Erro ao processar preview: {str(e)}")
        logger.error(traceback.format_exc())
        preview = []
        total_rows = 0
        # Não levanta exceção para não perder o batch_id
    
    try:
        logger.info(f"Retornando resposta, batch_id: {batch.id}")
        # Garante que sheets e current_sheet são serializáveis
        sheets_list = list(sheets) if sheets else None
        current_sheet_str = str(current_sheet) if current_sheet else None
        
        response = ImportUploadResponse(
            batch_id=batch.id,
            file_name=file.filename or "arquivo",
            preview=preview or [],
            total_rows=total_rows or 0,
            sheets=sheets_list,
            current_sheet=current_sheet_str
        )
        logger.info("Resposta criada com sucesso")
        return response
    except Exception as e:
        import traceback
        error_msg = f"Erro ao criar resposta: {str(e)}"
        logger.error(error_msg)
        logger.error(traceback.format_exc())
        # Tenta retornar resposta mínima
        try:
            return ImportUploadResponse(
                batch_id=batch.id,
                file_name=file.filename or "arquivo",
                preview=[],
                total_rows=0,
                sheets=None,
                current_sheet=None
            )
        except:
            raise HTTPException(
                status_code=500,
                detail=error_msg
            )


@router.post("/execute")
async def execute_import(
    batch_id: int = Form(...),
    codigo_rubrica: str = Form(...),
    fornecedor: str = Form(...),
    valor: str = Form(...),
    data: str = Form(None),
    ordem_pagamento: str = Form(None),
    justificativo: str = Form(None),
    requisicao: str = Form(None),
    exercicio: int = Form(2024),
    sheet_name: str = Form(None),  # Nome da folha do Excel
    dry_run: bool = Form(False),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Executa importação com mapeamento de colunas.
    """
    # Busca batch
    batch = get_import_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch não encontrado")
    
    if batch.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    # Monta mapeamento
    mapping = ColumnMapping(
        codigo_rubrica=codigo_rubrica,
        fornecedor=fornecedor,
        valor=valor,
        data=data,
        ordem_pagamento=ordem_pagamento,
        justificativo=justificativo,
        requisicao=requisicao
    )
    
    # Encontra arquivo usando batch_id
    file_ext = ".csv" if batch.tipo == "csv" else ".xlsx"
    file_name = f"batch_{batch_id}{file_ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, file_name)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    
    # Processa importação
    try:
        processor = ImportProcessor(db, current_user.id, exercicio=exercicio)
        resultado = processor.execute_import(
            file_path=file_path,
            file_type=batch.tipo,
            mapping=mapping,
            batch_id=batch_id,
            dry_run=dry_run,
            sheet_name=sheet_name if sheet_name else None
        )
        
        return resultado
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar importação: {str(e)}"
        )


@router.get("/{batch_id}/lines", response_model=List[ImportLineResponse])
async def get_import_lines(
    batch_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Lista linhas importadas de um batch.
    """
    batch = get_import_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch não encontrado")
    
    if batch.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    # Busca despesas do batch
    despesas = db.query(Despesa).filter(Despesa.batch_id == batch_id).all()
    
    lines = []
    for idx, despesa in enumerate(despesas, start=1):
        lines.append(ImportLineResponse(
            linha_numero=idx,
            despesa_id=despesa.id,  # ID da despesa para confirmação
            codigo_rubrica=despesa.rubrica.codigo if despesa.rubrica else "",
            fornecedor=despesa.fornecedor.usuario.nome if despesa.fornecedor else despesa.fornecedor_text or "",
            valor=despesa.valor,
            data=despesa.data_emissao,
            ordem_pagamento=despesa.ordem_pagamento,
            status=despesa.status.value,
            mensagem_erro=None,
            fornecedor_match_id=despesa.fornecedor_id,
            rubrica_match_id=despesa.rubrica_id,
            sugestoes=None
        ))
    
    return lines


@router.get("/{batch_id}", response_model=ImportBatchResponse)
async def get_batch(
    batch_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retorna detalhes de um batch."""
    batch = get_import_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch não encontrado")
    
    if batch.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    return batch


@router.post("/{batch_id}/preview-sheet")
async def preview_sheet(
    batch_id: int,
    sheet_name: str = Form(...),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Carrega preview de uma folha específica do Excel.
    """
    batch = get_import_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch não encontrado")
    
    if batch.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    if batch.tipo != "xlsx":
        raise HTTPException(status_code=400, detail="Apenas arquivos Excel têm folhas")
    
    # Encontra arquivo
    file_ext = ".xlsx"
    file_name = f"batch_{batch_id}{file_ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, file_name)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    
    try:
        processor = ImportProcessor(db, current_user.id, exercicio=2024)
        df = processor.read_file(file_path, "xlsx", sheet_name=sheet_name)
        
        preview = df.head(10).to_dict(orient="records")
        total_rows = len(df)
        
        return {
            "sheet_name": sheet_name,
            "preview": preview,
            "total_rows": total_rows
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao ler folha: {str(e)}"
        )

