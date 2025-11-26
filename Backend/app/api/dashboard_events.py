"""
API de eventos em tempo real para o dashboard usando Server-Sent Events (SSE).
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from jose import JWTError, jwt
from app.db import get_db
from app.api.auth import get_current_user
from app.models import Usuario
from app.crud import get_usuario_by_username
from app.config import settings

router = APIRouter()

# Fila de eventos por exercício (em produção, usar Redis ou similar)
event_queues: Dict[int, asyncio.Queue] = {}

# Flag global para indicar que o servidor está desligando
_shutting_down = False


async def get_current_user_from_token(
    token: Optional[str] = Query(None, description="JWT token (para SSE)"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
) -> Usuario:
    """
    Dependency alternativa para autenticação via query parameter.
    Necessário porque EventSource não suporta headers customizados.
    
    Aceita token via query parameter (para SSE) ou via header Authorization (fallback).
    """
    import logging
    logger = logging.getLogger(__name__)
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Determinar qual token usar
    token_to_use = None
    
    # Prioridade 1: Token do query parameter (para SSE)
    if token:
        logger.info(f"Token recebido via query parameter (length: {len(token)})")
        token_to_use = token
    # Prioridade 2: Token do header Authorization (fallback para requisições normais)
    elif authorization and authorization.startswith("Bearer "):
        logger.info("Token recebido via Authorization header")
        token_to_use = authorization.replace("Bearer ", "")
    else:
        logger.warning("Nenhum token encontrado (nem query param nem header)")
    
    if not token_to_use:
        raise credentials_exception
    
    try:
        payload = jwt.decode(
            token_to_use, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        username: str = payload.get("sub")
        if username is None:
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
    except JWTError:
        raise credentials_exception


async def notify_dashboard_event(exercicio: int, event_type: str, data: Dict[str, Any]):
    """
    Notifica um evento para todos os clientes conectados ao exercício.
    """
    if exercicio not in event_queues:
        event_queues[exercicio] = asyncio.Queue()
    
    event = {
        "type": event_type,
        "data": data,
        "timestamp": datetime.now().isoformat()
    }
    
    # Enviar para a fila do exercício
    await event_queues[exercicio].put(event)


@router.get("/events")
async def stream_dashboard_events(
    exercicio: int = Query(..., description="Ano do exercício"),
    token: Optional[str] = Query(None, description="JWT token (para SSE via query parameter)"),
    current_user: Usuario = Depends(get_current_user_from_token)
):
    """
    Stream de eventos em tempo real usando Server-Sent Events (SSE).
    
    Eventos enviados:
    - despesa_confirmada: Quando uma despesa é confirmada
    - despesa_criada: Quando uma nova despesa é criada
    - despesa_atualizada: Quando uma despesa é atualizada
    - despesa_removida: Quando uma despesa é removida
    - dotacao_atualizada: Quando a dotação global é atualizada
    """
    # Criar fila para este exercício se não existir
    if exercicio not in event_queues:
        event_queues[exercicio] = asyncio.Queue()
    
    async def event_generator():
        queue = event_queues.get(exercicio)
        if not queue:
            return
        
        global _shutting_down
        
        try:
            while not _shutting_down:
                try:
                    # Aguardar evento com timeout de 1 segundo para verificar shutdown frequentemente
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                    
                    # Verificar se servidor está desligando antes de enviar
                    if _shutting_down:
                        break
                    
                    # Se evento for de shutdown, encerrar imediatamente
                    if isinstance(event, dict) and event.get("type") == "shutdown":
                        break
                    
                    # Formatar como SSE
                    event_data = json.dumps(event)
                    yield f"data: {event_data}\n\n"
                    
                except asyncio.TimeoutError:
                    # Verificar se servidor está desligando
                    if _shutting_down:
                        break
                    # Enviar heartbeat para manter conexão viva
                    yield ": heartbeat\n\n"
                    
        except asyncio.CancelledError:
            # Cliente desconectou ou servidor está sendo desligado
            # Isso é normal e esperado, não é um erro
            logger = logging.getLogger(__name__)
            logger.debug("Conexão SSE cancelada (cliente desconectou ou servidor desligando)")
            return
        except Exception as e:
            # Em caso de erro, enviar mensagem de erro
            logger = logging.getLogger(__name__)
            logger.error(f"Erro no stream SSE: {e}", exc_info=True)
            error_event = {
                "type": "error",
                "data": {"error": str(e)},
                "timestamp": datetime.now().isoformat()
            }
            try:
                yield f"data: {json.dumps(error_event)}\n\n"
            except:
                # Se não conseguir enviar, apenas retornar
                return
        finally:
            # Limpar recursos quando conexão for fechada
            logger = logging.getLogger(__name__)
            logger.debug(f"Conexão SSE fechada para exercício {exercicio}")
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Desabilitar buffering no Nginx
        }
    )


@router.get("/events/public")
async def stream_dashboard_events_public(
    exercicio: int = Query(..., description="Ano do exercício")
):
    """
    Stream de eventos em tempo real usando Server-Sent Events (SSE) - Versão pública.
    Não requer autenticação, para uso em páginas públicas.
    
    Eventos enviados:
    - despesa_confirmada: Quando uma despesa é confirmada
    - despesa_criada: Quando uma nova despesa é criada
    - despesa_atualizada: Quando uma despesa é atualizada
    - despesa_removida: Quando uma despesa é removida
    - dotacao_atualizada: Quando a dotação global é atualizada
    """
    # Criar fila para este exercício se não existir
    if exercicio not in event_queues:
        event_queues[exercicio] = asyncio.Queue()
    
    async def event_generator():
        queue = event_queues.get(exercicio)
        if not queue:
            return
        
        global _shutting_down
        
        try:
            while not _shutting_down:
                try:
                    # Aguardar evento com timeout de 1 segundo para verificar shutdown frequentemente
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                    
                    # Verificar se servidor está desligando antes de enviar
                    if _shutting_down:
                        break
                    
                    # Se evento for de shutdown, encerrar imediatamente
                    if isinstance(event, dict) and event.get("type") == "shutdown":
                        break
                    
                    # Formatar como SSE
                    event_data = json.dumps(event)
                    yield f"data: {event_data}\n\n"
                    
                except asyncio.TimeoutError:
                    # Verificar se servidor está desligando
                    if _shutting_down:
                        break
                    # Enviar heartbeat para manter conexão viva
                    yield ": heartbeat\n\n"
                    
        except asyncio.CancelledError:
            # Cliente desconectou ou servidor está sendo desligado
            logger = logging.getLogger(__name__)
            logger.debug("Conexão SSE pública cancelada (cliente desconectou ou servidor desligando)")
            return
        except Exception as e:
            # Em caso de erro, enviar mensagem de erro
            logger = logging.getLogger(__name__)
            logger.error(f"Erro no stream SSE público: {e}", exc_info=True)
            error_event = {
                "type": "error",
                "data": {"error": str(e)},
                "timestamp": datetime.now().isoformat()
            }
            try:
                yield f"data: {json.dumps(error_event)}\n\n"
            except:
                return
        finally:
            logger = logging.getLogger(__name__)
            logger.debug(f"Conexão SSE pública fechada para exercício {exercicio}")
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# Função auxiliar para notificar eventos (pode ser chamada de outros módulos)
def notify_event_sync(exercicio: int, event_type: str, data: Dict[str, Any]):
    """
    Versão síncrona para notificar eventos (para uso em código síncrono).
    Cria uma task assíncrona para enviar o evento.
    """
    # Criar fila para este exercício se não existir
    if exercicio not in event_queues:
        event_queues[exercicio] = asyncio.Queue()
    
    event = {
        "type": event_type,
        "data": data,
        "timestamp": datetime.now().isoformat()
    }
    
    # Adicionar evento à fila (thread-safe)
    try:
        queue = event_queues[exercicio]
        # Usar put_nowait para não bloquear
        queue.put_nowait(event)
    except asyncio.QueueFull:
        # Se a fila estiver cheia, remover eventos antigos
        try:
            queue.get_nowait()
            queue.put_nowait(event)
        except asyncio.QueueEmpty:
            pass

