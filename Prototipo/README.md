# Sistema Protótipo — Balancete de Execução Financeira

Um protótipo funcional de sistema de gestão orçamental desenvolvido com HTML, CSS e JavaScript vanilla (sem frameworks). O sistema apresenta o **Balancete de Execução Financeira** como página principal, onde cada linha é clicável e abre os detalhes correspondentes na **Relação Intercalar de Despesas**.

## 🚀 Como Executar

### Método 1: Abrir diretamente no navegador
1. Baixe ou clone este repositório
2. Abra o arquivo `index.html` diretamente no seu navegador web
3. O sistema carregará automaticamente os dados de exemplo

### Método 2: Servidor local (recomendado)
Para evitar problemas de CORS com carregamento de arquivos JSON:

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

# Node.js (se tiver instalado)
npx http-server

# PHP
php -S localhost:8000
```

Depois acesse: `http://localhost:8000`

## 📋 Funcionalidades

### ✅ Implementadas
- **Balancete Principal**: Tabela clicável com execução financeira
- **Dashboard**: Visualização de totais (Dotação, Gasto, Saldo, Execução %)
- **Pesquisa Dinâmica**: Busca em tempo real por designação ou classificação
- **Ordenação**: Colunas clicáveis com indicadores visuais
- **Relação Intercalar**: Modal com despesas detalhadas por rubrica
- **Exportação**: Download de CSV do balancete e detalhes
- **Impressão**: Relatórios formatados para impressão
- **Design Responsivo**: Funciona em desktop e mobile
- **Interface Institucional**: Cores azuis e layout profissional

### 🔍 Como Usar

#### 1. Navegar no Balancete
- Visualize o balancete de execução financeira na tabela principal
- Clique em qualquer linha para ver os detalhes da rubrica
- Use os controles de paginação para navegar entre páginas

#### 2. Pesquisar
- Digite no campo de pesquisa para filtrar por designação ou classificação
- A pesquisa é feita em tempo real conforme você digita
- Clique em "Limpar" para remover o filtro

#### 3. Ordenar Colunas
- Clique nos cabeçalhos das colunas para ordenar
- Os ícones mostram a direção da ordenação (↑ ↓)
- Suporte para ordenação alfabética e numérica

#### 4. Ver Detalhes (Relação Intercalar)
- Clique em qualquer linha do balancete
- Visualize as despesas associadas no modal
- Veja resumo executivo com percentagem de execução

#### 5. Exportar Dados
- Use "Exportar CSV" para baixar o balancete completo
- No modal de detalhes, use "Exportar Detalhes" para as despesas específicas

#### 6. Imprimir Relatório
- Clique em "Imprimir Relatório"
- Use Ctrl+P (Cmd+P no Mac) para imprimir
- O CSS está otimizado para impressão

## 📁 Estrutura de Arquivos

```
/prototipo-orcamental/
├── index.html          # Página principal (Balancete)
├── styles.css          # Estilos CSS responsivos
├── app.js             # Lógica JavaScript
├── data/
│   ├── balancete.json  # Dados do balancete
│   ├── relation.json   # Dados da relação intercalar
│   ├── sample.json     # Dados de exemplo (legado)
│   └── sample.csv      # Dados de exemplo (legado)
└── README.md          # Este arquivo
```

## 📊 Formato de Dados

### Balancete (balancete.json)
```json
[
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
```

### Relação Intercalar (relation.json)
```json
{
  "47/H000/1.1.2.1.01": [
    {
      "fornecedor": "Sérgio Manuel Gonçalo",
      "requisicao": "/OF/2024",
      "justificativo": "Guia nº 77",
      "ordem_pagamento": "OP202200000196",
      "valor": 147840
    }
  ]
}
```

**Nota**: Todos os valores estão em Meticais moçambicanos (MZN).

## 🎨 Design e UX

- **Layout Responsivo**: Mobile-first, funciona em todos os dispositivos
- **Cores Institucionais**: Esquema azul governamental/contábil
- **Tabelas Interativas**: Linhas clicáveis com efeitos hover
- **Ordenação Visual**: Ícones indicadores de direção (↑ ↓)
- **Navegação Intuitiva**: Interface limpa e fácil de usar
- **Feedback Visual**: Alertas e mensagens de sucesso/erro
- **Acessibilidade**: Contraste adequado e navegação por teclado

## 🔧 Tecnologias Utilizadas

- **HTML5**: Estrutura semântica
- **CSS3**: Flexbox, Grid, Media Queries, Animações
- **JavaScript ES6+**: Classes, Async/Await, Fetch API
- **Sem Frameworks**: Código vanilla para máxima compatibilidade

## 📱 Compatibilidade

- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 12+
- ✅ Edge 79+
- ✅ Mobile browsers

## 🚨 Limitações Conhecidas

- **Sem Backend**: Todos os dados são processados no frontend
- **Persistência Local**: Dados não são salvos entre sessões
- **CORS**: Arquivos JSON precisam ser servidos via HTTP (não file://)
- **Validação Básica**: Validações são simples, não substituem validação de backend
- **Dados Estáticos**: Balancete e relação intercalar são carregados de arquivos JSON
- **Moeda Fixa**: Valores estão em Meticais moçambicanos (MZN) - conversão automática não implementada

## 🔮 Próximos Passos (Futuro)

- Integração com API REST
- Persistência em base de dados
- Autenticação de utilizadores
- Relatórios avançados
- Gráficos e dashboards
- Notificações em tempo real

## 🐛 Resolução de Problemas

### Erro: "Arquivo de dados não encontrado"
- Certifique-se de que está executando via servidor HTTP
- Verifique se os arquivos `data/balancete.json` e `data/relation.json` existem

### Linhas do balancete não são clicáveis
- Verifique se o JavaScript está habilitado
- Confirme que não há erros no console do navegador

### Modal não abre
- Verifique o console do navegador para erros
- Certifique-se de que o JavaScript está habilitado
- Confirme que os dados da relação intercalar estão carregados

### Pesquisa não funciona
- Verifique se o campo de pesquisa está visível
- Confirme que os dados do balancete foram carregados

## 📞 Suporte

Este é um protótipo para demonstração. Para suporte ou dúvidas sobre implementação, consulte o código fonte que está bem comentado.

## 📄 Licença

Este projeto é um protótipo educacional. Use livremente para fins de demonstração e aprendizagem.
