# Atualizações desta versão

- Checkout unificado aceita escolha Pix, cartão de crédito e tentativa de cartão de débito via Card Payment Brick do Mercado Pago.
- O backend recebe token de cartão, identificador de método, emissor e parcelas (1 a 12 para crédito; 1 para débito). Nunca recebe PAN ou CVV.
- Parcelamento e juros são apresentados pelo SDK do Mercado Pago; não são simulados localmente.
- Custo de aquisição de cada item é congelado no banco (`pedido_itens.custo_unitario`, `pedido_itens.custo_total`, `pedidos.custo_total`).
- Comissões são calculadas sobre `max(0, valor efetivamente pago - custo_total)`, apenas para vendedor, patrocinador imediato e patrocinador do patrocinador. Percentuais padrão em novas instalações: 30%, 10%, 10%; saldo permanece na central.
- Se o banco já tem taxas cadastradas, elas NÃO são substituídas automaticamente. Ajuste no painel administrativo para 30/10/10 se desejado.
- A sacola não é apagada ao apenas criar o pedido; o pagamento Pix é acompanhado por consulta de status.

## Antes de produção

1. Configurar `DATABASE_URL`, `JWT_SECRET`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY` e demais variáveis exigidas pelo servidor.
2. Conferir custos de aquisição cadastrados em todos os produtos; custos ausentes não podem ser considerados lucro real.
3. Validar em conta Mercado Pago habilitada a disponibilidade de cartão de débito, as bandeiras aceitas, as parcelas e juros. O Brick depende das condições da conta, e a seleção visual de débito não é uma garantia de que o método oferecido seja débito.
4. Testar pagamentos reais ou sandbox (Pix, crédito, débito), webhooks, estornos, conciliação, cupons, concorrência e antifraude antes de liberar vendas.
5. Revisar a chave de idempotência por tentativa: esta versão mantém a chave por pedido e impede nova tentativa quando um payment_id já foi registrado; recuperação de pagamentos rejeitados exige fluxo próprio.
6. Esta entrega passou por validação sintática local, não por testes de integração com Neon ou Mercado Pago. Não declarar homologação de produção.

## Nota de compatibilidade

Pedidos antigos sem custo histórico têm `custo_total` igual a zero por padrão. Não recalcule comissões antigas com essa informação; a base histórica precisa ser recuperada de registros contábeis reais.
