// ============================================================================
// Visualização de Rubricas - Cards Modernos e Intuitivos
// ============================================================================

// Página pública - não requer autenticação
// API_BASE já está declarado em common.js (carregado antes deste arquivo)

// Salvar referência original de formatMoney
let formatMoneyFromCommon = null;
if (typeof window !== 'undefined' && typeof window.formatMoney === 'function') {
    formatMoneyFromCommon = window.formatMoney.bind(window);
}

// Variáveis globais
let treeData = null;
let rootNode = null;
let currentExercicio = new Date().getFullYear();
let currentPath = []; // Caminho atual na hierarquia
let searchTerm = '';
let allNodes = []; // Todos os nós para busca rápida
let savedPathIds = null; // IDs do caminho para restaurar após recarregar

// Elementos DOM
let cardsGrid = null;

// ============================================================================
// Inicialização
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    cardsGrid = document.getElementById('cardsGrid');
    
    // Verificar se há parâmetro de exercício na URL
    const urlParams = new URLSearchParams(window.location.search);
    const exercicioParam = urlParams.get('exercicio');
    if (exercicioParam) {
        currentExercicio = parseInt(exercicioParam);
    }
    
    initExercicioSelector();
    setupEventListeners();
    loadData();
    
    // Inicializar monitoramento SSE
    initSSEStatus();
});

function initExercicioSelector() {
    const selector = document.getElementById('exercicioSelect');
    if (!selector) return;

    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        if (i === currentExercicio) {
            option.selected = true;
        }
        selector.appendChild(option);
    }

    selector.addEventListener('change', (e) => {
        currentExercicio = parseInt(e.target.value);
        currentPath = [];
        searchTerm = '';
        loadData();
        
        // Reconectar SSE com novo exercício
        if (sseConnection) {
            closeSSEConnection();
            setupSSEConnection();
        }
    });
}

function setupEventListeners() {
    // Botão Refresh
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            loadData();
        });
    }

    // Busca
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.trim().toLowerCase();
            handleSearch();
        });
    }

    // Botão Limpar Busca
    const btnClear = document.getElementById('clearSearch');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            document.getElementById('searchInput').value = '';
            searchTerm = '';
            btnClear.style.display = 'none';
            handleSearch();
        });
    }

    // Botão Home no breadcrumb - lógica condicional
    const breadcrumbHome = document.getElementById('breadcrumbHome');
    if (breadcrumbHome) {
        breadcrumbHome.addEventListener('click', () => {
            // Se está na raiz (página das rubricas), volta para home
            // Se está em sub-rubricas, volta para a raiz das rubricas
            if (currentPath.length === 0) {
                window.location.href = 'home.html';
            } else {
                navigateToRoot();
            }
        });
    }
}

// ============================================================================
// Carregamento de Dados
// ============================================================================

async function loadData() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const errorMessage = document.getElementById('errorMessage');
    
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    if (errorMessage) errorMessage.style.display = 'none';

    try {
        const response = await fetch(
            `${API_BASE}/api/v1/rubricas/tree?exercicio=${currentExercicio}`
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao carregar rubricas' }));
            throw new Error(error.detail || 'Erro ao carregar rubricas');
        }

        const data = await response.json();
        
        if (!data || data.length === 0) {
            throw new Error('Nenhuma rubrica encontrada para este exercício');
        }

        // Converter dados para formato de árvore
        if (data.length === 1) {
            treeData = data[0];
        } else if (data.length > 1) {
            const totalDotacao = data.reduce((sum, r) => {
                const val = parseFloat(r.dotacao_calculada) || 0;
                return sum + val;
            }, 0);
            treeData = { 
                id: 0, 
                codigo: 'Raiz', 
                designacao: 'Todas as Rubricas',
                dotacao_calculada: totalDotacao,
                children: data 
            };
        } else {
            throw new Error('Nenhuma rubrica encontrada');
        }

        // Processar árvore e criar índice
        rootNode = processTreeData(treeData);
        allNodes = flattenTree(rootNode);
        
        // Restaurar navegação se houver caminho salvo
        if (savedPathIds && savedPathIds.length > 0) {
            restoreNavigation(savedPathIds);
            savedPathIds = null;
        } else {
            // Navegar para a raiz apenas se não houver caminho salvo
            navigateToRoot();
        }

    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        if (errorMessage) {
            errorMessage.textContent = `Erro: ${error.message}`;
            errorMessage.style.display = 'block';
        }
    } finally {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }
}

// ============================================================================
// Processamento de Dados
// ============================================================================

function processTreeData(data, parent = null, depth = 0) {
    const node = {
        id: data.id,
        codigo: data.codigo || '',
        designacao: data.designacao || '',
        dotacao_calculada: parseFloat(data.dotacao_calculada) || 0,
        tipo: data.tipo || '',
        nivel: data.nivel || depth,
        parent: parent,
        children: [],
        depth: depth
    };

    if (data.children && Array.isArray(data.children)) {
        node.children = data.children.map(child => processTreeData(child, node, depth + 1));
    }

    return node;
}

function flattenTree(node, result = []) {
    result.push(node);
    if (node.children) {
        node.children.forEach(child => flattenTree(child, result));
    }
    return result;
}

// ============================================================================
// Navegação
// ============================================================================

function navigateToRoot() {
    currentPath = [];
    renderCards(rootNode.children || []);
    updateBreadcrumb(rootNode);
}

function navigateToNode(node) {
    if (!node) return;
    
    // Adicionar ao caminho
    const pathToNode = [];
    let current = node;
    while (current && current !== rootNode) {
        pathToNode.unshift(current);
        current = current.parent;
    }
    currentPath = pathToNode;
    
    // Renderizar filhos do nó
    renderCards(node.children || []);
    updateBreadcrumb(node);
}

function navigateToParent() {
    if (currentPath.length === 0) {
        navigateToRoot();
        return;
    }
    
    currentPath.pop();
    const targetNode = currentPath.length === 0 ? rootNode : currentPath[currentPath.length - 1];
    navigateToNode(targetNode);
}

// ============================================================================
// Renderização de Cards
// ============================================================================

function renderCards(nodes) {
    if (!cardsGrid) return;
    
    cardsGrid.innerHTML = '';
    
    if (!nodes || nodes.length === 0) {
        cardsGrid.innerHTML = `
            <div class="empty-state">
                <i class='bx bx-folder-open'></i>
                <p>Nenhuma rubrica encontrada neste nível</p>
            </div>
        `;
        return;
    }
    
    nodes.forEach(node => {
        const card = createCard(node);
        cardsGrid.appendChild(card);
    });
}

function createCard(node) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.nodeId = node.id;
    
    // Determinar cor baseado no nível
    const nivel = node.nivel || 0;
    let colorClass = 'card-level-0';
    let iconClass = 'bx-wallet'; // Ícone padrão para nível 0
    
    if (nivel === 1) {
        colorClass = 'card-level-1';
        iconClass = 'bx-money';
    } else if (nivel === 2) {
        colorClass = 'card-level-2';
        iconClass = 'bx-check-circle';
    } else if (nivel >= 3) {
        colorClass = 'card-level-3';
        iconClass = 'bx-lock-alt';
    }
    
    card.classList.add(colorClass);
    
    // Indicador de filhos
    const hasChildren = node.children && node.children.length > 0;
    const childrenCount = hasChildren ? node.children.length : 0;
    
    card.innerHTML = `
        <div class="card-header">
            <i class='bx ${iconClass}'></i>
            <div class="card-info">
                <div class="card-title-group">
                    <h3 class="card-title">${escapeHtml(node.designacao)}</h3>
                    ${hasChildren ? `
                        <span class="card-badge">
                            <i class='bx bx-folder'></i>
                            ${childrenCount}
                        </span>
                    ` : ''}
                </div>
                <div class="card-body">
                    <div class="card-code">
                        <span>${escapeHtml(node.codigo)}</span>
                    </div>
                    <div class="card-value">
                        <span class="card-value-number">${formatMoneyValue(node.dotacao_calculada)}</span>
                        <span class="card-value-words">${numberToWords(node.dotacao_calculada)}</span>
                    </div>
                </div>
            </div>
            ${hasChildren ? `
                <button class="card-expand-btn" title="Ver sub-rubricas">
                    <i class='bx bx-chevron-right'></i>
                </button>
            ` : ''}
        </div>
        ${hasChildren ? `
            <div class="card-footer">
                <span class="card-hint">Clique para ver ${childrenCount} sub-rubrica${childrenCount > 1 ? 's' : ''}</span>
            </div>
        ` : ''}
    `;
    
    // Event listeners
    if (hasChildren) {
        card.addEventListener('click', (e) => {
            // Não navegar se clicar no botão de expandir (já tem seu próprio handler)
            if (e.target.closest('.card-expand-btn')) return;
            navigateToNode(node);
        });
        
        const expandBtn = card.querySelector('.card-expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigateToNode(node);
            });
        }
    }
    
    // Hover para tooltip
    card.addEventListener('mouseenter', (e) => {
        showTooltip(e, node);
    });
    
    card.addEventListener('mouseleave', () => {
        hideTooltip();
    });
    
    return card;
}

// ============================================================================
// Breadcrumb
// ============================================================================

function updateBreadcrumb(node) {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;
    
    // Construir caminho completo
    const path = [];
    let current = node;
    while (current && current !== rootNode) {
        path.unshift(current);
        current = current.parent;
    }
    
    // Renderizar breadcrumb
    let html = `
        <button class="breadcrumb-home" id="breadcrumbHome" title="Voltar ao início">
            <i class='bx bx-home'></i>
        </button>
    `;
    
    path.forEach((n, index) => {
        html += `<span class="breadcrumb-separator">›</span>`;
        html += `
            <button class="breadcrumb-item ${index === path.length - 1 ? 'active' : ''}" 
                    data-node-id="${n.id}">
                ${escapeHtml(n.designacao)}
            </button>
        `;
    });
    
    breadcrumb.innerHTML = html;
    
    // Event listeners
    breadcrumb.querySelectorAll('.breadcrumb-item').forEach(item => {
        item.addEventListener('click', () => {
            const nodeId = parseInt(item.dataset.nodeId);
            const targetNode = allNodes.find(n => n.id === nodeId);
            if (targetNode) {
                navigateToNode(targetNode);
            }
        });
    });
    
    const homeBtn = breadcrumb.querySelector('.breadcrumb-home');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            // Se está na raiz (página das rubricas), volta para home
            // Se está em sub-rubricas, volta para a raiz das rubricas
            if (currentPath.length === 0) {
                window.location.href = 'home.html';
            } else {
                navigateToRoot();
            }
        });
    }
}

// ============================================================================
// Busca
// ============================================================================

function handleSearch() {
    const btnClear = document.getElementById('clearSearch');
    if (btnClear) {
        btnClear.style.display = searchTerm ? 'flex' : 'none';
    }
    
    if (!searchTerm) {
        // Se não há busca, mostrar o nível atual
        const currentNode = currentPath.length > 0 ? currentPath[currentPath.length - 1] : rootNode;
        renderCards(currentNode.children || []);
        return;
    }
    
    // Filtrar nós que correspondem à busca
    const matches = allNodes.filter(node => {
        const codigo = (node.codigo || '').toLowerCase();
        const designacao = (node.designacao || '').toLowerCase();
        return codigo.includes(searchTerm) || designacao.includes(searchTerm);
    });
    
    if (matches.length > 0) {
        renderCards(matches);
        updateBreadcrumbForSearch();
    } else {
        cardsGrid.innerHTML = `
            <div class="empty-state">
                <i class='bx bx-search-alt'></i>
                <p>Nenhuma rubrica encontrada para "${escapeHtml(searchTerm)}"</p>
            </div>
        `;
    }
}

function updateBreadcrumbForSearch() {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;
    
    breadcrumb.innerHTML = `
        <button class="breadcrumb-home" id="breadcrumbHome" title="Voltar ao início">
            <i class='bx bx-home'></i>
        </button>
        <span class="breadcrumb-separator">›</span>
        <span class="breadcrumb-item active">Resultados da busca: "${escapeHtml(searchTerm)}"</span>
    `;
    
    const homeBtn = breadcrumb.querySelector('.breadcrumb-home');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            // Limpar busca e voltar para raiz
            document.getElementById('searchInput').value = '';
            searchTerm = '';
            handleSearch();
            // Se estava na raiz, volta para home, senão volta para raiz das rubricas
            if (currentPath.length === 0) {
                window.location.href = 'home.html';
            } else {
                navigateToRoot();
            }
        });
    }
}

// ============================================================================
// Tooltip
// ============================================================================

function showTooltip(event, node) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;
    
    tooltip.innerHTML = `
        <div class="tooltip-title">${escapeHtml(node.codigo)}</div>
        <div class="tooltip-item">
            <span class="tooltip-label">Designação:</span>
            <span class="tooltip-value">${escapeHtml(node.designacao)}</span>
        </div>
        <div class="tooltip-item">
            <span class="tooltip-label">Dotação Calculada:</span>
            <span class="tooltip-value">${formatMoneyValue(node.dotacao_calculada)}</span>
        </div>
        <div class="tooltip-item">
            <span class="tooltip-label">Nível:</span>
            <span class="tooltip-value">${node.nivel || 0}</span>
        </div>
        ${node.children && node.children.length > 0 ? `
        <div class="tooltip-item">
            <span class="tooltip-label">Sub-rubricas:</span>
            <span class="tooltip-value">${node.children.length}</span>
        </div>
        ` : ''}
    `;
    
    tooltip.style.display = 'block';
    tooltip.style.left = (event.pageX + 10) + 'px';
    tooltip.style.top = (event.pageY + 10) + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

// ============================================================================
// Utilitários
// ============================================================================

function formatMoneyValue(value) {
    if (formatMoneyFromCommon) {
        try {
            return formatMoneyFromCommon(value, 'MZN');
        } catch (e) {
            console.warn('Erro ao usar formatMoney de common.js:', e);
        }
    }
    
    if (value === null || value === undefined || isNaN(value)) {
        return '0,00 MZN';
    }
    
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const formatted = Math.abs(numValue).toFixed(2).replace('.', ',');
    const parts = formatted.split(',');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    
    return `${parts.join(',')} MZN`;
}

// ============================================================================
// Conversão de Números para Extenso (Português)
// ============================================================================

function numberToWords(num) {
    if (num === 0 || num === null || num === undefined || isNaN(num)) {
        return 'Zero meticais';
    }
    
    const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    const especiais = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
    const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    
    function convertGroup(n) {
        if (n === 0) return '';
        if (n === 100) return 'cem';
        
        let result = '';
        const c = Math.floor(n / 100);
        const d = Math.floor((n % 100) / 10);
        const u = n % 10;
        
        if (c > 0) {
            result += centenas[c];
            if (d > 0 || u > 0) result += ' e ';
        }
        
        if (d === 1) {
            result += especiais[u];
        } else {
            if (d > 1) {
                result += dezenas[d];
                if (u > 0) result += ' e ';
            }
            if (u > 0) {
                result += unidades[u];
            }
        }
        
        return result;
    }
    
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    const numInt = Math.floor(Math.abs(numValue));
    const numDec = Math.round((Math.abs(numValue) - numInt) * 100);
    
    if (numInt === 0 && numDec === 0) return 'Zero meticais';
    
    let result = '';
    const parts = [];
    
    // Bilhões (mil milhões)
    const bilhoes = Math.floor(numInt / 1000000000);
    if (bilhoes > 0) {
        if (bilhoes === 1) {
            parts.push('um mil milhões');
        } else {
            parts.push(convertGroup(bilhoes) + ' mil milhões');
        }
    }
    
    // Milhões
    const milhoes = Math.floor((numInt % 1000000000) / 1000000);
    if (milhoes > 0) {
        if (milhoes === 1) {
            parts.push('um milhão');
        } else {
            parts.push(convertGroup(milhoes) + ' milhões');
        }
    }
    
    // Milhares
    const milhares = Math.floor((numInt % 1000000) / 1000);
    if (milhares > 0) {
        if (milhares === 1) {
            parts.push('mil');
        } else {
            parts.push(convertGroup(milhares) + ' mil');
        }
    }
    
    // Centenas, dezenas e unidades
    const resto = numInt % 1000;
    if (resto > 0 || parts.length === 0) {
        parts.push(convertGroup(resto));
    }
    
    result = parts.join(' e ');
    
    // Plural
    if (numInt === 1) {
        result += ' metical';
    } else {
        result += ' meticais';
    }
    
    // Centavos
    if (numDec > 0) {
        result += ' e ';
        if (numDec === 1) {
            result += 'um centavo';
        } else {
            result += convertGroup(numDec) + ' centavos';
        }
    }
    
    return result.charAt(0).toUpperCase() + result.slice(1);
}

// ============================================================================
// Monitoramento de Status SSE e Atualização Automática
// ============================================================================

let sseConnection = null;

function initSSEStatus() {
    const sseStatusText = document.getElementById('sseStatusText');
    const sseStatus = document.getElementById('sseStatus');
    if (!sseStatusText || !sseStatus) return;
    
    // Conectar ao SSE público
    setupSSEConnection();
}

function setupSSEConnection() {
    // Fechar conexão anterior se existir
    closeSSEConnection();
    
    const sseStatusText = document.getElementById('sseStatusText');
    const sseStatus = document.getElementById('sseStatus');
    
    // Criar nova conexão SSE pública (sem autenticação)
    const sseUrl = `${API_BASE}/api/v1/dashboard/events/public?exercicio=${currentExercicio}`;
    console.log('Conectando SSE público:', sseUrl);
    
    const eventSource = new EventSource(sseUrl, { withCredentials: true });
    
    // Atualizar status para conectando
    if (sseStatusText) sseStatusText.textContent = 'Conectando...';
    if (sseStatus) sseStatus.className = 'sse-status';
    
    eventSource.addEventListener('open', () => {
        console.log('SSE conectado');
        if (sseStatusText) sseStatusText.textContent = 'Online';
        if (sseStatus) sseStatus.className = 'sse-status sse-online';
    });
    
    eventSource.addEventListener('message', (event) => {
        try {
            const data = JSON.parse(event.data);
            handleSSEEvent(data);
        } catch (error) {
            console.error('Erro ao processar evento SSE:', error);
        }
    });
    
    // Escutar eventos específicos
    eventSource.addEventListener('despesa_confirmada', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    eventSource.addEventListener('despesa_criada', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    eventSource.addEventListener('despesa_atualizada', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    eventSource.addEventListener('despesa_removida', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    eventSource.addEventListener('dotacao_atualizada', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    // Tratamento de erros
    eventSource.onerror = (error) => {
        console.error('Erro na conexão SSE:', error);
        if (sseStatusText) sseStatusText.textContent = 'Offline';
        if (sseStatus) sseStatus.className = 'sse-status sse-offline';
        
        // Tentar reconectar após 5 segundos
        setTimeout(() => {
            if (eventSource.readyState === EventSource.CLOSED) {
                setupSSEConnection();
            }
        }, 5000);
    };
    
    sseConnection = eventSource;
}

function handleSSEEvent(event) {
    if (!event || !event.type) return;
    
    console.log('Evento SSE recebido:', event.type);
    
    // Recarregar dados quando houver mudanças relevantes
    if (event.type === 'dotacao_atualizada' || 
        event.type === 'despesa_confirmada' || 
        event.type === 'despesa_criada' || 
        event.type === 'despesa_atualizada' || 
        event.type === 'despesa_removida' ||
        event.type === 'rubrica_atualizada' ||
        event.type === 'rubricas_recalculadas') {
        
        // Se estiver em modo de busca, limpar busca
        if (searchTerm) {
            searchTerm = '';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            savedPathIds = null; // Não restaurar navegação se estava em busca
        } else {
            // Salvar IDs do caminho atual para restaurar depois
            if (currentPath.length > 0) {
                savedPathIds = currentPath.map(node => node.id);
            } else {
                savedPathIds = null;
            }
        }
        
        // Recarregar árvore de rubricas
        loadData();
    }
}

function restoreNavigation(pathIds) {
    if (!pathIds || pathIds.length === 0) {
        navigateToRoot();
        return;
    }
    
    // Tentar encontrar e restaurar o caminho na nova árvore
    const restoredPath = [];
    let currentNode = rootNode;
    
    for (const nodeId of pathIds) {
        // Procurar o nó na nova árvore
        const foundNode = allNodes.find(n => n.id === nodeId);
        
        if (foundNode) {
            // Verificar se é filho do nó atual (validação de hierarquia)
            if (foundNode.parent === currentNode || 
                (currentNode === rootNode && foundNode.parent === null)) {
                restoredPath.push(foundNode);
                currentNode = foundNode;
            } else {
                // Se a hierarquia mudou, parar aqui
                break;
            }
        } else {
            // Nó não encontrado (pode ter sido removido), parar
            break;
        }
    }
    
    if (restoredPath.length > 0) {
        // Navegar para o último nó restaurado
        const targetNode = restoredPath[restoredPath.length - 1];
        currentPath = restoredPath;
        renderCards(targetNode.children || []);
        updateBreadcrumb(targetNode);
        console.log('Navegação restaurada para:', targetNode.designacao);
    } else {
        // Se não conseguir restaurar, voltar para a raiz
        console.log('Não foi possível restaurar navegação, voltando para raiz');
        navigateToRoot();
    }
}

function closeSSEConnection() {
    if (sseConnection) {
        sseConnection.close();
        sseConnection = null;
    }
}

// Fechar conexão ao sair da página
window.addEventListener('beforeunload', () => {
    closeSSEConnection();
});

function formatMoneyWithWords(value) {
    const formatted = formatMoneyValue(value);
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const words = numberToWords(numValue);
    
    return {
        formatted: formatted,
        words: words
    };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
