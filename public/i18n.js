(function () {
    'use strict';

    const IDIOMA_PADRAO = 'pt-BR';
    const idiomas = ['pt-BR', 'en', 'es', 'zh', 'it', 'fr'];
    const rotulos = {
        'pt-BR': 'Português', en: 'English', es: 'Español',
        zh: '中文', it: 'Italiano', fr: 'Français'
    };
    const frases = [
        ['Idioma', 'Language', 'Idioma', '语言', 'Lingua', 'Langue'],
        ['Área do Afiliado - Tech Software', 'Affiliate Area - Tech Software', 'Área de afiliados - Tech Software', '联盟伙伴专区 - Tech Software', 'Area affiliati - Tech Software', 'Espace affilié - Tech Software'],
        ['Página de Pagamentos - Relatório Financeiro de Afiliados', 'Payments - Affiliate Financial Report', 'Pagos - Informe financiero de afiliados', '付款 - 联盟伙伴财务报告', 'Pagamenti - Report finanziario affiliati', 'Paiements - Rapport financier des affiliés'],
        ['Checkout - CMV Food Lite | Tech Software', 'Checkout - CMV Food Lite | Tech Software', 'Pago - CMV Food Lite | Tech Software', '结账 - CMV Food Lite | Tech Software', 'Checkout - CMV Food Lite | Tech Software', 'Paiement - CMV Food Lite | Tech Software'],
        ['Checkout - CMV Food Plus | Tech Software', 'Checkout - CMV Food Plus | Tech Software', 'Pago - CMV Food Plus | Tech Software', '结账 - CMV Food Plus | Tech Software', 'Checkout - CMV Food Plus | Tech Software', 'Paiement - CMV Food Plus | Tech Software'],
        ['Checkout - CMV Food Pro | Tech Software', 'Checkout - CMV Food Pro | Tech Software', 'Pago - CMV Food Pro | Tech Software', '结账 - CMV Food Pro | Tech Software', 'Checkout - CMV Food Pro | Tech Software', 'Paiement - CMV Food Pro | Tech Software'],
        ['Checkout Lite Oficial', 'Official Lite Checkout', 'Checkout Lite oficial', 'Lite 官方结账', 'Checkout Lite ufficiale', 'Paiement Lite officiel'],
        ['Checkout Plus Oficial', 'Official Plus Checkout', 'Checkout Plus oficial', 'Plus 官方结账', 'Checkout Plus ufficiale', 'Paiement Plus officiel'],
        ['Checkout Pro Oficial', 'Official Pro Checkout', 'Checkout Pro oficial', 'Pro 官方结账', 'Checkout Pro ufficiale', 'Paiement Pro officiel'],
        ['Ambiente Seguro & Criptografado', 'Secure & Encrypted Environment', 'Entorno seguro y cifrado', '安全加密环境', 'Ambiente sicuro e crittografato', 'Environnement sécurisé et chiffré'],
        ['Tech - Sistema de Gestão para o Seu Negócio', 'Tech - Business Management System for Your Business', 'Tech - Sistema de gestión para tu negocio', 'Tech - 您的业务管理系统', 'Tech - Sistema di gestione per la tua attività', 'Tech - Système de gestion pour votre entreprise'],
        ['Voltar à Loja', 'Back to Store', 'Volver a la tienda', '返回商店', 'Torna al negozio', 'Retour à la boutique'],
        ['Sair da Conta', 'Sign Out', 'Cerrar sesión', '退出账户', 'Esci dall’account', 'Se déconnecter'],
        ['Painel do Afiliado Oficial', 'Official Affiliate Dashboard', 'Panel oficial de afiliados', '官方联盟伙伴面板', 'Pannello affiliati ufficiale', 'Espace affilié officiel'],
        ['Portal do Afiliado', 'Affiliate Portal', 'Portal de afiliados', '联盟伙伴门户', 'Portale affiliati', 'Portail affilié'],
        ['Acessar Área do Afiliado', 'Access Affiliate Area', 'Acceder al área de afiliados', '访问联盟伙伴专区', 'Accedi all’area affiliati', 'Accéder à l’espace affilié'],
        ['Entre com seu apelido e senha para visualizar sua rede e comissões.', 'Sign in with your username and password to view your network and commissions.', 'Inicia sesión con tu usuario y contraseña para ver tu red y comisiones.', '使用用户名和密码登录以查看您的网络和佣金。', 'Accedi con nome utente e password per visualizzare la rete e le commissioni.', 'Connectez-vous avec votre identifiant et votre mot de passe pour consulter votre réseau et vos commissions.'],
        ['Patrocinador (Pai) Detectado:', 'Sponsor (Parent) Detected:', 'Patrocinador (padre) detectado:', '已检测到推荐人（上级）：', 'Sponsor (genitore) rilevato:', 'Parrain (parent) détecté :'],
        ['Nome Completo', 'Full Name', 'Nombre completo', '姓名', 'Nome completo', 'Nom complet'],
        ['Telefone / WhatsApp (com DDD)', 'Phone / WhatsApp (with area code)', 'Teléfono / WhatsApp (con código de área)', '电话 / WhatsApp（含区号）', 'Telefono / WhatsApp (con prefisso)', 'Téléphone / WhatsApp (avec indicatif)'],
        ['Chave Pix', 'Pix Key', 'Clave Pix', 'Pix 密钥', 'Chiave Pix', 'Clé Pix'],
        ['Chave Pix para receber a comissão', 'Pix key to receive commissions', 'Clave Pix para recibir comisiones', '用于接收佣金的 Pix 密钥', 'Chiave Pix per ricevere le commissioni', 'Clé Pix pour recevoir les commissions'],
        ['Seu Apelido / Usuário', 'Username / Nickname', 'Tu usuario / apodo', '用户名 / 昵称', 'Nome utente / Nickname', 'Identifiant / Pseudo'],
        ['Senha', 'Password', 'Contraseña', '密码', 'Password', 'Mot de passe'],
        ['Entrar no Painel', 'Sign In to Dashboard', 'Entrar al panel', '登录面板', 'Accedi al pannello', 'Se connecter au tableau de bord'],
        ['Ainda não tem conta? Crie sua Conta aqui', 'Don’t have an account? Create one here', '¿Aún no tienes cuenta? Créala aquí', '还没有账户？在此创建', 'Non hai ancora un account? Crealo qui', 'Vous n’avez pas de compte ? Créez-le ici'],
        ['Esqueceu a senha?', 'Forgot your password?', '¿Olvidaste tu contraseña?', '忘记密码？', 'Password dimenticata?', 'Mot de passe oublié ?'],
        ['Fale com o suporte', 'Contact Support', 'Contactar con soporte', '联系支持', 'Contatta il supporto', 'Contacter le support'],
        ['Entre em contato com o suporte da loja.', 'Contact the store support team.', 'Ponte en contacto con el soporte de la tienda.', '请联系商店客服。', 'Contatta il supporto del negozio.', 'Contactez le support de la boutique.'],
        ['Carregando seu painel... (o servidor pode demorar alguns segundos para acordar)', 'Loading your dashboard... (the server may take a few seconds to wake up)', 'Cargando tu panel... (el servidor puede tardar unos segundos en iniciarse)', '正在加载面板……（服务器启动可能需要几秒钟）', 'Caricamento del pannello... (il server potrebbe impiegare alcuni secondi ad avviarsi)', 'Chargement du tableau de bord... (le serveur peut prendre quelques secondes à démarrer)'],
        ['Olá,', 'Hello,', 'Hola,', '您好，', 'Ciao,', 'Bonjour,'],
        ['Acompanhe o desempenho da sua rede de indicados (filhos).', 'Track the performance of your referral network.', 'Sigue el rendimiento de tu red de referidos.', '查看您的推荐网络表现。', 'Monitora le prestazioni della tua rete di referral.', 'Suivez les performances de votre réseau de filleuls.'],
        ['Identificador Único:', 'Unique Identifier:', 'Identificador único:', '唯一标识符：', 'Identificatore univoco:', 'Identifiant unique :'],
        ['Campanha de cupons ativa!', 'Coupon campaign is active!', '¡La campaña de cupones está activa!', '优惠券活动已开启！', 'La campagna coupon è attiva!', 'La campagne de coupons est active !'],
        ['Você pode criar seu cupom de desconto de até', 'You can create a discount coupon of up to', 'Puedes crear un cupón de descuento de hasta', '您可以创建最高折扣为以下比例的优惠券：', 'Puoi creare un coupon sconto fino al', 'Vous pouvez créer un coupon de réduction jusqu’à'],
        ['Válido até', 'Valid until', 'Válido hasta', '有效期至', 'Valido fino al', 'Valide jusqu’au'],
        ['venda(s)', 'sale(s)', 'venta(s)', '笔销售', 'vendita(e)', 'vente(s)'],
        ['parceiro(s) na sua rede', 'partner(s) in your network', 'socio(s) en tu red', '位网络伙伴', 'partner nella tua rete', 'partenaire(s) dans votre réseau'],
        ['Parceiro(s)', 'Partner(s)', 'Socio(s)', '位伙伴', 'Partner', 'Partenaire(s)'],
        ['Nome do comunicado', 'Announcement title', 'Título del aviso', '公告标题', 'Titolo del comunicato', 'Titre de l’annonce'],
        ['Título do comunicado', 'Announcement title', 'Título del aviso', '公告标题', 'Titolo del comunicato', 'Titre de l’annonce'],
        ['Mensagem para os afiliados...', 'Message for affiliates...', 'Mensaje para los afiliados...', '给联盟伙伴的消息……', 'Messaggio per gli affiliati...', 'Message pour les affiliés...'],
        ['O comunicado será exibido nos painéis dos afiliados. Use {nome} ou {primeiro_nome} para personalizar.', 'The announcement will appear on affiliate dashboards. Use {nome} or {primeiro_nome} to personalize it.', 'El aviso aparecerá en los paneles de afiliados. Usa {nome} o {primeiro_nome} para personalizarlo.', '公告将显示在联盟伙伴面板中。使用 {nome} 或 {primeiro_nome} 进行个性化。', 'Il comunicato apparirà nei pannelli affiliati. Usa {nome} o {primeiro_nome} per personalizzarlo.', 'L’annonce s’affichera dans les tableaux de bord des affiliés. Utilisez {nome} ou {primeiro_nome} pour la personnaliser.'],
        ['Seu cupom de desconto', 'Your Discount Coupon', 'Tu cupón de descuento', '您的折扣券', 'Il tuo coupon sconto', 'Votre coupon de réduction'],
        ['Salvar / Atualizar cupom', 'Save / Update Coupon', 'Guardar / Actualizar cupón', '保存 / 更新优惠券', 'Salva / Aggiorna coupon', 'Enregistrer / Mettre à jour le coupon'],
        ['Vendas Diretas', 'Direct Sales', 'Ventas directas', '直接销售', 'Vendite dirette', 'Ventes directes'],
        ['Comissão de Rede (Filhos)', 'Network Commission (Referrals)', 'Comisión de red (referidos)', '网络佣金（下级）', 'Commissioni rete (referral)', 'Commission réseau (filleuls)'],
        ['Total a Receber', 'Total Due', 'Total a recibir', '应收总额', 'Totale da ricevere', 'Total à recevoir'],
        ['Repasse via Pix', 'Paid via Pix', 'Pago por Pix', '通过 Pix 转账', 'Pagamento tramite Pix', 'Paiement via Pix'],
        ['Seus Links Exclusivos', 'Your Exclusive Links', 'Tus enlaces exclusivos', '您的专属链接', 'I tuoi link esclusivi', 'Vos liens exclusifs'],
        ['1. Link para Venda de Softwares', '1. Software Sales Link', '1. Enlace para vender software', '1. 软件销售链接', '1. Link per la vendita di software', '1. Lien de vente des logiciels'],
        ['2. Link para Cadastrar na sua Rede (Filhos)', '2. Link to Join Your Network (Referrals)', '2. Enlace para unirse a tu red (referidos)', '2. 加入您的网络链接（下级）', '2. Link per iscriversi alla tua rete (referral)', '2. Lien d’inscription à votre réseau (filleuls)'],
        ['Minha Rede de Indicados Diretos (Filhos)', 'My Direct Referral Network', 'Mi red de referidos directos', '我的直接推荐网络', 'La mia rete di referral diretti', 'Mon réseau de filleuls directs'],
        ['Copiar', 'Copy', 'Copiar', '复制', 'Copia', 'Copier'],
        ['Suporte', 'Support', 'Soporte', '支持', 'Supporto', 'Assistance'],
        ['Defina sua nova senha', 'Set Your New Password', 'Establece tu nueva contraseña', '设置新密码', 'Imposta la nuova password', 'Définissez votre nouveau mot de passe'],
        ['Nova senha (mínimo 6 caracteres)', 'New password (at least 6 characters)', 'Nueva contraseña (mínimo 6 caracteres)', '新密码（至少 6 个字符）', 'Nuova password (almeno 6 caratteri)', 'Nouveau mot de passe (6 caractères minimum)'],
        ['Repita a nova senha', 'Repeat the new password', 'Repite la nueva contraseña', '请再次输入新密码', 'Ripeti la nuova password', 'Répétez le nouveau mot de passe'],
        ['Salvar nova senha e entrar', 'Save New Password and Sign In', 'Guardar nueva contraseña e iniciar sesión', '保存新密码并登录', 'Salva la nuova password e accedi', 'Enregistrer le nouveau mot de passe et se connecter'],
        ['Cancelar', 'Cancel', 'Cancelar', '取消', 'Annulla', 'Annuler'],
        ['Gerenciamento de Cupons de Afiliados', 'Affiliate Coupon Management', 'Gestión de cupones de afiliados', '联盟优惠券管理', 'Gestione coupon affiliati', 'Gestion des coupons affiliés'],
        ['Defina a campanha global e aprove os códigos cadastrados pelos afiliados.', 'Set the global campaign and approve codes submitted by affiliates.', 'Configura la campaña global y aprueba los códigos enviados por afiliados.', '设置全局活动并批准联盟伙伴提交的代码。', 'Imposta la campagna globale e approva i codici inviati dagli affiliati.', 'Configurez la campagne globale et approuvez les codes soumis par les affiliés.'],
        ['Campanha de cupons ativa para afiliados', 'Coupon campaign active for affiliates', 'Campaña de cupones activa para afiliados', '联盟优惠券活动已启用', 'Campagna coupon attiva per gli affiliati', 'Campagne de coupons active pour les affiliés'],
        ['Desconto máximo (%)', 'Maximum discount (%)', 'Descuento máximo (%)', '最高折扣（%）', 'Sconto massimo (%)', 'Remise maximale (%)'],
        ['Salvar regra', 'Save Rule', 'Guardar regla', '保存规则', 'Salva regola', 'Enregistrer la règle'],
        ['Comunicação e Campanhas', 'Communications and Campaigns', 'Comunicaciones y campañas', '通知与活动', 'Comunicazioni e campagne', 'Communications et campagnes'],
        ['Publicar Comunicado para Todos os Afiliados', 'Publish Announcement to All Affiliates', 'Publicar aviso para todos los afiliados', '向所有联盟伙伴发布公告', 'Pubblica comunicato a tutti gli affiliati', 'Publier une annonce à tous les affiliés'],
        ['Painel Gerencial Restrito', 'Restricted Management Dashboard', 'Panel de gestión restringido', '受限管理面板', 'Pannello di gestione riservato', 'Tableau de gestion réservé'],
        ['Relatório de Pagamentos Pix', 'Pix Payment Report', 'Informe de pagos Pix', 'Pix 付款报告', 'Report pagamenti Pix', 'Rapport des paiements Pix'],
        ['Consulte os saldos calculados automaticamente e gerencie os cadastros da rede unificada.', 'Review automatically calculated balances and manage the unified network accounts.', 'Consulta los saldos calculados automáticamente y gestiona las cuentas de la red unificada.', '查看自动计算的余额并管理统一网络账户。', 'Consulta i saldi calcolati automaticamente e gestisci gli account della rete unificata.', 'Consultez les soldes calculés automatiquement et gérez les comptes du réseau unifié.'],
        ['Total Geral a Distribuir', 'Total to Distribute', 'Total general a distribuir', '待分配总额', 'Totale generale da distribuire', 'Total général à distribuer'],
        ['Fechamento do ciclo de afiliados', 'Affiliate Cycle Settlement', 'Cierre del ciclo de afiliados', '联盟周期结算', 'Chiusura ciclo affiliati', 'Clôture du cycle affilié'],
        ['Processar Fechamento de Ciclo e Liquidar Pagamentos', 'Process Cycle Settlement and Pay Commissions', 'Procesar cierre del ciclo y liquidar pagos', '处理周期结算并支付佣金', 'Elabora chiusura ciclo e liquida i pagamenti', 'Traiter la clôture du cycle et régler les paiements'],
        ['Suporte: Contas e Senha Temporária', 'Support: Accounts and Temporary Passwords', 'Soporte: cuentas y contraseñas temporales', '支持：账户与临时密码', 'Supporto: account e password temporanee', 'Assistance : comptes et mots de passe temporaires'],
        ['Salvar WhatsApp', 'Save WhatsApp', 'Guardar WhatsApp', '保存 WhatsApp', 'Salva WhatsApp', 'Enregistrer WhatsApp'],
        ['Buscar', 'Search', 'Buscar', '搜索', 'Cerca', 'Rechercher'],
        ['Extrato de Comissões por Afiliado', 'Commission Statement by Affiliate', 'Extracto de comisiones por afiliado', '联盟伙伴佣金明细', 'Estratto commissioni per affiliato', 'Relevé des commissions par affilié'],
        ['Resumo do Pedido', 'Order Summary', 'Resumen del pedido', '订单摘要', 'Riepilogo ordine', 'Récapitulatif de commande'],
        ['Subtotal:', 'Subtotal:', 'Subtotal:', '小计：', 'Subtotale:', 'Sous-total :'],
        ['Desconto do cupom:', 'Coupon discount:', 'Descuento del cupón:', '优惠券折扣：', 'Sconto coupon:', 'Remise du coupon :'],
        ['Encargos / Juros de Parcelamento:', 'Installment Fees / Interest:', 'Cargos / intereses por cuotas:', '分期费用 / 利息：', 'Commissioni / interessi rateali:', 'Frais / intérêts de paiement échelonné :'],
        ['Total Geral:', 'Grand Total:', 'Total general:', '总计：', 'Totale complessivo:', 'Total général :'],
        ['À vista no Pix ou Cartão', 'Pay in full via Pix or Card', 'Pago al contado por Pix o tarjeta', '通过 Pix 或银行卡一次性付款', 'Pagamento in un’unica soluzione con Pix o carta', 'Paiement comptant par Pix ou carte'],
        ['À vista via Pix', 'Pay in full via Pix', 'Pago al contado por Pix', '通过 Pix 一次性付款', 'Pagamento in un’unica soluzione con Pix', 'Paiement comptant par Pix'],
        ['À vista no Pix ou Cartão', 'Pay in full via Pix or Card', 'Pago al contado por Pix o tarjeta', '通过 Pix 或银行卡一次性付款', 'Pagamento in un’unica soluzione con Pix o carta', 'Paiement comptant par Pix ou carte'],
        ['Indicação do parceiro:', 'Affiliate referral:', 'Recomendación del afiliado:', '联盟伙伴推荐：', 'Segnalazione affiliato:', 'Recommandation de l’affilié :'],
        ['Cupom de afiliado', 'Affiliate Coupon', 'Cupón de afiliado', '联盟优惠券', 'Coupon affiliato', 'Coupon affilié'],
        ['Aplicar', 'Apply', 'Aplicar', '应用', 'Applica', 'Appliquer'],
        ['Identificação & Chave de Acesso', 'Identification & Access Key', 'Identificación y clave de acceso', '身份信息与访问密钥', 'Identificazione e chiave di accesso', 'Identification et clé d’accès'],
        ['Forma de Pagamento', 'Payment Method', 'Método de pago', '付款方式', 'Metodo di pagamento', 'Mode de paiement'],
        ['Dados para envio da licença do CMV Food Lite.', 'Details for delivery of your CMV Food Lite license.', 'Datos para enviar la licencia de CMV Food Lite.', '用于发送 CMV Food Lite 许可证的信息。', 'Dati per l’invio della licenza CMV Food Lite.', 'Informations pour l’envoi de la licence CMV Food Lite.'],
        ['Selecione a modalidade desejada.', 'Select your preferred payment method.', 'Selecciona el método de pago deseado.', '请选择付款方式。', 'Seleziona il metodo di pagamento desiderato.', 'Sélectionnez le mode de paiement souhaité.'],
        ['Cartão Crédito', 'Credit Card', 'Tarjeta de crédito', '信用卡', 'Carta di credito', 'Carte bancaire'],
        ['Débito / À Vista', 'Debit / One-time Payment', 'Débito / Pago al contado', '借记卡 / 一次性付款', 'Debito / Pagamento unico', 'Débit / Paiement comptant'],
        ['PIX', 'PIX', 'PIX', 'PIX', 'PIX', 'PIX'],
        ['Pagamento via Pix com Liberação após Confirmação', 'Pix Payment — Access After Confirmation', 'Pago por Pix: acceso tras la confirmación', 'Pix 付款 — 确认后开通', 'Pagamento Pix: accesso dopo la conferma', 'Paiement Pix — accès après confirmation'],
        ['Recebedor: Tech Software.', 'Payee: Tech Software.', 'Beneficiario: Tech Software.', '收款方：Tech Software。', 'Beneficiario: Tech Software.', 'Bénéficiaire : Tech Software.'],
        ['Finalizar Pedido', 'Complete Order', 'Finalizar pedido', '提交订单', 'Completa ordine', 'Finaliser la commande'],
        ['Pedido registrado!', 'Order registered!', '¡Pedido registrado!', '订单已登记！', 'Ordine registrato!', 'Commande enregistrée !'],
        ['Copiar código Pix', 'Copy Pix Code', 'Copiar código Pix', '复制 Pix 代码', 'Copia codice Pix', 'Copier le code Pix'],
        ['Voltar ao checkout', 'Back to Checkout', 'Volver al checkout', '返回结账页面', 'Torna al checkout', 'Retour au paiement'],
        ['Ativo', 'Active', 'Activo', '启用', 'Attivo', 'Actif'],
        ['Inativo', 'Inactive', 'Inactivo', '未启用', 'Inattivo', 'Inactif'],
        ['Expirado', 'Expired', 'Expirado', '已过期', 'Scaduto', 'Expiré'],
        ['Desativar', 'Deactivate', 'Desactivar', '停用', 'Disattiva', 'Désactiver'],
        ['Ativar', 'Activate', 'Activar', '启用', 'Attiva', 'Activer'],
        ['Excluir', 'Delete', 'Eliminar', '删除', 'Elimina', 'Supprimer'],
        ['Copiar Chave Pix', 'Copy Pix Key', 'Copiar clave Pix', '复制 Pix 密钥', 'Copia chiave Pix', 'Copier la clé Pix'],
        ['Vendas Diretas', 'Direct Sales', 'Ventas directas', '直接销售', 'Vendite dirette', 'Ventes directes'],
        ['Comissão Direta', 'Direct Commission', 'Comisión directa', '直接佣金', 'Commissione diretta', 'Commission directe'],
        ['Comissão de Rede', 'Network Commission', 'Comisión de red', '网络佣金', 'Commissioni rete', 'Commission réseau'],
        ['Nenhum afiliado cadastrado.', 'No affiliates registered.', 'No hay afiliados registrados.', '尚未注册联盟伙伴。', 'Nessun affiliato registrato.', 'Aucun affilié enregistré.'],
        ['Nenhum comunicado ativo no momento.', 'No active announcements at this time.', 'No hay avisos activos en este momento.', '目前没有有效公告。', 'Nessun comunicato attivo al momento.', 'Aucune annonce active pour le moment.'],
        ['Sem data de expiração definida.', 'No expiration date set.', 'No se ha definido fecha de vencimiento.', '未设置到期日期。', 'Nessuna data di scadenza impostata.', 'Aucune date d’expiration définie.'],
        ['Aguardando ativação pelo administrador.', 'Waiting for administrator approval.', 'Esperando la activación del administrador.', '等待管理员启用。', 'In attesa dell’attivazione da parte dell’amministratore.', 'En attente de l’activation par l’administrateur.']
        ,['Licença Essencial', 'Essential License', 'Licencia esencial', '基础许可证', 'Licenza essenziale', 'Licence essentielle']
        ,['Dados para envio da licença do CMV Food Lite.', 'Details for delivery of your CMV Food Lite license.', 'Datos para enviar la licencia de CMV Food Lite.', '用于发送 CMV Food Lite 许可证的信息。', 'Dati per l’invio della licenza CMV Food Lite.', 'Informations pour l’envoi de la licence CMV Food Lite.']
        ,['Dados para envio da licença definitiva do CMV Food Plus.', 'Details for delivery of your CMV Food Plus license.', 'Datos para enviar la licencia definitiva de CMV Food Plus.', '用于发送 CMV Food Plus 正式许可证的信息。', 'Dati per l’invio della licenza definitiva CMV Food Plus.', 'Informations pour l’envoi de la licence définitive CMV Food Plus.']
        ,['Dados para envio da licença do CMV Food Pro.', 'Details for delivery of your CMV Food Pro license.', 'Datos para enviar la licencia de CMV Food Pro.', '用于发送 CMV Food Pro 许可证的信息。', 'Dati per l’invio della licenza CMV Food Pro.', 'Informations pour l’envoi de la licence CMV Food Pro.']
        ,['CPF (Obrigatório p/ Chave)', 'CPF (Required for Access Key)', 'CPF (obligatorio para la clave)', 'CPF（访问密钥必填）', 'CPF (obbligatorio per la chiave)', 'CPF (obligatoire pour la clé)']
        ,['(Obrigatório p/ Chave)', '(Required for Access Key)', '(obligatorio para la clave)', '（访问密钥必填）', '(obbligatorio per la chiave)', '(obligatoire pour la clé)']
        ,['Digite seu nome completo', 'Enter your full name', 'Escribe tu nombre completo', '输入您的全名', 'Inserisci il tuo nome completo', 'Saisissez votre nom complet']
        ,['seu@email.com', 'you@email.com', 'tu@email.com', 'you@email.com', 'tu@email.com', 'vous@email.com']
        ,['000.000.000-00', '000.000.000-00', '000.000.000-00', '000.000.000-00', '000.000.000-00', '000.000.000-00']
        ,['Número do pedido', 'Order number', 'Número de pedido', '订单号', 'Numero ordine', 'Numéro de commande']
        ,['Digite seu cupom', 'Enter your coupon', 'Introduce tu cupón', '输入优惠券代码', 'Inserisci il coupon', 'Saisissez votre coupon']
        ,['Selecione a modalidade desejada.', 'Select your preferred payment method.', 'Selecciona el método de pago deseado.', '请选择付款方式。', 'Seleziona il metodo di pagamento desiderato.', 'Sélectionnez le mode de paiement souhaité.']
        ,['O QR Code Pix e o código Copia e Cola serão gerados pelo Mercado Pago nesta tela. A liberação acontece após a confirmação.', 'The Pix QR code and copy-and-paste code will be generated by Mercado Pago on this screen. Access is granted after confirmation.', 'Mercado Pago generará el código QR Pix y el código para copiar en esta pantalla. El acceso se habilitará tras la confirmación.', 'Mercado Pago 将在此页面生成 Pix 二维码和复制粘贴代码。确认后即可开通。', 'Il codice QR Pix e il codice copia e incolla saranno generati da Mercado Pago in questa schermata. L’accesso verrà attivato dopo la conferma.', 'Le QR code Pix et le code à copier seront générés par Mercado Pago sur cette page. L’accès sera accordé après confirmation.']
        ,['Preencha os campos seguros do Mercado Pago. Os dados do cartão são tokenizados e não são enviados ao nosso servidor.', 'Fill in Mercado Pago’s secure fields. Card details are tokenized and are not sent to our server.', 'Completa los campos seguros de Mercado Pago. Los datos de la tarjeta se tokenizan y no se envían a nuestro servidor.', '请填写 Mercado Pago 安全表单。银行卡信息会被令牌化，不会发送到我们的服务器。', 'Compila i campi sicuri di Mercado Pago. I dati della carta vengono tokenizzati e non inviati al nostro server.', 'Remplissez les champs sécurisés de Mercado Pago. Les données de carte sont tokenisées et ne sont pas envoyées à notre serveur.']
        ,['Após informar o cartão, selecione no formulário seguro a opção de parcelas disponível. O Mercado Pago apresenta o valor por parcela antes de concluir.', 'After entering your card details, choose an available installment option in the secure form. Mercado Pago shows each installment amount before you complete the payment.', 'Después de introducir la tarjeta, selecciona las cuotas disponibles en el formulario seguro. Mercado Pago muestra el importe de cada cuota antes de finalizar.', '填写银行卡信息后，请在安全表单中选择可用分期。Mercado Pago 会在付款前显示每期金额。', 'Dopo aver inserito la carta, seleziona un’opzione rateale disponibile nel modulo sicuro. Mercado Pago mostra l’importo di ogni rata prima della conferma.', 'Après avoir saisi la carte, choisissez une option de paiement échelonné dans le formulaire sécurisé. Mercado Pago affiche le montant de chaque échéance avant la validation.']
        ,['Informe os dados no formulário seguro do Mercado Pago para pagar no débito.', 'Enter your details in Mercado Pago’s secure form to pay by debit card.', 'Introduce tus datos en el formulario seguro de Mercado Pago para pagar con débito.', '请在 Mercado Pago 安全表单中填写信息以使用借记卡付款。', 'Inserisci i dati nel modulo sicuro di Mercado Pago per pagare con carta di debito.', 'Saisissez vos informations dans le formulaire sécurisé de Mercado Pago pour payer par carte de débit.']
        ,['Pedido', 'Order', 'Pedido', '订单', 'Ordine', 'Commande']
        ,['QR Code Pix do Mercado Pago', 'Mercado Pago Pix QR Code', 'Código QR Pix de Mercado Pago', 'Mercado Pago Pix 二维码', 'Codice QR Pix di Mercado Pago', 'QR code Pix de Mercado Pago']
        ,['Pix Copia e Cola', 'Pix Copy and Paste Code', 'Código Pix para copiar y pegar', 'Pix 复制粘贴代码', 'Codice Pix copia e incolla', 'Code Pix à copier-coller']
        ,['Pague pelo aplicativo do seu banco. Não feche esta tela enquanto aguardamos a confirmação.', 'Pay using your bank app. Do not close this screen while we wait for confirmation.', 'Paga desde la aplicación de tu banco. No cierres esta pantalla mientras esperamos la confirmación.', '请使用银行应用付款。等待确认期间请勿关闭此页面。', 'Paga tramite l’app della tua banca. Non chiudere questa schermata mentre attendiamo la conferma.', 'Payez depuis l’application de votre banque. Ne fermez pas cette page pendant l’attente de la confirmation.']
        ,['Aguardando confirmação do pagamento pelo Mercado Pago...', 'Waiting for payment confirmation from Mercado Pago...', 'Esperando la confirmación del pago por Mercado Pago...', '正在等待 Mercado Pago 确认付款……', 'In attesa della conferma del pagamento da Mercado Pago...', 'En attente de la confirmation du paiement par Mercado Pago...']
        ,['O arquivo será liberado após a confirmação do pagamento.', 'The file will be available after payment confirmation.', 'El archivo estará disponible tras la confirmación del pago.', '付款确认后即可获取文件。', 'Il file sarà disponibile dopo la conferma del pagamento.', 'Le fichier sera disponible après confirmation du paiement.']
        ,['Verificar pagamento e liberar arquivo', 'Verify Payment and Unlock File', 'Verificar el pago y desbloquear el archivo', '验证付款并解锁文件', 'Verifica il pagamento e sblocca il file', 'Vérifier le paiement et débloquer le fichier']
        ,['Acessar arquivo para download', 'Access File for Download', 'Acceder al archivo para descargar', '访问文件并下载', 'Accedi al file da scaricare', 'Accéder au fichier à télécharger']
        ,['Aguardando pagamento...', 'Waiting for payment...', 'Esperando el pago...', '正在等待付款……', 'In attesa del pagamento...', 'En attente du paiement...']
        ,['O arquivo será liberado automaticamente após a confirmação do pagamento para', 'The file will be automatically available after payment confirmation for', 'El archivo se habilitará automáticamente tras la confirmación del pago para', '付款确认后将自动为以下用户开放文件：', 'Il file sarà disponibile automaticamente dopo la conferma del pagamento per', 'Le fichier sera automatiquement disponible après confirmation du paiement pour']
        ,['Recebedor: Tech Software', 'Payee: Tech Software', 'Beneficiario: Tech Software', '收款方：Tech Software', 'Beneficiario: Tech Software', 'Bénéficiaire : Tech Software']
        ,['Válido até (em branco = sem expiração)', 'Valid until (leave blank for no expiration)', 'Válido hasta (en blanco = sin vencimiento)', '有效期至（留空表示永不过期）', 'Valido fino al (vuoto = senza scadenza)', 'Valide jusqu’au (vide = sans expiration)']
        ,['Salvar validade', 'Save Expiration Date', 'Guardar vencimiento', '保存有效期', 'Salva scadenza', 'Enregistrer la date d’expiration']
        ,['Ainda não cadastrou cupom', 'No coupon registered yet', 'Aún no has registrado un cupón', '尚未登记优惠券', 'Nessun coupon registrato', 'Aucun coupon enregistré']
        ,['Nenhum comunicado publicado.', 'No announcements published.', 'No hay avisos publicados.', '尚未发布公告。', 'Nessun comunicato pubblicato.', 'Aucune annonce publiée.']
        ,['Regra salva. Campanha', 'Rule saved. Campaign', 'Regla guardada. Campaña', '规则已保存。活动', 'Regola salvata. Campagna', 'Règle enregistrée. Campagne']
        ,['ativa', 'active', 'activa', '已启用', 'attiva', 'active']
        ,['desativada', 'disabled', 'desactivada', '已停用', 'disattivata', 'désactivée']
        ,['© 2026 Tech - Software de Gestão. Todos os direitos reservados.', '© 2026 Tech - Management Software. All rights reserved.', '© 2026 Tech - Software de gestión. Todos los derechos reservados.', '© 2026 Tech - 管理软件。保留所有权利。', '© 2026 Tech - Software gestionale. Tutti i diritti riservati.', '© 2026 Tech - Logiciel de gestion. Tous droits réservés.']
    ];

    const indiceIdioma = Object.fromEntries(idiomas.map((idioma, index) => [idioma, index]));
    const mapas = Object.fromEntries(idiomas.map((idioma, index) => [
        idioma,
        new Map(frases.map(frase => [frase[0], frase[index]]))
    ]));
    const textosOriginais = new WeakMap();
    const atributosOriginais = new WeakMap();
    let tituloOriginal = '';
    let observador = null;
    let idiomaAtual = IDIOMA_PADRAO;

    function normalizar(texto) {
        return texto.replace(/\s+/g, ' ').trim();
    }

    function traduzirTexto(original, idioma) {
        const mapa = mapas[idioma] || mapas[IDIOMA_PADRAO];
        const texto = normalizar(original);
        if (mapa.has(texto)) {
            const prefixo = original.match(/^\s*/)[0];
            const sufixo = original.match(/\s*$/)[0];
            return prefixo + mapa.get(texto) + sufixo;
        }

        let traduzido = original;
        frases.slice().sort((a, b) => b[0].length - a[0].length).forEach(frase => {
            const destino = frase[indiceIdioma[idioma]];
            if (destino && frase[0] !== destino) {
                traduzido = traduzido.split(frase[0]).join(destino);
            }
        });
        return traduzido;
    }

    function traduzirArvore(raiz) {
        const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent || parent.closest('script, style, noscript')) return NodeFilter.FILTER_REJECT;
                if (!normalizar(node.nodeValue)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let node;
        while ((node = walker.nextNode())) {
            if (!textosOriginais.has(node)) textosOriginais.set(node, node.nodeValue);
            node.nodeValue = traduzirTexto(textosOriginais.get(node), idiomaAtual);
        }
    }

    function traduzirAtributos() {
        document.querySelectorAll('input[placeholder], textarea[placeholder], [title]').forEach(elemento => {
            ['placeholder', 'title'].forEach(atributo => {
                if (!elemento.hasAttribute(atributo)) return;
                let originais = atributosOriginais.get(elemento);
                if (!originais) {
                    originais = {};
                    atributosOriginais.set(elemento, originais);
                }
                if (originais[atributo] === undefined) originais[atributo] = elemento.getAttribute(atributo);
                elemento.setAttribute(atributo, traduzirTexto(originais[atributo], idiomaAtual));
            });
        });
    }

    function atualizarSelectores() {
        document.querySelectorAll('[data-tech-language]').forEach(select => {
            select.value = idiomaAtual;
        });
    }

    function aplicarIdioma() {
        if (!document.body) return;
        document.documentElement.lang = idiomaAtual;
        if (!tituloOriginal) tituloOriginal = document.title;
        document.title = traduzirTexto(tituloOriginal, idiomaAtual);
        traduzirArvore(document.body);
        traduzirAtributos();
        atualizarSelectores();
    }

    function setLanguage(language) {
        idiomaAtual = idiomas.includes(language) ? language : IDIOMA_PADRAO;
        localStorage.setItem('tech_language', idiomaAtual);
        aplicarIdioma();
        document.dispatchEvent(new CustomEvent('tech-language-changed', { detail: { language: idiomaAtual } }));
    }

    function iniciar() {
        const salvo = localStorage.getItem('tech_language');
        idiomaAtual = idiomas.includes(salvo) ? salvo : IDIOMA_PADRAO;
        aplicarIdioma();
        if (!observador) {
            observador = new MutationObserver(registros => {
                registros.forEach(registro => {
                    registro.addedNodes.forEach(no => {
                        if (no.nodeType === Node.TEXT_NODE) {
                            if (!textosOriginais.has(no)) textosOriginais.set(no, no.nodeValue);
                            no.nodeValue = traduzirTexto(textosOriginais.get(no), idiomaAtual);
                        } else if (no.nodeType === Node.ELEMENT_NODE) {
                            traduzirArvore(no);
                        }
                    });
                });
                traduzirAtributos();
            });
            observador.observe(document.body, { childList: true, subtree: true });
        }
    }

    document.addEventListener('change', event => {
        if (event.target instanceof Element
            && event.target.matches('[data-tech-language]')
            && event.target.id !== 'seletorIdioma') {
            setLanguage(event.target.value);
        }
    });

    window.TechI18n = {
        defaultLanguage: IDIOMA_PADRAO,
        labels: rotulos,
        setLanguage,
        apply: aplicarIdioma,
        getLanguage: () => idiomaAtual
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar, { once: true });
    } else {
        iniciar();
    }
})();
