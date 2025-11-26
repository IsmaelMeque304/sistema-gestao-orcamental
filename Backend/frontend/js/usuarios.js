// JavaScript para página de Usuários

let usuarios = [];
let isEditMode = false;

// Verifica autenticação e se é admin
document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;
    
    // Verifica se é admin
    const admin = await isAdmin();
    if (!admin) {
        showError('Acesso negado. Apenas administradores podem gerenciar usuários.');
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);
        return;
    }
    
    loadUsuarios();
});

async function loadUsuarios() {
    try {
        hideMessages();
        document.getElementById('loading').style.display = 'block';
        document.getElementById('usuariosTable').style.display = 'none';
        
        const response = await handleApiRequest(`${API_BASE}/api/v1/usuarios?limit=1000`);
        
        if (!response.ok) {
            throw new Error('Erro ao carregar usuários');
        }
        
        usuarios = await response.json();
        renderTable(usuarios);
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('usuariosTable').style.display = 'table';
        
    } catch (error) {
        document.getElementById('loading').style.display = 'none';
        showError('Erro ao carregar usuários: ' + error.message);
    }
}

function renderTable(data) {
    const tbody = document.getElementById('usuariosTableBody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <div class="empty-state-text">Nenhum usuário encontrado</div>
                </td>
            </tr>
        `;
        return;
    }
    
    data.forEach(usuario => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${usuario.id}</td>
            <td>${usuario.username}</td>
            <td>${usuario.nome}</td>
            <td>${usuario.email || '-'}</td>
            <td>${usuario.contacto || '-'}</td>
            <td>
                <span class="badge ${usuario.activo ? 'badge-success' : 'badge-danger'}">
                    ${usuario.activo ? 'Ativo' : 'Inativo'}
                </span>
            </td>
            <td>${formatDate(usuario.criado_em)}</td>
            <td class="actions">
                <button class="btn btn-primary btn-small" onclick="editUsuario(${usuario.id})">Editar</button>
                <button class="btn btn-danger btn-small" onclick="deleteUsuario(${usuario.id})">Desativar</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterTable() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    
    let filtered = usuarios.filter(u => {
        const matchSearch = !search || 
            u.nome.toLowerCase().includes(search) ||
            u.username.toLowerCase().includes(search) ||
            (u.email && u.email.toLowerCase().includes(search));
        
        const matchStatus = !statusFilter || 
            (statusFilter === 'true' && u.activo) ||
            (statusFilter === 'false' && !u.activo);
        
        return matchSearch && matchStatus;
    });
    
    renderTable(filtered);
}

function openCreateModal() {
    isEditMode = false;
    document.getElementById('modalTitle').textContent = 'Novo Usuário';
    document.getElementById('usuarioForm').reset();
    document.getElementById('usuarioId').value = '';
    document.getElementById('senhaGroup').style.display = 'block';
    document.getElementById('senha').required = true;
    document.getElementById('activo').checked = true;
    openModal('usuarioModal');
}

function editUsuario(id) {
    const usuario = usuarios.find(u => u.id === id);
    if (!usuario) return;
    
    isEditMode = true;
    document.getElementById('modalTitle').textContent = 'Editar Usuário';
    document.getElementById('usuarioId').value = usuario.id;
    document.getElementById('username').value = usuario.username;
    document.getElementById('nome').value = usuario.nome;
    document.getElementById('email').value = usuario.email || '';
    document.getElementById('contacto').value = usuario.contacto || '';
    document.getElementById('nuit').value = usuario.nuit || '';
    document.getElementById('endereco').value = usuario.endereco || '';
    document.getElementById('activo').checked = usuario.activo;
    
    // Senha não é obrigatória na edição
    document.getElementById('senhaGroup').style.display = 'none';
    document.getElementById('senha').required = false;
    
    openModal('usuarioModal');
}

async function saveUsuario(event) {
    event.preventDefault();
    
    try {
        hideMessages();
        
        const formData = {
            username: document.getElementById('username').value,
            nome: document.getElementById('nome').value,
            email: document.getElementById('email').value || null,
            contacto: document.getElementById('contacto').value || null,
            nuit: document.getElementById('nuit').value || null,
            endereco: document.getElementById('endereco').value || null,
            activo: document.getElementById('activo').checked
        };
        
        const id = document.getElementById('usuarioId').value;
        let response;
        
        if (id) {
            // Atualizar
            response = await handleApiRequest(
                `${API_BASE}/api/v1/usuarios/${id}`,
                {
                    method: 'PUT',
                    body: JSON.stringify(formData)
                }
            );
        } else {
            // Criar
            const senha = document.getElementById('senha').value;
            if (!senha || senha.length < 8) {
                showError('Senha deve ter no mínimo 8 caracteres');
                return;
            }
            
            formData.senha = senha;
            response = await handleApiRequest(
                `${API_BASE}/api/v1/usuarios`,
                {
                    method: 'POST',
                    body: JSON.stringify(formData)
                }
            );
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erro ao salvar usuário');
        }
        
        closeModal('usuarioModal');
        showSuccess(id ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!');
        loadUsuarios();
        
    } catch (error) {
        showError('Erro ao salvar usuário: ' + error.message);
    }
}

async function deleteUsuario(id) {
    if (!confirm('Tem certeza que deseja desativar este usuário?')) {
        return;
    }
    
    try {
        hideMessages();
        
        const response = await handleApiRequest(
            `${API_BASE}/api/v1/usuarios/${id}`,
            { method: 'DELETE' }
        );
        
        if (!response.ok) {
            throw new Error('Erro ao desativar usuário');
        }
        
        showSuccess('Usuário desativado com sucesso!');
        loadUsuarios();
        
    } catch (error) {
        showError('Erro ao desativar usuário: ' + error.message);
    }
}

