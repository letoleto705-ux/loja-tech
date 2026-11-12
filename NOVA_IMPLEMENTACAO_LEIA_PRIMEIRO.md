# NOVA IMPLEMENTAÇÃO — 12/11/2026

## Origem
Pacote integral baseado em `Loja_Tech_Visual_Azul_Banner_Categorias_Mobile.zip` disponível nesta conversa, não necessariamente na versão mais recente do repositório GitHub. **Compare `git diff` com o código atual antes de substituir arquivos.**

## Entregue
- `public/index.html`: botões Status da Compra (desktop/mobile), edição do custo do fornecedor por produto, categoria do produto, atalho administrativo.
- `public/status_compra.html`: consulta privada por token do checkout, produtos, pagamento, entrega, histórico e download.
- `public/checkout_sacola.html`: link para status e chave do pedido mantida na sessão.
- `public/admin_operacoes.html`: gestão restrita de fornecedores, registro manual de repasse, categorias, prazo e rastreamento.
- `public/afiliado.html`: card vermelho exclusivo da visão administrativa, valor de fornecedores pendentes.
- `server.js`: endpoints de acompanhamento, administração e migração automática das tabelas; endpoint público de produtos não retorna `custo` nem `pdf`; download exige nova validação do Mercado Pago.

## Regra financeira importante
O código-base **já calcula a comissão central sobre o valor da venda menos o custo congelado do fornecedor**, e depois subtrai as comissões de afiliados. Portanto o card verde **não pode descontar o custo novamente**. O card vermelho é um destaque informativo do custo devido ao fornecedor. Vendas antigas devem ser auditadas caso os custos históricos não tenham sido registrados corretamente. Valores da captura de tela não foram recalculados sem acesso ao Neon.

## Limitações e pendências para produção
- Sem credenciais do Neon/Mercado Pago, não foi possível testar pagamentos reais, estornos, execução das migrações no banco nem deploy Render.
- Os links `pdf` existentes são URLs públicas externas: uma vez revelados após a validação, não podem ser revogados. Para revogação real, migrar para armazenamento privado com links assinados de curta duração.
- O prazo é configurado em **dias corridos**, estimado a partir da criação do pedido; frete é exibido como zero porque a base atual não implementa cálculo real de transportadora. Não há integração de eventos em tempo real dos Correios.
- A página de status usa chave temporária de pedido no `sessionStorage`, emitida no checkout. Não há recuperação de pedidos por conta autenticada em outro dispositivo; isso exige um fluxo de autenticação de pedidos adicional.
- Os registros de repasse a fornecedores são administrativos; não transferem dinheiro automaticamente.
- O cadastro de categorias não associa/exclui produtos automaticamente; o administrador atribui a categoria no formulário de cada produto.
- **Atenção ao HTML antigo:** se a vitrine dependia de dados confidenciais de `/api/produtos`, teste os fluxos; o novo endpoint oculta `custo` e `pdf` por privacidade.

## Verificação local
`npm run check` passou: sintaxe do servidor e verificações estáticas de HTML. Nenhuma afirmação de homologação financeira é feita.

## Deploy
1. Faça backup do projeto atual e compare com esta versão.
2. Revise especialmente `server.js`, `public/index.html`, `public/checkout_sacola.html`, `public/afiliado.html`.
3. Rode `npm install` e `npm run check`.
4. Faça deploy de homologação com Neon de testes; a inicialização executa migrações incrementais.
5. Teste Pix, cartões, afiliados, repasses, cancelamentos, downloads, frete e sessão antes de publicar.
