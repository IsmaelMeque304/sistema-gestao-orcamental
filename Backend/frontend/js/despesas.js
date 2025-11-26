// Despesas.js - Gerenciamento de Lançamento de Despesas
// Funcionalidades: CRUD completo, confirmação, filtros, autocomplete

// Verificar se common.js foi carregado
if (typeof fetchWithAuth === 'undefined') {
    console.error('common.js deve ser carregado antes de despesas.js');
}

let despesas = [];
let filteredDespesas = [];
let rubricas = [];
let fornecedores = [];
let currentExercicio = new Date().getFullYear();

// ============================================================================
// Inicialização
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    // Configurar formatação de inputs monetários
    if (typeof setupMoneyInput !== 'undefined') {
        setupMoneyInput('valor');
    }
    
    // Carregar dados iniciais
    carregarRubricas();
    carregarFornecedores();
    carregarDespesas();
    
    // Event listeners
    setupEventListeners();
    
    // Inicializar exercício atual
    const exercicioSelect = document.getElementById('filterExercicio');
    if (exercicioSelect) {
        const currentYear = new Date().getFullYear();
        for (let year = currentYear - 2; year <= currentYear + 1; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            if (year === currentYear) {
                option.selected = true;
                currentExercicio = year;
            }
            exercicioSelect.appendChild(option);
        }
    }
});

function setupEventListeners() {
    // Botão Nova Despesa
    const btnNovo = document.getElementById('btnNovaDespesa');
    if (btnNovo) {
        btnNovo.addEventListener('click', () => abrirModalNovo());
    }
    
    // Botão Atualizar
    const btnAtualizar = document.getElementById('btnAtualizar');
    if (btnAtualizar) {
        btnAtualizar.addEventListener('click', () => {
            carregarDespesas();
        });
    }
    
    // Formulário
    const form = document.getElementById('despesaForm');
    if (form) {
        form.addEventListener('submit', handleSubmit);
    }
    
    // Filtros
    const filterExercicio = document.getElementById('filterExercicio');
    const filterMes = document.getElementById('filterMes');
    const filterStatus = document.getElementById('filterStatus');
    const filterRubrica = document.getElementById('filterRubrica');
    const filterFornecedor = document.getElementById('filterFornecedor');
    const btnLimparFiltros = document.getElementById('btnLimparFiltros');
    
    if (filterExercicio) {
        filterExercicio.addEventListener('change', () => {
            currentExercicio = parseInt(filterExercicio.value) || new Date().getFullYear();
            aplicarFiltros();
        });
    }
    
    if (filterMes) {
        filterMes.addEventListener('change', aplicarFiltros);
    }
    
    if (filterStatus) {
        filterStatus.addEventListener('change', aplicarFiltros);
    }
    
    if (filterRubrica) {
        filterRubrica.addEventListener('change', aplicarFiltros);
    }
    
    if (filterFornecedor) {
        const debouncedFilter = debounce(() => aplicarFiltros(), 300);
        filterFornecedor.addEventListener('input', debouncedFilter);
    }
    
    if (btnLimparFiltros) {
        btnLimparFiltros.addEventListener('click', limparFiltros);
    }
    
    // Autocomplete de fornecedor
    const fornecedorSearch = document.getElementById('fornecedor_search');
    if (fornecedorSearch) {
        fornecedorSearch.addEventListener('input', handleFornecedorSearch);
        fornecedorSearch.addEventListener('focus', () => {
            if (fornecedorSearch.value) {
                handleFornecedorSearch({ target: fornecedorSearch });
            }
        });
    }
    
    // Data emissão - atualizar mês e exercício automaticamente
    const dataEmissao = document.getElementById('data_emissao');
    if (dataEmissao) {
        dataEmissao.addEventListener('change', () => {
            const date = new Date(dataEmissao.value);
            if (date && !isNaN(date.getTime())) {
                // Atualizar exercício no filtro se necessário
                const exercicioSelect = document.getElementById('filterExercicio');
                if (exercicioSelect) {
                    exercicioSelect.value = date.getFullYear();
                    currentExercicio = date.getFullYear();
                }
            }
        });
    }
}

// ============================================================================
// Carregamento de Dados
// ============================================================================

async function carregarRubricas() {
    try {
        const exercicio = currentExercicio || new Date().getFullYear();
        const response = await fetchWithAuth(`${API_BASE}/api/v1/rubricas/tree-view?exercicio=${exercicio}`);
        
        if (!response.ok) {
            throw new Error('Erro ao carregar rubricas');
        }
        
        const tree = await response.json();
        rubricas = flattenRubricasTree(tree);
        
        // Preencher select de rubricas
        preencherSelectRubricas();
        preencherFiltroRubricas();
        
    } catch (error) {
        console.error('Erro ao carregar rubricas:', error);
        showError('Erro ao carregar rubricas');
    }
}

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

function flattenRubricasTree(tree, result = [], level = 0) {
    for (const rubrica of tree) {
        // Apenas rubricas folha (sem children ou children vazio)
        if (!rubrica.children || rubrica.children.length === 0) {
            result.push({
                ...rubrica,
                display: '  '.repeat(level) + `${rubrica.codigo} - ${rubrica.designacao}`
            });
        }
        if (rubrica.children && rubrica.children.length > 0) {
            flattenRubricasTree(rubrica.children, result, level + 1);
        }
    }
    return result;
}

function preencherSelectRubricas() {
    const select = document.getElementById('rubrica_id');
    if (!select) return;
    
    select.innerHTML = '<option value="">Selecione uma rubrica...</option>';
    
    rubricas.forEach(rubrica => {
        const option = document.createElement('option');
        option.value = rubrica.id;
        option.textContent = rubrica.display || `${rubrica.codigo} - ${rubrica.designacao}`;
        select.appendChild(option);
    });
}

function preencherFiltroRubricas() {
    const select = document.getElementById('filterRubrica');
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="">Todas</option>';
    
    rubricas.forEach(rubrica => {
        const option = document.createElement('option');
        option.value = rubrica.id;
        option.textContent = rubrica.display || `${rubrica.codigo} - ${rubrica.designacao}`;
        select.appendChild(option);
    });
    
    if (currentValue) {
        select.value = currentValue;
    }
}

async function carregarFornecedores() {
    try {
        const response = await fetchWithAuth(`${API_BASE}/api/v1/fornecedores?limit=1000`);
        
        if (!response.ok) {
            throw new Error('Erro ao carregar fornecedores');
        }
        
        fornecedores = await response.json();
        
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
        showError('Erro ao carregar fornecedores');
    }
}

async function carregarDespesas() {
    try {
        showLoading(true);
        
        const params = new URLSearchParams();
        const filterExercicio = document.getElementById('filterExercicio')?.value;
        const filterMes = document.getElementById('filterMes')?.value;
        const filterStatus = document.getElementById('filterStatus')?.value;
        const filterRubrica = document.getElementById('filterRubrica')?.value;
        const filterFornecedor = document.getElementById('filterFornecedor')?.value;
        
        if (filterExercicio) params.append('exercicio', filterExercicio);
        if (filterMes) params.append('mes', filterMes);
        if (filterStatus) params.append('status', filterStatus);
        if (filterRubrica) params.append('rubrica_id', filterRubrica);
        
        const response = await fetchWithAuth(`${API_BASE}/api/v1/despesas?${params.toString()}`);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao carregar despesas' }));
            throw new Error(error.detail || 'Erro ao carregar despesas');
        }
        
        despesas = await response.json();
        
        // Filtrar por fornecedor se fornecido
        if (filterFornecedor) {
            const searchTerm = filterFornecedor.toLowerCase();
            despesas = despesas.filter(d => {
                const nome = (d.fornecedor?.nome || d.fornecedor_text || '').toLowerCase();
                return nome.includes(searchTerm);
            });
        }
        
        filteredDespesas = despesas;
        renderTable();
        
    } catch (error) {
        console.error('Erro ao carregar despesas:', error);
        showError(error.message || 'Erro ao carregar despesas');
        document.getElementById('despesasBody').innerHTML = `
            <tr>
                <td colspan="6" class="table-empty">
                    <div class="empty-state">
                        <i class='bx bx-error-circle' style="color: var(--danger);"></i>
                        <p>Erro ao carregar despesas. Tente novamente.</p>
                    </div>
                </td>
            </tr>
        `;
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// Renderização da Tabela
// ============================================================================

function renderTable() {
    const tbody = document.getElementById('despesasBody');
    if (!tbody) return;
    
    if (filteredDespesas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty">
                    <div class="empty-state">
                        <i class='bx bx-inbox'></i>
                        <p>Nenhuma despesa encontrada</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filteredDespesas.map(despesa => {
        const dataFormatada = despesa.data_emissao ? 
            new Date(despesa.data_emissao).toLocaleDateString('pt-PT', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }) : '-';
        const valorFormatado = formatMoney(despesa.valor);
        
        const statusLabels = {
            'pendente': 'Pendente',
            'confirmada': 'Confirmada',
            'cancelada': 'Cancelada'
        };
        const statusClasses = {
            'pendente': 'status-badge pendente',
            'confirmada': 'status-badge confirmada',
            'cancelada': 'status-badge cancelada'
        };
        const status = despesa.status || 'pendente';
        const statusLabel = statusLabels[status] || status;
        const statusClass = statusClasses[status] || 'status-badge';
        
        // Formatar nome da rubrica: mostrar código e truncar designação se muito longa
        let rubricaNome = '-';
        if (despesa.rubrica) {
            const codigo = despesa.rubrica.codigo || '';
            const designacao = despesa.rubrica.designacao || '';
            // Se a designação for muito longa, mostrar apenas os primeiros 20 caracteres
            if (designacao.length > 20) {
                rubricaNome = `${codigo} - ${designacao.substring(0, 20)}...`;
            } else {
                rubricaNome = `${codigo} - ${designacao}`;
            }
        }
        
        // Buscar nome do fornecedor: primeiro do objeto fornecedor, depois da lista carregada, depois fornecedor_text
        let fornecedorNome = '-';
        if (despesa.fornecedor?.nome) {
            fornecedorNome = despesa.fornecedor.nome;
        } else if (despesa.fornecedor_id) {
            // Buscar na lista de fornecedores carregada
            const fornecedorEncontrado = fornecedores.find(f => f.id === despesa.fornecedor_id);
            if (fornecedorEncontrado?.nome) {
                fornecedorNome = fornecedorEncontrado.nome;
            }
        }
        
        // Se ainda não encontrou, usar fornecedor_text
        if (fornecedorNome === '-' && despesa.fornecedor_text) {
            fornecedorNome = despesa.fornecedor_text;
        }
        
        return `
            <tr>
                <td>${dataFormatada}</td>
                <td>${escapeHtml(rubricaNome)}</td>
                <td>${escapeHtml(fornecedorNome)}</td>
                <td class="text-right">${valorFormatado}</td>
                <td>
                    <span class="${statusClass}">${statusLabel}</span>
                </td>
                <td class="text-center">
                    <div class="table-actions">
                        ${status === 'pendente' ? `
                        <button class="btn btn--small btn--primary" 
                                onclick="abrirModalEditar(${despesa.id})"
                                aria-label="Editar despesa"
                                title="Editar despesa">
                            <i class='bx bx-edit'></i>
                        </button>
                        <button class="btn btn--small btn--success" 
                                onclick="confirmarDespesa(${despesa.id})"
                                aria-label="Confirmar despesa"
                                title="Confirmar despesa">
                            <i class='bx bx-check'></i>
                        </button>
                        <button class="btn btn--small btn--danger" 
                                onclick="removerDespesa(${despesa.id})"
                                aria-label="Remover despesa"
                                title="Remover despesa">
                            <i class='bx bx-trash'></i>
                        </button>
                        ` : `
                        <span style="color: var(--dark-grey); font-size: 0.875rem;">-</span>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================================================
// Filtros
// ============================================================================

function aplicarFiltros() {
    carregarDespesas();
}

function limparFiltros() {
    document.getElementById('filterExercicio').value = currentExercicio || new Date().getFullYear();
    document.getElementById('filterMes').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterRubrica').value = '';
    document.getElementById('filterFornecedor').value = '';
    aplicarFiltros();
}

// ============================================================================
// Autocomplete Fornecedor
// ============================================================================

function handleFornecedorSearch(event) {
    const searchTerm = event.target.value.toLowerCase().trim();
    const suggestions = document.getElementById('fornecedor_suggestions');
    const fornecedorIdInput = document.getElementById('fornecedor_id');
    
    if (!suggestions || !fornecedorIdInput) return;
    
    if (!searchTerm) {
        suggestions.classList.remove('show');
        fornecedorIdInput.value = '';
        return;
    }
    
    const matches = fornecedores
        .filter(f => f.activo && f.nome && f.nome.toLowerCase().includes(searchTerm))
        .slice(0, 10);
    
    if (matches.length === 0) {
        suggestions.classList.remove('show');
        return;
    }
    
    suggestions.innerHTML = matches.map(fornecedor => `
        <div class="autocomplete-suggestion" 
             data-id="${fornecedor.id}"
             data-nome="${escapeHtml(fornecedor.nome)}"
             onclick="selecionarFornecedor(${fornecedor.id}, '${escapeHtml(fornecedor.nome)}')">
            ${escapeHtml(fornecedor.nome)}
        </div>
    `).join('');
    
    suggestions.classList.add('show');
}

function selecionarFornecedor(id, nome) {
    document.getElementById('fornecedor_id').value = id;
    document.getElementById('fornecedor_search').value = nome;
    document.getElementById('fornecedor_suggestions').classList.remove('show');
}

// Fechar autocomplete ao clicar fora
document.addEventListener('click', (e) => {
    const suggestions = document.getElementById('fornecedor_suggestions');
    const searchInput = document.getElementById('fornecedor_search');
    if (suggestions && searchInput && 
        !suggestions.contains(e.target) && 
        e.target !== searchInput) {
        suggestions.classList.remove('show');
    }
});

// ============================================================================
// Modal
// ============================================================================

function abrirModalNovo() {
    document.getElementById('despesaForm').reset();
    document.getElementById('despesaId').value = '';
    document.getElementById('modalTitle').textContent = 'Nova Despesa';
    document.getElementById('fornecedor_id').value = '';
    document.getElementById('fornecedor_search').value = '';
    
    // Definir data padrão (hoje)
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('data_emissao').value = hoje;
    
    openModal('despesaModal');
}

async function abrirModalEditar(id) {
    try {
        const despesa = despesas.find(d => d.id === id);
        if (!despesa) {
            showError('Despesa não encontrada');
            return;
        }
        
        // Buscar despesa completa da API
        const response = await fetchWithAuth(`${API_BASE}/api/v1/despesas/${id}`);
        
        if (!response.ok) {
            throw new Error('Erro ao buscar despesa');
        }
        
        const despesaFull = await response.json();
        
        // Preencher formulário
        document.getElementById('despesaId').value = despesaFull.id;
        document.getElementById('rubrica_id').value = despesaFull.rubrica_id || '';
        const valorInput = document.getElementById('valor');
        if (valorInput) {
            const valor = despesaFull.valor || 0;
            // Formatar o valor para exibição
            if (typeof formatMoneyInput !== 'undefined') {
                valorInput.value = formatMoneyInput(valor);
            } else {
                valorInput.value = valor;
            }
        }
        document.getElementById('justificativo').value = despesaFull.justificativo || '';
        document.getElementById('requisicao').value = despesaFull.requisicao || '';
        document.getElementById('ordem_pagamento').value = despesaFull.ordem_pagamento || '';
        
        // Data
        if (despesaFull.data_emissao) {
            const date = new Date(despesaFull.data_emissao);
            document.getElementById('data_emissao').value = date.toISOString().split('T')[0];
        }
        
        // Fornecedor
        if (despesaFull.fornecedor_id) {
            document.getElementById('fornecedor_id').value = despesaFull.fornecedor_id;
            document.getElementById('fornecedor_search').value = despesaFull.fornecedor?.nome || '';
        } else if (despesaFull.fornecedor_text) {
            document.getElementById('fornecedor_search').value = despesaFull.fornecedor_text;
        }
        
        document.getElementById('modalTitle').textContent = 'Editar Despesa';
        
        openModal('despesaModal');
        
    } catch (error) {
        console.error('Erro ao carregar despesa:', error);
        showError('Erro ao carregar despesa: ' + error.message);
    }
}

// ============================================================================
// Submissão do Formulário
// ============================================================================

async function handleSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    
    // Prevenir duplo submit
    const form = event.target;
    if (form.dataset.submitting === 'true') {
        console.warn('Formulário já está sendo processado');
        return;
    }
    form.dataset.submitting = 'true';
    
    const submitBtn = form.querySelector('button[type="submit"]');
    const cancelBtn = form.querySelector('button[type="button"]');
    
    if (submitBtn) submitBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (submitBtn) submitBtn.textContent = 'Salvando...';
    
    try {
        const id = document.getElementById('despesaId').value;
        const rubrica_id = parseInt(document.getElementById('rubrica_id').value);
        const fornecedor_id = document.getElementById('fornecedor_id').value || null;
        const fornecedor_text = fornecedor_id ? null : (document.getElementById('fornecedor_search').value.trim() || null);
        const data_emissao = document.getElementById('data_emissao').value;
        // Remover formatação antes de converter para número
        const valorInput = document.getElementById('valor');
        const valorUnformatted = typeof unformatMoneyInput !== 'undefined' 
            ? unformatMoneyInput(valorInput.value)
            : valorInput.value.replace(/[^\d.]/g, '');
        const valor = parseFloat(valorUnformatted);
        const justificativo = document.getElementById('justificativo').value.trim() || null;
        const requisicao = document.getElementById('requisicao').value.trim() || null;
        const ordem_pagamento = document.getElementById('ordem_pagamento').value.trim() || null;
        
        if (!rubrica_id) {
            throw new Error('Rubrica é obrigatória');
        }
        
        if (!data_emissao) {
            throw new Error('Data da despesa é obrigatória');
        }
        
        if (!valor || valor <= 0) {
            throw new Error('Valor deve ser maior que zero');
        }
        
        const formData = {
            rubrica_id: rubrica_id,
            fornecedor_id: fornecedor_id ? parseInt(fornecedor_id) : null,
            fornecedor_text: fornecedor_text,
            data_emissao: data_emissao,
            valor: valor,
            justificativo: justificativo,
            requisicao: requisicao,
            ordem_pagamento: ordem_pagamento
        };
        
        let response;
        
        if (id) {
            // Atualizar
            response = await fetchWithAuth(`${API_BASE}/api/v1/despesas/${id}`, {
                method: 'PUT',
                body: JSON.stringify(formData)
            });
        } else {
            // Criar
            response = await fetchWithAuth(`${API_BASE}/api/v1/despesas`, {
                method: 'POST',
                body: JSON.stringify(formData)
            });
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Erro ao salvar despesa' }));
            
            // Tratar erros de validação do Pydantic (422)
            if (response.status === 422 && errorData.detail) {
                let errorMessage = 'Erro de validação:\n';
                if (Array.isArray(errorData.detail)) {
                    errorMessage += errorData.detail.map(err => {
                        const field = err.loc ? err.loc.join('.') : 'campo';
                        return `- ${field}: ${err.msg}`;
                    }).join('\n');
                } else {
                    errorMessage = errorData.detail;
                }
                throw new Error(errorMessage);
            }
            
            throw new Error(errorData.detail || errorData.message || 'Erro ao salvar despesa');
        }
        
        // Obter dados da resposta
        const responseData = await response.json();
        
        // Sucesso
        closeModal('despesaModal');
        showSuccess(id ? 'Despesa atualizada com sucesso!' : 'Despesa criada com sucesso!');
        
        // Recarregar lista
        await carregarDespesas();
        
        // Notificar outras abas (incluindo dashboard) sobre a atualização
        const exercicio = responseData.exercicio || currentExercicio;
        notifyDashboardUpdate(id ? 'despesa_atualizada' : 'despesa_criada', { 
            despesa_id: responseData.id, 
            exercicio: exercicio,
            valor: responseData.valor 
        });
        
    } catch (error) {
        console.error('Erro ao salvar despesa:', error);
        showError(error.message || 'Erro ao salvar despesa');
    } finally {
        if (form) {
            form.dataset.submitting = 'false';
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Salvar';
        }
        if (cancelBtn) cancelBtn.disabled = false;
    }
}

// ============================================================================
// Confirmação e Remoção
// ============================================================================

async function confirmarDespesa(id) {
    const despesa = despesas.find(d => d.id === id);
    if (!despesa) {
        showError('Despesa não encontrada');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja confirmar esta despesa?\n\nValor: ${formatMoney(despesa.valor)}\nRubrica: ${despesa.rubrica?.designacao || '-'}\n\nEsta ação atualizará a execução mensal.`)) {
        return;
    }
    
    try {
        const response = await fetchWithAuth(`${API_BASE}/api/v1/despesas/${id}/confirmar`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao confirmar despesa' }));
            throw new Error(error.detail || 'Erro ao confirmar despesa');
        }
        
        const result = await response.json();
        const exercicio = result.exercicio || despesa.exercicio || new Date().getFullYear();
        
        showSuccess('Despesa confirmada com sucesso!');
        
        // Recarregar lista
        await carregarDespesas();
        
        // Notificar outras abas (incluindo dashboard) sobre a atualização
        notifyDashboardUpdate('despesa_confirmada', { 
            despesa_id: id, 
            exercicio: exercicio,
            valor: despesa.valor 
        });
        
    } catch (error) {
        console.error('Erro ao confirmar despesa:', error);
        showError(error.message || 'Erro ao confirmar despesa');
    }
}

async function removerDespesa(id) {
    const despesa = despesas.find(d => d.id === id);
    if (!despesa) {
        showError('Despesa não encontrada');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja remover esta despesa?\n\nValor: ${formatMoney(despesa.valor)}\nRubrica: ${despesa.rubrica?.designacao || '-'}\n\nEsta ação não pode ser desfeita.`)) {
        return;
    }
    
    try {
        const response = await fetchWithAuth(`${API_BASE}/api/v1/despesas/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao remover despesa' }));
            throw new Error(error.detail || 'Erro ao remover despesa');
        }
        
        showSuccess('Despesa removida com sucesso!');
        
        // Recarregar lista
        await carregarDespesas();
        
    } catch (error) {
        console.error('Erro ao remover despesa:', error);
        showError(error.message || 'Erro ao remover despesa');
    }
}

// ============================================================================
// Utilitários
// ============================================================================

function showLoading(show) {
    const tbody = document.getElementById('despesasBody');
    if (show) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Carregando despesas...</td></tr>';
    }
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Exportar funções globais
window.abrirModalNovo = abrirModalNovo;
window.abrirModalEditar = abrirModalEditar;
// ============================================================================
// Comunicação entre abas (Cross-tab updates)
// ============================================================================

function notifyDashboardUpdate(type, data = {}) {
    // Usar BroadcastChannel para comunicação entre abas
    if (typeof BroadcastChannel !== 'undefined') {
        let channel = window.despesasChannel;
        if (!channel) {
            channel = new BroadcastChannel('dashboard_updates');
            window.despesasChannel = channel;
        }
        
        channel.postMessage({
            type: type,
            timestamp: Date.now(),
            ...data
        });
    }
}

window.confirmarDespesa = confirmarDespesa;
window.removerDespesa = removerDespesa;
window.selecionarFornecedor = selecionarFornecedor;

