// ============================================================================
// Tabela Mensal de Execução Orçamentária
// ============================================================================

// API_BASE já está declarado em common.js (carregado antes deste arquivo)

// Variáveis globais
let currentExercicio = new Date().getFullYear();
let rubricasData = [];
let execucaoMensalData = [];
let sseConnection = null;

// Elementos DOM
let exercicioSelect = null;
let tableBody = null;
let loadingOverlay = null;
let errorMessage = null;

// ============================================================================
// Inicialização
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    exercicioSelect = document.getElementById('exercicioSelect');
    tableBody = document.getElementById('tableBody');
    loadingOverlay = document.getElementById('loadingOverlay');
    errorMessage = document.getElementById('errorMessage');
    
    // Verificar se há parâmetro de exercício na URL
    const urlParams = new URLSearchParams(window.location.search);
    const exercicioParam = urlParams.get('exercicio');
    if (exercicioParam) {
        currentExercicio = parseInt(exercicioParam);
    }
    
    initExercicioSelector();
    setupEventListeners();
    loadData();
    
    // Inicializar monitoramento SSE
    initSSEStatus();
});

function initExercicioSelector() {
    if (!exercicioSelect) return;
    
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        if (i === currentExercicio) {
            option.selected = true;
        }
        exercicioSelect.appendChild(option);
    }
}

function setupEventListeners() {
    if (exercicioSelect) {
        exercicioSelect.addEventListener('change', (e) => {
            currentExercicio = parseInt(e.target.value);
            loadData();
            
            // Reconectar SSE com novo exercício
            if (sseConnection) {
                closeSSEConnection();
                setupSSEConnection();
            }
        });
    }
    
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            loadData();
        });
    }
    
    const btnExport = document.getElementById('btnExport');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            exportToExcel();
        });
    }
    
    const btnViewFull = document.getElementById('btnViewFull');
    if (btnViewFull) {
        btnViewFull.addEventListener('click', () => {
            viewFullTable();
        });
    }
}

// ============================================================================
// Carregamento de Dados
// ============================================================================

async function loadData() {
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    if (errorMessage) errorMessage.style.display = 'none';
    
    try {
        // Carregar dados em paralelo
        const [rubricasResponse, execucaoResponse] = await Promise.all([
            fetch(`${API_BASE}/api/v1/rubricas/tree?exercicio=${currentExercicio}`),
            fetch(`${API_BASE}/api/v1/execucao-mensal?exercicio=${currentExercicio}`)
        ]);
        
        if (!rubricasResponse.ok) {
            throw new Error('Erro ao carregar rubricas');
        }
        
        if (!execucaoResponse.ok) {
            throw new Error('Erro ao carregar execução mensal');
        }
        
        const rubricasTree = await rubricasResponse.json();
        execucaoMensalData = await execucaoResponse.json();
        
        // Flatten da árvore de rubricas para lista plana
        rubricasData = flattenRubricasTree(rubricasTree);
        
        // Renderizar tabela
        renderTable();
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        if (errorMessage) {
            errorMessage.textContent = `Erro: ${error.message}`;
            errorMessage.style.display = 'block';
        }
    } finally {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }
}

function flattenRubricasTree(tree, result = [], parent = null) {
    for (const node of tree) {
        const rubrica = {
            id: node.id,
            codigo: node.codigo,
            designacao: node.designacao,
            nivel: node.nivel || 0,
            parent_id: parent ? parent.id : null,
            children: node.children || []
        };
        result.push(rubrica);
        
        if (node.children && node.children.length > 0) {
            flattenRubricasTree(node.children, result, rubrica);
        }
    }
    return result;
}

// ============================================================================
// Renderização da Tabela
// ============================================================================

function renderTable() {
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (rubricasData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="14" style="text-align: center; padding: 40px; color: var(--dark-grey);">
                    Nenhuma rubrica encontrada para este exercício
                </td>
            </tr>
        `;
        return;
    }
    
    // Criar mapa de execução mensal por rubrica_id
    const execucaoMap = {};
    execucaoMensalData.forEach(item => {
        execucaoMap[item.rubrica_id] = item.meses;
    });
    
    // Renderizar cada rubrica
    rubricasData.forEach(rubrica => {
        const meses = execucaoMap[rubrica.id] || {};
        const row = createTableRow(rubrica, meses);
        tableBody.appendChild(row);
    });
}

function createTableRow(rubrica, meses) {
    const row = document.createElement('tr');
    
    // Calcular total anual (meses vêm como strings "1", "2", etc.)
    const total = Object.values(meses).reduce((sum, val) => {
        const numVal = parseFloat(val) || 0;
        return sum + numVal;
    }, 0);
    
    // Classe de nível para recuo visual
    // Se não tem parent_id, é rubrica principal (nível 0)
    const nivel = rubrica.nivel !== undefined ? rubrica.nivel : (rubrica.parent_id ? 1 : 0);
    const nivelClass = `rubrica-level-${Math.min(nivel, 5)}`;
    
    // Adicionar classe para rubricas principais (nível 0 ou sem parent_id)
    if (nivel === 0 || !rubrica.parent_id) {
        row.classList.add('rubrica-principal');
    }
    
    // Formatar valores mensais (meses vêm como strings "1", "2", etc. do endpoint)
    const mesesFormatted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(mes => {
        const valor = meses[String(mes)] || 0;
        return formatMoneyValue(valor);
    });
    
    // Verificar se valores são zero para aplicar classe
    const getZeroClass = (mesNum) => {
        const valor = meses[String(mesNum)] || 0;
        return valor == 0 ? 'value-zero' : '';
    };
    
    row.innerHTML = `
        <td class="col-rubrica ${nivelClass}">${escapeHtml(rubrica.designacao)}</td>
        <td class="col-month ${getZeroClass(1)}">${mesesFormatted[0]}</td>
        <td class="col-month ${getZeroClass(2)}">${mesesFormatted[1]}</td>
        <td class="col-month ${getZeroClass(3)}">${mesesFormatted[2]}</td>
        <td class="col-month ${getZeroClass(4)}">${mesesFormatted[3]}</td>
        <td class="col-month ${getZeroClass(5)}">${mesesFormatted[4]}</td>
        <td class="col-month ${getZeroClass(6)}">${mesesFormatted[5]}</td>
        <td class="col-month ${getZeroClass(7)}">${mesesFormatted[6]}</td>
        <td class="col-month ${getZeroClass(8)}">${mesesFormatted[7]}</td>
        <td class="col-month ${getZeroClass(9)}">${mesesFormatted[8]}</td>
        <td class="col-month ${getZeroClass(10)}">${mesesFormatted[9]}</td>
        <td class="col-month ${getZeroClass(11)}">${mesesFormatted[10]}</td>
        <td class="col-month ${getZeroClass(12)}">${mesesFormatted[11]}</td>
        <td class="col-total">${formatMoneyValue(total)}</td>
    `;
    
    return row;
}

// ============================================================================
// Visualizar Tabela Inteira
// ============================================================================

function viewFullTable() {
    if (!rubricasData || rubricasData.length === 0) {
        alert('Não há dados para visualizar');
        return;
    }
    
    // Criar uma nova janela para visualização completa
    const newWindow = window.open('', '_blank', 'width=1400,height=800,scrollbars=yes,resizable=yes');
    
    if (!newWindow) {
        alert('Por favor, permita pop-ups para visualizar a tabela completa');
        return;
    }
    
    // Criar mapa de execução mensal por rubrica_id
    const execucaoMap = {};
    execucaoMensalData.forEach(item => {
        execucaoMap[item.rubrica_id] = item.meses;
    });
    
    // Gerar HTML da tabela completa
    let html = `
        <!DOCTYPE html>
        <html lang="pt">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Tabela Mensal Completa - ${currentExercicio}</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    padding: 20px;
                    background: #f5f5f5;
                }
                .header {
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .header h1 {
                    font-size: 1.5rem;
                    color: #1976D2;
                    margin-bottom: 10px;
                }
                .header p {
                    color: #666;
                    font-size: 0.9rem;
                }
                .table-container {
                    background: white;
                    border-radius: 8px;
                    padding: 20px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    overflow-x: auto;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.85rem;
                }
                thead {
                    background: #f6f6f9;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                th {
                    padding: 12px 8px;
                    text-align: left;
                    font-weight: 700;
                    color: #363949;
                    border-bottom: 2px solid #eee;
                    white-space: nowrap;
                }
                th.col-rubrica {
                    min-width: 300px;
                    position: sticky;
                    left: 0;
                    background: #f6f6f9;
                    z-index: 11;
                }
                th.col-month, th.col-total {
                    text-align: right;
                    min-width: 100px;
                }
                th.col-total {
                    font-weight: 800;
                    color: #1976D2;
                }
                tbody tr {
                    border-bottom: 1px solid #eee;
                }
                tbody tr:hover:not(.rubrica-principal) {
                    background: #f6f6f9;
                }
                /* Apenas rubricas principais (nível 0) em azul */
                tbody tr.rubrica-principal {
                    background: #CFE8FF !important;
                    border-bottom: 2px solid #1976D2 !important;
                }
                tbody tr.rubrica-principal td {
                    background: #CFE8FF !important;
                }
                tbody tr.rubrica-principal td.col-rubrica {
                    background: #CFE8FF !important;
                    font-weight: 700 !important;
                    color: #1976D2 !important;
                }
                td {
                    padding: 10px 8px;
                    vertical-align: middle;
                }
                td.col-rubrica {
                    position: sticky;
                    left: 0;
                    z-index: 9;
                    box-shadow: 2px 0 4px rgba(0,0,0,0.05);
                    font-weight: 500;
                }
                tbody tr:not(.rubrica-principal) td.col-rubrica {
                    background: white;
                }
                tbody tr:hover:not(.rubrica-principal) td.col-rubrica {
                    background: #f6f6f9;
                }
                td.col-month, td.col-total {
                    text-align: right;
                    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
                    font-size: 0.8rem;
                }
                td.col-total {
                    font-weight: 700;
                    color: #1976D2;
                }
                .rubrica-level-0 { padding-left: 0px; }
                .rubrica-level-1 { padding-left: 20px; }
                .rubrica-level-2 { padding-left: 40px; }
                .rubrica-level-3 { padding-left: 60px; }
                .rubrica-level-4 { padding-left: 80px; }
                .zero-value {
                    color: #AAAAAA;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Tabela Mensal de Execução Orçamentária - ${currentExercicio}</h1>
                <p>Visualização completa da tabela - ${new Date().toLocaleDateString('pt-PT')}</p>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th class="col-rubrica">Rubrica</th>
                            <th class="col-month">Jan</th>
                            <th class="col-month">Fev</th>
                            <th class="col-month">Mar</th>
                            <th class="col-month">Abr</th>
                            <th class="col-month">Mai</th>
                            <th class="col-month">Jun</th>
                            <th class="col-month">Jul</th>
                            <th class="col-month">Ago</th>
                            <th class="col-month">Set</th>
                            <th class="col-month">Out</th>
                            <th class="col-month">Nov</th>
                            <th class="col-month">Dez</th>
                            <th class="col-total">Total</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    // Adicionar linhas da tabela
    rubricasData.forEach(rubrica => {
        const meses = execucaoMap[rubrica.id] || {};
        // Se não tem parent_id, é rubrica principal (nível 0)
        const nivel = rubrica.nivel !== undefined ? rubrica.nivel : (rubrica.parent_id ? 1 : 0);
        const isPrincipal = nivel === 0 || !rubrica.parent_id;
        
        // Calcular total
        const total = Object.values(meses).reduce((sum, val) => {
            const numVal = parseFloat(val) || 0;
            return sum + numVal;
        }, 0);
        
        // Formatar valores
        const formatValue = (value) => {
            if (value === null || value === undefined || isNaN(value) || value === 0) {
                return '<span class="zero-value">0,00</span>';
            }
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            const formatted = Math.abs(numValue).toFixed(2).replace('.', ',');
            const parts = formatted.split(',');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            return parts.join(',');
        };
        
        html += `
            <tr${isPrincipal ? ' class="rubrica-principal"' : ''}>
                <td class="col-rubrica rubrica-level-${nivel}">${escapeHtml(rubrica.designacao)}</td>
                <td class="col-month">${formatValue(meses['1'])}</td>
                <td class="col-month">${formatValue(meses['2'])}</td>
                <td class="col-month">${formatValue(meses['3'])}</td>
                <td class="col-month">${formatValue(meses['4'])}</td>
                <td class="col-month">${formatValue(meses['5'])}</td>
                <td class="col-month">${formatValue(meses['6'])}</td>
                <td class="col-month">${formatValue(meses['7'])}</td>
                <td class="col-month">${formatValue(meses['8'])}</td>
                <td class="col-month">${formatValue(meses['9'])}</td>
                <td class="col-month">${formatValue(meses['10'])}</td>
                <td class="col-month">${formatValue(meses['11'])}</td>
                <td class="col-month">${formatValue(meses['12'])}</td>
                <td class="col-total">${formatValue(total)}</td>
            </tr>
        `;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
        </body>
        </html>
    `;
    
    newWindow.document.write(html);
    newWindow.document.close();
}

// ============================================================================
// Exportação para Excel
// ============================================================================

async function exportToExcel() {
    if (!rubricasData || rubricasData.length === 0) {
        alert('Não há dados para exportar');
        return;
    }
    
    try {
        // Verificar se ExcelJS está disponível
        if (typeof ExcelJS === 'undefined') {
            // Fallback para XLSX se ExcelJS não estiver disponível
            exportToExcelXLSX();
            return;
        }
        
        // Criar mapa de execução mensal por rubrica_id
        const execucaoMap = {};
        execucaoMensalData.forEach(item => {
            execucaoMap[item.rubrica_id] = item.meses;
        });
        
        // Criar workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Execução Mensal');
        
        // Definir largura das colunas
        worksheet.columns = [
            { width: 50 },  // Rubrica
            { width: 15 },  // Jan
            { width: 15 },  // Fev
            { width: 15 },  // Mar
            { width: 15 },  // Abr
            { width: 15 },  // Mai
            { width: 15 },  // Jun
            { width: 15 },  // Jul
            { width: 15 },  // Ago
            { width: 15 },  // Set
            { width: 15 },  // Out
            { width: 15 },  // Nov
            { width: 15 },  // Dez
            { width: 18 }   // Total
        ];
        
        // Cabeçalho
        const headerRow = worksheet.addRow([
            'Rubrica',
            'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
            'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
            'Total'
        ]);
        
        // Formatar cabeçalho
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 25;
        
        // Adicionar dados das rubricas
        rubricasData.forEach(rubrica => {
            const meses = execucaoMap[rubrica.id] || {};
            
            // Se não tem parent_id, é rubrica principal (nível 0)
            const nivel = rubrica.nivel !== undefined ? rubrica.nivel : (rubrica.parent_id ? 1 : 0);
            const isPrincipal = nivel === 0 || !rubrica.parent_id;
            
            // Calcular total
            const total = Object.values(meses).reduce((sum, val) => {
                const numVal = parseFloat(val) || 0;
                return sum + numVal;
            }, 0);
            
            // Criar linha
            const row = worksheet.addRow([
                rubrica.designacao,
                parseFloat(meses['1'] || 0),
                parseFloat(meses['2'] || 0),
                parseFloat(meses['3'] || 0),
                parseFloat(meses['4'] || 0),
                parseFloat(meses['5'] || 0),
                parseFloat(meses['6'] || 0),
                parseFloat(meses['7'] || 0),
                parseFloat(meses['8'] || 0),
                parseFloat(meses['9'] || 0),
                parseFloat(meses['10'] || 0),
                parseFloat(meses['11'] || 0),
                parseFloat(meses['12'] || 0),
                total
            ]);
            
            // Formatar valores numéricos
            for (let col = 2; col <= 14; col++) { // Colunas B a N (meses + total)
                const cell = row.getCell(col);
                cell.numFmt = '#,##0.00';
            }
            
            // Aplicar estilo azul nas rubricas principais
            if (isPrincipal) {
                // Background azul claro para toda a linha
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFCFE8FF' } // Azul claro
                };
                
                // Borda inferior azul mais escura
                row.getCell(1).border = {
                    bottom: { style: 'medium', color: { argb: 'FF1976D2' } }
                };
                for (let col = 2; col <= 14; col++) {
                    row.getCell(col).border = {
                        bottom: { style: 'medium', color: { argb: 'FF1976D2' } }
                    };
                }
                
                // Coluna de Rubrica: texto azul e negrito
                row.getCell(1).font = {
                    bold: true,
                    color: { argb: 'FF1976D2' } // Azul
                };
            }
            
            // Formatar coluna Total (azul) para todas as linhas
            row.getCell(14).font = {
                bold: true,
                color: { argb: 'FF1976D2' }
            };
        });
        
        // Gerar nome do arquivo
        const fileName = `Tabela_Mensal_${currentExercicio}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        // Baixar arquivo
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        window.URL.revokeObjectURL(url);
        
        console.log('Arquivo Excel gerado com sucesso:', fileName);
        
    } catch (error) {
        console.error('Erro ao exportar para Excel:', error);
        // Fallback para método XLSX se houver erro
        exportToExcelXLSX();
    }
}

// Função fallback usando XLSX (sem estilos)
function exportToExcelXLSX() {
    if (typeof XLSX === 'undefined') {
        alert('Biblioteca de exportação não encontrada. Por favor, recarregue a página.');
        return;
    }
    
    try {
        // Criar mapa de execução mensal por rubrica_id
        const execucaoMap = {};
        execucaoMensalData.forEach(item => {
            execucaoMap[item.rubrica_id] = item.meses;
        });
        
        // Preparar dados para Excel
        const dados = [];
        
        // Cabeçalho
        const header = [
            'Rubrica',
            'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
            'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
            'Total'
        ];
        dados.push(header);
        
        // Dados das rubricas
        rubricasData.forEach(rubrica => {
            const meses = execucaoMap[rubrica.id] || {};
            
            // Calcular total
            const total = Object.values(meses).reduce((sum, val) => {
                const numVal = parseFloat(val) || 0;
                return sum + numVal;
            }, 0);
            
            // Criar linha
            const row = [
                rubrica.designacao,
                parseFloat(meses['1'] || 0),
                parseFloat(meses['2'] || 0),
                parseFloat(meses['3'] || 0),
                parseFloat(meses['4'] || 0),
                parseFloat(meses['5'] || 0),
                parseFloat(meses['6'] || 0),
                parseFloat(meses['7'] || 0),
                parseFloat(meses['8'] || 0),
                parseFloat(meses['9'] || 0),
                parseFloat(meses['10'] || 0),
                parseFloat(meses['11'] || 0),
                parseFloat(meses['12'] || 0),
                total
            ];
            dados.push(row);
        });
        
        // Criar workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(dados);
        
        // Ajustar largura das colunas
        ws['!cols'] = [
            { wch: 50 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }
        ];
        
        // Adicionar worksheet ao workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Execução Mensal');
        
        // Gerar nome do arquivo
        const fileName = `Tabela_Mensal_${currentExercicio}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        // Baixar arquivo
        XLSX.writeFile(wb, fileName);
        
        console.log('Arquivo Excel gerado com sucesso (sem estilos):', fileName);
        
    } catch (error) {
        console.error('Erro ao exportar para Excel:', error);
        alert('Erro ao exportar para Excel: ' + error.message);
    }
}

// ============================================================================
// Utilitários
// ============================================================================

function formatMoneyValue(value) {
    if (value === null || value === undefined || isNaN(value)) {
        return '0,00 MZN';
    }
    
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const formatted = Math.abs(numValue).toFixed(2).replace('.', ',');
    const parts = formatted.split(',');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    
    return `${parts.join(',')} MZN`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Monitoramento de Status SSE e Atualização Automática
// ============================================================================

function initSSEStatus() {
    const sseStatusText = document.getElementById('sseStatusText');
    const sseStatus = document.getElementById('sseStatus');
    if (!sseStatusText || !sseStatus) return;
    
    // Conectar ao SSE público
    setupSSEConnection();
}

function setupSSEConnection() {
    // Fechar conexão anterior se existir
    closeSSEConnection();
    
    const sseStatusText = document.getElementById('sseStatusText');
    const sseStatus = document.getElementById('sseStatus');
    
    // Criar nova conexão SSE pública (sem autenticação)
    const sseUrl = `${API_BASE}/api/v1/dashboard/events/public?exercicio=${currentExercicio}`;
    console.log('Conectando SSE público:', sseUrl);
    
    const eventSource = new EventSource(sseUrl, { withCredentials: true });
    
    // Atualizar status para conectando
    if (sseStatusText) sseStatusText.textContent = 'Conectando...';
    if (sseStatus) sseStatus.className = 'sse-status';
    
    eventSource.addEventListener('open', () => {
        console.log('SSE conectado');
        if (sseStatusText) sseStatusText.textContent = 'Online';
        if (sseStatus) sseStatus.className = 'sse-status sse-online';
    });
    
    eventSource.addEventListener('message', (event) => {
        try {
            const data = JSON.parse(event.data);
            handleSSEEvent(data);
        } catch (error) {
            console.error('Erro ao processar evento SSE:', error);
        }
    });
    
    // Escutar eventos específicos
    eventSource.addEventListener('despesa_confirmada', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    eventSource.addEventListener('despesa_criada', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    eventSource.addEventListener('despesa_atualizada', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    eventSource.addEventListener('despesa_removida', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    eventSource.addEventListener('dotacao_atualizada', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    eventSource.addEventListener('rubrica_atualizada', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    eventSource.addEventListener('rubricas_recalculadas', (event) => {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    });
    
    // Tratamento de erros
    eventSource.onerror = (error) => {
        console.error('Erro na conexão SSE:', error);
        if (sseStatusText) sseStatusText.textContent = 'Offline';
        if (sseStatus) sseStatus.className = 'sse-status sse-offline';
        
        // Tentar reconectar após 5 segundos
        setTimeout(() => {
            if (eventSource.readyState === EventSource.CLOSED) {
                setupSSEConnection();
            }
        }, 5000);
    };
    
    sseConnection = eventSource;
}

function handleSSEEvent(event) {
    if (!event || !event.type) return;
    
    console.log('Evento SSE recebido:', event.type);
    
    // Recarregar dados quando houver mudanças relevantes
    if (event.type === 'dotacao_atualizada' || 
        event.type === 'despesa_confirmada' || 
        event.type === 'despesa_criada' || 
        event.type === 'despesa_atualizada' || 
        event.type === 'despesa_removida' ||
        event.type === 'rubrica_atualizada' ||
        event.type === 'rubricas_recalculadas') {
        // Recarregar tabela
        loadData();
    }
}

function closeSSEConnection() {
    if (sseConnection) {
        sseConnection.close();
        sseConnection = null;
    }
}

// Fechar conexão ao sair da página
window.addEventListener('beforeunload', () => {
    closeSSEConnection();
});

