// Fornecedores.js - Gerenciamento de Fornecedores
// Funcionalidades: CRUD completo, busca, validações

// Verificar se common.js foi carregado
if (typeof fetchWithAuth === 'undefined') {
    console.error('common.js deve ser carregado antes de fornecedores.js');
}

let fornecedores = [];
let filteredFornecedores = [];

// ============================================================================
// Inicialização
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    // Carregar fornecedores
    carregarFornecedores();
    
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
    
    // Botão Novo Fornecedor
    const btnNovo = document.getElementById('btnNovoFornecedor');
    if (btnNovo) {
        btnNovo.addEventListener('click', () => abrirModalNovo());
    }
    
    // Botão Atualizar
    const btnAtualizar = document.getElementById('btnAtualizar');
    if (btnAtualizar) {
        btnAtualizar.addEventListener('click', () => {
            carregarFornecedores();
        });
    }
    
    // Formulário
    const form = document.getElementById('fornecedorForm');
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

async function carregarFornecedores() {
    try {
        showLoading(true);
        
        const response = await fetchWithAuth(`${API_BASE}/api/v1/fornecedores`);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao carregar fornecedores' }));
            throw new Error(error.detail || 'Erro ao carregar fornecedores');
        }
        
        const data = await response.json();
        fornecedores = Array.isArray(data) ? data : [];
        filteredFornecedores = fornecedores;
        
        renderTable();
        
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
        showError(error.message || 'Erro ao carregar fornecedores');
        document.getElementById('fornecedoresBody').innerHTML = 
            '<tr><td colspan="7" class="table-empty table-error">Erro ao carregar fornecedores. Tente novamente.</td></tr>';
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// Renderização da Tabela
// ============================================================================

function renderTable() {
    const tbody = document.getElementById('fornecedoresBody');
    if (!tbody) return;
    
    if (filteredFornecedores.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="table-empty">
                    <div class="empty-state">
                        <i class='bx bx-store-alt'></i>
                        <p>Nenhum fornecedor encontrado</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filteredFornecedores.map(fornecedor => {
        const estado = fornecedor.activo === true || fornecedor.activo === 'true' ? 'Ativo' : 'Inativo';
        const estadoClass = estado === 'Ativo' ? 'badge badge-success' : 'badge badge-danger';
        const tipoLabel = fornecedor.tipo === 'pessoa_singular' ? 'Pessoa Singular' : 
                         fornecedor.tipo === 'pessoa_coletiva' ? 'Pessoa Coletiva' : 
                         fornecedor.tipo || '-';
        
        // NIF vem do fornecedor (FornecedorResponse inclui nif)
        const nif = fornecedor.nif || '-';
        
        // Verificar se tem usuário vinculado (indicador de usuário existente)
        const temUsuarioVinculado = fornecedor.usuario_id && fornecedor.usuario_id > 0;
        const tooltipUsuario = temUsuarioVinculado ? `
            <span class="tooltip-container">
                <span class="tooltip-icon" title="Usuário Existente">ℹ</span>
                <span class="tooltip tooltip--top">Usuário Existente</span>
            </span>
        ` : '';
        
        return `
            <tr>
                <td>
                    ${escapeHtml(fornecedor.nome || 'N/A')}
                    ${tooltipUsuario}
                </td>
                <td>${escapeHtml(tipoLabel)}</td>
                <td>${escapeHtml(nif)}</td>
                <td>${escapeHtml(fornecedor.contacto || '-')}</td>
                <td>${escapeHtml(fornecedor.codigo_interno || '-')}</td>
                <td>
                    <span class="${estadoClass}">${estado}</span>
                </td>
                <td class="text-center table-actions">
                    ${fornecedor.activo ? `
                    <span class="tooltip-container">
                        <button class="btn btn--small btn--primary" 
                                onclick="abrirModalEditar(${fornecedor.id}); event.stopPropagation();"
                                aria-label="Editar ${escapeHtml(fornecedor.nome)}">
                            <i class='bx bx-edit'></i>
                        </button>
                        <span class="tooltip tooltip--top">Editar fornecedor<br/>Modificar informações do fornecedor</span>
                    </span>
                    <span class="tooltip-container">
                        <button class="btn btn--small btn--danger" 
                                onclick="desativarFornecedor(${fornecedor.id}); event.stopPropagation();"
                                aria-label="Desativar ${escapeHtml(fornecedor.nome)}">
                            <i class='bx bx-x-circle'></i>
                        </button>
                        <span class="tooltip tooltip--top">Desativar fornecedor<br/>Desativa o fornecedor (soft delete)</span>
                    </span>
                    <span class="tooltip-container">
                        <button class="btn btn--small" 
                                onclick="eliminarFornecedor(${fornecedor.id}); event.stopPropagation();"
                                aria-label="Eliminar ${escapeHtml(fornecedor.nome)}"
                                style="background: #dc2626; color: white;">
                            <i class='bx bx-trash'></i>
                        </button>
                        <span class="tooltip tooltip--top">Eliminar permanentemente<br/>Remove o fornecedor do sistema (irreversível)</span>
                    </span>
                    ` : `
                    <span class="tooltip-container">
                        <button class="btn btn--small btn--success" 
                                onclick="ativarFornecedor(${fornecedor.id}); event.stopPropagation();"
                                aria-label="Reativar ${escapeHtml(fornecedor.nome)}">
                            <i class='bx bx-check-circle'></i>
                        </button>
                        <span class="tooltip tooltip--top">Reativar fornecedor<br/>Reativa o fornecedor no sistema</span>
                    </span>
                    <span class="tooltip-container">
                        <button class="btn btn--small" 
                                onclick="eliminarFornecedor(${fornecedor.id}); event.stopPropagation();"
                                aria-label="Eliminar ${escapeHtml(fornecedor.nome)}"
                                style="background: #dc2626; color: white;">
                            <i class='bx bx-trash'></i>
                        </button>
                        <span class="tooltip tooltip--top">Eliminar permanentemente<br/>Remove o fornecedor do sistema (irreversível)</span>
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
        filteredFornecedores = fornecedores;
        renderTable();
        return;
    }
    
    filteredFornecedores = fornecedores.filter(forn => {
        const nome = (forn.nome || '').toLowerCase();
        const tipo = (forn.tipo || '').toLowerCase();
        const nif = (forn.nif || '').toLowerCase();
        const codigo = (forn.codigo_interno || '').toLowerCase();
        
        return nome.includes(searchTerm) || 
               tipo.includes(searchTerm) || 
               nif.includes(searchTerm) || 
               codigo.includes(searchTerm);
    });
    
    renderTable();
}

// ============================================================================
// Modal
// ============================================================================

function abrirModalNovo() {
    document.getElementById('fornecedorForm').reset();
    document.getElementById('fornecedorId').value = '';
    document.getElementById('modalTitle').textContent = 'Novo Fornecedor';
    
    // Atualizar tooltip do botão Salvar
    const salvarTooltip = document.getElementById('salvarTooltip');
    if (salvarTooltip) {
        salvarTooltip.innerHTML = 'Salvar fornecedor<br/>Criar um novo fornecedor no sistema';
    }
    
    // Limpar erro do modal
    const modalError = document.getElementById('modalError');
    if (modalError) {
        modalError.textContent = '';
        modalError.style.display = 'none';
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
    
    openModal('fornecedorModal');
}

async function abrirModalEditar(id) {
    try {
        // Limpar erro do modal
        const modalError = document.getElementById('modalError');
        if (modalError) {
            modalError.textContent = '';
            modalError.style.display = 'none';
        }
        
        const fornecedor = fornecedores.find(f => f.id === id);
        if (!fornecedor) {
            showError('Fornecedor não encontrado');
            return;
        }
        
        // Buscar fornecedor completo da API
        const response = await fetchWithAuth(`${API_BASE}/api/v1/fornecedores/${id}`);
        
        if (!response.ok) {
            throw new Error('Erro ao buscar fornecedor');
        }
        
        const fornecedorFull = await response.json();
        
        // Preencher formulário
        document.getElementById('fornecedorId').value = fornecedorFull.id;
        document.getElementById('nome').value = fornecedorFull.nome || '';
        document.getElementById('tipo').value = fornecedorFull.tipo || '';
        // NIF vem do fornecedor (FornecedorResponse inclui nif)
        document.getElementById('nif').value = fornecedorFull.nif || '';
        document.getElementById('contacto').value = fornecedorFull.contacto || '';
        document.getElementById('codigo_interno').value = fornecedorFull.codigo_interno || '';
        document.getElementById('endereco').value = fornecedorFull.endereco || '';
        
        // Email - buscar do usuário se existir
        const emailField = document.getElementById('email');
        if (emailField) {
            // Se o fornecedor tem usuário vinculado, buscar email do usuário
            if (fornecedorFull.usuario_id) {
                // Tentar buscar email do usuário (pode não estar na resposta)
                emailField.value = fornecedorFull.email || '';
            } else {
                emailField.value = '';
            }
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
        document.getElementById('modalTitle').textContent = 'Editar Fornecedor';
        
        // Atualizar tooltip do botão Salvar
        const salvarTooltip = document.getElementById('salvarTooltip');
        if (salvarTooltip) {
            salvarTooltip.innerHTML = 'Salvar alterações<br/>Atualizar o fornecedor com as modificações';
        }
        
        openModal('fornecedorModal');
        
    } catch (error) {
        console.error('Erro ao carregar fornecedor:', error);
        showError('Erro ao carregar fornecedor: ' + error.message);
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
        const id = document.getElementById('fornecedorId').value;
        const nome = document.getElementById('nome').value.trim();
        const tipo = document.getElementById('tipo').value;
        const nif = document.getElementById('nif').value.trim() || null;
        const contacto = document.getElementById('contacto').value.trim() || null;
        const codigo_interno = document.getElementById('codigo_interno').value.trim() || null;
        const endereco = document.getElementById('endereco').value.trim() || null;
        const email = document.getElementById('email').value.trim() || null;
        
        const formData = {
            nome: nome,
            tipo: tipo,
            nif: nif,
            contacto: contacto,
            codigo_interno: codigo_interno,
            endereco: endereco,
            email: email,
            usuario_id: null  // Backend sempre cria/vinculará usuário automaticamente
        };
        
        let response;
        
        if (id) {
            // Atualizar
            const updateData = {
                nome: formData.nome,
                tipo: formData.tipo,
                nif: formData.nif,
                contacto: formData.contacto,
                codigo_interno: formData.codigo_interno,
                endereco: formData.endereco
            };
            
            response = await fetchWithAuth(`${API_BASE}/api/v1/fornecedores/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
        } else {
            // Criar
            response = await fetchWithAuth(`${API_BASE}/api/v1/fornecedores`, {
                method: 'POST',
                body: JSON.stringify(formData)
            });
        }
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao salvar fornecedor' }));
            const errorMessage = error.detail || error.message || 'Erro ao salvar fornecedor';
            
            // Exibir erro no modal se estiver aberto
            const modalError = document.getElementById('modalError');
            const modal = document.getElementById('fornecedorModal');
            if (modalError && modal && modal.classList.contains('modal--show')) {
                modalError.textContent = errorMessage;
                modalError.style.display = 'block';
                // Scroll para o topo do modal para garantir que o erro seja visível
                modal.querySelector('.modal__content').scrollTop = 0;
            } else {
                // Se o modal não estiver aberto, usar toast
                showError(errorMessage);
            }
            
            throw new Error(errorMessage);
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
                   if (usuarioInfo.nuit) infoTexto += `NIF: ${usuarioInfo.nuit}\n`;
                   
                   showSuccess(mensagem);
                   // Mostrar modal com informações do usuário existente
                   showUserLinkedModal(usuarioInfo, mensagem);
               }
        
        // Sucesso
        closeModal('fornecedorModal');
        showSuccess(id ? 'Fornecedor atualizado com sucesso!' : 'Fornecedor criado com sucesso!');
        
        // Recarregar lista
        await carregarFornecedores();
        
    } catch (error) {
        console.error('Erro ao salvar fornecedor:', error);
        // A mensagem de erro já foi exibida no bloco anterior (no modal ou toast)
        // Não precisa exibir novamente aqui para evitar duplicação
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

async function desativarFornecedor(id) {
    const fornecedor = fornecedores.find(f => f.id === id);
    if (!fornecedor) {
        showError('Fornecedor não encontrado');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja desativar o fornecedor "${fornecedor.nome}"?`)) {
        return;
    }
    
    try {
        // Usar PUT para atualizar o status
        const response = await fetchWithAuth(`${API_BASE}/api/v1/fornecedores/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ activo: false })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao desativar fornecedor' }));
            throw new Error(error.detail || 'Erro ao desativar fornecedor');
        }
        
        showSuccess('Fornecedor desativado com sucesso!');
        
        // Recarregar lista
        await carregarFornecedores();
        
    } catch (error) {
        console.error('Erro ao desativar fornecedor:', error);
        showError(error.message || 'Erro ao desativar fornecedor');
    }
}

async function eliminarFornecedor(id) {
    const fornecedor = fornecedores.find(f => f.id === id);
    if (!fornecedor) {
        showError('Fornecedor não encontrado');
        return;
    }
    
    if (!confirm(`⚠️ ATENÇÃO: Tem certeza que deseja ELIMINAR permanentemente o fornecedor "${fornecedor.nome}"?\n\nEsta ação:\n- Removerá o fornecedor permanentemente\n- Removerá o usuário associado (se existir)\n- NÃO PODE SER DESFEITA\n\nDigite "ELIMINAR" para confirmar:`)) {
        return;
    }
    
    const confirmacao = prompt('Digite "ELIMINAR" para confirmar a remoção permanente:');
    if (confirmacao !== 'ELIMINAR') {
        showError('Confirmação incorreta. Operação cancelada.');
        return;
    }
    
    try {
        const response = await fetchWithAuth(`${API_BASE}/api/v1/fornecedores/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao eliminar fornecedor' }));
            throw new Error(error.detail || 'Erro ao eliminar fornecedor');
        }
        
        showSuccess('Fornecedor eliminado permanentemente!');
        
        // Recarregar lista
        await carregarFornecedores();
        
    } catch (error) {
        console.error('Erro ao eliminar fornecedor:', error);
        showError(error.message || 'Erro ao eliminar fornecedor');
    }
}

async function ativarFornecedor(id) {
    const fornecedor = fornecedores.find(f => f.id === id);
    if (!fornecedor) {
        showError('Fornecedor não encontrado');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja reativar o fornecedor "${fornecedor.nome}"?`)) {
        return;
    }
    
    try {
        const response = await fetchWithAuth(`${API_BASE}/api/v1/fornecedores/${id}/ativar`, {
            method: 'PATCH'
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Erro ao reativar fornecedor' }));
            throw new Error(error.detail || 'Erro ao reativar fornecedor');
        }
        
        showSuccess('Fornecedor reativado com sucesso!');
        
        // Recarregar lista
        await carregarFornecedores();
        
    } catch (error) {
        console.error('Erro ao reativar fornecedor:', error);
        showError(error.message || 'Erro ao reativar fornecedor');
    }
}

// ============================================================================
// Utilitários
// ============================================================================

function showLoading(show) {
    const tbody = document.getElementById('fornecedoresBody');
    if (show) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Carregando fornecedores...</td></tr>';
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
                        <strong>ℹ️ Informação:</strong> Um usuário existente foi vinculado a este fornecedor.
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
                        <label class="form-label">NIF:</label>
                        <div class="form-control" style="background: #f8f9fa;" id="linkedNIF">-</div>
                    </div>
                    <div class="form-group">
                        <small class="form-help" style="color: #059669; margin-top: 8px; display: block;">
                            ✓ Este usuário já existe no sistema e foi vinculado ao fornecedor.
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
    document.getElementById('linkedNIF').textContent = usuarioInfo.nuit || '-';
    
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
window.desativarFornecedor = desativarFornecedor;
window.eliminarFornecedor = eliminarFornecedor;
window.ativarFornecedor = ativarFornecedor;
window.copyToClipboard = copyToClipboard;
