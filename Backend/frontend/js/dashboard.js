// Dashboard.js - Dashboard com KPIs e Árvore de Rubricas
// Funcionalidades: KPIs, gráfico de progresso, árvore de rubricas, cache

let currentExercicio = new Date().getFullYear();
let refreshInterval = null;
let rubricasTree = [];
let expandedNodes = new Set();
let sseConnection = null;

// ============================================================================
// Inicialização
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    // Inicializar seletor de exercício
    initExercicioSelector();
    
    // Tornar KPI de Dotação clicável
    initDotacaoKPI();
    
    // Atualizar conexão SSE quando exercício mudar
    const exercicioSelect = document.getElementById('exercicioSelect');
    if (exercicioSelect) {
        const originalChangeHandler = exercicioSelect.onchange;
        exercicioSelect.addEventListener('change', (e) => {
            // Fechar conexão SSE antiga
            closeSSEConnection();
            // Nova conexão será criada em setupSSEConnection
        });
    }
    
    // Carregar dashboard
    loadDashboard();
    
    // Iniciar SSE para atualização em tempo real
    setupSSEConnection();
    
    // Iniciar atualização automática (fallback)
    startAutoRefresh();
    
    // Limpar ao sair
    window.addEventListener('beforeunload', () => {
        stopAutoRefresh();
        closeSSEConnection();
    });
});

function initExercicioSelector() {
    const container = document.querySelector('.container');
    if (!container) return;
    
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 5; i <= currentYear + 2; i++) {
        years.push(i);
    }
    
    const selector = document.createElement('div');
    selector.className = 'exercicio-selector';
    selector.innerHTML = `
        <label for="exercicioSelect">Exercício:</label>
        <select id="exercicioSelect" aria-label="Selecionar exercício">
            ${years.map(year => 
                `<option value="${year}" ${year === currentExercicio ? 'selected' : ''}>${year}</option>`
            ).join('')}
        </select>
    `;
    
    const select = selector.querySelector('#exercicioSelect');
    select.addEventListener('change', (e) => {
        currentExercicio = parseInt(e.target.value);
        invalidateCache('dotacao_global', currentExercicio);
        invalidateCache('rubricas_tree', currentExercicio);
        expandedNodes.clear();
        
        // Reconectar SSE com novo exercício
        setupSSEConnection();
        
        loadDashboard();
    });
    
    const header = container.querySelector('header');
    if (header && header.nextSibling) {
        container.insertBefore(selector, header.nextSibling);
    } else {
        container.insertBefore(selector, container.firstChild);
    }
}

// ============================================================================
// Carregamento de Dados
// ============================================================================

async function loadDashboard() {
    if (!checkAuth()) return;
    
    try {
        // Verificar se já há conteúdo válido nos KPIs antes de mostrar loading
        const kpiSection = document.getElementById('kpiSection');
        const hasValidKPIs = kpiSection && kpiSection.querySelectorAll('li').length > 0;
        
        // Só mostrar loading se não houver KPIs válidos
        if (!hasValidKPIs) {
            showLoadingState(true);
        }
        
        // Carregar dotação global e árvore de rubricas em paralelo
        const [dotacao, tree] = await Promise.all([
            loadDotacaoGlobal(),
            loadRubricasTree()
        ]);
        
        // Atualizar UI
        updateKPIs(dotacao);
        updateProgressChart(dotacao);
        // updateRubricasTree(tree); // Removido - seção de rubricas removida do dashboard
        
        updateLastRefreshTime();
        
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        showError('Erro ao carregar dashboard: ' + error.message);
    } finally {
        showLoadingState(false);
    }
}

async function loadDotacaoGlobal() {
    // Verificar cache
    const cached = getCachedData('dotacao_global', currentExercicio);
    if (cached) {
        return cached;
    }
    
    const response = await fetchWithAuth(
        `${API_BASE}/api/v1/dotacao_global?exercicio=${currentExercicio}`
    );
    
    if (!response.ok) {
        if (response.status === 404) {
            // Dotação não existe - retornar valores zerados
            return {
                id: 0,
                exercicio: currentExercicio,
                valor_anual: 0,
                saldo: 0,
                reservado: 0
            };
        }
        const error = await response.json().catch(() => ({ detail: 'Erro ao carregar dotação' }));
        throw new Error(error.detail || 'Erro ao carregar dotação');
    }
    
    const dotacao = await response.json();
    
    // Salvar no cache
    setCachedData('dotacao_global', dotacao, currentExercicio);
    
    return dotacao;
}

async function loadRubricasTree() {
    // Verificar cache
    const cached = getCachedData('rubricas_tree', currentExercicio);
    if (cached) {
        return cached;
    }
    
    try {
        const response = await fetchWithAuth(
            `${API_BASE}/api/v1/rubricas/tree?exercicio=${currentExercicio}`
        );
        
        if (!response.ok) {
            console.warn('Erro ao carregar árvore de rubricas:', response.status);
            return [];
        }
        
        const tree = await response.json();
        
        // Salvar no cache
        setCachedData('rubricas_tree', tree, currentExercicio);
        
        return tree;
    } catch (error) {
        console.warn('Erro ao carregar árvore de rubricas:', error);
        return [];
    }
}

// ============================================================================
// Atualização de KPIs
// ============================================================================

// Armazenar dados de dotação para uso no modal
let currentDotacaoData = null;

function updateKPIs(dotacao) {
    const kpiSection = document.getElementById('kpiSection');
    if (!kpiSection) return;
    
    // Armazenar dados para uso no modal
    currentDotacaoData = dotacao;
    
    // Usar gasto_total do backend se disponível, senão calcular
    const gastoAcumulado = dotacao.gasto_total !== undefined 
        ? parseFloat(dotacao.gasto_total) || 0
        : Math.max(0, (dotacao.valor_anual || 0) - (dotacao.saldo || 0));
    
    // O saldo já vem calculado do backend como: valor_anual - gasto_total - reservado
    // Então o saldo disponível é simplesmente o saldo retornado
    const saldoDisponivel = Math.max(0, dotacao.saldo || 0);
    const percentGasto = dotacao.valor_anual > 0 
        ? ((gastoAcumulado / dotacao.valor_anual) * 100) 
        : 0;
    
    // Atualizar os elementos existentes mantendo a estrutura do protótipo
    const items = kpiSection.querySelectorAll('li');
    
    // 1. Dotação Anual
    if (items[0]) {
        const info = items[0].querySelector('.info');
        if (info) {
            const h3 = info.querySelector('h3');
            const p = info.querySelector('p');
            if (h3) h3.textContent = formatMoney(dotacao.valor_anual || 0);
            if (p) p.textContent = `Exercício ${currentExercicio}`;
        }
    }
    
    // 2. Gasto Acumulado
    if (items[1]) {
        const info = items[1].querySelector('.info');
        if (info) {
            const h3 = info.querySelector('h3');
            const p = info.querySelector('p');
            if (h3) h3.textContent = formatMoney(gastoAcumulado);
            if (p) p.textContent = `${formatPercent(percentGasto)} da dotação`;
        }
    }
    
    // 3. Saldo Disponível
    if (items[2]) {
        const info = items[2].querySelector('.info');
        if (info) {
            const h3 = info.querySelector('h3');
            const p = info.querySelector('p');
            if (h3) h3.textContent = formatMoney(saldoDisponivel);
            if (p) p.textContent = 'Saldo Disponível';
        }
    }
    
    // 4. Reservado
    if (items[3]) {
        const info = items[3].querySelector('.info');
        if (info) {
            const h3 = info.querySelector('h3');
            const p = info.querySelector('p');
            if (h3) h3.textContent = formatMoney(dotacao.reservado || 0);
            if (p) p.textContent = 'Valor Reservado';
        }
    }
}

function formatPercent(value) {
    return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
}

// ============================================================================
// KPI de Dotação Clicável
// ============================================================================

function initDotacaoKPI() {
    const dotacaoCard = document.getElementById('kpiDotacaoCard');
    if (!dotacaoCard) return;
    
    dotacaoCard.addEventListener('click', () => {
        openChartModal();
    });
}

function openChartModal() {
    const modal = document.getElementById('chartModal');
    if (!modal) return;
    
    // Atualizar gráfico no modal
    if (currentDotacaoData) {
        updateModalProgressChart(currentDotacaoData);
    } else {
        // Se não houver dados, carregar
        loadDotacaoGlobal().then(dotacao => {
            updateModalProgressChart(dotacao);
        });
    }
    
    // Mostrar modal
    modal.classList.add('chart-modal--show');
    
    // Fechar ao clicar no overlay ou botão de fechar
    const overlay = modal.querySelector('.chart-modal__overlay');
    const closeBtn = document.getElementById('closeChartModal');
    
    if (overlay) {
        overlay.addEventListener('click', closeChartModal);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeChartModal);
    }
    
    // Fechar com ESC
    document.addEventListener('keydown', handleModalEscape);
}

function closeChartModal() {
    const modal = document.getElementById('chartModal');
    if (!modal) return;
    
    modal.classList.remove('chart-modal--show');
    
    // Remover listeners
    const overlay = modal.querySelector('.chart-modal__overlay');
    const closeBtn = document.getElementById('closeChartModal');
    
    if (overlay) {
        overlay.removeEventListener('click', closeChartModal);
    }
    
    if (closeBtn) {
        closeBtn.removeEventListener('click', closeChartModal);
    }
    
    document.removeEventListener('keydown', handleModalEscape);
}

function handleModalEscape(event) {
    if (event.key === 'Escape') {
        closeChartModal();
    }
}

// ============================================================================
// Gráfico de Progresso
// ============================================================================

function updateProgressChart(dotacao, gastoAcumulado = null, percentGasto = null) {
    // Esta função não é mais necessária, mas mantida para compatibilidade
    // O gráfico agora só aparece no modal
}

function updateModalProgressChart(dotacao, gastoAcumulado = null, percentGasto = null) {
    const chartDiv = document.getElementById('modalProgressChart');
    if (!chartDiv) return;
    
    renderProgressChart(chartDiv, dotacao, gastoAcumulado, percentGasto);
}

function renderProgressChart(chartDiv, dotacao, gastoAcumulado = null, percentGasto = null) {
    // Calcular se não fornecido
    if (gastoAcumulado === null || percentGasto === null) {
        gastoAcumulado = dotacao.gasto_total !== undefined 
            ? parseFloat(dotacao.gasto_total) || 0
            : Math.max(0, (dotacao.valor_anual || 0) - (dotacao.saldo || 0));
        percentGasto = dotacao.valor_anual > 0 
            ? ((gastoAcumulado / dotacao.valor_anual) * 100) 
            : 0;
    }
    
    // Determinar cor baseado no percentual
    let barClass = '';
    if (percentGasto >= 90) {
        barClass = 'danger';
    } else if (percentGasto >= 70) {
        barClass = 'warning';
    }
    
    // O saldo já vem calculado do backend como: valor_anual - gasto_total - reservado
    const saldoDisponivel = Math.max(0, dotacao.saldo || 0);
    const percentWidth = Math.min(100, Math.max(0, percentGasto));
    
    chartDiv.innerHTML = `
        <div class="progress-bar-container">
            <div class="progress-bar ${barClass}" style="width: ${percentWidth}%">
                ${formatPercent(percentGasto)}
            </div>
        </div>
        <div class="progress-info">
            <span>Gasto: ${formatMoney(gastoAcumulado)}</span>
            <span>Disponível: ${formatMoney(saldoDisponivel)}</span>
            <span>Total: ${formatMoney(dotacao.valor_anual || 0)}</span>
        </div>
    `;
}

// ============================================================================
// Árvore de Rubricas
// ============================================================================

function updateRubricasTree(tree) {
    rubricasTree = tree;
    
    // Criar seção se não existir
    let treeSection = document.getElementById('rubricasTreeSection');
    if (!treeSection) {
        treeSection = document.createElement('div');
        treeSection.id = 'rubricasTreeSection';
        treeSection.className = 'chart-section';
        treeSection.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2>Estrutura Orçamentária (Rubricas)</h2>
                <button class="btn btn--small" onclick="refreshRubricasTree()" aria-label="Atualizar árvore de rubricas">
                    Atualizar
                </button>
            </div>
            <div id="rubricasTreeContainer"></div>
        `;
        
        // Inserir após o gráfico de progresso
        const chartSection = document.querySelector('.chart-section');
        if (chartSection && chartSection.nextSibling) {
            chartSection.parentNode.insertBefore(treeSection, chartSection.nextSibling);
        } else {
            const container = document.querySelector('.container');
            if (container) {
                const quickActions = container.querySelector('.quick-actions');
                if (quickActions) {
                    container.insertBefore(treeSection, quickActions);
                } else {
                    container.appendChild(treeSection);
                }
            }
        }
    }
    
    const container = document.getElementById('rubricasTreeContainer');
    if (!container) return;
    
    if (tree.length === 0) {
        container.innerHTML = '<div class="rubrica-tree__empty">Nenhuma rubrica encontrada para este exercício.</div>';
        return;
    }
    
    // Renderizar árvore
    container.innerHTML = tree.map(node => renderRubricaNode(node, 0)).join('');
    
    // Calcular total
    const total = calculateTotal(tree);
    const footer = document.createElement('div');
    footer.className = 'rubrica-tree__footer';
    footer.innerHTML = `
        <div class="rubrica-tree__footer-row">
            <strong>Total:</strong>
            <span class="rubrica-tree__footer-value">${formatMoney(total)}</span>
        </div>
    `;
    container.appendChild(footer);
    
    // Adicionar event listeners
    attachRubricaTreeEventListeners();
}

function renderRubricaNode(node, level) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const indent = level * 18;
    
    // Valores
    const dotacaoValor = node.dotacao_calculada || node.dotacao || 0;
    const gasto = node.gasto || 0;
    const saldo = node.saldo || 0;
    
    return `
        <div class="rubrica-tree__node" data-node-id="${node.id}" data-level="${level}">
            <div class="rubrica-tree__row" 
                 style="padding-left: ${indent}px;"
                 role="row"
                 aria-expanded="${hasChildren ? isExpanded : 'false'}"
                 aria-controls="children-${node.id}">
                <div class="rubrica-tree__expand">
                    ${hasChildren ? `
                        <button class="rubrica-tree__expand-btn" 
                                data-node-id="${node.id}"
                                aria-label="${isExpanded ? 'Recolher' : 'Expandir'} ${node.designacao}"
                                aria-expanded="${isExpanded}">
                            <span class="rubrica-tree__expand-icon">${isExpanded ? '▾' : '▸'}</span>
                        </button>
                    ` : '<span class="rubrica-tree__spacer"></span>'}
                </div>
                <div class="rubrica-tree__content">
                    <div class="rubrica-tree__info">
                        <span class="rubrica-tree__code">${escapeHtml(node.codigo)}</span>
                        <span class="rubrica-tree__designacao" 
                              onclick="goToRubricaDetail(${node.id}, ${currentExercicio})"
                              role="button"
                              tabindex="0"
                              aria-label="Ver detalhes de ${escapeHtml(node.designacao)}">
                            ${escapeHtml(node.designacao)}
                        </span>
                        ${hasChildren ? '<span class="rubrica-tree__badge rubrica-tree__badge--parent">(pai - calculada)</span>' : '<span class="rubrica-tree__badge rubrica-tree__badge--leaf">(folha)</span>'}
                    </div>
                    <div class="rubrica-tree__values">
                        <span class="rubrica-tree__value rubrica-tree__value--dotacao" title="Dotação">
                            ${formatMoney(dotacaoValor)}
                        </span>
                        ${gasto !== undefined ? `
                            <span class="rubrica-tree__value rubrica-tree__value--gasto" title="Gasto">
                                ${formatMoney(gasto)}
                            </span>
                        ` : ''}
                        ${saldo !== undefined ? `
                            <span class="rubrica-tree__value rubrica-tree__value--saldo ${saldo < 0 ? 'rubrica-tree__value--negative' : ''}" title="Saldo">
                                ${formatMoney(saldo)}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
            ${hasChildren ? `
                <div class="rubrica-tree__children" 
                     id="children-${node.id}" 
                     style="display: ${isExpanded ? 'block' : 'none'};"
                     role="group">
                    ${node.children.map(child => renderRubricaNode(child, level + 1)).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function calculateTotal(tree) {
    let total = 0;
    function sumNode(node) {
        total += node.dotacao_calculada || node.dotacao || 0;
        if (node.children) {
            node.children.forEach(sumNode);
        }
    }
    tree.forEach(sumNode);
    return total;
}

function attachRubricaTreeEventListeners() {
    // Botões de expandir/recolher
    document.querySelectorAll('.rubrica-tree__expand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nodeId = parseInt(btn.dataset.nodeId);
            toggleRubricaNode(nodeId);
        });
        
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                const nodeId = parseInt(btn.dataset.nodeId);
                toggleRubricaNode(nodeId);
            }
        });
    });
    
    // Navegação por teclado
    document.querySelectorAll('.rubrica-tree__designacao').forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const nodeId = parseInt(el.closest('.rubrica-tree__node').dataset.nodeId);
                goToRubricaDetail(nodeId, currentExercicio);
            }
        });
    });
}

function toggleRubricaNode(nodeId) {
    const isExpanded = expandedNodes.has(nodeId);
    
    if (isExpanded) {
        expandedNodes.delete(nodeId);
    } else {
        expandedNodes.add(nodeId);
    }
    
    const childrenDiv = document.getElementById(`children-${nodeId}`);
    if (childrenDiv) {
        if (isExpanded) {
            childrenDiv.style.display = 'none';
        } else {
            childrenDiv.style.display = 'block';
            childrenDiv.style.opacity = '0';
            setTimeout(() => {
                childrenDiv.style.transition = 'opacity 200ms';
                childrenDiv.style.opacity = '1';
            }, 10);
        }
    }
    
    // Atualizar ícone e aria-expanded
    const btn = document.querySelector(`.rubrica-tree__expand-btn[data-node-id="${nodeId}"]`);
    const row = btn?.closest('.rubrica-tree__row');
    if (btn && row) {
        const icon = btn.querySelector('.rubrica-tree__expand-icon');
        if (icon) {
            icon.textContent = isExpanded ? '▸' : '▾';
        }
        btn.setAttribute('aria-expanded', !isExpanded);
        row.setAttribute('aria-expanded', !isExpanded);
    }
}

function refreshRubricasTree() {
    invalidateCache('rubricas_tree', currentExercicio);
    loadRubricasTree().then(tree => {
        updateRubricasTree(tree);
        showSuccess('Árvore de rubricas atualizada!');
    });
}

function goToRubricaDetail(rubricaId, exercicio) {
    window.location.href = `relacao.html?rubrica_id=${rubricaId}&exercicio=${exercicio}`;
}

// ============================================================================
// Utilitários
// ============================================================================

function showLoadingState(show) {
    const kpiSection = document.getElementById('kpiSection');
    
    if (show) {
        // Não limpar KPIs se já tiverem conteúdo válido (estrutura <li>)
        // Apenas mostrar loading se estiver vazio ou já tiver loading
        if (kpiSection) {
            const hasValidContent = kpiSection.querySelectorAll('li').length > 0;
            const hasLoading = kpiSection.querySelector('.loading');
            
            // Só mostrar loading se não tiver conteúdo válido e não tiver loading já
            if (!hasValidContent && !hasLoading) {
                kpiSection.innerHTML = '<div class="loading">Carregando dados...</div>';
            }
        }
    }
}

function updateLastRefreshTime() {
    const now = new Date();
    const timeString = formatDateTime(now);
    
    let lastUpdate = document.getElementById('lastUpdate');
    if (!lastUpdate) {
        lastUpdate = document.createElement('div');
        lastUpdate.id = 'lastUpdate';
        lastUpdate.className = 'last-update';
        const container = document.querySelector('.container');
        if (container) {
            container.appendChild(lastUpdate);
        }
    }
    lastUpdate.textContent = `Última atualização: ${timeString}`;
}

function setupSSEConnection() {
    // Fechar conexão anterior se existir
    closeSSEConnection();
    
    // Obter token do localStorage
    const token = getToken();
    if (!token) {
        console.error('Token não encontrado. Não é possível conectar ao SSE.');
        return;
    }
    
    // Criar nova conexão SSE com token na query string
    // EventSource não suporta headers customizados, então usamos query parameter
    const sseUrl = `${API_BASE}/api/v1/dashboard/events?exercicio=${currentExercicio}&token=${encodeURIComponent(token)}`;
    console.log('Conectando SSE:', sseUrl.replace(token, 'TOKEN_HIDDEN')); // Log sem expor token completo
    
    const eventSource = new EventSource(sseUrl, { withCredentials: true });
    
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
    
    // Invalidar cache e recarregar dashboard
    invalidateCache('dotacao_global', currentExercicio);
    invalidateCache('rubricas_tree', currentExercicio);
    
    // Recarregar dashboard
    loadDashboard();
    
    // Mostrar notificação opcional
    if (event.type === 'despesa_confirmada') {
        showSuccess('Despesa confirmada - Dashboard atualizado!');
    }
}

function closeSSEConnection() {
    if (sseConnection) {
        sseConnection.close();
        sseConnection = null;
    }
}

function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // Atualizar a cada 30 segundos como fallback (SSE é a principal)
    refreshInterval = setInterval(() => {
        if (!document.hidden && (!sseConnection || sseConnection.readyState === EventSource.CLOSED)) {
            // Só usar polling se SSE não estiver funcionando
            loadDashboard();
        }
    }, 30000); // 30 segundos
    
    // Atualizar quando a página ganha foco (usuário volta para a aba)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Invalidar cache e recarregar quando a página fica visível
            invalidateCache('dotacao_global', currentExercicio);
            invalidateCache('rubricas_tree', currentExercicio);
            loadDashboard();
            
            // Reconectar SSE se necessário
            if (!sseConnection || sseConnection.readyState === EventSource.CLOSED) {
                setupSSEConnection();
            }
        }
    });
    
    // Escutar eventos de atualização de outras abas/páginas (complementar ao SSE)
    setupCrossTabUpdate();
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Comunicação entre abas (Cross-tab updates)
// ============================================================================

function setupCrossTabUpdate() {
    // Usar BroadcastChannel para comunicação entre abas
    if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('dashboard_updates');
        
        channel.addEventListener('message', (event) => {
            if (event.data.type === 'despesa_confirmada' || 
                event.data.type === 'despesa_criada' ||
                event.data.type === 'despesa_atualizada') {
                // Invalidar cache e recarregar
                invalidateCache('dotacao_global', currentExercicio);
                invalidateCache('rubricas_tree', currentExercicio);
                loadDashboard();
            }
        });
        
        // Armazenar channel para uso global
        window.dashboardChannel = channel;
    }
}

// Função para notificar outras abas sobre atualizações
function notifyDashboardUpdate(type, data = {}) {
    if (window.dashboardChannel) {
        window.dashboardChannel.postMessage({
            type: type,
            timestamp: Date.now(),
            ...data
        });
    }
}

// Exportar funções globais
window.toggleRubricaNode = toggleRubricaNode;
window.refreshRubricasTree = refreshRubricasTree;
window.goToRubricaDetail = goToRubricaDetail;
window.notifyDashboardUpdate = notifyDashboardUpdate;
