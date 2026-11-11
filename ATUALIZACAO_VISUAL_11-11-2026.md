# Atualização visual Tech Store — 11/11/2026

Esta versão parte do ZIP Loja_Tech_Atualizada_Implementacoes.zip fornecido nesta conversa.

## Alterações realizadas
- `public/index.html`: vitrine com banner azul Tech Store, navegação lateral de categorias, filtro de categorias, cartões responsivos, identidade azul na área pública e ícone da sacola com contador sempre visível no cabeçalho mobile.
- `public/assets/tech-store-banner.jpg`: imagem de referência recortada de um quadro do vídeo enviado. Como não foi possível baixar os arquivos originais dos dois links i.ibb.co, esta imagem é uma reprodução da captura de tela, não o arquivo original em alta definição. Para substituí-la, use o mesmo nome e caminho.
- Categorias: quando o cadastro do produto tem `categoria` ou `category`, usa esse valor; caso contrário, classifica por palavras-chave no nome/descrição. A opção "Todos" sempre mostra o catálogo completo. O filtro não altera os índices originais usados no fluxo de compra.

## Preservado intencionalmente
- `server.js`, banco Neon, rotas, comissões, níveis de afiliados, regras de pedido, webhook Mercado Pago, PIX, cartões, `checkout_sacola.html`, `afiliado.html`, `pagamento.html` e demais arquivos do projeto original. Nenhuma alteração no banco de dados.

## Verificação
- `npm run check` executado sem erros de sintaxe.
- NÃO foram testados pagamentos reais, webhooks, comissões reais, persistência Neon, nem o funcionamento em dispositivos reais. Esses testes continuam necessários antes da publicação.

## Instalação
Faça backup da pasta atual e extraia o ZIP completo. Configure as variáveis de ambiente como antes. Para o servidor Node use o comando de execução do seu projeto. Live Server, isoladamente, não executa as rotas de backend.
