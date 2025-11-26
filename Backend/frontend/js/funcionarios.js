// Funcionarios.js - Gerenciamento de Funcionários
// Funcionalidades: CRUD completo, busca, validações

// Verificar se common.js foi carregado
if (typeof fetchWithAuth === 'undefined') {
    console.error('common.js deve ser carregado antes de funcionarios.js');
}

let funcionarios = [];
let filteredFuncionarios = [];

// ============================================================================
// Inicialização
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    // Carregar funcionários
    carregarFuncionarios();
    
    // Event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Busca
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const debouncedSearch = debounce(handleSearch, 300);
        searchInput.addEventListener('input', (e) => {
            debouncedSearch(e.target.value);
        });
    }
    
    // Botão Novo Funcionário
    const btnNovo = document.getElementById('btnNovoFuncionario');
    if (btnNovo) {
        btnNovo.addEventListener('click', () => abrirModalNovo());
    }
    
    // Botão Atualizar
    const btnAtualizar = document.getElementById('btnAtualizar');
    if (btnAtualizar) {
        btnAtualizar.addEventListener('click', () => {
            carregarFuncionarios();
        });
    }
    
    // Formulário
    const form = document.getElementById('funcionarioForm');
    if (form) {
        form.addEventListener('submit', handleSubmit);
    }
    
    // Checkbox sempre marcado e desabilitado (usuário sempre criado automaticamente)
    const criarUsuarioCheckbox = document.getElementById('criarUsuario');
    if (criarUsuarioCheckbox) {
        criarUsuarioCheckbox.checked = true;
        criarUsuarioCheckbox.disabled = true;
    }
}

// ============================================================================
// Carregamento de Dados
// ============================================================================

async function carregarFuncionarios() {
    try {
        showLoading(true);
        
        const response = await fetchWithAuth(`${API_BASE}/api/v1/funcionarios`);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao carregar funcionários' }));
            throw new Error(error.detail || 'Erro ao carregar funcionários');
        }
        
        funcionarios = await response.json();
        filteredFuncionarios = funcionarios;
        
        renderTable();
        
    } catch (error) {
        console.error('Erro ao carregar funcionários:', error);
        showError(error.message || 'Erro ao carregar funcionários');
        document.getElementById('funcionariosBody').innerHTML = 
            '<tr><td colspan="5" class="table-empty table-error">Erro ao carregar funcionários. Tente novamente.</td></tr>';
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// Renderização da Tabela
// ============================================================================

function renderTable() {
    const tbody = document.getElementById('funcionariosBody');
    if (!tbody) return;
    
    if (filteredFuncionarios.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="table-empty">
                    <div class="empty-state">
                        <i class='bx bx-group'></i>
                        <p>Nenhum funcionário encontrado</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filteredFuncionarios.map(funcionario => {
        const estado = funcionario.activo === true || funcionario.activo === 'true' ? 'Ativo' : 'Inativo';
        const estadoClass = estado === 'Ativo' ? 'badge badge-success' : 'badge badge-danger';
        
        // Verificar se tem usuário vinculado (indicador de usuário existente)
        const temUsuarioVinculado = funcionario.usuario_id && funcionario.usuario_id > 0;
        const tooltipUsuario = temUsuarioVinculado ? `
            <span class="tooltip-container">
                <span class="tooltip-icon" title="Usuário Existente">ℹ</span>
                <span class="tooltip tooltip--top">Usuário Existente</span>
            </span>
        ` : '';
        
        return `
            <tr>
                <td>
                    ${escapeHtml(funcionario.nome || 'N/A')}
                    ${tooltipUsuario}
                </td>
                <td>${escapeHtml(funcionario.categoria || funcionario.cargo || '-')}</td>
                <td>${escapeHtml(funcionario.departamento || '-')}</td>
                <td>
                    <span class="${estadoClass}">${estado}</span>
                </td>
                <td class="text-center table-actions">
                    ${funcionario.activo ? `
                    <span class="tooltip-container">
                        <button class="btn btn--small btn--primary" 
                                onclick="abrirModalEditar(${funcionario.id}); event.stopPropagation();"
                                aria-label="Editar ${escapeHtml(funcionario.nome)}">
                            <i class='bx bx-edit'></i>
                        </button>
                        <span class="tooltip tooltip--top">Editar funcionário<br/>Modificar informações do funcionário</span>
                    </span>
                    <span class="tooltip-container">
                        <button class="btn btn--small btn--danger" 
                                onclick="desativarFuncionario(${funcionario.id}); event.stopPropagation();"
                                aria-label="Desativar ${escapeHtml(funcionario.nome)}">
                            <i class='bx bx-x-circle'></i>
                        </button>
                        <span class="tooltip tooltip--top">Desativar funcionário<br/>Desativa o funcionário (soft delete)</span>
                    </span>
                    <span class="tooltip-container">
                        <button class="btn btn--small" 
                                onclick="eliminarFuncionario(${funcionario.id}); event.stopPropagation();"
                                aria-label="Eliminar ${escapeHtml(funcionario.nome)}"
                                style="background: #dc2626; color: white;">
                            <i class='bx bx-trash'></i>
                        </button>
                        <span class="tooltip tooltip--top">Eliminar permanentemente<br/>Remove o funcionário do sistema (irreversível)</span>
                    </span>
                    ` : `
                    <span class="tooltip-container">
                        <button class="btn btn--small btn--success" 
                                onclick="ativarFuncionario(${funcionario.id}); event.stopPropagation();"
                                aria-label="Reativar ${escapeHtml(funcionario.nome)}">
                            <i class='bx bx-check-circle'></i>
                        </button>
                        <span class="tooltip tooltip--top">Reativar funcionário<br/>Reativa o funcionário no sistema</span>
                    </span>
                    <span class="tooltip-container">
                        <button class="btn btn--small" 
                                onclick="eliminarFuncionario(${funcionario.id}); event.stopPropagation();"
                                aria-label="Eliminar ${escapeHtml(funcionario.nome)}"
                                style="background: #dc2626; color: white;">
                            <i class='bx bx-trash'></i>
                        </button>
                        <span class="tooltip tooltip--top">Eliminar permanentemente<br/>Remove o funcionário do sistema (irreversível)</span>
                    </span>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================================================
// Busca
// ============================================================================

function handleSearch(query) {
    const searchTerm = query.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredFuncionarios = funcionarios;
        renderTable();
        return;
    }
    
    filteredFuncionarios = funcionarios.filter(func => {
        const nome = (func.nome || '').toLowerCase();
        const categoria = (func.categoria || '').toLowerCase();
        const departamento = (func.departamento || '').toLowerCase();
        
        return nome.includes(searchTerm) || 
               categoria.includes(searchTerm) || 
               departamento.includes(searchTerm);
    });
    
    renderTable();
}

// ============================================================================
// Modal
// ============================================================================

function abrirModalNovo() {
    document.getElementById('funcionarioForm').reset();
    document.getElementById('funcionarioId').value = '';
    document.getElementById('modalTitle').textContent = 'Novo Funcionário';
    
    // Atualizar tooltip do botão Salvar
    const salvarTooltip = document.getElementById('salvarTooltip');
    if (salvarTooltip) {
        salvarTooltip.innerHTML = 'Salvar funcionário<br/>Criar um novo funcionário no sistema';
    }
    
    // Checkbox sempre marcado e desabilitado
    const criarUsuario = document.getElementById('criarUsuario');
    if (criarUsuario) {
        criarUsuario.checked = true;
        criarUsuario.disabled = true;
    }
    
    const emailWarning = document.getElementById('emailWarning');
    if (emailWarning) {
        emailWarning.style.display = 'none';
    }
    
    openModal('funcionarioModal');
}

async function abrirModalEditar(id) {
    try {
        const funcionario = funcionarios.find(f => f.id === id);
        if (!funcionario) {
            showError('Funcionário não encontrado');
            return;
        }
        
        // Buscar funcionário completo da API
        const response = await fetchWithAuth(`${API_BASE}/api/v1/funcionarios/${id}`);
        
        if (!response.ok) {
            throw new Error('Erro ao buscar funcionário');
        }
        
        const funcionarioFull = await response.json();
        
        // Preencher formulário
        document.getElementById('funcionarioId').value = funcionarioFull.id;
        document.getElementById('nome').value = funcionarioFull.nome || '';
        document.getElementById('categoria').value = funcionarioFull.categoria || funcionarioFull.cargo || '';
        document.getElementById('departamento').value = funcionarioFull.departamento || '';
        
        // Email - buscar do usuário se existir
        const emailField = document.getElementById('email');
        if (emailField) {
            // Se o funcionário tem usuário vinculado, buscar email do usuário
            if (funcionarioFull.usuario_id) {
                // Tentar buscar email do usuário (pode não estar na resposta)
                emailField.value = funcionarioFull.email || '';
            } else {
                emailField.value = '';
            }
        }
        
        // Contacto
        const contactoField = document.getElementById('contacto');
        if (contactoField) {
            contactoField.value = funcionarioFull.contacto || '';
        }
        
        // Checkbox sempre marcado e desabilitado (usuário sempre criado automaticamente)
        const criarUsuario = document.getElementById('criarUsuario');
        if (criarUsuario) {
            criarUsuario.checked = true;
            criarUsuario.disabled = true;
        }
        
        const emailWarning = document.getElementById('emailWarning');
        if (emailWarning) {
            emailWarning.style.display = 'none';
        }
        document.getElementById('modalTitle').textContent = 'Editar Funcionário';
        
        // Atualizar tooltip do botão Salvar
        const salvarTooltip = document.getElementById('salvarTooltip');
        if (salvarTooltip) {
            salvarTooltip.innerHTML = 'Salvar alterações<br/>Atualizar o funcionário com as modificações';
        }
        
        openModal('funcionarioModal');
        
    } catch (error) {
        console.error('Erro ao carregar funcionário:', error);
        showError('Erro ao carregar funcionário: ' + error.message);
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
    
    // Desabilitar botões durante submit
    if (submitBtn) submitBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (submitBtn) submitBtn.textContent = 'Salvando...';
    
    try {
        const id = document.getElementById('funcionarioId').value;
        const nome = document.getElementById('nome').value.trim();
        const categoria = document.getElementById('categoria').value.trim() || null;
        const departamento = document.getElementById('departamento').value.trim() || null;
        const email = document.getElementById('email').value.trim() || null;
        const contacto = document.getElementById('contacto').value.trim() || null;
        
        const formData = {
            nome: nome,
            categoria: categoria,
            departamento: departamento,
            email: email,
            contacto: contacto,
            usuario_id: null  // Backend sempre cria/vinculará usuário automaticamente
        };
        let response;
        
        if (id) {
            // Atualizar - FuncionarioUpdate não aceita nome nem usuario_id
            const updateData = {
                departamento: formData.departamento
            };
            if (formData.categoria) {
                updateData.cargo = formData.categoria; // Backend usa 'cargo' no update
            }
            
            response = await fetchWithAuth(`${API_BASE}/api/v1/funcionarios/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
        } else {
            // Criar
            response = await fetchWithAuth(`${API_BASE}/api/v1/funcionarios`, {
                method: 'POST',
                body: JSON.stringify(formData)
            });
        }
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao salvar funcionário' }));
            throw new Error(error.detail || 'Erro ao salvar funcionário');
        }
        
               const responseData = await response.json();
               
               // Processar informações de criação de usuário
               if (responseData.senha_temporaria) {
                   // Usuário foi criado - mostrar modal de credenciais
                   showCredentialsModal(responseData.username, responseData.senha_temporaria);
               } else if (responseData.vinculado || responseData.usuario_existente) {
                   // Usuário foi vinculado - mostrar informações do usuário existente
                   const usuarioInfo = responseData.usuario_info || {};
                   const mensagem = responseData.mensagem_usuario || 'Usuário existente vinculado.';
                   
                   let infoTexto = `Usuário existente vinculado:\n\n`;
                   infoTexto += `Username: ${usuarioInfo.username || responseData.username || 'N/A'}\n`;
                   if (usuarioInfo.nome) infoTexto += `Nome: ${usuarioInfo.nome}\n`;
                   if (usuarioInfo.email) infoTexto += `Email: ${usuarioInfo.email}\n`;
                   if (usuarioInfo.contacto) infoTexto += `Contacto: ${usuarioInfo.contacto}\n`;
                   
                   showSuccess(mensagem);
                   // Mostrar modal com informações do usuário existente
                   showUserLinkedModal(usuarioInfo, mensagem);
               }
        
        // Sucesso
        closeModal('funcionarioModal');
        showSuccess(id ? 'Funcionário atualizado com sucesso!' : 'Funcionário criado com sucesso!');
        
        // Recarregar lista
        await carregarFuncionarios();
        
    } catch (error) {
        console.error('Erro ao salvar funcionário:', error);
        showError(error.message || 'Erro ao salvar funcionário');
    } finally {
        // Reabilitar botões e flag de submit
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

async function desativarFuncionario(id) {
    const funcionario = funcionarios.find(f => f.id === id);
    if (!funcionario) {
        showError('Funcionário não encontrado');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja desativar o funcionário "${funcionario.nome}"?`)) {
        return;
    }
    
    try {
        // Usar PUT para atualizar o status
        const response = await fetchWithAuth(`${API_BASE}/api/v1/funcionarios/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ activo: false })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao desativar funcionário' }));
            throw new Error(error.detail || 'Erro ao desativar funcionário');
        }
        
        showSuccess('Funcionário desativado com sucesso!');
        
        // Recarregar lista
        await carregarFuncionarios();
        
    } catch (error) {
        console.error('Erro ao desativar funcionário:', error);
        showError(error.message || 'Erro ao desativar funcionário');
    }
}

async function eliminarFuncionario(id) {
    const funcionario = funcionarios.find(f => f.id === id);
    if (!funcionario) {
        showError('Funcionário não encontrado');
        return;
    }
    
    if (!confirm(`⚠️ ATENÇÃO: Tem certeza que deseja ELIMINAR permanentemente o funcionário "${funcionario.nome}"?\n\nEsta ação:\n- Removerá o funcionário permanentemente\n- Removerá o usuário associado (se existir)\n- NÃO PODE SER DESFEITA\n\nDigite "ELIMINAR" para confirmar:`)) {
        return;
    }
    
    const confirmacao = prompt('Digite "ELIMINAR" para confirmar a remoção permanente:');
    if (confirmacao !== 'ELIMINAR') {
        showError('Confirmação incorreta. Operação cancelada.');
        return;
    }
    
    try {
        const response = await fetchWithAuth(`${API_BASE}/api/v1/funcionarios/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao eliminar funcionário' }));
            throw new Error(error.detail || 'Erro ao eliminar funcionário');
        }
        
        showSuccess('Funcionário eliminado permanentemente!');
        
        // Recarregar lista
        await carregarFuncionarios();
        
    } catch (error) {
        console.error('Erro ao eliminar funcionário:', error);
        showError(error.message || 'Erro ao eliminar funcionário');
    }
}

async function ativarFuncionario(id) {
    const funcionario = funcionarios.find(f => f.id === id);
    if (!funcionario) {
        showError('Funcionário não encontrado');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja reativar o funcionário "${funcionario.nome}"?`)) {
        return;
    }
    
    try {
        const response = await fetchWithAuth(`${API_BASE}/api/v1/funcionarios/${id}/ativar`, {
            method: 'PATCH'
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao reativar funcionário' }));
            throw new Error(error.detail || 'Erro ao reativar funcionário');
        }
        
        showSuccess('Funcionário reativado com sucesso!');
        
        // Recarregar lista
        await carregarFuncionarios();
        
    } catch (error) {
        console.error('Erro ao reativar funcionário:', error);
        showError(error.message || 'Erro ao reativar funcionário');
    }
}

// ============================================================================
// Utilitários
// ============================================================================

function showLoading(show) {
    const tbody = document.getElementById('funcionariosBody');
    if (show) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Carregando funcionários...</td></tr>';
    }
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Modal de Credenciais
// ============================================================================

function showUserLinkedModal(usuarioInfo, mensagem) {
    let modal = document.getElementById('userLinkedModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'userLinkedModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal__overlay" onclick="closeModal('userLinkedModal')"></div>
            <div class="modal__content">
                <div class="modal__header">
                    <h2>Usuário Existente Vinculado</h2>
                    <button class="modal__close" onclick="closeModal('userLinkedModal')" aria-label="Fechar modal">
                        &times;
                    </button>
                </div>
                <div class="modal__body">
                    <div class="alert alert--info" style="margin-bottom: 20px;">
                        <strong>ℹ️ Informação:</strong> Um usuário existente foi vinculado a este funcionário.
                    </div>
                    <div class="form-group">
                        <label class="form-label">Username:</label>
                        <div class="form-control" style="background: #f8f9fa; font-weight: 600;" id="linkedUsername">-</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Nome:</label>
                        <div class="form-control" style="background: #f8f9fa;" id="linkedNome">-</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email:</label>
                        <div class="form-control" style="background: #f8f9fa;" id="linkedEmail">-</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Contacto:</label>
                        <div class="form-control" style="background: #f8f9fa;" id="linkedContacto">-</div>
                    </div>
                    <div class="form-group">
                        <small class="form-help" style="color: #059669; margin-top: 8px; display: block;">
                            ✓ Este usuário já existe no sistema e foi vinculado ao funcionário.
                        </small>
                    </div>
                </div>
                <div class="modal__footer">
                    <button type="button" class="btn btn--primary" onclick="closeModal('userLinkedModal')">
                        Entendido
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Preencher informações
    document.getElementById('linkedUsername').textContent = usuarioInfo.username || '-';
    document.getElementById('linkedNome').textContent = usuarioInfo.nome || '-';
    document.getElementById('linkedEmail').textContent = usuarioInfo.email || '-';
    document.getElementById('linkedContacto').textContent = usuarioInfo.contacto || '-';
    
    openModal('userLinkedModal');
}

function showCredentialsModal(username, senhaTemporaria) {
    // Criar modal se não existir
    let modal = document.getElementById('credentialsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'credentialsModal';
        modal.className = 'modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-labelledby', 'credentialsModalTitle');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="modal__overlay" onclick="closeModal('credentialsModal')"></div>
            <div class="modal__content">
                <div class="modal__header">
                    <h2 id="credentialsModalTitle">Usuário criado com sucesso</h2>
                    <button class="modal__close" onclick="closeModal('credentialsModal')" aria-label="Fechar modal">
                        &times;
                    </button>
                </div>
                <div class="modal__body">
                    <p>Um usuário foi criado automaticamente. Anote as credenciais abaixo:</p>
                    <div class="form-group">
                        <label class="form-label">Username:</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" 
                                   id="credentialsUsername" 
                                   class="form-control" 
                                   readonly
                                   style="flex: 1;">
                            <button type="button" 
                                    class="btn btn--small btn--secondary" 
                                    onclick="copyToClipboard('credentialsUsername')">
                                Copiar
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Senha Temporária:</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" 
                                   id="credentialsPassword" 
                                   class="form-control" 
                                   readonly
                                   style="flex: 1;">
                            <button type="button" 
                                    class="btn btn--small btn--secondary" 
                                    onclick="copyToClipboard('credentialsPassword')">
                                Copiar
                            </button>
                        </div>
                        <small class="form-help" style="color: #dc3545; margin-top: 8px; display: block;">
                            ⚠️ <strong>Importante:</strong> Esta senha é temporária. O usuário será solicitado a alterá-la no primeiro login.
                        </small>
                    </div>
                </div>
                <div class="modal__footer">
                    <button type="button" 
                            class="btn btn--primary" 
                            onclick="closeModal('credentialsModal')">
                        Entendi
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Preencher dados
    document.getElementById('credentialsUsername').value = username;
    document.getElementById('credentialsPassword').value = senhaTemporaria;
    
    // Mostrar modal
    openModal('credentialsModal');
}

function copyToClipboard(inputId) {
    const input = document.getElementById(inputId);
    input.select();
    input.setSelectionRange(0, 99999); // Para mobile
    
    try {
        document.execCommand('copy');
        showSuccess('Copiado para a área de transferência!');
    } catch (err) {
        console.error('Erro ao copiar:', err);
        showError('Erro ao copiar. Tente selecionar e copiar manualmente.');
    }
}

// Exportar funções globais
window.abrirModalNovo = abrirModalNovo;
window.abrirModalEditar = abrirModalEditar;
window.desativarFuncionario = desativarFuncionario;
window.eliminarFuncionario = eliminarFuncionario;
window.ativarFuncionario = ativarFuncionario;
window.copyToClipboard = copyToClipboard;
