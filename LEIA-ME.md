# Loja Tech — versão reconstruída com checkout unificado

Esta versão parte dos arquivos originais enviados e da integração anterior da sacola. Ela mantém o backend Node/Express, o catálogo JSONB existente no Neon, as tabelas existentes e o fluxo Mercado Pago já presente no projeto. A migração é aditiva e idempotente; não cria uma nova conta ou um novo banco Neon.

## Estrutura

- `server.js`: API, autenticação, Neon, pedidos, Mercado Pago, webhook e comissões.
- `public/index.html`: vitrine; botão de compra adiciona à sacola unificada.
- `public/checkout_sacola.html`: carrinho, dados do comprador, pedido e Pix.
- `public/afiliado.html`: painel e geração de links de indicação.
- `public/pagamento.html`: página de pagamento já existente.
- `public/responsive.css`: folha compartilhada que faltava nos arquivos recebidos.
- `database/migration_checkout_unificado.sql`: extensão de esquema para itens do pedido.
- `.env.example`: nomes das variáveis necessárias, sem segredos reais.

## O que foi implementado nesta revisão

1. Checkout único de vários produtos: a API recebe `itens`, valida os IDs, quantidades, preços no servidor e cria um único pedido e um único pagamento Pix.
2. Neon como fonte de verdade: pedidos e linhas de pedido são persistidos; o catálogo continua na chave `config.produtos` já usada pelo projeto. A migração adiciona `pedido_itens` e campos de endereço/telefone sem apagar dados existentes.
3. Indicação compatível: a vitrine e o checkout aceitam `afiliado`, `afiliado_ref` e o formato legado `ref=CODIGO` (exceto `ref=admin`). Os links novos do painel preservam os parâmetros compatíveis. A API valida o usuário afiliado no banco antes de atribuir a venda.
4. Comissões por pedido: a confirmação é protegida por transação e bloqueio da linha do pedido. A comissão é calculada sobre o total do pedido, uma vez, e a venda aprovada registra um único `payment_id`; itens ficam discriminados em `pedido_itens`.
5. Liquidação mensal: a apuração agora seleciona somente pedidos pagos no mês-calendário imediatamente anterior e impede liquidação antes do quinto dia útil do mês corrente. Mantém as taxas já configuradas no banco e o mínimo de saque existente. O calendário considera fins de semana e feriados nacionais/móveis já definidos no código; feriados bancários/municipais adicionais precisam ser configurados conforme a praça de operação.
6. Pagamento e entrega: o pedido é criado antes do pagamento; Mercado Pago recebe o total único com chave de idempotência; confirmação permanece vinculada ao pedido e ao `payment_id`; downloads de cada item são liberados apenas após aprovação.

## Implantação no Render

1. Faça backup do Neon antes de publicar qualquer alteração.
2. Envie o conteúdo desta pasta para o repositório conectado ao Render, mantendo a estrutura de diretórios.
3. Configure no Render as variáveis já utilizadas pela sua instalação: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_SENHA`, `MERCADO_PAGO_ACCESS_TOKEN` e `PORT` (o Render fornece `PORT`). Não cole segredos em arquivos públicos ou neste README.
4. O `server.js` executa as alterações aditivas de esquema ao iniciar. O SQL em `database/migration_checkout_unificado.sql` também pode ser executado manualmente no Neon se preferir controlar a migração.
5. Configure no painel do Mercado Pago a URL pública de webhook para `https://SEU-DOMINIO/api/webhook/mercadopago`. Use o domínio real do serviço e confirme no painel do Mercado Pago quais eventos de pagamento estão habilitados.
6. Confirme que cada produto digital possui um link HTTPS válido no campo `pdf` do catálogo salvo em `config.produtos`. O link precisa estar acessível para o comprador autorizado.
7. Faça deploy e valide primeiro com credenciais de teste/sandbox do Mercado Pago e uma cópia de staging do banco. Só depois troque para as credenciais de produção.

## Variáveis de ambiente

Consulte `.env.example`. Não substitua `DATABASE_URL` por outro banco: use a conexão Neon já existente. Não reutilize nem compartilhe tokens em chats, commits ou arquivos servidos ao público.

## Regras e observações importantes

- O carrinho no navegador usa `localStorage` (`tech_sacola_geral`). Ele é compartilhado entre páginas no mesmo navegador/dispositivo, mas não é um carrinho sincronizado entre dispositivos nem entre navegadores. Pedidos e pagamentos são persistidos no Neon. Sincronização de carrinho autenticado entre dispositivos exige uma funcionalidade adicional de carrinho por usuário.
- Os produtos presentes no catálogo inicial são licenças/arquivos digitais. O checkout não calcula frete, não integra transportadoras e não gera etiqueta de envio para mercadorias físicas. Não publique produtos físicos até implementar e testar cotação, cobrança e logística.
- A entrega digital utiliza URLs configuradas no campo `pdf`. O armazenamento/expiração/controle de acesso do próprio arquivo depende do provedor dessa URL.
- As comissões preservam as taxas configuradas no Neon. Os valores padrão existentes no código são apenas fallback quando não há configuração persistida; não altere as taxas sem conferir o painel e o banco.
- O sistema registra aprovação e comissões no nível do pedido, não em cada linha de produto. Isso evita multiplicar comissão em compras com vários itens.
- A liquidação marca as comissões do período como pagas no banco. A transferência bancária/Pix efetiva ao afiliado continua sendo uma operação financeira externa e deve ser conciliada pelo administrador; o endpoint não movimenta dinheiro automaticamente.
- A função de quinto dia útil contempla fins de semana e feriados nacionais/móveis codificados. Feriados estaduais, municipais e calendários bancários excepcionais podem alterar a data e devem ser revistos antes do primeiro ciclo real.

## Testes executados nesta entrega

O arquivo `VALIDACAO.txt` registra os testes estáticos executados. Verificações de sintaxe e consistência local não equivalem a teste real de integração: esta sessão não tem acesso às suas variáveis privadas, ao banco Neon de produção nem à conta Mercado Pago. Portanto, não é correto afirmar que um pagamento real, webhook externo, e-mail ou entrega foi testado em produção.
