# Loja Tech + Checkouts + Área do Afiliado + Tech Payments (Neon + Render)

```
loja-tech/
├── package.json
├── server.js              (API + banco: toda a regra de comissão fica aqui)
└── public/
    ├── index.html         (Loja Tech: tela de entrada + catálogo)
    ├── afiliado.html      (Área do Afiliado: abre pelo botão "Área do Afiliado" da loja)
    ├── check_lite.html    (Checkout Lite)
    ├── check_pro.html     (Checkout Pro)
    ├── check_plus.html    (Checkout Plus)
    └── pagamento.html     (Tech Payments: pedidos e pagamentos aos afiliados)
```

O Render serve todas as páginas e a API no mesmo endereço, então não há CORS nem URL para configurar. Tudo usa o **mesmo login** e o **mesmo banco (Neon)**.

## 1. Neon (banco)
Copie a **connection string** do seu projeto (`postgresql://...`). Não precisa criar tabelas: o servidor cria sozinho na primeira inicialização.

## 2. GitHub
Crie um repositório e envie **o conteúdo da pasta `loja-tech`** (com `package.json` e `server.js` na raiz do repositório).

## 3. Render (Web Service)
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Variáveis de ambiente:**

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a connection string do Neon |
| `JWT_SECRET` | um texto longo e aleatório (40+ caracteres) |
| `ADMIN_SENHA` | a senha do administrador |
| `ADMIN_USUARIO` | (opcional) padrão é `admin` |
| `MERCADO_PAGO_ACCESS_TOKEN` | token privado de produção ou teste da aplicação Mercado Pago |
| `MERCADO_PAGO_PUBLIC_KEY` | chave pública da mesma aplicação, usada pelo formulário seguro de cartão |
| `MERCADO_PAGO_WEBHOOK_URL` | (recomendado) URL pública `https://seu-dominio/api/webhook/mercadopago` |

No plano gratuito o Render "dorme" sem uso; o primeiro acesso depois disso demora alguns segundos (as páginas avisam enquanto carregam).

Configure no painel Mercado Pago o webhook de pagamentos para apontar para `MERCADO_PAGO_WEBHOOK_URL`. O servidor consulta a API do Mercado Pago e confere o pedido e o valor antes de atualizar o status; a mesma verificação também é feita durante a consulta de status da página.

## 4. A dinâmica de comissões (o "patriarca")
**O administrador é o topo da rede: não tem pai, e todo mundo está abaixo dele.**

- **1ª geração:** quem entra direto pelo link da Central.
- **2ª geração:** quem entra pelo link de um afiliado da 1ª geração. **3ª geração:** quem entra pelo link de alguém da 2ª, e assim por diante.

Só existem **duas porcentagens**, que você define na loja: entre como administrador → **Gerência de Afiliados** → "Regra Geral de Comissões". Valores iniciais: **50%** e **15%**.

| Quem | Ganha | Sobre |
|---|---|---|
| **Quem vendeu** | 50% (comissão direta) | o preço do produto |
| **O pai de quem vendeu** (patrocinador direto) | 15% | o preço do produto vendido pelo filho |
| **A Central (administrador)** | **todo o resto** | o preço do produto, em qualquer geração |

- Só o patrocinador **direto** ganha os 15%. Avô, bisavô etc. não ganham nada. O filho não ganha nada sobre o pai.
- Não existe uma porcentagem para a Central: ela fica com o que sobra. Em venda de afiliado que tem pai: 50% + 15% = 65% saem, **35% ficam com a Central**. Em venda de afiliado da 1ª geração (sem pai afiliado): 50% sai, **50% fica com a Central**. Venda sem afiliado: 100% da Central.
- A soma das duas porcentagens não pode passar de 100%. Mudar uma taxa vale só para as vendas confirmadas dali em diante.
- As comissões são gravadas **quando o Mercado Pago confirma a aprovação** (ou quando um pedido antigo/manual é confirmado pelo administrador), e os totais de cada afiliado são somados dos pedidos pagos.

Exemplo (venda de R$ 49,99 pela Neyza, indicada pelo Roll): Neyza R$ 25,00 · Roll R$ 7,50 · Central R$ 17,49.

## 5. Área do Afiliado (`afiliado.html`)
O botão **Área do Afiliado** da loja abre essa página.
- **Afiliado:** vê as suas vendas, a comissão direta, a comissão de rede (os 15% dos filhos), o total a receber, os seus dois links e **somente os indicados diretos** (quantas vendas fizeram e quanto você ganhou sobre eles).
- **Administrador:** vê **toda a rede, de todas as gerações**, com o patrocinador de cada um, as vendas, as comissões e quanto sobra para a Central, mais o total a distribuir.
- **Link 1 (vendas):** `index.html?ref=admin&afiliado=SEU_USUARIO`. **Link 2 (cadastrar na sua rede):** `afiliado.html?cad=SEU_USUARIO`: quem se cadastra por ele já entra como afiliado, filho de quem convidou.

## 6. Tela de entrada
A primeira tela da loja tem o **login à esquerda** (usuário e senha, ou "Crie sua conta de cliente", que pede nome, e-mail, CPF, Pix e telefone) e a **mensagem de boas-vindas à direita**, explicando em 3 passos como entrar, criar conta e se afiliar. Serve igual para administrador, afiliado e cliente.

## 7. Suporte e recuperação de senha
**Telefone no cadastro:** todo cadastro (cliente ou afiliado) agora pede um **telefone / WhatsApp de contato com DDD**. Ele aparece no painel do administrador, junto com e-mail e CPF.

**Botão de suporte:** no Tech Payments, seção "Suporte: Contas e Senha Temporária", cadastre o **WhatsApp do suporte**. A loja passa a mostrar o botão verde "Suporte" (e o link "Esqueceu a senha? Fale com o suporte" na tela de entrada).

**Cliente esqueceu a senha** (a senha é guardada criptografada: ninguém, nem você, consegue ler a original):
1. O cliente chama o suporte pelo botão do WhatsApp.
2. **Confirme a identidade** dele (CPF, e-mail e telefone do cadastro).
3. No Tech Payments, busque a conta (por nome, usuário, e-mail, CPF ou telefone) e clique em **Gerar senha temporária**. A senha aparece uma única vez, com um botão que abre o WhatsApp **do telefone cadastrado** já com a mensagem pronta.
4. O cliente entra com a senha temporária e o sistema o **obriga a criar uma senha nova** antes de qualquer outra coisa. A senha temporária vale 24 horas, e a senha antiga deixa de funcionar na hora.

**Regra de ouro:** envie a senha temporária **somente para o telefone cadastrado**, nunca para um número novo informado na conversa. Se a conta não tem telefone, o painel avisa.

**Senha do administrador:** fica na variável `ADMIN_SENHA` do Render. Se esquecer, mude o valor lá e reinicie o serviço.

**Dados pessoais (LGPD):** CPF, e-mail e telefone são dados protegidos. Use-os só para venda, contato e pagamento de comissões, e proteja o acesso ao seu painel do Neon e do Render.

## 8. Como funciona a venda
1. O cliente entra pelo link do afiliado, escolhe o produto e vai para o checkout.
2. No checkout preenche nome, e-mail e CPF e escolhe a forma de pagamento. O servidor registra um pedido **aguardando pagamento** (preço sempre vindo do catálogo do servidor). **Nenhuma comissão é gerada aqui.**
3. **Pix:** o Mercado Pago gera o QR Code e o código Copia e Cola na própria página. **Cartão e débito:** o formulário seguro do Mercado Pago tokeniza os dados no navegador; somente o token é enviado ao servidor, que cria a cobrança.
4. A página consulta o status a cada cinco segundos. O webhook e a consulta de status confirmam a cobrança com o Mercado Pago; só uma cobrança aprovada marca o pedido como pago, gera comissões e libera o download automaticamente.

O **Tech Payments** (`pagamento.html`) continua permitindo cancelar pedidos sem pagamento e estornar pedidos pagos. Não use a confirmação manual para pedidos pagos pelo Mercado Pago.

Proteções: o afiliado só ganha se existir; se o CPF ou e-mail do comprador for igual ao do afiliado (auto-indicação), a venda vira venda direta; confirmar o mesmo pedido duas vezes não duplica nada.

## 9. Primeiro uso e teste
1. Configure as chaves de acesso e pública do Mercado Pago no Render e o webhook na aplicação Mercado Pago.
2. Em Gerência de Afiliados, confira as duas porcentagens (50 e 15).
3. Teste ponta a ponta (janelas anônimas):
   1. **Roll:** abra `afiliado.html?cad=admin`, crie a conta `roll` (já entra como afiliado, 1ª geração).
   2. **Neyza:** abra o Link 2 do Roll (`afiliado.html?cad=roll`) e crie a conta `neyza` (2ª geração).
   3. **Cliente:** abra o Link 1 da Neyza, compre um produto e finalize o checkout pelo Pix ou cartão.
   4. Faça um pagamento de teste e aguarde a aprovação no Mercado Pago; a página deve atualizar o status e liberar o produto automaticamente.

## Observações
- Senhas são guardadas com hash (bcrypt); a senha do administrador fica só nas variáveis do Render. O cadastro exige senha de pelo menos 6 caracteres.
- Os dados antigos do `localStorage` (inclusive o antigo banco do `afiliado.html`) não são migrados: refaça os cadastros no sistema novo.
- Use as credenciais de teste do Mercado Pago antes de trocar para as credenciais de produção.
