-- Loja Tech: extensão idempotente para pedidos com vários produtos.
-- O server.js também aplica estas estruturas automaticamente ao iniciar.
CREATE TABLE IF NOT EXISTS pedido_itens (
  id bigserial PRIMARY KEY,
  pedido_id text NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id text NOT NULL,
  produto_nome text NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  preco_unitario numeric(12,2) NOT NULL CHECK (preco_unitario >= 0),
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  imagem text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pedido_itens_pedido_idx ON pedido_itens(pedido_id);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_telefone text NOT NULL DEFAULT '';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS endereco_entrega jsonb NOT NULL DEFAULT '{}'::jsonb;
