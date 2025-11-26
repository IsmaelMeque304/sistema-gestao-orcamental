// Rubricas.js - Gerenciamento de Rubricas Orçamentárias (Versão Simplificada - Inserção Manual)
// Funcionalidades: CRUD básico, busca, validações

// Verificar se common.js foi carregado
if (typeof fetchWithAuth === 'undefined') {
    console.error('common.js deve ser carregado antes de rubricas.js');
}

let currentExercicio = new Date().getFullYear();
let rubricas = [];
let filteredRubricas = [];
let expandedRubricas = new Set(); // Controla quais rubricas pai estão expandidas

// ============================================================================
// Inicialização
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    // Inicializar seletor de exercício
    initExercicioSelector();
    
    // Configurar formatação de inputs monetários
    if (typeof setupMoneyInput !== 'undefined') {
        setupMoneyInput('rubricaDotacaoInicial');
        setupMoneyInput('subrubricaDotacaoInicial');
    }
    
    // Carregar rubricas
    carregarRubricas();
    
    // Event listeners
    setupEventListeners();
});

function initExercicioSelector() {
    const selector = document.getElementById('exercicioSelector');
    if (selector) {
        const currentYear = new Date().getFullYear();
        for (let i = currentYear - 5; i <= currentYear + 2; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            if (i === currentExercicio) option.selected = true;
            selector.appendChild(option);
        }
        
        selector.addEventListener('change', (e) => {
            currentExercicio = parseInt(e.target.value);
            carregarRubricas();
        });
    }
}

function setupEventListeners() {
    // Busca
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const debouncedSearch = debounce(handleSearch, 300);
        searchInput.addEventListener('input', (e) => {
            debouncedSearch(e.target.value);
        });
    }
    
    // Botão Nova Rubrica
    const btnNova = document.getElementById('btnNovaRubrica');
    if (btnNova) {
        btnNova.addEventListener('click', () => abrirModalNovo());
    }
    
    // Botão Atualizar
    const btnAtualizar = document.getElementById('btnAtualizar');
    if (btnAtualizar) {
        btnAtualizar.addEventListener('click', () => {
            carregarRubricas();
        });
    }
    
    // Formulário de rubrica
    const form = document.getElementById('rubricaForm');
    if (form) {
        // Remover listeners anteriores para evitar duplicação
        form.removeEventListener('submit', handleSubmit);
        form.addEventListener('submit', handleSubmit);
    }
    
    // Formulário de subrubrica
    const subrubricaForm = document.getElementById('subrubricaForm');
    if (subrubricaForm) {
        // Remover listeners anteriores para evitar duplicação
        subrubricaForm.removeEventListener('submit', handleSubmitSubrubrica);
        subrubricaForm.addEventListener('submit', handleSubmitSubrubrica);
    }
    
    // Formulário de criação em lote
    const batchForm = document.getElementById('subrubricaBatchForm');
    if (batchForm) {
        batchForm.removeEventListener('submit', handleSubmitBatch);
        batchForm.addEventListener('submit', handleSubmitBatch);
    }
}

// ============================================================================
// Carregamento de Dados
// ============================================================================

async function carregarRubricas() {
    try {
        showLoading(true);
        
        const response = await fetchWithAuth(
            `${API_BASE}/api/v1/rubricas?exercicio=${currentExercicio}`
        );
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao carregar rubricas' }));
            throw new Error(error.detail || 'Erro ao carregar rubricas');
        }
        
               const data = await response.json();
               rubricas = Array.isArray(data) ? data : [];
               
               // Garantir que dotacao_calculada está presente
               // Se alguma rubrica não tem dotacao_calculada, pode precisar de recálculo
               // Mas vamos confiar que o backend já calculou
               
               filteredRubricas = rubricas;
               
               renderTable();
        
    } catch (error) {
        console.error('Erro ao carregar rubricas:', error);
        showError(error.message || 'Erro ao carregar rubricas');
        document.getElementById('rubricasBody').innerHTML = 
            '<tr><td colspan="8" class="table-empty table-error">Erro ao carregar rubricas. Tente novamente.</td></tr>';
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// Renderização da Tabela
// ============================================================================

function hasChildren(rubricaId) {
    return filteredRubricas.some(r => r.parent_id === rubricaId);
}

function getChildren(rubricaId) {
    return filteredRubricas.filter(r => r.parent_id === rubricaId);
}

function buildHierarchy() {
    // Separar raízes (sem parent_id) e filhos
    const roots = filteredRubricas.filter(r => !r.parent_id);
    const allChildren = filteredRubricas.filter(r => r.parent_id);
    
    // Criar mapa de filhos por parent_id
    const childrenMap = new Map();
    allChildren.forEach(child => {
        if (!childrenMap.has(child.parent_id)) {
            childrenMap.set(child.parent_id, []);
        }
        childrenMap.get(child.parent_id).push(child);
    });
    
    // Ordenar filhos por código
    childrenMap.forEach(children => {
        children.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
    });
    
    // Ordenar raízes por código
    roots.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
    
    return { roots, childrenMap };
}

function renderTable() {
    const tbody = document.getElementById('rubricasBody');
    if (!tbody) return;
    
    if (filteredRubricas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Nenhuma rubrica encontrada para este exercício.</td></tr>';
        return;
    }
    
    // Construir hierarquia
    const { roots, childrenMap } = buildHierarchy();
    
    // Renderizar recursivamente
    let html = '';
    function renderRubrica(rubrica, level = 0) {
        const isParent = hasChildren(rubrica.id);
        const isExpanded = expandedRubricas.has(rubrica.id);
        const children = childrenMap.get(rubrica.id) || [];
        
        // Renderizar a rubrica
        html += renderRubricaRow(rubrica, level, isParent, isExpanded);
        
        // Renderizar filhos se expandido
        if (isExpanded && children.length > 0) {
            children.forEach(child => {
                renderRubrica(child, level + 1);
            });
        }
    }
    
    // Renderizar todas as raízes
    roots.forEach(root => {
        renderRubrica(root, 0);
    });
    
    tbody.innerHTML = html;
}

function renderRubricaRow(rubrica, level, isParent, isExpanded) {
    // Normalizar status (pode vir como string ou enum)
    const statusValue = rubrica.status?.value || rubrica.status || '';
    const estado = statusValue.toLowerCase() === 'ativa' ? 'Ativa' : 
                 statusValue.toLowerCase() === 'inativa' ? 'Inativa' : 
                 statusValue.toLowerCase() === 'provisoria' ? 'Provisória' : 
                 statusValue || 'N/A';
    const estadoClass = estado === 'Ativa' ? 'badge badge-success' : 
                       estado === 'Inativa' ? 'badge badge-danger' : 
                       'badge badge-warning';
    
    // Normalizar tipo (pode vir como enum)
    const tipoValue = rubrica.tipo?.value || rubrica.tipo || '';
    const tipoDisplay = tipoValue.toLowerCase() === 'despesa' ? 'Despesa' :
                       tipoValue.toLowerCase() === 'receita' ? 'Receita' :
                       tipoValue || '-';
    
    // Dotação calculada: sempre usar dotacao_calculada se disponível
    // Rubricas não têm dotação própria - apenas estrutura
    // A dotação está em execucao_mensal, e dotacao_calculada é calculada automaticamente
    let dotacaoCalculada = 0;
    if (rubrica.dotacao_calculada !== null && rubrica.dotacao_calculada !== undefined) {
        dotacaoCalculada = rubrica.dotacao_calculada;
    }
    
    // Classe para linha de rubrica pai (clicável)
    const rowClass = isParent ? 'rubrica-row--parent' : 'rubrica-row--leaf';
    const indentClass = level > 0 ? `rubrica-row--level-${level}` : '';
    
    // Ícone de expandir/colapsar
    const expandIcon = isParent ? (isExpanded ? '▼' : '▶') : '';
    const expandButton = isParent ? 
        `<button class="rubrica-expand-btn" onclick="toggleRubrica(${rubrica.id}, event)" aria-label="${isExpanded ? 'Colapsar' : 'Expandir'} ${escapeHtml(rubrica.designacao)}" title="${isExpanded ? 'Ocultar' : 'Mostrar'} subrubricas">
            <span class="rubrica-expand-icon">${expandIcon}</span>
        </button>` : 
        '<span class="rubrica-expand-spacer"></span>';
    
    return `
        <tr class="${rowClass} ${indentClass}" data-rubrica-id="${rubrica.id}" data-level="${level}">
            <td class="rubrica-code-cell">
                ${expandButton}
                <strong>${escapeHtml(rubrica.codigo || 'N/A')}</strong>
            </td>
            <td>${escapeHtml(rubrica.designacao || 'N/A')}</td>
            <td>${escapeHtml(tipoDisplay)}</td>
            <td>${rubrica.nivel || 1}</td>
            <td class="text-right"><strong>${formatMoney(dotacaoCalculada)}</strong></td>
            <td>
                <span class="${estadoClass}">${estado}</span>
            </td>
            <td class="text-center table-actions" onclick="console.log('TD clicado'); event.stopPropagation();">
                ${!rubrica.parent_id ? `
                <span class="tooltip-container">
                    <button class="btn btn--small btn--success" 
                            onclick="console.log('Botão Adicionar Sub clicado, id:', ${rubrica.id}); handleAdicionarSubrubrica(${rubrica.id}, event)"
                            aria-label="Adicionar subrubrica para ${escapeHtml(rubrica.designacao)}">
                        <i class='bx bx-plus'></i>
                    </button>
                    <span class="tooltip tooltip--top">Adicionar subrubrica<br/>Criar uma subrubrica filha desta rubrica</span>
                </span>
                ` : ''}
                <span class="tooltip-container">
                    <button class="btn btn--small btn--primary" 
                            onclick="console.log('Botão Editar clicado, id:', ${rubrica.id}); handleEditarRubrica(${rubrica.id}, event)"
                            aria-label="Editar ${escapeHtml(rubrica.designacao)}">
                        <i class='bx bx-edit'></i>
                    </button>
                    <span class="tooltip tooltip--top">Editar rubrica<br/>Modificar designação, dotação inicial (se folha) e status</span>
                </span>
                <span class="tooltip-container">
                    <button class="btn btn--small btn--danger" 
                            onclick="console.log('Botão Desativar clicado, id:', ${rubrica.id}); handleDesativarRubrica(${rubrica.id}, event)"
                            aria-label="Desativar ${escapeHtml(rubrica.designacao)}">
                        <i class='bx bx-trash'></i>
                    </button>
                    <span class="tooltip tooltip--top">Desativar rubrica<br/>Desativa a rubrica (soft delete). A dotação será recalculada</span>
                </span>
            </td>
        </tr>
    `;
}

function toggleRubrica(rubricaId, event) {
    if (event) {
        event.stopPropagation();
    }
    
    if (expandedRubricas.has(rubricaId)) {
        expandedRubricas.delete(rubricaId);
    } else {
        expandedRubricas.add(rubricaId);
    }
    
    renderTable();
}

// ============================================================================
// Busca
// ============================================================================

function handleSearch(query) {
    const searchTerm = query.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredRubricas = rubricas;
        renderTable();
        return;
    }
    
    filteredRubricas = rubricas.filter(rubrica => {
        const codigo = (rubrica.codigo || '').toLowerCase();
        const designacao = (rubrica.designacao || '').toLowerCase();
        
        return codigo.includes(searchTerm) || designacao.includes(searchTerm);
    });
    
    renderTable();
}

// ============================================================================
// Modal
// ============================================================================

function abrirModalNovo() {
    const form = document.getElementById('rubricaForm');
    form.reset();
    form.dataset.submitting = 'false'; // Resetar flag de processamento
    document.getElementById('rubricaId').value = '';
    document.getElementById('modalTitle').textContent = 'Nova Rubrica';
    document.getElementById('exercicioForm').value = currentExercicio;
    document.getElementById('nivel').value = 1; // Nível será calculado automaticamente no backend
    document.getElementById('codigo').value = ''; // Limpar código
    document.getElementById('designacao').value = ''; // Limpar designação
    
    // Nova rubrica não tem pai (é raiz)
    // Ocultar campo de dotação inicial (apenas para subrubricas)
    const dotacaoInicialGroup = document.getElementById('rubricaDotacaoInicialGroup');
    if (dotacaoInicialGroup) dotacaoInicialGroup.style.display = 'none';
    
    // Atualizar tooltip do botão Salvar
    const salvarTooltip = document.getElementById('salvarTooltip');
    if (salvarTooltip) {
        salvarTooltip.innerHTML = 'Salvar rubrica<br/>Criar uma nova rubrica no sistema';
    }
    
    openModal('rubricaModal');
}

async function abrirModalEditar(id) {
    console.log('abrirModalEditar executando', { id, rubricasLength: rubricas.length });
    try {
        const rubrica = rubricas.find(r => r.id === id);
        console.log('Rubrica encontrada:', rubrica);
        if (!rubrica) {
            showError('Rubrica não encontrada');
            return;
        }
        
        // Buscar rubrica completa da API
        const response = await fetchWithAuth(`${API_BASE}/api/v1/rubricas/${id}`);
        
        if (!response.ok) {
            throw new Error('Erro ao buscar rubrica');
        }
        
        const rubricaFull = await response.json();
        
        // Preencher formulário
        document.getElementById('rubricaId').value = rubricaFull.id;
        document.getElementById('codigo').value = rubricaFull.codigo;
        document.getElementById('designacao').value = rubricaFull.designacao;
        document.getElementById('tipo').value = rubricaFull.tipo;
        document.getElementById('exercicioForm').value = rubricaFull.exercicio;
        document.getElementById('nivel').value = rubricaFull.nivel || 1;
        
        // Se for subrubrica (parent_id não é null), mostrar e preencher dotacao_inicial
        const dotacaoInicialGroup = document.getElementById('rubricaDotacaoInicialGroup');
        const dotacaoInicialInput = document.getElementById('rubricaDotacaoInicial');
        if (rubricaFull.parent_id !== null) {
            // É subrubrica: mostrar campo de dotação inicial
            if (dotacaoInicialGroup) dotacaoInicialGroup.style.display = 'block';
            if (dotacaoInicialInput) {
                const dotacaoInicial = rubricaFull.dotacao_inicial || 0;
                // Formatar o valor para exibição
                if (typeof formatMoneyInput !== 'undefined') {
                    dotacaoInicialInput.value = formatMoneyInput(dotacaoInicial);
                } else {
                    dotacaoInicialInput.value = dotacaoInicial;
                }
            }
        } else {
            // É rubrica pai: ocultar campo de dotação inicial
            if (dotacaoInicialGroup) dotacaoInicialGroup.style.display = 'none';
            if (dotacaoInicialInput) dotacaoInicialInput.value = '0.00';
        }
        
        document.getElementById('modalTitle').textContent = 'Editar Rubrica';
        
        // Atualizar tooltip do botão Salvar
        const salvarTooltip = document.getElementById('salvarTooltip');
        if (salvarTooltip) {
            salvarTooltip.innerHTML = 'Salvar alterações<br/>Atualizar a rubrica com as modificações';
        }
        
        console.log('Chamando openModal para rubricaModal');
        openModal('rubricaModal');
        console.log('openModal chamado, verificando se modal existe');
        const modal = document.getElementById('rubricaModal');
        console.log('Modal encontrado:', modal);
        if (modal) {
            console.log('Modal display:', window.getComputedStyle(modal).display);
            console.log('Modal visibility:', window.getComputedStyle(modal).visibility);
        }
        
    } catch (error) {
        console.error('Erro ao carregar rubrica:', error);
        showError('Erro ao carregar rubrica: ' + error.message);
    }
}


// ============================================================================
// Submissão do Formulário
// ============================================================================

async function handleSubmit(event) {
    event.preventDefault();
    event.stopPropagation(); // Prevenir propagação do evento
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const cancelBtn = form.querySelector('button[type="button"]');
    
    // Prevenir duplo submit: verificar se já está processando
    if (form.dataset.submitting === 'true') {
        console.warn('Formulário já está sendo processado, ignorando submit duplicado');
        return;
    }
    
    // Marcar como processando
    form.dataset.submitting = 'true';
    
    // Desabilitar botões durante submit
    if (submitBtn) submitBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (submitBtn) submitBtn.textContent = 'Salvando...';
    
    try {
        const id = document.getElementById('rubricaId').value;
        const codigo = document.getElementById('codigo').value.trim();
        const designacao = document.getElementById('designacao').value.trim();
        const tipo = document.getElementById('tipo').value;
               const exercicio = parseInt(document.getElementById('exercicioForm').value);
               const parent_id = null; // Nova rubrica sempre é raiz (sem pai)
               // Nível será calculado automaticamente no backend (será 1 para rubricas raiz)
        
        // Rubricas não têm dotação própria - dotação está em execucao_mensal
        // Não enviar dotacao ao criar/editar rubricas
        
        let response;
        
        if (id) {
            // Atualizar
            // Buscar rubrica completa da API para garantir que temos os dados atualizados
            const rubricaResponse = await fetchWithAuth(`${API_BASE}/api/v1/rubricas/${id}`);
            if (!rubricaResponse.ok) {
                throw new Error('Erro ao buscar dados da rubrica');
            }
            const rubricaFull = await rubricaResponse.json();
            
            const updateData = {
                designacao: designacao,
                status: 'ativa'
            };
            
            // Se for subrubrica (parent_id não é null), permitir atualizar dotacao_inicial
            if (rubricaFull && rubricaFull.parent_id !== null) {
                const dotacaoInicialInput = document.getElementById('rubricaDotacaoInicial');
                if (dotacaoInicialInput) {
                    // Remover formatação antes de converter para número
                    const unformatted = typeof unformatMoneyInput !== 'undefined' 
                        ? unformatMoneyInput(dotacaoInicialInput.value)
                        : dotacaoInicialInput.value.replace(/[^\d.]/g, '');
                    const dotacaoInicial = parseFloat(unformatted) || 0;
                    if (dotacaoInicial < 0) {
                        throw new Error('Dotação inicial deve ser maior ou igual a zero.');
                    }
                    updateData.dotacao_inicial = dotacaoInicial;
                }
            }
            
            console.log('Enviando dados de atualização:', updateData); // Debug
            
            response = await fetchWithAuth(`${API_BASE}/api/v1/rubricas/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
        } else {
            // Criar - validar campos obrigatórios
            if (!codigo) {
                throw new Error('Código é obrigatório.');
            }
            if (!designacao) {
                throw new Error('Designação é obrigatória.');
            }
            if (!tipo) {
                throw new Error('Tipo é obrigatório.');
            }
            if (!exercicio || isNaN(exercicio)) {
                throw new Error('Exercício é obrigatório.');
            }
            
                   // Preparar dados para envio
                   // Nível será calculado automaticamente no backend baseado no parent_id
                   // Rubricas não têm dotação própria - dotação está em execucao_mensal
                   const formData = {
                       codigo: codigo,
                       designacao: designacao,
                       tipo: tipo,  // "despesa" ou "receita" - Pydantic converte para enum
                       exercicio: exercicio,
                       status: 'ativa'  // Pydantic converte para enum
                   };
            
            // Adicionar parent_id apenas se não for null
            if (parent_id !== null) {
                formData.parent_id = parent_id;
            }
            
            console.log('Enviando dados:', formData); // Debug
            
            response = await fetchWithAuth(`${API_BASE}/api/v1/rubricas`, {
                method: 'POST',
                body: JSON.stringify(formData)
            });
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Erro ao salvar rubrica' }));
            console.error('Erro da API:', errorData); // Debug
            
            // Tratar diferentes formatos de erro do FastAPI/Pydantic
            let errorMessage = 'Erro ao salvar rubrica';
            
            if (errorData.detail) {
                // Erro simples
                errorMessage = errorData.detail;
                
                // Se for erro de rubrica já existente, sugerir editar
                if (errorMessage.includes('já existe') && !id) {
                    errorMessage += '\n\nDica: Esta rubrica já existe. Use o botão "Editar" na tabela para modificá-la.';
                }
            } else if (Array.isArray(errorData)) {
                // Erros de validação do Pydantic
                const errors = errorData.map(e => {
                    const field = e.loc ? e.loc.join('.') : e.field || 'campo';
                    const msg = e.msg || e.message || 'Erro de validação';
                    return `${field}: ${msg}`;
                });
                errorMessage = errors.join('; ');
            } else if (typeof errorData === 'object') {
                // Outro formato de erro
                errorMessage = JSON.stringify(errorData);
            }
            
            throw new Error(errorMessage);
        }
        
        // Sucesso
        const rubricaSalva = await response.json();
        closeModal('rubricaModal');
        showSuccess(id ? 'Rubrica atualizada com sucesso!' : 'Rubrica criada com sucesso!');
        
        // Recarregar lista
        await carregarRubricas();
        
        // Se criou nova rubrica e não tem parent_id, mostrar CTA para criar subrubricas
        if (!id && !parent_id) {
            // Encontrar a rubrica recém-criada na lista
            const novaRubrica = rubricas.find(r => r.codigo === codigo && r.exercicio === exercicio);
            if (novaRubrica) {
                // Mostrar mensagem com CTA
                setTimeout(() => {
                    showInfo(`Rubrica criada! Deseja adicionar subrubricas? Clique em "+ Sub" na linha da rubrica "${designacao}".`, 8000);
                }, 500);
            }
        }
        
        // Se criou subrubrica, expandir o pai automaticamente
        if (!id && parent_id) {
            expandedRubricas.add(parent_id);
            renderTable();
        }
        
    } catch (error) {
        console.error('Erro ao salvar rubrica:', error);
        // showError está definido em common.js
        showError(error.message || 'Erro ao salvar rubrica');
    } finally {
        // Reabilitar botões e remover flag de processamento
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
// Exclusão/Desativação
// ============================================================================

async function desativarRubrica(id) {
    console.log('desativarRubrica executando', { id, rubricasLength: rubricas.length });
    const rubrica = rubricas.find(r => r.id === id);
    console.log('Rubrica encontrada para desativar:', rubrica);
    if (!rubrica) {
        showError('Rubrica não encontrada');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja desativar a rubrica "${rubrica.designacao}"?\n\nEsta ação não pode ser desfeita.`)) {
        return;
    }
    
    try {
        const response = await fetchWithAuth(`${API_BASE}/api/v1/rubricas/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao desativar rubrica' }));
            throw new Error(error.detail || 'Erro ao desativar rubrica');
        }
        
        showSuccess('Rubrica desativada com sucesso!');
        
        // Remover da lista de expandidas se estava expandida
        expandedRubricas.delete(id);
        
        // Recarregar lista
        await carregarRubricas();
        
    } catch (error) {
        console.error('Erro ao desativar rubrica:', error);
        showError(error.message || 'Erro ao desativar rubrica');
    }
}

// ============================================================================
// Utilitários
// ============================================================================

function showLoading(show) {
    const tbody = document.getElementById('rubricasBody');
    if (show) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Carregando rubricas...</td></tr>';
    }
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Modal de Subrubrica
// ============================================================================

function abrirModalSubrubrica(parentId) {
    console.log('abrirModalSubrubrica executando', { parentId, rubricasLength: rubricas.length });
    const parentRubrica = rubricas.find(r => r.id === parentId);
    console.log('Parent rubrica encontrada:', parentRubrica);
    if (!parentRubrica) {
        showError('Rubrica pai não encontrada');
        return;
    }
    
    // Armazenar parentId globalmente para uso no modal de lote
    window.currentBatchParentId = parentId;
    
    // Limpar formulário primeiro
    const form = document.getElementById('subrubricaForm');
    form.reset();
    form.dataset.submitting = 'false'; // Resetar flag de processamento
    
    // Preencher informações do pai (após reset)
    document.getElementById('subrubricaParentId').value = parentId;
    document.getElementById('subrubricaExercicio').value = parentRubrica.exercicio;
    // Nível será calculado automaticamente no backend baseado no parent_id
    document.getElementById('subrubricaParentInfo').value = `${parentRubrica.codigo} - ${parentRubrica.designacao}`;
    
    // Limpar campos editáveis
    document.getElementById('subrubricaCodigo').value = '';
    document.getElementById('subrubricaDesignacao').value = '';
    document.getElementById('subrubricaTipo').value = parentRubrica.tipo?.value || parentRubrica.tipo || 'despesa';
    document.getElementById('subrubricaDotacaoInicial').value = '0.00';
    
    // Mostrar campo de dotação inicial (apenas para subrubricas)
    document.getElementById('subrubricaDotacaoInicialGroup').style.display = 'block';
    
    document.getElementById('subrubricaModalTitle').textContent = `Nova Subrubrica de "${parentRubrica.designacao}"`;
    
    console.log('Chamando openModal para subrubricaModal');
    openModal('subrubricaModal');
    console.log('openModal chamado, verificando se modal existe');
    const modal = document.getElementById('subrubricaModal');
    console.log('Modal encontrado:', modal);
    if (modal) {
        console.log('Modal display:', window.getComputedStyle(modal).display);
        console.log('Modal visibility:', window.getComputedStyle(modal).visibility);
        console.log('Modal classes:', modal.className);
    }
    
    // Rubricas não têm dotação própria - dotação está em execucao_mensal
    
    openModal('subrubricaModal');
}

function abrirModalSubrubricaBatchFromModal() {
    // Fechar modal de subrubrica individual
    closeModal('subrubricaModal');
    
    // Usar o parentId armazenado
    const parentId = window.currentBatchParentId;
    if (!parentId) {
        showError('Rubrica pai não encontrada');
        return;
    }
    
    // Abrir modal de lote
    abrirModalSubrubricaBatch(parentId);
}

async function handleSubmitSubrubrica(event) {
    event.preventDefault();
    event.stopPropagation(); // Prevenir propagação do evento
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const cancelBtn = form.querySelector('button[type="button"]');
    
    // Prevenir duplo submit: verificar se já está processando
    if (form.dataset.submitting === 'true') {
        console.warn('Formulário já está sendo processado, ignorando submit duplicado');
        return;
    }
    
    // Marcar como processando
    form.dataset.submitting = 'true';
    
    // Desabilitar botões durante submit
    if (submitBtn) submitBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (submitBtn) submitBtn.textContent = 'Salvando...';
    
    try {
        const parentId = parseInt(document.getElementById('subrubricaParentId').value);
        const exercicio = parseInt(document.getElementById('subrubricaExercicio').value);
        // Nível será calculado automaticamente no backend baseado no parent_id
        const codigo = document.getElementById('subrubricaCodigo').value.trim();
        const designacao = document.getElementById('subrubricaDesignacao').value.trim();
        const tipo = document.getElementById('subrubricaTipo').value;
        
        // Validações
        if (!codigo) {
            throw new Error('Código é obrigatório.');
        }
        if (!designacao) {
            throw new Error('Designação é obrigatória.');
        }
        if (!tipo) {
            throw new Error('Tipo é obrigatório.');
        }
        if (!parentId) {
            throw new Error('Rubrica pai não especificada.');
        }
        
        // Preparar dados
        // Nível será calculado automaticamente no backend baseado no parent_id
        const dotacaoInicialInput = document.getElementById('subrubricaDotacaoInicial');
        // Remover formatação antes de converter para número
        const unformatted = typeof unformatMoneyInput !== 'undefined' 
            ? unformatMoneyInput(dotacaoInicialInput.value)
            : dotacaoInicialInput.value.replace(/[^\d.]/g, '');
        const dotacaoInicial = parseFloat(unformatted) || 0;
        if (dotacaoInicial < 0) {
            throw new Error('Dotação inicial deve ser maior ou igual a zero.');
        }
        const formData = {
            codigo: codigo,
            designacao: designacao,
            tipo: tipo,
            exercicio: exercicio,
            parent_id: parentId,
            dotacao_inicial: dotacaoInicial,
            status: 'ativa'
        };
        
        console.log('Enviando subrubrica:', formData);
        
        const response = await fetchWithAuth(`${API_BASE}/api/v1/rubricas`, {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Erro ao salvar subrubrica' }));
            console.error('Erro da API:', errorData);
            
            let errorMessage = 'Erro ao salvar subrubrica';
            if (errorData.detail) {
                errorMessage = errorData.detail;
            } else if (Array.isArray(errorData)) {
                const errors = errorData.map(e => {
                    const field = e.loc ? e.loc.join('.') : e.field || 'campo';
                    const msg = e.msg || e.message || 'Erro de validação';
                    return `${field}: ${msg}`;
                });
                errorMessage = errors.join('; ');
            }
            
            throw new Error(errorMessage);
        }
        
        // Sucesso
        const subrubricaSalva = await response.json();
        closeModal('subrubricaModal');
        showSuccess('Subrubrica criada com sucesso! A dotação da rubrica pai foi recalculada automaticamente.');
        
        // Recarregar lista para ver a nova subrubrica e o recálculo do pai
        await carregarRubricas();
        
        // Expandir automaticamente o pai para mostrar a nova subrubrica
        // parentId já foi declarado no início da função, apenas reutilizar
        if (parentId) {
            expandedRubricas.add(parentId);
            renderTable(); // Re-renderizar para mostrar a expansão
        }
        
    } catch (error) {
        console.error('Erro ao salvar subrubrica:', error);
        showError(error.message || 'Erro ao salvar subrubrica');
    } finally {
        // Reabilitar botões e remover flag de processamento
        if (form) {
            form.dataset.submitting = 'false';
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Salvar Subrubrica';
        }
        if (cancelBtn) cancelBtn.disabled = false;
    }
}

// ============================================================================
// Modal de Criação em Lote (CSV)
// ============================================================================

function abrirModalSubrubricaBatch(parentId) {
    const parentRubrica = rubricas.find(r => r.id === parentId);
    if (!parentRubrica) {
        showError('Rubrica pai não encontrada');
        return;
    }
    
    // Limpar formulário
    const form = document.getElementById('subrubricaBatchForm');
    form.reset();
    form.dataset.submitting = 'false';
    
    // Preencher informações do pai
    document.getElementById('batchParentId').value = parentId;
    document.getElementById('batchExercicio').value = parentRubrica.exercicio;
    document.getElementById('batchParentInfo').value = `${parentRubrica.codigo} - ${parentRubrica.designacao}`;
    document.getElementById('batchTipo').value = parentRubrica.tipo?.value || parentRubrica.tipo || 'despesa';
    document.getElementById('batchCsv').value = '';
    document.getElementById('batchRawText').value = '';
    
    // Ocultar preview e relatório
    document.getElementById('batchPreview').style.display = 'none';
    document.getElementById('batchReport').style.display = 'none';
    
    document.getElementById('subrubricaBatchModalTitle').textContent = `Criar Subrubricas em Lote - "${parentRubrica.designacao}"`;
    
    openModal('subrubricaBatchModal');
}

function organizarTextoBatch() {
    const rawText = document.getElementById('batchRawText').value.trim();
    const csvTextarea = document.getElementById('batchCsv');
    
    if (!rawText) {
        showWarning('Por favor, cole o texto bruto primeiro.');
        return;
    }
    
    try {
        // Dividir em linhas
        const lines = rawText.split('\n').filter(line => line.trim());
        const csvLines = [];
        const erros = [];
        
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            
            // Tentar diferentes separadores: tabulação, múltiplos espaços, ou vírgula
            let parts = [];
            
            // Primeiro, tentar tabulação
            if (trimmed.includes('\t')) {
                parts = trimmed.split('\t').map(p => p.trim()).filter(p => p);
            } 
            // Se não tiver tabulação, tentar múltiplos espaços (2 ou mais)
            else if (trimmed.match(/\s{2,}/)) {
                parts = trimmed.split(/\s{2,}/).map(p => p.trim()).filter(p => p);
            }
            // Se já estiver em formato CSV (vírgula), verificar se precisa reorganizar
            else if (trimmed.includes(',')) {
                parts = trimmed.split(',').map(p => p.trim()).filter(p => p);
                // Se já está no formato correto (código,designação,dotacao), verificar
                // Se a primeira parte parece um código (tem / e números), já está correto
                if (parts.length >= 2 && /^[\d\/H\.\-]+$/.test(parts[0])) {
                    // Já está no formato correto: codigo,designacao,dotacao
                    csvLines.push(trimmed);
                    return;
                }
            }
            // Último recurso: dividir por qualquer espaço
            else {
                // Tentar encontrar onde começa o código (geralmente tem formato 47/H000/...)
                const codeMatch = trimmed.match(/([\d\/H\.\-]+)/);
                if (codeMatch) {
                    const codeIndex = trimmed.indexOf(codeMatch[1]);
                    const designacao = trimmed.substring(0, codeIndex).trim();
                    const codigo = codeMatch[1];
                    const rest = trimmed.substring(codeIndex + codeMatch[1].length).trim();
                    
                    if (designacao && codigo) {
                        parts = [designacao, codigo];
                        if (rest) {
                            // Verificar se o resto é um número (dotação)
                            const restClean = rest.replace(/\./g, '').replace(/,/g, '');
                            if (/^[\d]+$/.test(restClean)) {
                                parts.push(rest);
                            }
                        }
                    } else {
                        parts = [trimmed];
                    }
                } else {
                    parts = [trimmed];
                }
            }
            
            // Formato esperado do texto bruto: designacao, codigo, dotacao (opcional)
            // Formato CSV necessário: codigo, designacao, dotacao
            
            if (parts.length >= 2) {
                let designacao = '';
                let codigo = '';
                let dotacao = '0';
                
                // Identificar qual parte é código (geralmente tem formato 47/H000/...)
                const codePattern = /^[\d\/H\.\-]+$/;
                
                // Procurar a parte que é código
                let codeIndex = -1;
                for (let i = 0; i < parts.length; i++) {
                    if (codePattern.test(parts[i])) {
                        codeIndex = i;
                        codigo = parts[i];
                        break;
                    }
                }
                
                if (codeIndex === -1) {
                    // Não encontrou código, tentar heurística: segunda coluna geralmente é código
                    if (parts.length >= 2) {
                        codigo = parts[1];
                        designacao = parts[0];
                        if (parts.length > 2) {
                            // Verificar se última parte é número
                            const lastPart = parts[parts.length - 1];
                            const isDotacao = /^[\d,\.]+$/.test(lastPart.replace(/\./g, '').replace(/,/g, ''));
                            if (isDotacao) {
                                dotacao = lastPart;
                            }
                        }
                    } else {
                        erros.push(`Linha ${index + 1}: Não foi possível identificar o código.`);
                        return;
                    }
                } else {
                    // Código encontrado, designação é tudo antes dele
                    designacao = parts.slice(0, codeIndex).join(' ').trim();
                    
                    // Se há partes após o código, verificar se a última é dotação
                    if (parts.length > codeIndex + 1) {
                        const lastPart = parts[parts.length - 1];
                        const isDotacao = /^[\d,\.]+$/.test(lastPart.replace(/\./g, '').replace(/,/g, ''));
                        if (isDotacao) {
                            dotacao = lastPart;
                        } else {
                            // Se não for número, juntar ao código ou designação
                            designacao = parts.slice(0, codeIndex).concat(parts.slice(codeIndex + 1)).join(' ').trim();
                        }
                    }
                }
                
                // Validar que temos código e designação
                if (!codigo || !designacao) {
                    erros.push(`Linha ${index + 1}: Faltam código ou designação.`);
                    return;
                }
                
                // Formato CSV: codigo,designacao (dotacao removida - rubricas não têm dotação própria)
                csvLines.push(`${codigo},${designacao}`);
                
            } else if (parts.length === 1) {
                erros.push(`Linha ${index + 1}: Não foi possível identificar código e designação.`);
            }
        });
        
        if (csvLines.length === 0) {
            showError('Não foi possível organizar nenhuma linha. Verifique o formato do texto.');
            if (erros.length > 0) {
                console.warn('Erros encontrados:', erros);
            }
            return;
        }
        
        // Preencher o campo CSV
        csvTextarea.value = csvLines.join('\n');
        
        // Mostrar mensagem com avisos se houver erros
        let mensagem = `${csvLines.length} linha(s) organizada(s) com sucesso!`;
        if (erros.length > 0) {
            mensagem += ` ${erros.length} linha(s) com erro(s) foram puladas.`;
            console.warn('Linhas com erro:', erros);
        }
        mensagem += ' Clique em "Validar CSV" para verificar.';
        
        showSuccess(mensagem);
        
        // Focar no campo CSV
        csvTextarea.focus();
        csvTextarea.scrollTop = 0;
        
    } catch (error) {
        console.error('Erro ao organizar texto:', error);
        showError('Erro ao organizar texto: ' + error.message);
    }
}

function validarBatchCSV() {
    const csvText = document.getElementById('batchCsv').value.trim();
    const previewDiv = document.getElementById('batchPreview');
    const previewContent = document.getElementById('batchPreviewContent');
    
    if (!csvText) {
        previewDiv.style.display = 'none';
        return;
    }
    
    const lines = csvText.split('\n').filter(line => line.trim());
    const items = [];
    const erros = [];
    
    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        
        const parts = trimmed.split(',').map(p => p.trim());
        
        if (parts.length < 2) {
            erros.push({
                linha: index + 1,
                conteudo: trimmed,
                erro: 'Formato inválido. Use: codigo,designacao'
            });
            return;
        }
        
        const codigo = parts[0];
        const designacao = parts[1];
        const dotacao = parts.length > 2 ? parseFloat(parts[2]) || 0 : 0;
        
        if (!codigo) {
            erros.push({
                linha: index + 1,
                conteudo: trimmed,
                erro: 'Código é obrigatório'
            });
            return;
        }
        
        if (!designacao) {
            erros.push({
                linha: index + 1,
                conteudo: trimmed,
                erro: 'Designação é obrigatória'
            });
            return;
        }
        
            // Rubricas não têm dotação própria - dotação está em execucao_mensal
            items.push({ codigo, designacao, linha: index + 1 });
    });
    
    // Renderizar preview
    let html = '';
    
    if (items.length > 0) {
        html += `<p class="text-success"><strong>${items.length} rubrica(s) válida(s):</strong></p>`;
        html += '<table class="batch-preview-table">';
        html += '<thead><tr><th>Linha</th><th>Código</th><th>Designação</th></tr></thead>';
        html += '<tbody>';
        items.forEach(item => {
            html += `<tr>
                <td>${item.linha}</td>
                <td><code>${escapeHtml(item.codigo)}</code></td>
                <td>${escapeHtml(item.designacao)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
    }
    
    if (erros.length > 0) {
        html += `<p class="text-danger" style="margin-top: 15px;"><strong>${erros.length} erro(s) encontrado(s):</strong></p>`;
        html += '<table class="batch-preview-table">';
        html += '<thead><tr><th>Linha</th><th>Conteúdo</th><th>Erro</th></tr></thead>';
        html += '<tbody>';
        erros.forEach(erro => {
            html += `<tr class="batch-error">
                <td>${erro.linha}</td>
                <td><code>${escapeHtml(erro.conteudo)}</code></td>
                <td>${escapeHtml(erro.erro)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
    }
    
    previewContent.innerHTML = html;
    previewDiv.style.display = 'block';
}

async function handleSubmitBatch(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Prevenir duplo submit
    if (form.dataset.submitting === 'true') {
        console.warn('Formulário já está sendo processado');
        return;
    }
    
    form.dataset.submitting = 'true';
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Criando...';
    }
    
    try {
        const parentId = parseInt(document.getElementById('batchParentId').value);
        const exercicio = parseInt(document.getElementById('batchExercicio').value);
        const tipo = document.getElementById('batchTipo').value;
        const csvText = document.getElementById('batchCsv').value.trim();
        
        if (!tipo) {
            throw new Error('Tipo é obrigatório');
        }
        
        if (!csvText) {
            throw new Error('Dados CSV são obrigatórios');
        }
        
        // Parse CSV
        const lines = csvText.split('\n').filter(line => line.trim());
        const items = [];
        
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            
            const parts = trimmed.split(',').map(p => p.trim());
            if (parts.length < 2) return;
            
            const codigo = parts[0];
            const designacao = parts[1];
            // Rubricas não têm dotação própria - dotação está em execucao_mensal
            // Ignorar terceira coluna se existir (compatibilidade com CSV antigo)
            
            if (codigo && designacao) {
                // Rubricas não têm dotação própria - dotação está em execucao_mensal
                items.push({
                    codigo: codigo,
                    designacao: designacao
                });
            }
        });
        
        if (items.length === 0) {
            throw new Error('Nenhuma rubrica válida encontrada no CSV');
        }
        
        // Preparar dados
        const batchData = {
            parent_id: parentId,
            exercicio: exercicio,
            tipo: tipo,
            items: items
        };
        
        console.log('Enviando lote:', batchData);
        
        const response = await fetchWithAuth(`${API_BASE}/api/v1/rubricas/batch`, {
            method: 'POST',
            body: JSON.stringify(batchData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Erro ao criar rubricas em lote' }));
            throw new Error(errorData.detail || 'Erro ao criar rubricas em lote');
        }
        
        const result = await response.json();
        
        if (result.erros > 0) {
            // Se houver erros, mostrar relatório mas manter modal aberto
            mostrarRelatorioBatch(result);
            showWarning(`${result.erros} erro(s) durante a criação. Veja o relatório abaixo.`);
        } else {
            // Se tudo foi criado com sucesso, fechar modal automaticamente
            closeModal('subrubricaBatchModal');
        }
        
        // Se houve sucessos, recarregar lista e expandir pai
        if (result.criadas > 0) {
            expandedRubricas.add(parentId);
            await carregarRubricas();
            showSuccess(`${result.criadas} subrubrica(s) criada(s) com sucesso!`);
        }
        
    } catch (error) {
        console.error('Erro ao criar rubricas em lote:', error);
        showError(error.message || 'Erro ao criar rubricas em lote');
    } finally {
        if (form) {
            form.dataset.submitting = 'false';
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Criar em Lote';
        }
    }
}

function mostrarRelatorioBatch(result) {
    const reportDiv = document.getElementById('batchReport');
    const reportContent = document.getElementById('batchReportContent');
    
    let html = `<div style="margin-bottom: 15px;">
        <strong>Total processado:</strong> ${result.criadas + result.erros} | 
        <span style="color: #28a745;"><strong>Sucessos:</strong> ${result.criadas}</span> | 
        <span style="color: #dc3545;"><strong>Erros:</strong> ${result.erros}</span>
    </div>`;
    
    result.detalhes.forEach(detalhe => {
        if (detalhe.status === 'sucesso') {
            html += `<div class="batch-report-item batch-report-item--success">
                <strong>✓ ${escapeHtml(detalhe.codigo)} - ${escapeHtml(detalhe.designacao)}</strong>
                <span>Criada com sucesso (ID: ${detalhe.id})</span>
            </div>`;
        } else {
            html += `<div class="batch-report-item batch-report-item--error">
                <strong>✗ ${escapeHtml(detalhe.codigo)} - ${escapeHtml(detalhe.designacao || 'N/A')}</strong>
                <span>${escapeHtml(detalhe.mensagem || 'Erro desconhecido')}</span>
            </div>`;
        }
    });
    
    reportContent.innerHTML = html;
    reportDiv.style.display = 'block';
    
    // Scroll para o relatório
    reportDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Funções wrapper para garantir que eventos sejam tratados corretamente
function handleEditarRubrica(id, event) {
    console.log('handleEditarRubrica chamado', { id, event });
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    console.log('Chamando abrirModalEditar com id:', id);
    abrirModalEditar(id);
}

function handleDesativarRubrica(id, event) {
    console.log('handleDesativarRubrica chamado', { id, event });
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    console.log('Chamando desativarRubrica com id:', id);
    desativarRubrica(id);
}

function handleAdicionarSubrubrica(id, event) {
    console.log('handleAdicionarSubrubrica chamado', { id, event });
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    console.log('Chamando abrirModalSubrubrica com id:', id);
    abrirModalSubrubrica(id);
}

// Exportar funções globais (garantir que estejam disponíveis)
// Estas funções são usadas em onclick inline na tabela
if (typeof window !== 'undefined') {
    window.abrirModalNovo = abrirModalNovo;
    window.abrirModalEditar = abrirModalEditar;
    window.desativarRubrica = desativarRubrica;
    window.abrirModalSubrubrica = abrirModalSubrubrica;
    window.abrirModalSubrubricaBatch = abrirModalSubrubricaBatch;
    window.abrirModalSubrubricaBatchFromModal = abrirModalSubrubricaBatchFromModal;
    window.organizarTextoBatch = organizarTextoBatch;
    window.validarBatchCSV = validarBatchCSV;
    window.handleSubmit = handleSubmit;
    window.handleSubmitSubrubrica = handleSubmitSubrubrica;
    window.toggleRubrica = toggleRubrica;
    // Exportar funções wrapper
    window.handleEditarRubrica = handleEditarRubrica;
    window.handleDesativarRubrica = handleDesativarRubrica;
    window.handleAdicionarSubrubrica = handleAdicionarSubrubrica;
}
