"""
Aplicação principal FastAPI do Sistema Contabil.
"""
import logging
import os
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from app.api import auth, import_api, rubricas, despesas, dotacao_global, despesas_confirm, usuarios, funcionarios, fornecedores, dashboard_events
from app.config import settings

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Criar instância FastAPI
app = FastAPI(
    title="Sistema Contabil API",
    description="Sistema orçamental mínimo viável",
    version="1.0.0"
)

# Lifespan para limpar recursos ao desligar
@app.on_event("shutdown")
async def shutdown_event():
    """Limpar recursos ao desligar o servidor."""
    import logging
    import asyncio
    logger = logging.getLogger(__name__)
    logger.info("Servidor desligando, limpando recursos...")
    
    # Marcar que servidor está desligando para fechar conexões SSE
    from app.api.dashboard_events import event_queues, _shutting_down
    import app.api.dashboard_events as dashboard_events_module
    
    # Atualizar flag global IMEDIATAMENTE
    dashboard_events_module._shutting_down = True
    
    # Enviar evento de shutdown para todas as filas para fechar conexões
    shutdown_event = {
        "type": "shutdown",
        "data": {"message": "Servidor está desligando"},
        "timestamp": datetime.now().isoformat()
    }
    
    for exercicio, queue in event_queues.items():
        try:
            # Adicionar evento de shutdown para cada fila (múltiplas vezes para garantir)
            for _ in range(10):  # Enviar múltiplos eventos para garantir que seja recebido
                try:
                    queue.put_nowait(shutdown_event)
                except:
                    break
        except:
            pass
    
    # Limpar filas imediatamente (não esperar)
    event_queues.clear()
    logger.info("Recursos limpos com sucesso.")

# CORS - permitir frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção, especificar domínios
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir routers
app.include_router(auth.router, prefix="/auth", tags=["Autenticação"])
app.include_router(usuarios.router, prefix="/api/v1/usuarios", tags=["Usuários"])
app.include_router(funcionarios.router, prefix="/api/v1/funcionarios", tags=["Funcionários"])
app.include_router(fornecedores.router, prefix="/api/v1/fornecedores", tags=["Fornecedores"])
app.include_router(import_api.router, prefix="/api/v1/import", tags=["Importação"])
app.include_router(rubricas.router, prefix="/api/v1", tags=["Rubricas"])
app.include_router(despesas.router, prefix="/api/v1/despesas", tags=["Despesas"])
app.include_router(dotacao_global.router, prefix="/api/v1/dotacao_global", tags=["Dotação Global"])
app.include_router(despesas_confirm.router, prefix="/api/v1/despesas", tags=["Confirmação de Despesas"])
app.include_router(dashboard_events.router, prefix="/api/v1/dashboard", tags=["Dashboard Events"])

# Servir frontend estático na raiz
frontend_dir = "frontend"
if os.path.exists(frontend_dir):
    # Servir arquivos estáticos (CSS, JS, imagens, etc.)
    # IMPORTANTE: Montar ANTES dos handlers específicos de HTML
    app.mount("/css", StaticFiles(directory=os.path.join(frontend_dir, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(frontend_dir, "js")), name="js")
    app.mount("/img", StaticFiles(directory=os.path.join(frontend_dir, "img")), name="img")
    
    # Lista de arquivos HTML permitidos
    html_files = ["index.html", "home.html", "dashboard.html", "dashboard_new.html", 
                 "rubricas.html", "setup_dotacao.html", "dotacao_mov.html",
                 "usuarios.html", "funcionarios.html", "fornecedores.html", "despesas.html", 
                 "tree.html", "tabela-mensal.html"]
    
    # Redirecionar raiz para home.html (página inicial pública)
    @app.get("/")
    async def root():
        """Redireciona para a página inicial pública de disposição orçamental."""
        home_path = os.path.join(frontend_dir, "home.html")
        if os.path.exists(home_path):
            return FileResponse(home_path)
        # Fallback para tree.html se home.html não existir
        tree_path = os.path.join(frontend_dir, "tree.html")
        if os.path.exists(tree_path):
            return FileResponse(tree_path)
        # Fallback para index.html
        index_path = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {
            "message": "Sistema Contabil API",
            "version": "1.0.0",
            "docs": "/docs"
        }
    
    # Servir arquivos HTML específicos na raiz
    def create_serve_handler(html_file: str):
        """Factory para criar handlers de arquivos HTML."""
        async def serve_html():
            """Serve arquivo HTML do frontend."""
            return FileResponse(os.path.join(frontend_dir, html_file))
        return serve_html
    
    for html_file in html_files:
        file_path = os.path.join(frontend_dir, html_file)
        if os.path.exists(file_path):
            app.get(f"/{html_file}")(create_serve_handler(html_file))
else:
    @app.get("/")
    async def root():
        """Endpoint raiz."""
        return {
            "message": "Sistema Contabil API",
            "version": "1.0.0",
            "docs": "/docs"
        }


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok"}

