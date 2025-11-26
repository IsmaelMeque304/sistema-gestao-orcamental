// JavaScript compartilhado para todas as páginas
// Utilitários: fetchWithAuth, formatMoney, toast, handle401

const API_BASE = window.location.origin;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutos

// ============================================================================
// Autenticação
// ============================================================================

function getToken() {
    return localStorage.getItem('token');
}

function checkAuth() {
    if (!getToken()) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

function getAuthHeaders() {
    const token = getToken();
    if (!token) {
        window.location.href = 'index.html';
        return {};
    }
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// ============================================================================
// fetchWithAuth - Wrapper para fetch com autenticação e tratamento de 401
// ============================================================================

async function fetchWithAuth(url, options = {}) {
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers || {})
    };
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    // Tratamento de 401: redirect automático para login
    if (response.status === 401) {
        localStorage.removeItem('token');
        window.location.href = 'index.html';
        throw new Error('Sessão expirada. Por favor, faça login novamente.');
    }
    
    return response;
}

// ============================================================================
// Cache com sessionStorage
// ============================================================================

function getCacheKey(key, exercicio = null) {
    return exercicio ? `${key}_${exercicio}` : key;
}

function getCachedData(key, exercicio = null) {
    try {
        const cacheKey = getCacheKey(key, exercicio);
        const cached = sessionStorage.getItem(cacheKey);
        if (!cached) return null;
        
        const { data, timestamp } = JSON.parse(cached);
        const now = Date.now();
        
        if (now - timestamp > CACHE_TTL) {
            sessionStorage.removeItem(cacheKey);
            return null;
        }
        
        return data;
    } catch (error) {
        console.warn('Erro ao ler cache:', error);
        return null;
    }
}

function setCachedData(key, data, exercicio = null) {
    try {
        const cacheKey = getCacheKey(key, exercicio);
        sessionStorage.setItem(cacheKey, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    } catch (error) {
        console.warn('Erro ao salvar cache:', error);
    }
}

function invalidateCache(key, exercicio = null) {
    try {
        const cacheKey = getCacheKey(key, exercicio);
        sessionStorage.removeItem(cacheKey);
    } catch (error) {
        console.warn('Erro ao invalidar cache:', error);
    }
}

function clearAllCache() {
    try {
        sessionStorage.clear();
    } catch (error) {
        console.warn('Erro ao limpar cache:', error);
    }
}

// ============================================================================
// formatMoney - Formatação monetária com separador de milhar e vírgula decimal
// ============================================================================

function formatMoney(value, currency = 'MZN') {
    if (value === null || value === undefined || isNaN(value)) {
        return `0,00 ${currency}`;
    }
    
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    // Formatação com separador de milhar (ponto) e vírgula decimal
    const formatted = new Intl.NumberFormat('pt-MZ', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numValue);
    
    return `${formatted} ${currency}`;
}

// ============================================================================
// Toast - Sistema de notificações
// ============================================================================

let toastContainer = null;

function initToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

function showToast(message, type = 'info', duration = 3000) {
    const container = initToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
    toast.innerHTML = `
        <span class="toast__icon">${icon}</span>
        <span class="toast__message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Animar entrada
    setTimeout(() => toast.classList.add('toast--show'), 10);
    
    // Remover após duração
    setTimeout(() => {
        toast.classList.remove('toast--show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Aliases para conveniência
function showSuccess(message, duration = 3000) {
    showToast(message, 'success', duration);
}

function showError(message, duration = 5000) {
    showToast(message, 'error', duration);
}

function showWarning(message, duration = 4000) {
    showToast(message, 'warning', duration);
}

function showInfo(message, duration = 3000) {
    showToast(message, 'info', duration);
}

// ============================================================================
// handle401 - Tratamento centralizado de 401
// ============================================================================

function handle401(response) {
    if (response.status === 401) {
        localStorage.removeItem('token');
        showError('Sessão expirada. Redirecionando para login...');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
        return true;
    }
    return false;
}

// ============================================================================
// Utilitários de Formatação
// ============================================================================

function formatCurrency(value) {
    return formatMoney(value, 'MZN');
}

function formatDate(date) {
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('pt-MZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(new Date(date));
}

function formatDateTime(date) {
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('pt-MZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(date));
}

// ============================================================================
// Modais
// ============================================================================

function openModal(modalId) {
    console.log('openModal chamado com modalId:', modalId);
    const modal = document.getElementById(modalId);
    console.log('Modal encontrado:', modal);
    if (modal) {
        console.log('Adicionando classe modal--show');
        modal.classList.add('modal--show');
        modal.setAttribute('aria-hidden', 'false');
        console.log('Classes do modal após adicionar:', modal.className);
        console.log('Display após adicionar:', window.getComputedStyle(modal).display);
        
        // Focar no primeiro input
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
        
        // Prevenir scroll do body
        document.body.style.overflow = 'hidden';
    } else {
        console.error('Modal não encontrado com id:', modalId);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('modal--show');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
}

// Expor funções globalmente
window.openModal = openModal;
window.closeModal = closeModal;

// Fechar modal ao clicar fora ou pressionar ESC
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal').forEach(modal => {
        // Clicar fora
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                const modalId = modal.id;
                closeModal(modalId);
            }
        });
        
        // ESC key
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modalId = modal.id;
                closeModal(modalId);
            }
        });
    });
});

// ============================================================================
// Logout
// ============================================================================

function logout() {
    if (confirm('Tem certeza que deseja sair?')) {
        localStorage.removeItem('token');
        clearAllCache();
        window.location.href = 'index.html';
    }
}

// ============================================================================
// Verificação de Admin
// ============================================================================

async function isAdmin() {
    try {
        const token = getToken();
        if (!token) return false;
        
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        const response = await fetchWithAuth(`${API_BASE}/api/v1/usuarios?limit=1`);
        if (!response.ok) return false;
        
        return true;
    } catch (error) {
        return false;
    }
}

// ============================================================================
// Debounce - Para inputs de busca
// ============================================================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================================================
// Formatação de Input Monetário
// ============================================================================

/**
 * Formata um valor numérico para exibição com espaços como separadores de milhar
 * Formato: 7 303 380.00
 */
function formatMoneyInput(value) {
    if (value === null || value === undefined || value === '') return '';
    
    // Converter para string e remover tudo exceto números e ponto decimal
    let numericValue = String(value).replace(/[^\d.]/g, '');
    
    // Se vazio, retornar vazio
    if (!numericValue) return '';
    
    // Separar parte inteira e decimal
    const parts = numericValue.split('.');
    let integerPart = parts[0] || '0';
    let decimalPart = parts[1] || '';
    
    // Limitar a 2 casas decimais
    if (decimalPart.length > 2) {
        decimalPart = decimalPart.substring(0, 2);
    }
    
    // Remover zeros à esquerda da parte inteira (exceto se for apenas "0")
    integerPart = integerPart.replace(/^0+/, '') || '0';
    
    // Adicionar espaços como separadores de milhar (da direita para esquerda)
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    
    // Montar resultado
    if (decimalPart) {
        return `${integerPart}.${decimalPart}`;
    } else if (numericValue.includes('.') && numericValue.indexOf('.') === numericValue.length - 1) {
        // Se o usuário acabou de digitar o ponto
        return `${integerPart}.`;
    } else {
        return integerPart;
    }
}

/**
 * Remove formatação e retorna apenas o valor numérico
 */
function unformatMoneyInput(value) {
    if (!value) return '';
    // Remove espaços e mantém apenas números e ponto decimal
    return String(value).replace(/[^\d.]/g, '');
}

/**
 * Aplica formatação monetária a um input
 * Formato visual: 7 303 380.00
 */
function setupMoneyInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    // Formatar ao digitar
    input.addEventListener('input', function(e) {
        const cursorPosition = e.target.selectionStart;
        const unformatted = unformatMoneyInput(e.target.value);
        const formatted = formatMoneyInput(unformatted);
        
        e.target.value = formatted;
        
        // Ajustar posição do cursor
        const diff = formatted.length - e.target.value.length;
        const newPosition = Math.max(0, cursorPosition + diff);
        e.target.setSelectionRange(newPosition, newPosition);
    });
    
    // Formatar ao perder foco
    input.addEventListener('blur', function(e) {
        const unformatted = unformatMoneyInput(e.target.value);
        if (unformatted) {
            const numValue = parseFloat(unformatted);
            if (!isNaN(numValue)) {
                e.target.value = formatMoneyInput(numValue.toFixed(2));
            }
        }
    });
    
    // Formatar ao ganhar foco (remover formatação temporariamente para facilitar edição)
    input.addEventListener('focus', function(e) {
        const unformatted = unformatMoneyInput(e.target.value);
        if (unformatted) {
            e.target.value = unformatted;
        }
    });
}

// ============================================================================
// Export para uso em módulos
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        API_BASE,
        getToken,
        checkAuth,
        getAuthHeaders,
        fetchWithAuth,
        formatMoney,
        formatCurrency,
        formatDate,
        formatDateTime,
        showToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        handle401,
        openModal,
        closeModal,
        logout,
        isAdmin,
        getCachedData,
        setCachedData,
        invalidateCache,
        clearAllCache,
        debounce,
        formatMoneyInput,
        unformatMoneyInput,
        setupMoneyInput
    };
}
