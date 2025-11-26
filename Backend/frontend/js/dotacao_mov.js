// Dotação Movimentos - Histórico de Movimentos da Dotação Global
// Verificar se common.js foi carregado
if (typeof fetchWithAuth === 'undefined') {
    console.error('common.js deve ser carregado antes de dotacao_mov.js');
}

// API_BASE já está definido em common.js - não declarar novamente
if (typeof API_BASE === 'undefined') {
    console.error('API_BASE não está definido. Certifique-se de que common.js foi carregado.');
}

let currentPage = 0;
let currentLimit = 100;
let currentExercicio = new Date().getFullYear();

// ============================================================================
// Inicialização
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    // Inicializar seletor de exercício
    initExercicioSelector();
    
    // Carregar movimentos
    carregarMovimentos();
    
    // Event listeners
    setupEventListeners();
});

// ============================================================================
// Inicialização de Componentes
// ============================================================================

function initExercicioSelector() {
    const selector = document.getElementById('exercicioSelector');
    if (!selector) return;
    
    const currentYear = new Date().getFullYear();
    const startYear = 2020;
    const endYear = currentYear + 5;
    
    selector.innerHTML = '';
    for (let year = endYear; year >= startYear; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) {
            option.selected = true;
            currentExercicio = year;
        }
        selector.appendChild(option);
    }
    
    selector.addEventListener('change', (e) => {
        currentExercicio = parseInt(e.target.value);
        currentPage = 0;
        carregarMovimentos();
    });
}

function setupEventListeners() {
    // Botão Atualizar
    const btnAtualizar = document.getElementById('btnAtualizar');
    if (btnAtualizar) {
        btnAtualizar.addEventListener('click', () => {
            currentPage = 0;
            carregarMovimentos();
        });
    }
    
    // Filtro de tipo
    const tipoFiltro = document.getElementById('tipoFiltro');
    if (tipoFiltro) {
        tipoFiltro.addEventListener('change', () => {
            currentPage = 0;
            carregarMovimentos();
        });
    }
    
    // Seletor de limite
    const limitSelector = document.getElementById('limitSelector');
    if (limitSelector) {
        limitSelector.addEventListener('change', (e) => {
            currentLimit = parseInt(e.target.value);
            currentPage = 0;
            carregarMovimentos();
        });
    }
}

// ============================================================================
// Carregamento de Dados
// ============================================================================

async function carregarMovimentos() {
    const tbody = document.getElementById('movimentosBody');
    if (!tbody) return;
    
    const tipoFiltro = document.getElementById('tipoFiltro')?.value || '';
    const skip = currentPage * currentLimit;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="table-empty">
                <div class="empty-state">
                    <i class='bx bx-loader-alt bx-spin'></i>
                    <p>Carregando movimentos...</p>
                </div>
            </td>
        </tr>
    `;
    
    try {
        let url = `${API_BASE}/api/v1/dotacao_global/movimentos?exercicio=${currentExercicio}&skip=${skip}&limit=${currentLimit}`;
        
        const response = await fetchWithAuth(url);
        
        if (!response.ok) {
            throw new Error('Erro ao carregar movimentos');
        }
        
        let movimentos = await response.json();
        
        // Filtra por tipo se especificado
        if (tipoFiltro) {
            movimentos = movimentos.filter(m => m.tipo === tipoFiltro);
        }
        
        if (movimentos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="table-empty">
                        <div class="empty-state">
                            <i class='bx bx-history'></i>
                            <p>Nenhum movimento encontrado</p>
                        </div>
                    </td>
                </tr>
            `;
            updatePagination(0);
            return;
        }
        
        let html = '';
        movimentos.forEach(mov => {
            const data = new Date(mov.criado_em).toLocaleString('pt-MZ', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const valorFormatado = formatMoney(mov.valor);
            const valorClass = mov.valor < 0 ? 'text-danger' : 'text-success';
            const tipoClass = getTipoClass(mov.tipo);
            const tipoLabel = getTipoLabel(mov.tipo);
            
            html += `
                <tr>
                    <td>${data}</td>
                    <td><span class="tipo-badge ${tipoClass}">${escapeHtml(tipoLabel)}</span></td>
                    <td class="text-right ${valorClass}"><strong>${valorFormatado}</strong></td>
                    <td>${escapeHtml(mov.referencia || '-')}</td>
                    <td>${escapeHtml(mov.descricao || '-')}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        updatePagination(movimentos.length);
        
    } catch (error) {
        console.error('Erro ao carregar movimentos:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="table-empty">
                    <div class="empty-state">
                        <i class='bx bx-error'></i>
                        <p>Erro ao carregar movimentos: ${escapeHtml(error.message)}</p>
                    </div>
                </td>
            </tr>
        `;
        updatePagination(0);
    }
}

// ============================================================================
// Paginação
// ============================================================================

function updatePagination(itemsCount) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
    const hasMore = itemsCount === currentLimit;
    
    if (currentPage === 0 && !hasMore) {
        pagination.style.display = 'none';
        return;
    }
    
    pagination.style.display = 'flex';
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageInfo = document.getElementById('pageInfo');
    
    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = !hasMore;
    if (pageInfo) pageInfo.textContent = `Página ${currentPage + 1}`;
}

function previousPage() {
    if (currentPage > 0) {
        currentPage--;
        carregarMovimentos();
    }
}

function nextPage() {
    currentPage++;
    carregarMovimentos();
}

// ============================================================================
// Utilitários
// ============================================================================

function getTipoClass(tipo) {
    const map = {
        'ajuste': 'tipo-ajuste',
        'despesa_confirmada': 'tipo-despesa_confirmada',
        'despesa_cancelada': 'tipo-despesa_cancelada',
        'reserva': 'tipo-reserva',
        'reserva_cancelada': 'tipo-reserva_cancelada'
    };
    return map[tipo] || '';
}

function getTipoLabel(tipo) {
    const map = {
        'ajuste': 'Ajuste',
        'despesa_confirmada': 'Despesa Confirmada',
        'despesa_cancelada': 'Despesa Cancelada',
        'reserva': 'Reserva',
        'reserva_cancelada': 'Reserva Cancelada'
    };
    return map[tipo] || tipo;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Exportar funções globais
if (typeof window !== 'undefined') {
    window.previousPage = previousPage;
    window.nextPage = nextPage;
}

