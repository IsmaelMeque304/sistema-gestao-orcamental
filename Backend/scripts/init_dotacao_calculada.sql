-- Script para inicializar dotacao_calculada para rubricas existentes
-- Execute este script se já tiver rubricas no banco e precisar calcular dotacao_calculada

USE sistema_contabil;

-- ============================================================================
-- Passo 1: Inicializar dotacao_calculada para rubricas folha (sem filhos)
-- ============================================================================
-- Para rubricas folha, dotacao_calculada = dotacao (ou 0 se NULL)

UPDATE rubrica r1
SET r1.dotacao_calculada = COALESCE(r1.dotacao, 0.00)
WHERE r1.id NOT IN (
    SELECT DISTINCT parent_id 
    FROM rubrica r2 
    WHERE r2.parent_id IS NOT NULL
);

-- ============================================================================
-- Passo 2: Calcular dotacao_calculada para rubricas pai (com filhos)
-- ============================================================================
-- Para rubricas pai, dotacao_calculada = soma(dotacao_calculada dos filhos)
-- Este processo precisa ser executado de baixo para cima (folhas primeiro, depois pais)

-- Atualizar rubricas de nível mais alto primeiro (folhas)
-- Depois atualizar seus pais recursivamente

-- Função recursiva usando CTE (MySQL 8.0+)
-- Nota: Se estiver usando MySQL < 8.0, será necessário executar múltiplas vezes
-- até que todos os valores estejam corretos

WITH RECURSIVE rubrica_hierarchy AS (
    -- Base: rubricas folha (sem filhos)
    SELECT 
        id,
        parent_id,
        nivel,
        COALESCE(dotacao, 0.00) as dotacao_calculada,
        0 as depth
    FROM rubrica
    WHERE id NOT IN (
        SELECT DISTINCT parent_id 
        FROM rubrica 
        WHERE parent_id IS NOT NULL
    )
    
    UNION ALL
    
    -- Recursão: calcular para pais baseado nos filhos
    SELECT 
        r.id,
        r.parent_id,
        r.nivel,
        COALESCE((
            SELECT SUM(COALESCE(rh.dotacao_calculada, 0.00))
            FROM rubrica_hierarchy rh
            WHERE rh.parent_id = r.id
        ), COALESCE(r.dotacao, 0.00)) as dotacao_calculada,
        rh.depth + 1
    FROM rubrica r
    INNER JOIN rubrica_hierarchy rh ON r.parent_id = rh.id
    WHERE rh.depth < 10  -- Limite de profundidade para evitar loops infinitos
)
UPDATE rubrica r
INNER JOIN (
    SELECT 
        id,
        MAX(dotacao_calculada) as dotacao_calculada
    FROM rubrica_hierarchy
    GROUP BY id
) rh ON r.id = rh.id
SET r.dotacao_calculada = rh.dotacao_calculada
WHERE r.dotacao_calculada IS NULL OR r.dotacao_calculada != rh.dotacao_calculada;

-- ============================================================================
-- Alternativa para MySQL < 8.0 ou se CTE não funcionar:
-- ============================================================================
-- Execute este bloco múltiplas vezes (3-5 vezes geralmente é suficiente)
-- até que todos os valores estejam corretos

-- Iteração 1: Atualizar rubricas folha
UPDATE rubrica r1
SET r1.dotacao_calculada = COALESCE(r1.dotacao, 0.00)
WHERE r1.id NOT IN (
    SELECT DISTINCT parent_id 
    FROM rubrica r2 
    WHERE r2.parent_id IS NOT NULL
);

-- Iteração 2-5: Atualizar pais baseado nos filhos (executar múltiplas vezes)
UPDATE rubrica r
SET r.dotacao_calculada = (
    SELECT COALESCE(SUM(COALESCE(r2.dotacao_calculada, 0.00)), 0.00)
    FROM rubrica r2
    WHERE r2.parent_id = r.id
)
WHERE r.id IN (
    SELECT DISTINCT parent_id 
    FROM rubrica 
    WHERE parent_id IS NOT NULL
)
AND (
    r.dotacao_calculada IS NULL 
    OR r.dotacao_calculada != (
        SELECT COALESCE(SUM(COALESCE(r2.dotacao_calculada, 0.00)), 0.00)
        FROM rubrica r2
        WHERE r2.parent_id = r.id
    )
);

-- ============================================================================
-- Verificação: Ver rubricas com dotacao_calculada NULL ou incorreta
-- ============================================================================
SELECT 
    id,
    codigo,
    designacao,
    nivel,
    parent_id,
    dotacao,
    dotacao_calculada,
    CASE 
        WHEN id IN (SELECT DISTINCT parent_id FROM rubrica WHERE parent_id IS NOT NULL) 
        THEN 'Pai'
        ELSE 'Folha'
    END as tipo,
    CASE 
        WHEN id IN (SELECT DISTINCT parent_id FROM rubrica WHERE parent_id IS NOT NULL) 
        THEN (
            SELECT COALESCE(SUM(COALESCE(r2.dotacao_calculada, 0.00)), 0.00)
            FROM rubrica r2
            WHERE r2.parent_id = r.id
        )
        ELSE COALESCE(dotacao, 0.00)
    END as valor_esperado
FROM rubrica r
WHERE dotacao_calculada IS NULL
   OR (
       id IN (SELECT DISTINCT parent_id FROM rubrica WHERE parent_id IS NOT NULL)
       AND dotacao_calculada != (
           SELECT COALESCE(SUM(COALESCE(r2.dotacao_calculada, 0.00)), 0.00)
           FROM rubrica r2
           WHERE r2.parent_id = r.id
       )
   )
ORDER BY nivel, codigo;

