-- Loja Tech: cupons de afiliados, comunicados e snapshots de checkout.
-- Os produtos atuais são armazenados como JSONB em config.valor (chave "produtos").

CREATE TABLE IF NOT EXISTS afiliado_cupons (
  id SERIAL PRIMARY KEY,
  afiliado_usuario TEXT NOT NULL UNIQUE
    REFERENCES afiliados(usuario) ON DELETE CASCADE,
  codigo_cupom VARCHAR(50) NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT FALSE,
  data_validade DATE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE afiliado_cupons
  ADD COLUMN IF NOT EXISTS data_validade DATE;

DELETE FROM afiliado_cupons c
WHERE NOT EXISTS (
  SELECT 1 FROM afiliados a WHERE a.usuario = c.afiliado_usuario
);

DO $$
DECLARE chave_fk RECORD;
        campo_afiliado SMALLINT;
BEGIN
  SELECT attnum INTO campo_afiliado
  FROM pg_attribute
  WHERE attrelid = 'afiliado_cupons'::regclass
    AND attname = 'afiliado_usuario'
    AND NOT attisdropped;

  FOR chave_fk IN
    SELECT conname, confdeltype
    FROM pg_constraint
    WHERE conrelid = 'afiliado_cupons'::regclass
      AND confrelid = 'afiliados'::regclass
      AND contype = 'f'
      AND campo_afiliado = ANY(conkey)
  LOOP
    IF chave_fk.confdeltype <> 'c' THEN
      EXECUTE format('ALTER TABLE afiliado_cupons DROP CONSTRAINT %I', chave_fk.conname);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'afiliado_cupons'::regclass
      AND confrelid = 'afiliados'::regclass
      AND contype = 'f'
      AND campo_afiliado = ANY(conkey)
      AND confdeltype = 'c'
  ) THEN
    ALTER TABLE afiliado_cupons
      ADD CONSTRAINT afiliado_cupons_afiliado_usuario_fkey
      FOREIGN KEY (afiliado_usuario)
      REFERENCES afiliados(usuario)
      ON DELETE CASCADE;
  END IF;
END $$;

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
  ADD COLUMN IF NOT EXISTS repasse_juros_comprador BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tipo_pedido TEXT NOT NULL DEFAULT 'software',
  ADD COLUMN IF NOT EXISTS custo_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrega_cep TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entrega_rua TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entrega_numero TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entrega_bairro TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entrega_cidade TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entrega_estado CHAR(2) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entrega_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entrega_telefone TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS produtos_cj (
  pid TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  preco NUMERIC(12,2) NOT NULL CHECK (preco >= 0),
  custo NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (custo >= 0),
  categoria TEXT NOT NULL DEFAULT '',
  imagem TEXT NOT NULL DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id BIGSERIAL PRIMARY KEY,
  pedido_id TEXT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_pid TEXT NOT NULL,
  produto_nome TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(12,2) NOT NULL CHECK (preco_unitario >= 0),
  custo_unitario NUMERIC(12,2) NOT NULL CHECK (custo_unitario >= 0),
  imagem TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS itens_pedido_pedido_id_idx
  ON itens_pedido (pedido_id);

UPDATE pedidos SET valor_original = valor WHERE valor_original = 0;

INSERT INTO config (chave, valor)
VALUES
  ('cupom_global_ativo', 'false'::jsonb),
  ('cupom_porcentagem_maxima', '0'::jsonb)
ON CONFLICT (chave) DO NOTHING;

DELETE FROM config WHERE chave = 'pixChave';

INSERT INTO config (chave, valor)
VALUES
  ('taxaComissao', '35'::jsonb),
  ('taxaPatrocinador', '10'::jsonb),
  ('taxaAvo', '5'::jsonb)
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

-- Softwares permanecem em config.valor (JSONB), na chave "produtos".
-- Produtos físicos ficam em produtos_cj e os pedidos guardam snapshots em itens_pedido.
