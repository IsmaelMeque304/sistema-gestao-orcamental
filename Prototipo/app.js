/**
 * Sistema Protótipo — Balancete de Execução Financeira
 * JavaScript principal para gerenciar dados do balancete e relação intercalar
 */

class BalanceteManager {
    constructor() {
        this.balanceteData = [];
        this.relationData = {};
        this.filteredData = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.expandedCategories = this.loadExpandedState();
        
        this.initializeApp();
    }

    /**
     * Inicializa a aplicação
     */
    async initializeApp() {
        try {
            await this.loadData();
            this.setupEventListeners();
            this.updateDashboard();
            this.renderBalanceteTable();
        } catch (error) {
            console.error('Erro ao inicializar aplicação:', error);
            this.showError('Erro ao carregar dados iniciais');
        }
    }

    /**
     * Carrega estado de categorias expandidas do localStorage
     */
    loadExpandedState() {
        const saved = localStorage.getItem('expandedCategories');
        if (saved) {
            return new Set(JSON.parse(saved));
        }
        // Por padrão, todas as categorias começam expandidas
        return new Set(['all']);
    }

    /**
     * Salva estado de categorias expandidas no localStorage
     */
    saveExpandedState() {
        localStorage.setItem('expandedCategories', JSON.stringify([...this.expandedCategories]));
    }

    /**
     * Toggle categoria (expandir/recolher) - versão simples
     */
    toggleCategoria(classificacao) {
        if (this.expandedCategories.has(classificacao)) {
            this.expandedCategories.delete(classificacao);
        } else {
            this.expandedCategories.add(classificacao);
        }
        this.saveExpandedState();
        this.renderBalanceteTable();
    }

    /**
     * Toggle categoria com animação visual
     */
    toggleCategoriaComAnimacao(classificacao, row) {
        const isCurrentlyExpanded = this.expandedCategories.has(classificacao) || 
                                   this.expandedCategories.has('all');
        
        // Adicionar classe de animação
        row.classList.add('categoria-toggling');
        
        // Animar ícone de toggle
        const toggleIcon = row.querySelector('.categoria-toggle');
        const folderIcon = row.querySelector('.categoria-icon');
        
        if (toggleIcon) {
            toggleIcon.style.transform = 'rotate(180deg)';
            setTimeout(() => {
                toggleIcon.textContent = isCurrentlyExpanded ? 'chevron_right' : 'expand_more';
                toggleIcon.style.transform = 'rotate(0deg)';
            }, 150);
        }

        // Animar ícone de pasta (aberta/fechada)
        if (folderIcon) {
            folderIcon.style.opacity = '0';
            setTimeout(() => {
                folderIcon.textContent = isCurrentlyExpanded ? 'folder' : 'folder_open';
                folderIcon.style.opacity = '1';
            }, 100);
        }

        // Atualizar estado e re-renderizar após animação
        setTimeout(() => {
            if (this.expandedCategories.has(classificacao)) {
                this.expandedCategories.delete(classificacao);
            } else {
                this.expandedCategories.add(classificacao);
            }
            this.saveExpandedState();
            this.renderBalanceteTable();
            this.updateToggleAllButton();
        }, 200);
    }

    /**
     * Toggle expandir/recolher todas as categorias
     */
    toggleAllCategories() {
        const allExpanded = this.expandedCategories.has('all');
        
        if (allExpanded) {
            // Recolher todas
            this.expandedCategories.clear();
        } else {
            // Expandir todas
            this.expandedCategories.clear();
            this.expandedCategories.add('all');
            
            // Adicionar todas as categorias individualmente também
            this.balanceteData.forEach(categoria => {
                this.expandedCategories.add(categoria.classificacao);
            });
        }
        
        this.saveExpandedState();
        this.renderBalanceteTable();
        this.updateToggleAllButton();
    }

    /**
     * Atualiza o botão de toggle all
     */
    updateToggleAllButton() {
        const btn = document.getElementById('toggleAllBtn');
        if (!btn) return;

        const allExpanded = this.expandedCategories.has('all') || 
                           this.expandedCategories.size === this.balanceteData.length;
        
        const icon = btn.querySelector('.material-icons');
        const textNode = Array.from(btn.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
        
        if (allExpanded) {
            icon.textContent = 'unfold_less';
            if (textNode) {
                textNode.textContent = 'Recolher Todas';
            } else {
                btn.childNodes[1].textContent = 'Recolher Todas';
            }
            btn.title = 'Recolher todas as categorias';
        } else {
            icon.textContent = 'unfold_more';
            if (textNode) {
                textNode.textContent = 'Expandir Todas';
            } else {
                btn.childNodes[1].textContent = 'Expandir Todas';
            }
            btn.title = 'Expandir todas as categorias';
        }
    }

    /**
     * Calcula totais de uma categoria
     */
    calcularTotaisCategoria(categoria) {
        if (!categoria.subcategorias || categoria.subcategorias.length === 0) {
            return {
                dotacao: 0,
                liquidacao_anterior: 0,
                durante_mes: 0,
                gasto_total: 0,
                saldo_livre: 0
            };
        }

        return categoria.subcategorias.reduce((totais, sub) => {
            totais.dotacao += sub.dotacao || 0;
            totais.liquidacao_anterior += sub.liquidacao_anterior || 0;
            totais.durante_mes += sub.durante_mes || 0;
            totais.gasto_total += sub.gasto_total || 0;
            totais.saldo_livre += sub.saldo_livre || 0;
            return totais;
        }, {
            dotacao: 0,
            liquidacao_anterior: 0,
            durante_mes: 0,
            gasto_total: 0,
            saldo_livre: 0
        });
    }

    /**
     * Converte estrutura hierárquica em lista plana (para dashboard e pesquisa)
     */
    getFlatData() {
        const flat = [];
        this.balanceteData.forEach(categoria => {
            if (categoria.subcategorias) {
                categoria.subcategorias.forEach(sub => {
                    flat.push({...sub, categoria: categoria.designacao});
                });
            }
        });
        return flat;
    }

    /**
     * Carrega dados do balancete e relação intercalar
     */
    async loadData() {
        try {
            // Carregar dados do balancete
            const balanceteResponse = await fetch('data/balancete.json');
            if (!balanceteResponse.ok) {
                throw new Error('Arquivo balancete.json não encontrado');
            }
            this.balanceteData = await balanceteResponse.json();

            // Carregar dados da relação intercalar
            const relationResponse = await fetch('data/relation.json');
            if (!relationResponse.ok) {
                throw new Error('Arquivo relation.json não encontrado');
            }
            this.relationData = await relationResponse.json();

            this.filteredData = [...this.balanceteData];
        } catch (error) {
            console.warn('Não foi possível carregar arquivos de dados, usando dados padrão');
            // Fallback para dados padrão hierárquicos
            this.balanceteData = [
                {
                    "tipo": "categoria",
                    "designacao": "DEMAIS DESPESAS COM PESSOAL",
                    "classificacao": "1.1",
                    "subcategorias": [
                        {
                            "designacao": "Ajudas de Custo dentro do País",
                            "classificacao": "47/H000/1.1.2.1.01",
                            "dotacao": 45000000,
                            "liquidacao_anterior": 22000000,
                            "durante_mes": 8500000,
                            "gasto_total": 30500000,
                            "saldo_livre": 14500000
                        }
                    ]
                }
            ];
            this.relationData = {
                "47/H000/1.1.2.1.01": [
                    {
                        "fornecedor": "Sérgio Manuel Gonçalo",
                        "requisicao": "/OF/2024",
                        "justificativo": "Guia nº 77",
                        "ordem_pagamento": "OP202200000196",
                        "valor": 147840
                    }
                ]
            };
            this.filteredData = [...this.balanceteData];
        }
    }

    /**
     * Configura todos os event listeners
     */
    setupEventListeners() {
        // Pesquisa
        document.getElementById('searchInput').addEventListener('input', (e) => this.handleSearch(e.target.value));
        document.getElementById('clearSearchBtn').addEventListener('click', () => this.clearSearch());

        // Exportação e impressão
        document.getElementById('exportBtn').addEventListener('click', () => this.exportToCSV());
        document.getElementById('printBtn').addEventListener('click', () => window.print());

        // Modal
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('relationModal').addEventListener('click', (e) => {
            if (e.target.id === 'relationModal') this.closeModal();
        });

        // Paginação
        document.getElementById('prevPage').addEventListener('click', () => this.previousPage());
        document.getElementById('nextPage').addEventListener('click', () => this.nextPage());

        // Exportação de detalhes
        document.getElementById('exportDetailsBtn').addEventListener('click', () => this.exportDetailsToCSV());

        // Ordenação de colunas
        document.querySelectorAll('[data-sort]').forEach(header => {
            header.addEventListener('click', () => this.sortTable(header.dataset.sort));
        });

        // Toggle expandir/recolher todas as categorias
        document.getElementById('toggleAllBtn').addEventListener('click', () => this.toggleAllCategories());
    }

    /**
     * Manipula a pesquisa em tempo real
     */
    handleSearch(query) {
        const searchResults = document.getElementById('searchResults');
        
        if (!query.trim()) {
            this.filteredData = [...this.balanceteData];
            searchResults.style.display = 'none';
        } else {
            const searchTerm = query.toLowerCase();
            this.filteredData = [];
            
            // Procurar em categorias e subcategorias
            this.balanceteData.forEach(categoria => {
                const matchedSubcategorias = [];
                
                if (categoria.subcategorias) {
                    categoria.subcategorias.forEach(sub => {
                        if (sub.designacao.toLowerCase().includes(searchTerm) ||
                            sub.classificacao.toLowerCase().includes(searchTerm)) {
                            matchedSubcategorias.push(sub);
                        }
                    });
                }
                
                // Se a categoria tem matches ou seu nome corresponde à pesquisa
                if (matchedSubcategorias.length > 0 || 
                    categoria.designacao.toLowerCase().includes(searchTerm) ||
                    categoria.classificacao.toLowerCase().includes(searchTerm)) {
                    
                    this.filteredData.push({
                        ...categoria,
                        subcategorias: matchedSubcategorias.length > 0 ? 
                            matchedSubcategorias : categoria.subcategorias
                    });
                    
                    // Expandir categoria automaticamente durante pesquisa
                    if (!this.expandedCategories.has(categoria.classificacao)) {
                        this.expandedCategories.add(categoria.classificacao);
                    }
                }
            });
            
            const totalMatches = this.filteredData.reduce((total, cat) => 
                total + (cat.subcategorias ? cat.subcategorias.length : 0), 0);
            
            if (totalMatches === 0) {
                searchResults.textContent = 'Nenhum resultado encontrado.';
                searchResults.style.display = 'block';
            } else {
                searchResults.textContent = `${totalMatches} resultado(s) encontrado(s).`;
                searchResults.style.display = 'block';
            }
        }
        
        this.currentPage = 1;
        this.renderBalanceteTable();
    }

    /**
     * Limpa a pesquisa
     */
    clearSearch() {
        document.getElementById('searchInput').value = '';
        this.handleSearch('');
    }

    /**
     * Ordena a tabela por coluna
     */
    sortTable(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        this.filteredData.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];

            // Converter para número se for valor monetário
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            }

            // Ordenação alfabética
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
            
            if (this.sortDirection === 'asc') {
                return aVal.localeCompare(bVal);
            } else {
                return bVal.localeCompare(aVal);
            }
        });

        this.updateSortIcons();
        this.renderBalanceteTable();
    }

    /**
     * Atualiza ícones de ordenação
     */
    updateSortIcons() {
        document.querySelectorAll('[data-sort]').forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
            const icon = header.querySelector('.sort-icon, .sort-icon-small');
            if (icon) {
                icon.textContent = 'unfold_more';
            }
        });

        if (this.sortColumn) {
            const activeHeader = document.querySelector(`[data-sort="${this.sortColumn}"]`);
            if (activeHeader) {
                activeHeader.classList.add(this.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
                const icon = activeHeader.querySelector('.sort-icon, .sort-icon-small');
                if (icon) {
                    icon.textContent = this.sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward';
                }
            }
        }
    }

    /**
     * Renderiza a tabela do balancete com estrutura hierárquica
     */
    renderBalanceteTable() {
        const tbody = document.getElementById('balanceteTableBody');
        tbody.innerHTML = '';

        // Para paginação, não paginar por categoria, mas por total de linhas (categorias + subcategorias visíveis)
        const allRows = [];
        
        this.filteredData.forEach(categoria => {
            allRows.push({ type: 'categoria', data: categoria });
            
            // Se categoria está expandida, adicionar subcategorias
            const isExpanded = this.expandedCategories.has('all') || 
                              this.expandedCategories.has(categoria.classificacao);
            
            if (isExpanded && categoria.subcategorias) {
                categoria.subcategorias.forEach(sub => {
                    allRows.push({ type: 'subcategoria', data: sub, categoria: categoria });
                });
            }
        });

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedRows = allRows.slice(startIndex, endIndex);

        paginatedRows.forEach(rowData => {
            if (rowData.type === 'categoria') {
                this.renderCategoriaRow(tbody, rowData.data);
            } else {
                this.renderSubcategoriaRow(tbody, rowData.data, rowData.categoria);
            }
        });

        this.updatePagination();
        this.updateRubricasCount();
        this.updateToggleAllButton();
    }

    /**
     * Atualiza contador de rubricas
     */
    updateRubricasCount() {
        const totalCategorias = this.filteredData.length;
        const totalSubcategorias = this.filteredData.reduce((total, cat) => 
            total + (cat.subcategorias ? cat.subcategorias.length : 0), 0);
        
        const countElement = document.getElementById('rubricasCount');
        if (countElement) {
            countElement.textContent = `${totalCategorias} Categorias · ${totalSubcategorias} Rubricas`;
        }
    }

    /**
     * Renderiza linha de categoria
     */
    renderCategoriaRow(tbody, categoria) {
        const totais = this.calcularTotaisCategoria(categoria);
        const isExpanded = this.expandedCategories.has('all') || 
                          this.expandedCategories.has(categoria.classificacao);
        const icon = isExpanded ? 'expand_more' : 'chevron_right';
        const row = tbody.insertRow();
        row.className = 'categoria-row';
        row.dataset.classificacao = categoria.classificacao;
        row.dataset.expanded = isExpanded;
        
        row.innerHTML = `
            <td class="categoria-cell" title="Clique para ${isExpanded ? 'recolher' : 'expandir'} esta categoria">
                <div class="categoria-header">
                    <span class="material-icons categoria-toggle" title="${isExpanded ? 'Recolher' : 'Expandir'} categoria">${icon}</span>
                    <span class="material-icons categoria-icon">folder${isExpanded ? '_open' : ''}</span>
                    <strong>${categoria.designacao}</strong>
                    <span class="categoria-badge">${categoria.subcategorias ? categoria.subcategorias.length : 0} itens</span>
                </div>
            </td>
            <td class="text-right categoria-total">${categoria.classificacao}</td>
            <td class="text-right categoria-total"><strong>${this.formatCurrency(totais.dotacao)}</strong></td>
            <td class="text-right categoria-total"><strong>${this.formatCurrency(totais.liquidacao_anterior)}</strong></td>
            <td class="text-right categoria-total"><strong>${this.formatCurrency(totais.durante_mes)}</strong></td>
            <td class="text-right categoria-total"><strong>${this.formatCurrency(totais.gasto_total)}</strong></td>
            <td class="text-right categoria-total">
                <span class="badge ${totais.saldo_livre >= 0 ? 'badge-positive' : 'badge-negative'}">
                    <strong>${this.formatCurrency(totais.saldo_livre)}</strong>
                </span>
            </td>
        `;

        // Adicionar event listener para toda a linha
        row.addEventListener('click', (e) => {
            // Evitar duplo clique se clicar diretamente no toggle
            if (!e.target.closest('.categoria-toggle')) {
                this.toggleCategoriaComAnimacao(categoria.classificacao, row);
            }
        });

        // Event listener específico para o ícone toggle
        const toggleIcon = row.querySelector('.categoria-toggle');
        toggleIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCategoriaComAnimacao(categoria.classificacao, row);
        });
    }

    /**
     * Renderiza linha de subcategoria
     */
    renderSubcategoriaRow(tbody, item, categoria) {
        const row = tbody.insertRow();
        row.className = 'subcategoria-row';
        row.addEventListener('click', () => this.showRelationModal(item));
        
        row.innerHTML = `
            <td class="subcategoria-cell">
                <div class="subcategoria-content">
                    <span class="material-icons subcategoria-icon">description</span>
                    <span class="subcategoria-arrow">↳</span>
                    ${item.designacao}
                </div>
            </td>
            <td class="subcategoria-data">${item.classificacao}</td>
            <td class="text-right subcategoria-data">${this.formatCurrency(item.dotacao)}</td>
            <td class="text-right subcategoria-data">${this.formatCurrency(item.liquidacao_anterior)}</td>
            <td class="text-right subcategoria-data">${this.formatCurrency(item.durante_mes)}</td>
            <td class="text-right subcategoria-data">${this.formatCurrency(item.gasto_total)}</td>
            <td class="text-right subcategoria-data">
                <span class="badge ${item.saldo_livre >= 0 ? 'badge-positive' : 'badge-negative'}">
                    ${this.formatCurrency(item.saldo_livre)}
                </span>
            </td>
        `;
    }

    /**
     * Atualiza controles de paginação
     */
    updatePagination() {
        // Calcular total de linhas (categorias + subcategorias expandidas)
        let totalRows = 0;
        this.filteredData.forEach(categoria => {
            totalRows++; // Categoria
            const isExpanded = this.expandedCategories.has('all') || 
                              this.expandedCategories.has(categoria.classificacao);
            if (isExpanded && categoria.subcategorias) {
                totalRows += categoria.subcategorias.length;
            }
        });
        
        const totalPages = Math.ceil(totalRows / this.itemsPerPage);
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');

        pageInfo.textContent = `Página ${this.currentPage} de ${totalPages || 1}`;
        prevBtn.disabled = this.currentPage === 1;
        nextBtn.disabled = this.currentPage >= totalPages || totalPages === 0;
    }

    /**
     * Página anterior
     */
    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderBalanceteTable();
        }
    }

    /**
     * Próxima página
     */
    nextPage() {
        const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderBalanceteTable();
        }
    }

    /**
     * Atualiza o dashboard com totais
     */
    updateDashboard() {
        const flatData = this.getFlatData();
        const totalDotacao = flatData.reduce((sum, item) => sum + item.dotacao, 0);
        const totalGasto = flatData.reduce((sum, item) => sum + item.gasto_total, 0);
        const totalSaldo = totalDotacao - totalGasto;
        const execucaoPercent = totalDotacao > 0 ? ((totalGasto / totalDotacao) * 100).toFixed(1) : 0;

        document.getElementById('totalDotacao').textContent = this.formatCurrency(totalDotacao);
        document.getElementById('totalGasto').textContent = this.formatCurrency(totalGasto);
        
        const saldoElement = document.getElementById('totalSaldo');
        saldoElement.textContent = this.formatCurrency(totalSaldo);
        saldoElement.className = 'card-value ' + (totalSaldo >= 0 ? 'badge-positive' : 'badge-negative');

        document.getElementById('execucaoPercent').textContent = `${execucaoPercent}%`;
    }

    /**
     * Exibe modal com relação intercalar
     */
    showRelationModal(balanceteItem) {
        const modal = document.getElementById('relationModal');
        
        // Preencher cabeçalho do modal
        document.getElementById('modalTitle').textContent = 'Relação Intercalar de Despesas';
        document.getElementById('modalDesignacao').textContent = balanceteItem.designacao;
        document.getElementById('modalCodigo').textContent = balanceteItem.classificacao;
        
        // Preencher resumo
        document.getElementById('modalDotacao').textContent = this.formatCurrency(balanceteItem.dotacao);
        document.getElementById('modalGasto').textContent = this.formatCurrency(balanceteItem.gasto_total);
        document.getElementById('modalSaldo').textContent = this.formatCurrency(balanceteItem.saldo_livre);
        
        const execucaoPercent = balanceteItem.dotacao > 0 ? 
            ((balanceteItem.gasto_total / balanceteItem.dotacao) * 100).toFixed(1) : 0;
        document.getElementById('modalExecucao').textContent = `${execucaoPercent}%`;

        // Buscar e exibir despesas
        const despesas = this.relationData[balanceteItem.classificacao] || [];
        this.renderRelationTable(despesas);

        // Calcular total de despesas
        const totalDespesas = despesas.reduce((sum, d) => sum + parseFloat(d.valor), 0);
        document.getElementById('totalDespesas').textContent = this.formatCurrency(totalDespesas);

        // Atualizar texto de execução
        document.getElementById('executionText').textContent = 
            `Execução da dotação: ${execucaoPercent}% (${this.formatCurrency(totalDespesas)} de ${this.formatCurrency(balanceteItem.dotacao)})`;

        modal.style.display = 'flex';
    }

    /**
     * Renderiza a tabela de relação intercalar
     */
    renderRelationTable(despesas) {
        const tbody = document.getElementById('relationTableBody');
        tbody.innerHTML = '';

        if (despesas.length === 0) {
            const row = tbody.insertRow();
            row.innerHTML = '<td colspan="5" class="text-center">Nenhuma despesa encontrada para esta rubrica.</td>';
            return;
        }

        despesas.forEach(despesa => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${despesa.fornecedor}</td>
                <td>${despesa.requisicao}</td>
                <td>${despesa.justificativo}</td>
                <td>${despesa.ordem_pagamento}</td>
                <td class="text-right">${this.formatCurrency(despesa.valor)}</td>
            `;
        });
    }

    /**
     * Fecha o modal
     */
    closeModal() {
        document.getElementById('relationModal').style.display = 'none';
    }

    /**
     * Exporta dados do balancete para CSV (estrutura hierárquica)
     */
    exportToCSV() {
        const headers = [
            'Tipo',
            'Designação Orçamental',
            'Classificação Orçamental', 
            'Dotação Disponível',
            'Liquidação até ao mês anterior',
            'Durante o mês',
            'Gasto até ao mês',
            'Saldo Livre'
        ];

        const rows = [];
        
        this.filteredData.forEach(categoria => {
            const totais = this.calcularTotaisCategoria(categoria);
            
            // Linha da categoria
            rows.push([
                'CATEGORIA',
                `"${categoria.designacao}"`,
                categoria.classificacao,
                totais.dotacao,
                totais.liquidacao_anterior,
                totais.durante_mes,
                totais.gasto_total,
                totais.saldo_livre
            ].join(','));
            
            // Linhas das subcategorias
            if (categoria.subcategorias) {
                categoria.subcategorias.forEach(sub => {
                    rows.push([
                        'Subcategoria',
                        `"  → ${sub.designacao}"`,
                        sub.classificacao,
                        sub.dotacao,
                        sub.liquidacao_anterior,
                        sub.durante_mes,
                        sub.gasto_total,
                        sub.saldo_livre
                    ].join(','));
                });
            }
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        this.downloadFile(csvContent, 'balancete-execucao-financeira.csv', 'text/csv');
        this.showSuccess('Arquivo CSV exportado com sucesso!');
    }

    /**
     * Exporta detalhes da relação intercalar para CSV
     */
    exportDetailsToCSV() {
        const modalTitle = document.getElementById('modalDesignacao').textContent;
        const classificacao = document.getElementById('modalCodigo').textContent;
        
        const headers = ['Fornecedor', 'Requisição', 'Justificativo', 'Ordem de Pagamento', 'Importância'];
        const despesas = this.relationData[classificacao] || [];

        const csvContent = [
            headers.join(','),
            ...despesas.map(d => [
                `"${d.fornecedor}"`,
                d.requisicao,
                d.justificativo,
                d.ordem_pagamento,
                d.valor
            ].join(','))
        ].join('\n');

        const filename = `relacao-intercalar-${classificacao.replace(/[\/]/g, '-')}.csv`;
        this.downloadFile(csvContent, filename, 'text/csv');
        this.showSuccess('Detalhes exportados com sucesso!');
    }

    /**
     * Faz download de um arquivo
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Formata valor monetário em Meticais moçambicanos
     */
    formatCurrency(value) {
        return new Intl.NumberFormat('pt-MZ', {
            style: 'currency',
            currency: 'MZN'
        }).format(value);
    }

    /**
     * Exibe mensagem de erro
     */
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        const searchSection = document.querySelector('.search-section');
        searchSection.appendChild(errorDiv);
        
        setTimeout(() => {
            if (searchSection.contains(errorDiv)) {
                searchSection.removeChild(errorDiv);
            }
        }, 5000);
    }

    /**
     * Exibe mensagem de sucesso
     */
    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'error-message';
        successDiv.style.backgroundColor = '#d4edda';
        successDiv.style.color = '#155724';
        successDiv.style.borderLeftColor = '#27ae60';
        successDiv.textContent = message;
        
        const searchSection = document.querySelector('.search-section');
        searchSection.appendChild(successDiv);
        
        setTimeout(() => {
            if (searchSection.contains(successDiv)) {
                searchSection.removeChild(successDiv);
            }
        }, 3000);
    }
}

// Inicializar aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    window.balanceteApp = new BalanceteManager();
});