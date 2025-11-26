// layout.js - Componente de layout reutilizável (Sidebar + Navbar)

function getSidebarHTML(activePage = 'dashboard') {
    const pages = [
        { id: 'dashboard', name: 'Dashboard', icon: 'bxs-dashboard', href: 'dashboard.html' },
        { id: 'despesas', name: 'Despesas', icon: 'money', href: 'despesas.html' },
        { id: 'rubricas', name: 'Rubricas', icon: 'analyse', href: 'rubricas.html' },
        { id: 'dotacao', name: 'Dotação', icon: 'wallet', href: 'setup_dotacao.html' },
        { id: 'movimentos', name: 'Movimentos', icon: 'transfer', href: 'dotacao_mov.html' },
        { id: 'tabela-mensal', name: 'Tabela Mensal', icon: 'table', href: 'tabela-mensal.html' },
        { id: 'funcionarios', name: 'Funcionários', icon: 'group', href: 'funcionarios.html' },
        { id: 'fornecedores', name: 'Fornecedores', icon: 'store-alt', href: 'fornecedores.html' }
    ];

    const menuItems = pages.map(page => {
        const activeClass = page.id === activePage ? 'active' : '';
        return `
            <li class="${activeClass}">
                <a href="${page.href}">
                    <i class='bx bx-${page.icon}'></i>${page.name}
                </a>
            </li>
        `;
    }).join('');

    return `
        <div class="sidebar">
            <a href="dashboard.html" class="logo">
                <i class='bx bx-code-alt'></i>
                <div class="logo-name"><span>Sistema</span> Contabil</div>
            </a>
            <ul class="side-menu">
                ${menuItems}
            </ul>
            <ul class="side-menu">
                <li>
                    <a href="#" class="logout" onclick="logout(); return false;">
                        <i class='bx bx-log-out-circle'></i>
                        Sair
                    </a>
                </li>
            </ul>
        </div>
    `;
}

function getNavbarHTML() {
    // Obter nome do usuário do token
    let userName = 'Usuário';
    try {
        const token = localStorage.getItem('token');
        
        if (token) {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                
                // Usar o nome do token (agora o token inclui 'nome')
                if (payload.nome) {
                    userName = payload.nome;
                } else if (payload.name) {
                    userName = payload.name;
                } else if (payload.sub) {
                    // Se não tiver nome no token, usar username formatado
                    userName = payload.sub.charAt(0).toUpperCase() + payload.sub.slice(1);
                }
                
                console.log('getNavbarHTML - Nome encontrado:', userName, 'do payload:', payload);
            }
        }
    } catch (e) {
        console.warn('Erro ao decodificar token:', e);
    }
    
    return `
        <nav>
            <i class='bx bx-menu'></i>
            <form action="#" id="searchForm">
                <div class="form-input">
                    <input type="search" id="searchInput" placeholder="Buscar...">
                    <button class="search-btn" type="submit"><i class='bx bx-search'></i></button>
                </div>
            </form>
            <input type="checkbox" id="theme-toggle" hidden>
            <label for="theme-toggle" class="theme-toggle"></label>
            <a href="#" class="notif" id="notifBtn">
                <i class='bx bx-bell'></i>
                <span class="count" id="notifCount" style="display: none;">0</span>
            </a>
            <a href="#" class="profile" id="profileBtn" title="${userName}">
                <span class="profile-name">${userName}</span>
            </a>
        </nav>
    `;
}

function initLayout(activePage = 'dashboard') {
    // Inserir sidebar antes do body
    const sidebarHTML = getSidebarHTML(activePage);
    document.body.insertAdjacentHTML('afterbegin', sidebarHTML);

    // Criar estrutura de content se não existir
    let content = document.querySelector('.content');
    if (!content) {
        const oldContainer = document.querySelector('.container');
        if (oldContainer) {
            content = document.createElement('div');
            content.className = 'content';
            oldContainer.parentNode.insertBefore(content, oldContainer);
            content.appendChild(oldContainer);
            oldContainer.classList.remove('container');
            oldContainer.classList.add('page-content');
        } else {
            content = document.createElement('div');
            content.className = 'content';
            document.body.appendChild(content);
        }
    }

    // Inserir navbar no início do content
    const navbarHTML = getNavbarHTML();
    content.insertAdjacentHTML('afterbegin', navbarHTML);

    // Inicializar funcionalidades do layout
    initSidebar();
    initNavbar();
    initThemeToggle();
    
    // Carregar nome completo do usuário se disponível
    loadUserProfile();
}

function initSidebar() {
    const sideLinks = document.querySelectorAll('.sidebar .side-menu li a:not(.logout)');
    const menuBar = document.querySelector('.content nav .bx.bx-menu');
    const sideBar = document.querySelector('.sidebar');

    sideLinks.forEach(item => {
        const li = item.parentElement;
        item.addEventListener('click', () => {
            sideLinks.forEach(i => {
                i.parentElement.classList.remove('active');
            });
            li.classList.add('active');
        });
    });

    if (menuBar && sideBar) {
        menuBar.addEventListener('click', () => {
            sideBar.classList.toggle('close');
        });
    }

    // Responsividade
    window.addEventListener('resize', () => {
        if (window.innerWidth < 768) {
            if (sideBar) sideBar.classList.add('close');
        } else {
            if (sideBar) sideBar.classList.remove('close');
        }
    });
}

function initNavbar() {
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
}

function initThemeToggle() {
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
}

async function loadUserProfile() {
    // Atualizar nome do usuário no perfil
    try {
        const token = localStorage.getItem('token');
        
        if (!token) {
            console.warn('loadUserProfile: Token não encontrado');
            return;
        }
        
        // Decodificar token para obter dados
        const parts = token.split('.');
        if (parts.length !== 3) {
            console.warn('loadUserProfile: Token inválido');
            return;
        }
        
        const payload = JSON.parse(atob(parts[1]));
        console.log('loadUserProfile - Payload:', payload);
        
        // Usar o nome do token (agora o token inclui 'nome')
        let userName = null;
        if (payload.nome) {
            userName = payload.nome;
        } else if (payload.name) {
            userName = payload.name;
        } else if (payload.sub) {
            // Se não tiver nome no token, usar username formatado
            userName = payload.sub.charAt(0).toUpperCase() + payload.sub.slice(1);
        }
        
        console.log('loadUserProfile - Nome encontrado:', userName);
        
        if (!userName || userName === 'Usuário') {
            console.warn('loadUserProfile: Nome não encontrado ou inválido');
            return;
        }
        
        // Atualizar nome no perfil
        const profileBtn = document.getElementById('profileBtn');
        console.log('loadUserProfile - profileBtn encontrado?', !!profileBtn);
        
        if (profileBtn) {
            let profileName = profileBtn.querySelector('.profile-name');
            console.log('loadUserProfile - profile-name encontrado?', !!profileName);
            
            if (!profileName) {
                // Se não existir, criar o elemento
                profileName = document.createElement('span');
                profileName.className = 'profile-name';
                profileBtn.appendChild(profileName);
                console.log('loadUserProfile - Elemento profile-name criado');
            }
            
            // Usar o nome diretamente (já vem formatado do banco)
            profileName.textContent = userName;
            profileBtn.title = userName;
            console.log('loadUserProfile - Nome atualizado para:', userName);
        } else {
            console.error('loadUserProfile - Elemento profileBtn não encontrado!');
        }
    } catch (error) {
        console.error('Erro ao carregar perfil do usuário:', error);
    }
}

