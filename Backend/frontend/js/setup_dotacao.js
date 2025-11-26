// Setup Dotação - Gerenciamento de Dotação Global
// Verificar se common.js foi carregado
if (typeof fetchWithAuth === 'undefined') {
    console.error('common.js deve ser carregado antes de setup_dotacao.js');
}

// API_BASE já está definido em common.js
let currentExercicio = new Date().getFullYear();

// ============================================================================
// Inicialização
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    // Configurar formatação de inputs monetários
    if (typeof setupMoneyInput !== 'undefined') {
        setupMoneyInput('valorAnual');
        setupMoneyInput('reservaValor');
    }
    
    // Inicializar seletor de exercício
    initExercicioSelector();
    
    // Carregar dados iniciais
    carregarDotacao();
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
        carregarDotacao();
        carregarMovimentos();
    });
}

function setupEventListeners() {
    // Botão Atualizar
    const btnAtualizar = document.getElementById('btnAtualizar');
    if (btnAtualizar) {
        btnAtualizar.addEventListener('click', () => {
            carregarDotacao();
            carregarMovimentos();
        });
    }
    
    // Formulário de Dotação
    const dotacaoForm = document.getElementById('dotacaoForm');
    if (dotacaoForm) {
        dotacaoForm.addEventListener('submit', handleSubmitDotacao);
    }
    
    // Formulário de Reserva
    const reservaForm = document.getElementById('reservaForm');
    if (reservaForm) {
        reservaForm.addEventListener('submit', handleSubmitReserva);
    }
}

// ============================================================================
// Carregamento de Dados
// ============================================================================

async function carregarDotacao() {
    try {
        const response = await fetchWithAuth(
            `${API_BASE}/api/v1/dotacao_global?exercicio=${currentExercicio}`
        );
        
        if (!response.ok) {
            throw new Error('Erro ao carregar dotação');
        }
        
        const data = await response.json();
        
        // Atualizar KPIs
        const kpiValorAnual = document.getElementById('kpiValorAnual');
        const kpiSaldo = document.getElementById('kpiSaldo');
        const kpiReservado = document.getElementById('kpiReservado');
        
        if (kpiValorAnual) {
            kpiValorAnual.textContent = formatMoney(data.valor_anual || 0);
        }
        if (kpiSaldo) {
            kpiSaldo.textContent = formatMoney(data.saldo || 0);
        }
        if (kpiReservado) {
            kpiReservado.textContent = formatMoney(data.reservado || 0);
        }
        
        // Atualizar formulário se existir
        const valorAnualInput = document.getElementById('valorAnual');
        if (valorAnualInput && data.id && data.id > 0) {
            const valor = data.valor_anual || 0;
            if (typeof formatMoneyInput !== 'undefined') {
                valorAnualInput.value = formatMoneyInput(valor);
            } else {
                valorAnualInput.value = valor;
            }
        }
        
    } catch (error) {
        console.error('Erro ao carregar dotação:', error);
        showError('Erro ao carregar dotação: ' + error.message);
    }
}

async function carregarMovimentos() {
    const tbody = document.getElementById('movimentosBody');
    if (!tbody) return;
    
    try {
        const response = await fetchWithAuth(
            `${API_BASE}/api/v1/dotacao_global/movimentos?exercicio=${currentExercicio}&limit=50`
        );
        
        if (!response.ok) {
            throw new Error('Erro ao carregar movimentos');
        }
        
        const movimentos = await response.json();
        
        if (movimentos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="table-empty">
                        <div class="empty-state">
                            <i class='bx bx-history'></i>
                            <p>Nenhum movimento encontrado</p>
                        </div>
                    </td>
                </tr>
            `;
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
            
            html += `
                <tr>
                    <td>${data}</td>
                    <td>${escapeHtml(mov.tipo || '-')}</td>
                    <td class="text-right ${valorClass}"><strong>${valorFormatado}</strong></td>
                    <td>${escapeHtml(mov.descricao || '-')}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
    } catch (error) {
        console.error('Erro ao carregar movimentos:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="table-empty">
                    <div class="empty-state">
                        <i class='bx bx-error'></i>
                        <p>Erro ao carregar movimentos: ${escapeHtml(error.message)}</p>
                    </div>
                </td>
            </tr>
        `;
    }
}

// ============================================================================
// Manipulação de Formulários
// ============================================================================

async function handleSubmitDotacao(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Desabilitar botão durante submit
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Salvando...';
    }
    
    try {
        // Remover formatação antes de converter para número
        const valorAnualInput = document.getElementById('valorAnual');
        const valorUnformatted = typeof unformatMoneyInput !== 'undefined' 
            ? unformatMoneyInput(valorAnualInput.value)
            : valorAnualInput.value.replace(/[^\d.]/g, '');
        const valorAnual = parseFloat(valorUnformatted);
        
        if (isNaN(valorAnual) || valorAnual < 0) {
            throw new Error('Valor anual deve ser um número válido maior ou igual a zero');
        }
        
        const response = await fetchWithAuth(`${API_BASE}/api/v1/dotacao_global`, {
            method: 'POST',
            body: JSON.stringify({
                exercicio: currentExercicio,
                valor_anual: valorAnual
            })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao salvar dotação' }));
            throw new Error(error.detail || 'Erro ao salvar dotação');
        }
        
        const data = await response.json();
        showSuccess('Dotação salva com sucesso!');
        
        // Recarregar dados
        await carregarDotacao();
        await carregarMovimentos();
        
    } catch (error) {
        console.error('Erro ao salvar dotação:', error);
        showError(error.message || 'Erro ao salvar dotação');
    } finally {
        // Reabilitar botão
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class=\'bx bx-save\'></i> Salvar Dotação';
        }
    }
}

async function handleSubmitReserva(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Desabilitar botão durante submit
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Criando...';
    }
    
    try {
        // Remover formatação antes de converter para número
        const reservaValorInput = document.getElementById('reservaValor');
        const valorUnformatted = typeof unformatMoneyInput !== 'undefined' 
            ? unformatMoneyInput(reservaValorInput.value)
            : reservaValorInput.value.replace(/[^\d.]/g, '');
        const valor = parseFloat(valorUnformatted);
        const descricao = document.getElementById('reservaDescricao').value.trim() || null;
        
        if (isNaN(valor) || valor <= 0) {
            throw new Error('Valor a reservar deve ser um número válido maior que zero');
        }
        
        const response = await fetchWithAuth(`${API_BASE}/api/v1/dotacao_global/reserva`, {
            method: 'POST',
            body: JSON.stringify({
                exercicio: currentExercicio,
                valor: valor,
                descricao: descricao
            })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao criar reserva' }));
            throw new Error(error.detail || 'Erro ao criar reserva');
        }
        
        const data = await response.json();
        showSuccess('Reserva criada com sucesso!');
        
        // Limpar formulário
        reservaValorInput.value = '';
        document.getElementById('reservaDescricao').value = '';
        
        // Recarregar dados
        await carregarDotacao();
        await carregarMovimentos();
        
    } catch (error) {
        console.error('Erro ao criar reserva:', error);
        showError(error.message || 'Erro ao criar reserva');
    } finally {
        // Reabilitar botão
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class=\'bx bx-plus\'></i> Criar Reserva';
        }
    }
}

// ============================================================================
// Utilitários
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

