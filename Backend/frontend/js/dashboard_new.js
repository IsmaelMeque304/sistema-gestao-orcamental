// dashboard_new.js - Integração do novo layout com funcionalidades existentes

// Função auxiliar para escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Função para formatar nome: primeiro nome + último nome
function formatarNomeCompleto(nomeCompleto) {
    if (!nomeCompleto || typeof nomeCompleto !== 'string') {
        return '-';
    }
    
    const partes = nomeCompleto.trim().split(/\s+/);
    
    // Se tiver apenas uma parte, retorna ela
    if (partes.length === 1) {
        return partes[0];
    }
    
    // Se tiver duas ou mais partes, retorna primeira + última
    if (partes.length >= 2) {
        return `${partes[0]} ${partes[partes.length - 1]}`;
    }
    
    return nomeCompleto;
}

// ============================================================================
// Sidebar e Navegação (do protótipo)
// ============================================================================

const sideLinks = document.querySelectorAll('.sidebar .side-menu li a:not(.logout)');

sideLinks.forEach(item => {
    const li = item.parentElement;
    item.addEventListener('click', () => {
        sideLinks.forEach(i => {
            i.parentElement.classList.remove('active');
        });
        li.classList.add('active');
    });
});

const menuBar = document.querySelector('.content nav .bx.bx-menu');
const sideBar = document.querySelector('.sidebar');

if (menuBar && sideBar) {
    menuBar.addEventListener('click', () => {
        sideBar.classList.toggle('close');
    });
}

// ============================================================================
// Busca (do protótipo)
// ============================================================================

const searchBtn = document.querySelector('.content nav form .form-input button');
const searchBtnIcon = document.querySelector('.content nav form .form-input button .bx');
const searchForm = document.querySelector('.content nav form');

if (searchBtn && searchForm) {
    searchBtn.addEventListener('click', function (e) {
        if (window.innerWidth < 576) {
            e.preventDefault();
            searchForm.classList.toggle('show');
            if (searchForm.classList.contains('show')) {
                searchBtnIcon.classList.replace('bx-search', 'bx-x');
            } else {
                searchBtnIcon.classList.replace('bx-x', 'bx-search');
            }
        }
    });
}

// ============================================================================
// Tema Dark/Light (do protótipo)
// ============================================================================

const toggler = document.getElementById('theme-toggle');

if (toggler) {
    // Carregar preferência salva
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark');
        toggler.checked = true;
    }

    toggler.addEventListener('change', function () {
        if (this.checked) {
            document.body.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    });
}

// ============================================================================
// Responsividade (do protótipo)
// ============================================================================

window.addEventListener('resize', () => {
    if (window.innerWidth < 768) {
        if (sideBar) sideBar.classList.add('close');
    } else {
        if (sideBar) sideBar.classList.remove('close');
    }
    if (window.innerWidth > 576) {
        if (searchBtnIcon) searchBtnIcon.classList.replace('bx-x', 'bx-search');
        if (searchForm) searchForm.classList.remove('show');
    }
});

// ============================================================================
// Adaptação do Seletor de Exercício
// ============================================================================

function initExercicioSelectorNew() {
    const select = document.getElementById('exercicioSelect');
    if (!select) return;

    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 5; i <= currentYear + 2; i++) {
        years.push(i);
    }

    select.innerHTML = years.map(year =>
        `<option value="${year}" ${year === currentExercicio ? 'selected' : ''}>${year}</option>`
    ).join('');

    select.addEventListener('change', (e) => {
        currentExercicio = parseInt(e.target.value);
        invalidateCache('dotacao_global', currentExercicio);
        invalidateCache('rubricas_tree', currentExercicio);
        expandedNodes.clear();

        // Reconectar SSE com novo exercício
        if (typeof setupSSEConnection === 'function') {
            setupSSEConnection();
        }

        if (typeof loadDashboard === 'function') {
            loadDashboard();
        }
    });
}

// ============================================================================
// Atualização dos KPIs no novo layout
// ============================================================================

function updateKPIsNew(dotacao) {
    const kpiDotacao = document.getElementById('kpiDotacao');
    const kpiGasto = document.getElementById('kpiGasto');
    const kpiSaldo = document.getElementById('kpiSaldo');
    const kpiReservado = document.getElementById('kpiReservado');

    if (kpiDotacao) {
        kpiDotacao.textContent = formatMoney(dotacao.valor_anual || 0);
    }

    if (kpiGasto) {
        const gastoAcumulado = dotacao.gasto_total || 0;
        kpiGasto.textContent = formatMoney(gastoAcumulado);
    }

    if (kpiSaldo) {
        const saldoDisponivel = Math.max(0, (dotacao.saldo || 0));
        kpiSaldo.textContent = formatMoney(saldoDisponivel);
    }

    if (kpiReservado) {
        kpiReservado.textContent = formatMoney(dotacao.reservado || 0);
    }
}

// ============================================================================
// Atualização de Despesas Recentes
// ============================================================================

async function loadRecentDespesas() {
    const container = document.getElementById('recentDespesas');
    if (!container) return;

    try {
        const response = await fetchWithAuth(
            `${API_BASE}/api/v1/despesas?limit=3&exercicio=${currentExercicio}`
        );

        if (!response.ok) {
            throw new Error('Erro ao carregar despesas');
        }

        const despesas = await response.json();

        if (despesas.length === 0) {
            container.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Fornecedor</th>
                            <th>Valor</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="4" style="text-align: center; padding: 40px; color: var(--dark-grey);">
                                Nenhuma despesa encontrada
                            </td>
                        </tr>
                    </tbody>
                </table>
            `;
            return;
        }

        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Fornecedor</th>
                        <th>Valor</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${despesas.map(despesa => {
                        const dataFormatada = despesa.data_emissao ?
                            new Date(despesa.data_emissao).toLocaleDateString('pt-PT') : '-';
                        const valorFormatado = formatMoney(despesa.valor);
                        const statusLabels = {
                            'pendente': 'Pendente',
                            'confirmada': 'Confirmada',
                            'cancelada': 'Cancelada'
                        };
                        const statusClasses = {
                            'pendente': 'status pending',
                            'confirmada': 'status completed',
                            'cancelada': 'status process'
                        };
                        const status = despesa.status || 'pendente';
                        const statusLabel = statusLabels[status] || status;
                        const statusClass = statusClasses[status] || 'status';
                        // O nome do fornecedor está no campo 'nome' do fornecedor (enriquecido do usuario)
                        const fornecedorNomeCompleto = despesa.fornecedor?.nome || 
                            despesa.fornecedor_text || 
                            '-';
                        
                        // Formatar para mostrar apenas primeiro e último nome
                        const fornecedorNome = formatarNomeCompleto(fornecedorNomeCompleto);

                        return `
                            <tr onclick="window.location.href='despesas.html'">
                                <td>${dataFormatada}</td>
                                <td>${escapeHtml(fornecedorNome)}</td>
                                <td>${valorFormatado}</td>
                                <td><span class="${statusClass}">${statusLabel}</span></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('Erro ao carregar despesas recentes:', error);
        container.innerHTML = `
            <div class="loading" style="color: var(--danger);">
                Erro ao carregar despesas
            </div>
        `;
    }
}

// ============================================================================
// Integração com dashboard.js existente
// ============================================================================

// Sobrescrever função updateKPIs se existir
if (typeof updateKPIs !== 'undefined') {
    const originalUpdateKPIs = updateKPIs;
    window.updateKPIs = function(dotacao) {
        originalUpdateKPIs(dotacao);
        updateKPIsNew(dotacao);
    };
} else {
    window.updateKPIs = updateKPIsNew;
}

// Sobrescrever initExercicioSelector
if (typeof initExercicioSelector !== 'undefined') {
    const originalInit = initExercicioSelector;
    window.initExercicioSelector = function() {
        initExercicioSelectorNew();
    };
} else {
    window.initExercicioSelector = initExercicioSelectorNew;
}

// Carregar despesas recentes quando dashboard carregar
document.addEventListener('DOMContentLoaded', () => {
    if (typeof currentExercicio !== 'undefined') {
        loadRecentDespesas();
        
        // Recarregar despesas quando dashboard atualizar
        const originalLoadDashboard = window.loadDashboard;
        if (originalLoadDashboard) {
            window.loadDashboard = async function() {
                await originalLoadDashboard();
                loadRecentDespesas();
            };
        }
    }
});

// Botão de refresh
const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        if (typeof loadDashboard === 'function') {
            loadDashboard();
        }
        loadRecentDespesas();
    });
}

// Botão de refresh de rubricas removido - seção removida do dashboard

// Botão de exportar
const exportBtn = document.getElementById('exportBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('Funcionalidade de exportação em desenvolvimento', 'info');
    });
}

