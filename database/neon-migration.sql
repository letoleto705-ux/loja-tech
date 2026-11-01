-- Loja Tech: cupons de afiliados, comunicados e snapshots de checkout.
-- Os produtos atuais são armazenados como JSONB em config.valor (chave "produtos").

CREATE TABLE IF NOT EXISTS afiliado_cupons (
  id SERIAL PRIMARY KEY,
  afiliado_usuario TEXT NOT NULL UNIQUE
    REFERENCES afiliados(usuario) ON DELETE CASCADE,
  codigo_cupom VARCHAR(50) NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS afiliado_cupons_codigo_lower_uidx
  ON afiliado_cupons (LOWER(codigo_cupom));

CREATE TABLE IF NOT EXISTS notificacoes_afiliados (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  mensagem TEXT NOT NULL,
  data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ativa BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS valor_original NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cupom_codigo TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cupom_desconto NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repasse_juros_comprador BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE pedidos SET valor_original = valor WHERE valor_original = 0;

INSERT INTO config (chave, valor)
VALUES
  ('cupom_global_ativo', 'false'::jsonb),
  ('cupom_porcentagem_maxima', '0'::jsonb)
ON CONFLICT (chave) DO NOTHING;

UPDATE config
SET valor = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(produto) = 'object'
        THEN jsonb_set(
          produto,
          '{repasseJurosComprador}',
          CASE WHEN jsonb_typeof(produto->'repasseJurosComprador') = 'boolean'
            THEN produto->'repasseJurosComprador' ELSE 'true'::jsonb END,
          TRUE
        )
      ELSE produto
    END
  )
  FROM jsonb_array_elements(config.valor) AS produto
)
WHERE chave = 'produtos' AND jsonb_typeof(valor) = 'array';

-- A estrutura atual não possui tabela "produtos": a configuração do produto fica em
-- config.valor (JSONB), na chave "produtos". A propriedade repasseJurosComprador
-- é adicionada e validada pelo backend e editada exclusivamente pelo Admin.
