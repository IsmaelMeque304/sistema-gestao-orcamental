// ============================================================================
// Página Inicial - Disposição Orçamental
// ============================================================================

// API_BASE já está declarado em common.js (carregado antes deste arquivo)

// Salvar referência original de formatMoney
let formatMoneyFromCommon = null;
if (typeof window !== 'undefined' && typeof window.formatMoney === 'function') {
    formatMoneyFromCommon = window.formatMoney.bind(window);
}

// Variáveis globais
let currentExercicio = new Date().getFullYear();
let dotacaoGlobal = null;

// Elementos DOM
let cardsGrid = null;
let loadingOverlay = null;
let errorMessage = null;

// ============================================================================
// Inicialização
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    cardsGrid = document.getElementById('cardsGrid');
    loadingOverlay = document.getElementById('loadingOverlay');
    errorMessage = document.getElementById('errorMessage');
    
    initExercicioSelector();
    setupEventListeners();
    loadDotacaoGlobal();
    
    // Inicializar monitoramento SSE
    initSSEStatus();
});

function initExercicioSelector() {
    const selector = document.getElementById('exercicioSelectMain');
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
}

function setupEventListeners() {
    const selector = document.getElementById('exercicioSelectMain');
    if (selector) {
        selector.addEventListener('change', (e) => {
            currentExercicio = parseInt(e.target.value);
            loadDotacaoGlobal();
            
            // Reconectar SSE com novo exercício
            if (sseConnection) {
                closeSSEConnection();
                setupSSEConnection();
            }
        });
    }
}

// ============================================================================
// Carregamento de Dados
// ============================================================================

async function loadDotacaoGlobal() {
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    if (errorMessage) errorMessage.style.display = 'none';

    try {
        // Endpoint público - sem autenticação
        const response = await fetch(
            `${API_BASE}/api/v1/dotacao_global?exercicio=${currentExercicio}`
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao carregar dotação' }));
            throw new Error(error.detail || 'Erro ao carregar dotação orçamental');
        }

        const data = await response.json();
        dotacaoGlobal = data;
        
        renderCards();
    } catch (error) {
        console.error('Erro ao carregar dotação:', error);
        if (errorMessage) {
            errorMessage.textContent = `Erro: ${error.message}`;
            errorMessage.style.display = 'block';
        }
    } finally {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }
}

// ============================================================================
// Renderização de Cards
// ============================================================================

function renderCards() {
    if (!cardsGrid) return;
    
    cardsGrid.innerHTML = '';
    
    if (!dotacaoGlobal) {
        cardsGrid.innerHTML = `
            <div class="empty-state">
                <i class='bx bx-folder-open'></i>
                <p>Nenhuma dotação encontrada para este exercício</p>
            </div>
        `;
        return;
    }

    // Card principal - Disposição Orçamental Global
    const card = createDotacaoCard();
    cardsGrid.appendChild(card);
}

function createDotacaoCard() {
    const card = document.createElement('div');
    card.className = 'card card-dotacao-global';
    
    const valorAnual = dotacaoGlobal.valor_anual || 0;
    const saldo = dotacaoGlobal.saldo || 0;
    const gastoTotal = dotacaoGlobal.gasto_total || 0;
    const reservado = dotacaoGlobal.reservado || 0;
    
    card.innerHTML = `
        <div class="card-header">
            <i class='bx bx-wallet'></i>
            <div class="card-info">
                <div class="card-title-group">
                    <h3 class="card-title">Disposição Orçamental</h3>
                </div>
                <div class="card-body">
                    <div class="card-value">
                        <span class="card-value-number">${formatMoneyValue(valorAnual)}</span>
                        <span class="card-value-words">${numberToWords(parseFloat(valorAnual))}</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="card-footer">
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.9rem;">
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--dark-grey);">Saldo Disponível:</span>
                    <span style="color: var(--success); font-weight: 600;">${formatMoneyValue(saldo)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--dark-grey);">Gasto Total:</span>
                    <span style="color: var(--danger); font-weight: 600;">${formatMoneyValue(gastoTotal)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--dark-grey);">Reservado:</span>
                    <span style="color: var(--warning); font-weight: 600;">${formatMoneyValue(reservado)}</span>
                </div>
            </div>
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--grey);">
                <span class="card-hint">Clique para ver as rubricas orçamentárias</span>
            </div>
        </div>
    `;
    
    // Event listener para navegar para tree.html
    card.addEventListener('click', () => {
        window.location.href = `tree.html?exercicio=${currentExercicio}`;
    });
    
    return card;
}

// ============================================================================
// Utilitários
// ============================================================================

function formatMoneyValue(value) {
    if (formatMoneyFromCommon) {
        return formatMoneyFromCommon(value);
    }
    // Fallback se common.js não estiver disponível
    if (value === null || value === undefined || isNaN(value)) {
        return '0,00 MZN';
    }
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const formatted = new Intl.NumberFormat('pt-MZ', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numValue);
    return `${formatted} MZN`;
}

// ============================================================================
// Conversão de Números para Extenso (Português)
// ============================================================================

function numberToWords(num) {
    // Converter para número se necessário
    let numValue = num;
    if (typeof num === 'string') {
        numValue = parseFloat(num.replace(/[^\d.,-]/g, '').replace(',', '.'));
    }
    if (numValue === 0 || numValue === null || numValue === undefined || isNaN(numValue)) {
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        // Recarregar dotação global
        loadDotacaoGlobal();
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

