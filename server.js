'use strict';
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ===== Variáveis de ambiente (configure no Render) =====
const { DATABASE_URL, JWT_SECRET, ADMIN_SENHA } = process.env;
const ADMIN_USUARIO = (process.env.ADMIN_USUARIO || 'admin').trim().toLowerCase();
const MERCADO_PAGO_ACCESS_TOKEN = (process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim() || (process.env.ACCESS_TOKEN || '').trim();
const MERCADO_PAGO_PUBLIC_KEY = (process.env.MERCADO_PAGO_PUBLIC_KEY || '').trim() || (process.env.PUBLIC_KEY || '').trim();
if (!DATABASE_URL || !JWT_SECRET || !ADMIN_SENHA) {
  console.error('Defina DATABASE_URL, JWT_SECRET e ADMIN_SENHA nas variáveis de ambiente.');
  process.exit(1);
}

// ===== Regras padrão de comissão =====
const TAXA_COMISSAO_PADRAO = 35;
const TAXA_PATROCINADOR_PADRAO = 10;
const TAXA_AVO_PADRAO = 5;
const VALOR_MINIMO_SAQUE_PADRAO = 50;

const PRODUTOS_INICIAIS = [
  { id: 'lite', nome: 'CMV Food Lite', desc: 'Início prático e direto para controle de fichas técnicas básicas.', custo: 10.00, precoDe: 69.99, precoPor: 49.99, imagem: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&auto=format&fit=crop&q=60', video: '', pdf: '' },
  { id: 'pro', nome: 'CMV Food Pro', desc: 'Inclui módulo de Metas de Lucro Bruto e painel visual.', custo: 15.00, precoDe: 99.99, precoPor: 79.99, imagem: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60', video: '', pdf: '' },
  { id: 'plus', nome: 'CMV Food Plus', desc: 'Versão definitiva com base de clientes e suporte VIP.', custo: 20.00, precoDe: 119.00, precoPor: 99.99, imagem: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=500&auto=format&fit=crop&q=60', video: '', pdf: '' }
];

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
const q = (sql, params) => pool.query(sql, params);

// ===== Utilitários =====
const norm = t => (t == null ? '' : String(t).trim().toLowerCase());
const txt = (t, max = 120) => String(t == null ? '' : t).trim().slice(0, max);
const RE_USUARIO = /^[a-z0-9_.-]{3,30}$/;
const RE_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const RE_CPF = /^[0-9.\-\s]{0,20}$/;
const RE_PIX = /^[A-Za-z0-9@._+\-\s\/]{0,100}$/;
const semTags = t => !/[<>]/.test(t);
const ehUrlWeb = valor => {
  try {
    const url = new URL(valor);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname;
  } catch {
    return false;
  }
};
const hash256 = s => crypto.createHash('sha256').update(String(s)).digest();
const igual = (a, b) => crypto.timingSafeEqual(hash256(a), hash256(b));
const soDigitos = t => String(t == null ? '' : t).replace(/\D/g, '');
const RE_TEL = /^\d{10,13}$/;
// Telefone brasileiro com DDD (10 ou 11 dígitos) ganha o 55 para virar link de WhatsApp
const paraWhatsApp = t => { const d = soDigitos(t); return d.length === 10 || d.length === 11 ? '55' + d : d; };
// 'trocar' = token de quem entrou com senha temporária: só pode trocar a senha, nada mais
const gerarToken = (usuario, perfil, trocar = false) => jwt.sign({ usuario, perfil, trocar }, JWT_SECRET, { expiresIn: trocar ? '1h' : '7d' });
const dadosUsuario = (row, perfil) => ({ usuario: row.usuario, nome: row.nome, email: row.email, cpf: row.cpf, pix: row.pix, telefone: row.telefone || '', perfil });
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

async function lerConfig(chave, padrao) {
  const r = await q('SELECT valor FROM config WHERE chave = $1', [chave]);
  return r.rows.length ? r.rows[0].valor : padrao;
}
async function gravarConfig(chave, valor) {
  await q(
    'INSERT INTO config (chave, valor) VALUES ($1, $2::jsonb) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor',
    [chave, JSON.stringify(valor)]
  );
}

async function lerTaxas() {
  const [taxaComissao, taxaPatrocinador] = await Promise.all([
    lerConfig('taxaComissao', TAXA_COMISSAO_PADRAO),
    lerConfig('taxaPatrocinador', TAXA_PATROCINADOR_PADRAO)
  ]);
  const direta = Number(taxaComissao);
  const patrocinador = Number(taxaPatrocinador);
  return {
    taxaComissao: direta,
    taxaPatrocinador: patrocinador,
    taxaAvo: TAXA_AVO_PADRAO,
    taxaCentral: 100 - direta - patrocinador - TAXA_AVO_PADRAO
  };
}
const centavos = (valor, taxa) => Math.round(valor * taxa) / 100;
const dinheiro = v => Math.round(Number(v || 0) * 100) / 100;

function dataAtualBrasil() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  return Object.fromEntries(partes.filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}

function dataInicioMesBrasil() {
  const { year, month } = dataAtualBrasil();
  return new Date(Date.UTC(year, month - 1, 1, 3)).toISOString();
}

function dataPascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function quintoDiaUtilBrasil(ano, mes) {
  const pascoa = dataPascoa(ano);
  const feriados = new Set([
    `${ano}-01-01`, `${ano}-04-21`, `${ano}-05-01`, `${ano}-09-07`,
    `${ano}-10-12`, `${ano}-11-02`, `${ano}-11-15`, `${ano}-11-20`, `${ano}-12-25`
  ]);
  const diaMovel = (offset) => {
    const data = new Date(pascoa);
    data.setUTCDate(data.getUTCDate() + offset);
    return data.toISOString().slice(0, 10);
  };
  [ -48, -47, -2, 60 ].forEach(offset => feriados.add(diaMovel(offset)));

  let uteis = 0;
  const cursor = new Date(Date.UTC(ano, mes - 1, 1));
  while (true) {
    const semana = cursor.getUTCDay();
    const data = cursor.toISOString().slice(0, 10);
    if (semana !== 0 && semana !== 6 && !feriados.has(data)) {
      uteis++;
      if (uteis === 5) return data;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

function calendarioSaqueHoje() {
  const { year, month, day } = dataAtualBrasil();
  const hoje = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dataEsteMes = quintoDiaUtilBrasil(year, month);
  const liberado = dataEsteMes === hoje;
  if (!liberado && hoje > dataEsteMes) {
    const proximoMes = new Date(Date.UTC(year, month, 1));
    return {
      dataSaque: quintoDiaUtilBrasil(proximoMes.getUTCFullYear(), proximoMes.getUTCMonth() + 1),
      liberado
    };
  }
  return { dataSaque: dataEsteMes, liberado };
}

const mapAf = r => {
  const direta = dinheiro(r.direta), rede = dinheiro(r.rede);
  return {
    id: r.id, usuario: r.usuario, nome: r.nome, email: r.email, cpf: r.cpf, pix: r.pix, telefone: r.telefone || '',
    patrocinadorId: r.patrocinador_id, criadoEm: r.criado_em,
    vendasDiretas: Number(r.vendas) || 0, vendasRede: Number(r.vendas_rede) || 0,
    comissaoDireta: direta, comissaoRede: rede, comissaoTotal: dinheiro(direta + rede),
    comissaoDiretaPendente: dinheiro(r.direta_pendente), comissaoRedePendente: dinheiro(r.rede_pendente),
    comissaoPendente: dinheiro(Number(r.direta_pendente || 0) + Number(r.rede_pendente || 0)),
    comissaoDiretaLiberar: dinheiro(r.direta_liberar), comissaoRedeLiberar: dinheiro(r.rede_liberar),
    comissaoLiberar: dinheiro(Number(r.direta_liberar || 0) + Number(r.rede_liberar || 0)),
    comissaoCentral: dinheiro(r.central), faturado: dinheiro(r.faturado)
  };
};

function ehFilhoDe(filho, pai) {
  const ref = norm(filho.patrocinadorId);
  if (!ref || ref === 'admin') return false;
  return ref === norm(pai.id) || ref === norm(pai.usuario);
}

// Totais de cada afiliado, somados dos pedidos PAGOS (estorno e cancelamento saem sozinhos da conta):
//  direta = comissão das vendas que ele fez; rede = comissões de pai e avô
async function afiliadosComComissao() {
  const r = await q(`
    SELECT a.*,
      COALESCE(v.qtd, 0) AS vendas, COALESCE(v.direta, 0) AS direta,
      COALESCE(v.central, 0) AS central, COALESCE(v.faturado, 0) AS faturado,
      COALESCE(n.qtd, 0) AS vendas_rede, COALESCE(n.rede, 0) AS rede,
      COALESCE(pd.direta_pendente, 0) AS direta_pendente,
      COALESCE(pn.rede_pendente, 0) AS rede_pendente,
      COALESCE(pd.direta_liberar, 0) AS direta_liberar,
      COALESCE(pn.rede_liberar, 0) AS rede_liberar
    FROM afiliados a
    LEFT JOIN (
      SELECT afiliado_usuario AS u, count(*)::int AS qtd, sum(comissao) AS direta,
             sum(comissao_central) AS central, sum(valor) AS faturado
      FROM pedidos WHERE status = 'pago' AND afiliado_usuario IS NOT NULL GROUP BY 1
    ) v ON v.u = a.usuario
    LEFT JOIN (
      SELECT u, count(DISTINCT pedido_id)::int AS qtd, sum(valor) AS rede
      FROM (
        SELECT id AS pedido_id, patrocinador_usuario AS u, comissao_patrocinador AS valor
        FROM pedidos WHERE status = 'pago' AND patrocinador_usuario IS NOT NULL
        UNION ALL
        SELECT id AS pedido_id, avo_usuario AS u, comissao_avo AS valor
        FROM pedidos WHERE status = 'pago' AND avo_usuario IS NOT NULL
      ) comissoes_rede
      GROUP BY u
    ) n ON n.u = a.usuario
    LEFT JOIN (
      SELECT afiliado_usuario AS u, sum(comissao) AS direta_pendente,
             sum(comissao) FILTER (WHERE pago_em < $1::timestamptz) AS direta_liberar
      FROM pedidos
      WHERE status = 'pago' AND status_comissao_direta = 'PENDENTE' AND afiliado_usuario IS NOT NULL
      GROUP BY 1
    ) pd ON pd.u = a.usuario
    LEFT JOIN (
      SELECT u, sum(valor) AS rede_pendente,
             sum(valor) FILTER (WHERE pago_em < $1::timestamptz) AS rede_liberar
      FROM (
        SELECT patrocinador_usuario AS u, comissao_patrocinador AS valor, pago_em
        FROM pedidos
        WHERE status = 'pago' AND status_comissao_patrocinador = 'PENDENTE' AND patrocinador_usuario IS NOT NULL
        UNION ALL
        SELECT avo_usuario AS u, comissao_avo AS valor, pago_em
        FROM pedidos
        WHERE status = 'pago' AND status_comissao_avo = 'PENDENTE' AND avo_usuario IS NOT NULL
      ) comissoes_rede_pendentes
      GROUP BY u
    ) pn ON pn.u = a.usuario
    ORDER BY a.criado_em, a.id`, [dataInicioMesBrasil()]);
  const lista = r.rows.map(mapAf);
  lista.forEach(a => { a.filhosDiretos = lista.filter(f => ehFilhoDe(f, a)).length; });
  return lista;
}

// Lista em ordem de árvore (pai, depois filhos, netos...), com a geração de cada um (1 = direto da Central)
function arvoreOrdenada(lista) {
  const visitados = new Set();
  const saida = [];
  const visitar = (af, nivel) => {
    if (visitados.has(af.usuario)) return;
    visitados.add(af.usuario);
    saida.push({ ...af, nivel });
    lista.filter(f => ehFilhoDe(f, af)).forEach(f => visitar(f, nivel + 1));
  };
  lista.filter(a => !lista.some(p => p !== a && ehFilhoDe(a, p))).forEach(a => visitar(a, 1));
  lista.forEach(a => visitar(a, 1)); // proteção contra ciclos
  return saida;
}

async function usuarioDoPatrocinador(patrocinadorId) {
  if (!patrocinadorId || norm(patrocinadorId) === 'admin') return null;
  const r = await q('SELECT usuario FROM afiliados WHERE lower(id) = $1 OR usuario = $1', [norm(patrocinadorId)]);
  return r.rows.length ? r.rows[0].usuario : norm(patrocinadorId);
}

// ===== Banco =====
async function iniciarBanco() {
  await q(`CREATE TABLE IF NOT EXISTS contas (
    usuario text PRIMARY KEY, nome text NOT NULL, email text NOT NULL,
    cpf text NOT NULL DEFAULT '', pix text NOT NULL DEFAULT '',
    senha_hash text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS afiliados (
    id text PRIMARY KEY, usuario text UNIQUE NOT NULL, nome text NOT NULL, email text NOT NULL,
    cpf text NOT NULL DEFAULT '', pix text NOT NULL DEFAULT '', senha_hash text NOT NULL,
    patrocinador_id text NOT NULL DEFAULT 'admin',
    vendas_diretas integer NOT NULL DEFAULT 0,
    comissao_direta numeric(12,2) NOT NULL DEFAULT 0,
    criado_em timestamptz NOT NULL DEFAULT now())`);
  await q("ALTER TABLE contas ADD COLUMN IF NOT EXISTS telefone text NOT NULL DEFAULT ''");
  await q('ALTER TABLE contas ADD COLUMN IF NOT EXISTS trocar_senha boolean NOT NULL DEFAULT false');
  await q('ALTER TABLE contas ADD COLUMN IF NOT EXISTS temp_expira timestamptz');
  await q("ALTER TABLE afiliados ADD COLUMN IF NOT EXISTS telefone text NOT NULL DEFAULT ''");
  // Pedido nasce aguardando; o pagamento confirmado gera comissões e libera o produto.
  await q(`CREATE TABLE IF NOT EXISTS pedidos (
    id text PRIMARY KEY, afiliado_usuario text, produto_id text NOT NULL,
    valor numeric(12,2) NOT NULL DEFAULT 0, comissao numeric(12,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'aguardando',
    criado_em timestamptz NOT NULL DEFAULT now(), pago_em timestamptz)`);
  await q('ALTER TABLE pedidos ALTER COLUMN afiliado_usuario DROP NOT NULL');
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS produto_nome text NOT NULL DEFAULT ''");
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS forma text NOT NULL DEFAULT 'pix'");
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_nome text NOT NULL DEFAULT ''");
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_email text NOT NULL DEFAULT ''");
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_cpf text NOT NULL DEFAULT ''");
  // Comissões gravadas NA HORA da confirmação (mudar a taxa depois não altera vendas antigas)
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS patrocinador_usuario text');
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comissao_patrocinador numeric(12,2) NOT NULL DEFAULT 0');
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS avo_usuario text');
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comissao_avo numeric(12,2) NOT NULL DEFAULT 0');
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pix_comissao_direta text NOT NULL DEFAULT ''");
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pix_comissao_patrocinador text NOT NULL DEFAULT ''");
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pix_comissao_avo text NOT NULL DEFAULT ''");
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comissao_central numeric(12,2) NOT NULL DEFAULT 0');
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS status_comissao_direta text NOT NULL DEFAULT 'PENDENTE'");
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS data_pagamento_comissao_direta timestamptz');
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS status_comissao_patrocinador text NOT NULL DEFAULT 'PENDENTE'");
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS data_pagamento_comissao_patrocinador timestamptz');
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS status_comissao_avo text NOT NULL DEFAULT 'PENDENTE'");
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS data_pagamento_comissao_avo timestamptz');
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS download_token text');
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS payment_id text');
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT ''");
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS payment_qr_code text NOT NULL DEFAULT ''");
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS payment_qr_code_base64 text NOT NULL DEFAULT ''");
  await q(`CREATE TABLE IF NOT EXISTS config (chave text PRIMARY KEY, valor jsonb NOT NULL)`);
  await q(`CREATE TABLE IF NOT EXISTS vendas_aprovadas (
    payment_id text PRIMARY KEY,
    cpf text NOT NULL DEFAULT '',
    email text NOT NULL DEFAULT '',
    produto text NOT NULL DEFAULT 'CMV Food Light',
    valor numeric(12,2) NOT NULL DEFAULT 0,
    hwid text,
    status text NOT NULL DEFAULT 'APROVADO',
    ativa boolean NOT NULL DEFAULT true
  )`);
  await q('ALTER TABLE vendas_aprovadas ADD COLUMN IF NOT EXISTS payment_id text');
  await q("ALTER TABLE vendas_aprovadas ADD COLUMN IF NOT EXISTS cpf text NOT NULL DEFAULT ''");
  await q("ALTER TABLE vendas_aprovadas ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT ''");
  await q("ALTER TABLE vendas_aprovadas ADD COLUMN IF NOT EXISTS produto text NOT NULL DEFAULT 'CMV Food Light'");
  await q('ALTER TABLE vendas_aprovadas ADD COLUMN IF NOT EXISTS valor numeric(12,2) NOT NULL DEFAULT 0');
  await q('ALTER TABLE vendas_aprovadas ADD COLUMN IF NOT EXISTS hwid text');
  await q("ALTER TABLE vendas_aprovadas ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'APROVADO'");
  await q('ALTER TABLE vendas_aprovadas ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true');
  await q('CREATE UNIQUE INDEX IF NOT EXISTS vendas_aprovadas_payment_id_uidx ON vendas_aprovadas (payment_id)');
}

// ===== App =====
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const tentativas = new Map();
const consultasStatusCheckout = new Map();
function limitarTentativas(req, res, next) {
  const agora = Date.now();
  let r = tentativas.get(req.ip);
  if (!r || agora > r.ate) r = { n: 0, ate: agora + 15 * 60 * 1000 };
  r.n++;
  tentativas.set(req.ip, r);
  if (r.n > 40) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
  next();
}

function limitarConsultasStatusCheckout(req, res, next) {
  const agora = Date.now();
  let r = consultasStatusCheckout.get(req.ip);
  if (!r || agora > r.ate) r = { n: 0, ate: agora + 15 * 60 * 1000 };
  r.n++;
  consultasStatusCheckout.set(req.ip, r);
  if (r.n > 1000) return res.status(429).json({ erro: 'Muitas consultas de status. Aguarde alguns minutos.' });
  next();
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.user = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', JWT_SECRET);
    if (req.user.trocar && !req.path.startsWith('/api/senha/')) {
      return res.status(403).json({ erro: 'Defina uma nova senha antes de continuar.', trocarSenha: true });
    }
    next();
  } catch (e) {
    res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  }
}
const soAdmin = (req, res, next) =>
  req.user.perfil === 'admin' ? next() : res.status(403).json({ erro: 'Acesso exclusivo do Administrador.' });

app.get('/api/saude', (req, res) => res.json({ ok: true }));
app.get('/api/pagamento/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ publicKey: String(MERCADO_PAGO_PUBLIC_KEY || '').trim() });
});

// ----- Cadastro / login -----
app.post('/api/registrar', limitarTentativas, wrap(async (req, res) => {
  const usuario = norm(req.body.usuario);
  const nome = txt(req.body.nome, 100), email = txt(req.body.email, 120);
  const cpf = txt(req.body.cpf, 20), pix = txt(req.body.pix, 100);
  const telefone = soDigitos(req.body.telefone);
  const senha = String(req.body.senha || '');
  const perfil = req.body.perfil || 'cliente';

  if (!['cliente', 'afiliado'].includes(perfil)) return res.status(400).json({ erro: 'Tipo de cadastro inválido.' });
  if (!RE_USUARIO.test(usuario)) return res.status(400).json({ erro: 'Usuário inválido: use de 3 a 30 letras minúsculas, números, ponto, hífen ou _.' });
  if (!nome || !semTags(nome)) return res.status(400).json({ erro: 'Informe um nome válido.' });
  if (!RE_EMAIL.test(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  if (!cpf || !RE_CPF.test(cpf)) return res.status(400).json({ erro: 'Informe um CPF válido.' });
  if (perfil === 'afiliado' && !pix) return res.status(400).json({ erro: 'Informe uma chave Pix para receber a comissão.' });
  if (!RE_PIX.test(pix)) return res.status(400).json({ erro: 'Chave Pix com caracteres inválidos.' });
  if (!RE_TEL.test(telefone)) return res.status(400).json({ erro: 'Informe um telefone/WhatsApp de contato com DDD (somente números).' });
  if (senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });
  if (usuario === ADMIN_USUARIO) return res.status(409).json({ erro: 'Este usuário já existe.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ex = await client.query('SELECT 1 FROM contas WHERE usuario = $1 UNION SELECT 1 FROM afiliados WHERE usuario = $1', [usuario]);
    if (ex.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Este usuário já existe.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const pixConta = perfil === 'afiliado' ? pix : '';
    await client.query('INSERT INTO contas (usuario, nome, email, cpf, pix, telefone, senha_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [usuario, nome, email, cpf, pixConta, telefone, senhaHash]);

    if (perfil === 'afiliado') {
      let patrocinadorId = 'admin', patrocinadorUsuario = null;
      const indicador = norm(req.body.indicador);
      if (indicador && indicador !== 'admin' && indicador !== usuario) {
        const pai = (await client.query('SELECT id, usuario FROM afiliados WHERE usuario = $1', [indicador])).rows[0];
        if (pai) {
          patrocinadorId = pai.id;
          patrocinadorUsuario = pai.usuario;
        }
      }
      const id = 'AF-' + usuario.toUpperCase();
      await client.query(`INSERT INTO afiliados (id, usuario, nome, email, cpf, pix, telefone, senha_hash, patrocinador_id)
                          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, usuario, nome, email, cpf, pix, telefone, senhaHash, patrocinadorId]);
      await client.query('COMMIT');
      return res.json({
        token: gerarToken(usuario, 'afiliado'),
        user: dadosUsuario({ usuario, nome, email, cpf, pix, telefone }, 'afiliado'),
        id, patrocinadorId, patrocinadorUsuario
      });
    }

    await client.query('COMMIT');
    res.json({
      token: gerarToken(usuario, 'cliente'),
      user: dadosUsuario({ usuario, nome, email, cpf, pix: '', telefone }, 'cliente')
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

app.post('/api/login', limitarTentativas, wrap(async (req, res) => {
  const usuario = norm(req.body.usuario);
  const senha = String(req.body.senha || '');

  if (usuario === ADMIN_USUARIO && igual(senha, ADMIN_SENHA)) {
    return res.json({ token: gerarToken(usuario, 'admin'), user: { usuario: 'admin', nome: 'Administrador (Central)', perfil: 'admin' } });
  }

  let r = await q('SELECT * FROM afiliados WHERE usuario = $1', [usuario]);
  let perfil = 'afiliado';
  if (!r.rows.length) {
    r = await q('SELECT * FROM contas WHERE usuario = $1', [usuario]);
    perfil = 'cliente';
  }
  const row = r.rows[0];
  if (!row || !(await bcrypt.compare(senha, row.senha_hash))) {
    return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
  }

  // Senha temporária (gerada pelo suporte): vale por tempo limitado e obriga a troca
  const flag = (await q('SELECT trocar_senha, temp_expira FROM contas WHERE usuario = $1', [row.usuario])).rows[0] || {};
  const trocar = !!flag.trocar_senha;
  if (trocar && flag.temp_expira && new Date(flag.temp_expira) < new Date()) {
    return res.status(401).json({ erro: 'Senha temporária expirada. Peça uma nova ao suporte.' });
  }
  res.json({ token: gerarToken(row.usuario, perfil, trocar), trocarSenha: trocar, user: dadosUsuario(row, perfil) });
}));

// ----- Afiliação (herda o patrocinador) -----
app.post('/api/afiliar', auth, wrap(async (req, res) => {
  if (req.user.perfil === 'admin') return res.status(403).json({ erro: 'O administrador não precisa se afiliar.' });
  const usuario = req.user.usuario;
  const nome = txt(req.body.nome, 100), email = txt(req.body.email, 120);
  const cpf = txt(req.body.cpf, 20), pix = txt(req.body.pix, 100);
  const telefone = soDigitos(req.body.telefone);

  if (!nome || !semTags(nome)) return res.status(400).json({ erro: 'Informe um nome válido.' });
  if (!RE_EMAIL.test(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  if (!cpf || !RE_CPF.test(cpf)) return res.status(400).json({ erro: 'Informe um CPF válido (somente números, pontos e hífen).' });
  if (!pix || !RE_PIX.test(pix)) return res.status(400).json({ erro: 'Informe uma chave Pix válida.' });
  if (!RE_TEL.test(telefone)) return res.status(400).json({ erro: 'Informe um telefone/WhatsApp de contato com DDD (somente números).' });

  await q('UPDATE contas SET telefone = $2 WHERE usuario = $1', [usuario, telefone]);

  // Já é afiliado: atualiza só os dados; patrocinador e valores são preservados
  const existente = (await q('SELECT * FROM afiliados WHERE usuario = $1', [usuario])).rows[0];
  if (existente) {
    await q('UPDATE afiliados SET nome=$2, email=$3, cpf=$4, pix=$5, telefone=$6 WHERE usuario=$1', [usuario, nome, email, cpf, pix, telefone]);
    return res.json({ ok: true, id: existente.id, patrocinadorId: existente.patrocinador_id, patrocinadorUsuario: await usuarioDoPatrocinador(existente.patrocinador_id) });
  }

  const conta = (await q('SELECT senha_hash FROM contas WHERE usuario = $1', [usuario])).rows[0];
  if (!conta) return res.status(404).json({ erro: 'Conta não encontrada.' });

  // Patrocinador: indicador do link, se for afiliado válido e não for ele mesmo; senão a Central
  let patrocinadorId = 'admin', patrocinadorUsuario = null;
  const indicador = norm(req.body.indicador);
  if (indicador && indicador !== 'admin' && indicador !== usuario) {
    const pai = (await q('SELECT id, usuario FROM afiliados WHERE usuario = $1', [indicador])).rows[0];
    if (pai) { patrocinadorId = pai.id; patrocinadorUsuario = pai.usuario; }
  }

  const id = 'AF-' + usuario.toUpperCase();
  await q(`INSERT INTO afiliados (id, usuario, nome, email, cpf, pix, telefone, senha_hash, patrocinador_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, usuario, nome, email, cpf, pix, telefone, conta.senha_hash, patrocinadorId]);
  res.json({ ok: true, id, patrocinadorId, patrocinadorUsuario });
}));

app.get('/api/patrocinador/:usuario', limitarTentativas, wrap(async (req, res) => {
  const u = norm(req.params.usuario);
  if (u === 'admin' || u === ADMIN_USUARIO) return res.json({ usuario: 'admin', nome: 'Central (Administrador)' });
  const r = await q('SELECT usuario, nome FROM afiliados WHERE usuario = $1 OR lower(id) = $1', [u]);
  if (!r.rows.length) return res.status(404).json({ erro: 'Patrocinador não encontrado.' });
  res.json(r.rows[0]);
}));

// Painel "Área do Afiliado": o administrador vê TODAS as gerações; o afiliado vê só os indicados diretos
app.get('/api/rede', auth, wrap(async (req, res) => {
  const lista = await afiliadosComComissao();
  const taxas = await lerTaxas();
  const valorMinimoSaque = Number(await lerConfig('valorMinimoSaque', VALOR_MINIMO_SAQUE_PADRAO));
  const calendarioSaque = calendarioSaqueHoje();

  if (req.user.perfil === 'admin') {
    const arvore = arvoreOrdenada(lista).map(a => {
      const pai = lista.find(p => p !== a && ehFilhoDe(a, p));
      return {
        id: a.id, usuario: a.usuario, nome: a.nome, email: a.email, criadoEm: a.criadoEm, nivel: a.nivel,
        patrocinadorUsuario: pai ? pai.usuario : 'admin', patrocinadorNome: pai ? pai.nome : 'Central (Administrador)',
        vendasDiretas: a.vendasDiretas, comissaoDireta: a.comissaoDireta, comissaoRede: a.comissaoRede,
        comissaoTotal: a.comissaoTotal, comissaoCentral: a.comissaoCentral, filhosDiretos: a.filhosDiretos
      };
    });
    const t = (await q(`SELECT count(*)::int AS qtd, COALESCE(sum(valor), 0) AS faturado,
        COALESCE(sum(comissao), 0) AS vend, COALESCE(sum(comissao_patrocinador), 0) AS pat,
        COALESCE(sum(comissao_avo), 0) AS avo, COALESCE(sum(comissao_central), 0) AS cen
      FROM pedidos WHERE status = 'pago'`)).rows[0];
    return res.json({
      visao: 'admin', taxas, afiliados: arvore, valorMinimoSaque,
      calendarioSaque,
      resumo: {
        vendasPagas: t.qtd, faturado: dinheiro(t.faturado), comissaoCentral: dinheiro(t.cen),
        totalADistribuir: dinheiro(Number(t.vend) + Number(t.pat) + Number(t.avo)), totalAfiliados: lista.length,
        geracoes: arvore.reduce((m, a) => Math.max(m, a.nivel), 0)
      }
    });
  }

  const eu = lista.find(a => a.usuario === req.user.usuario);
  if (!eu) return res.status(404).json({ erro: 'Você ainda não é afiliado. Clique em "Afilia-se" na loja.' });
  const pai = lista.find(p => p !== eu && ehFilhoDe(eu, p));
  const ganhos = (await q(`SELECT afiliado_usuario AS u, sum(comissao_patrocinador) AS total
      FROM pedidos WHERE status = 'pago' AND patrocinador_usuario = $1 GROUP BY 1`, [eu.usuario])).rows;
  const filhos = lista.filter(f => ehFilhoDe(f, eu)).map(f => ({
    usuario: f.usuario, nome: f.nome, criadoEm: f.criadoEm, vendas: f.vendasDiretas,
    minhaComissao: dinheiro((ganhos.find(g => g.u === f.usuario) || {}).total)
  }));
  res.json({
    visao: 'afiliado', taxas, filhos, valorMinimoSaque,
    calendarioSaque,
    eu: {
      id: eu.id, usuario: eu.usuario, nome: eu.nome, vendasDiretas: eu.vendasDiretas, vendasRede: eu.vendasRede,
      comissaoDireta: eu.comissaoDireta, comissaoRede: eu.comissaoRede, comissaoTotal: eu.comissaoTotal,
      comissaoPendente: eu.comissaoPendente, comissaoLiberar: eu.comissaoLiberar,
      filhosDiretos: eu.filhosDiretos, patrocinadorNome: pai ? pai.nome : 'Central (Administrador)'
    }
  });
}));

// ----- Checkout, pedidos e confirmação de pagamento -----
const FORMAS = ['pix', 'cartao', 'debito'];

// 1) Cliente finaliza o checkout: registra o pedido como AGUARDANDO (sem comissão).
//    Preço vem do banco (nunca do navegador). Afiliado inválido ou o próprio comprador => venda direta.
app.post('/api/checkout', limitarTentativas, wrap(async (req, res) => {
  const produtoId = norm(req.body.produtoId);
  const nome = txt(req.body.nome, 100), email = txt(req.body.email, 120);
  const cpf = soDigitos(req.body.cpf);
  const forma = norm(req.body.forma);
  let afiliado = norm(req.body.afiliado).replace(/[^a-z0-9_.-]/g, '');

  if (!nome || !semTags(nome)) return res.status(400).json({ erro: 'Informe seu nome completo.' });
  if (!RE_EMAIL.test(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  if (cpf.length !== 11) return res.status(400).json({ erro: 'Informe um CPF válido (11 números).' });
  if (!FORMAS.includes(forma)) return res.status(400).json({ erro: 'Forma de pagamento inválida.' });

  const produtos = await lerConfig('produtos', PRODUTOS_INICIAIS);
  const prod = produtos.find(p => norm(p.id) === produtoId);
  if (!prod) return res.status(400).json({ erro: 'Produto não encontrado.' });

  let afiliadoValido = false;
  if (afiliado) {
    const af = (await q('SELECT usuario, cpf, email FROM afiliados WHERE usuario = $1', [afiliado])).rows[0];
    const proprioComprador = af && (soDigitos(af.cpf) === cpf || norm(af.email) === norm(email));
    if (af && !proprioComprador) afiliadoValido = true;
    else afiliado = '';
  }

  const pedidoId = crypto.randomBytes(8).toString('hex');
  const downloadToken = crypto.randomBytes(32).toString('hex');
  await q(`INSERT INTO pedidos (id, afiliado_usuario, produto_id, produto_nome, valor, forma, cliente_nome, cliente_email, cliente_cpf, download_token)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [pedidoId, afiliadoValido ? afiliado : null, prod.id, prod.nome, Number(prod.precoPor), forma, nome, email, cpf, downloadToken]);

  res.json({
    pedidoId, produtoNome: prod.nome, valor: Number(prod.precoPor), forma,
    pixChave: String(await lerConfig('pixChave', '')), afiliadoValido, downloadToken
  });
}));

async function consultarPagamentoMercadoPago(id) {
  const accessToken = MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MERCADO_PAGO_ACCESS_TOKEN ou ACCESS_TOKEN não está configurado.');
  const resposta = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000)
  });
  const dados = await resposta.json().catch(() => ({}));
  return { ok: resposta.ok, statusCode: resposta.status, dados };
}

app.post('/api/checkout/:id/pagar', limitarTentativas, wrap(async (req, res) => {
  const tokenPedido = txt(req.get('x-download-token'), 64);
  const pedido = (await q('SELECT * FROM pedidos WHERE id = $1', [req.params.id])).rows[0];
  if (!pedido || !/^[a-f0-9]{64}$/i.test(tokenPedido) || !pedido.download_token || !igual(tokenPedido, pedido.download_token)) {
    return res.status(404).json({ erro: 'Pedido não encontrado.' });
  }
  if (pedido.status === 'pago') return res.status(409).json({ erro: 'Este pedido já foi pago.' });
  if (pedido.status !== 'aguardando') return res.status(409).json({ erro: 'Este pedido não está disponível para pagamento.' });
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    return res.status(503).json({ erro: 'O pagamento está temporariamente indisponível. Tente novamente mais tarde.' });
  }

  if (pedido.payment_id && ['pending', 'in_process'].includes(pedido.payment_status)) {
    return res.json({
      pedidoId: pedido.id, produtoNome: pedido.produto_nome, valor: Number(pedido.valor),
      forma: pedido.forma, paymentId: pedido.payment_id, status: pedido.payment_status,
      qrCode: pedido.payment_qr_code, qrCodeBase64: pedido.payment_qr_code_base64
    });
  }

  const metodo = pedido.forma;
  const pagamento = {
    transaction_amount: Number(pedido.valor),
    description: pedido.produto_nome,
    statement_descriptor: 'TECH SOFTWARE',
    external_reference: pedido.id,
    notification_url: process.env.MERCADO_PAGO_WEBHOOK_URL || undefined,
    payer: {
      email: pedido.cliente_email,
      first_name: pedido.cliente_nome.split(/\s+/)[0],
      identification: { type: 'CPF', number: soDigitos(pedido.cliente_cpf) }
    }
  };

  if (metodo === 'pix') {
    pagamento.payment_method_id = 'pix';
  } else {
    const formData = req.body && req.body.paymentData;
    const cardToken = txt(formData && formData.token, 200);
    const paymentMethodId = txt(formData && formData.payment_method_id, 60);
    const issuerId = txt(formData && formData.issuer_id, 30);
    const installments = Number(formData && formData.installments);
    if (!cardToken || !/^[a-zA-Z0-9_-]+$/.test(cardToken)
      || !/^[a-zA-Z0-9_-]+$/.test(paymentMethodId)
      || !Number.isInteger(installments) || installments < 1 || installments > 12) {
      return res.status(400).json({ erro: 'Os dados tokenizados do cartão são inválidos. Revise os dados e tente novamente.' });
    }
    pagamento.token = cardToken;
    pagamento.payment_method_id = paymentMethodId;
    pagamento.installments = installments;
    if (issuerId) pagamento.issuer_id = issuerId;
  }

  const accessToken = MERCADO_PAGO_ACCESS_TOKEN;
  let resposta;
  try {
    resposta = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify(pagamento),
      signal: AbortSignal.timeout(15000)
    });
  } catch (erro) {
    console.error('Falha ao conectar com o Mercado Pago:', erro.message);
    return res.status(502).json({ erro: 'Não foi possível conectar ao processador de pagamentos. Tente novamente.' });
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !dados.id) {
    console.error(`Mercado Pago recusou a criação do pagamento (HTTP ${resposta.status}).`);
    const detalhe = txt(dados.message || dados.cause?.[0]?.description, 240);
    return res.status(502).json({ erro: detalhe || 'O Mercado Pago não conseguiu processar o pagamento.' });
  }

  const qr = dados.point_of_interaction?.transaction_data || {};
  await q(`UPDATE pedidos
    SET payment_id = $2, payment_status = $3, payment_qr_code = $4, payment_qr_code_base64 = $5
    WHERE id = $1`,
  [pedido.id, String(dados.id), txt(dados.status, 40), txt(qr.qr_code, 3000), txt(qr.qr_code_base64, 100000)]);

  res.json({
    pedidoId: pedido.id, produtoNome: pedido.produto_nome, valor: Number(pedido.valor),
    forma: pedido.forma, paymentId: String(dados.id), status: String(dados.status || ''),
    statusDetail: String(dados.status_detail || ''), qrCode: qr.qr_code || '',
    qrCodeBase64: qr.qr_code_base64 || '', ticketUrl: qr.ticket_url || ''
  });
}));

async function sincronizarPagamentoMercadoPago(idPagamento, pagamentoRecebido) {
  const consulta = pagamentoRecebido
    ? { ok: true, dados: pagamentoRecebido }
    : await consultarPagamentoMercadoPago(idPagamento);
  if (!consulta.ok) {
    console.error(`Erro ao consultar pagamento no Mercado Pago: HTTP ${consulta.statusCode}.`);
    return null;
  }
  const pagamento = consulta.dados;
  const pedidoId = txt(pagamento.external_reference, 64);
  const pedido = (await q('SELECT * FROM pedidos WHERE id = $1 AND payment_id = $2', [pedidoId, String(pagamento.id)])).rows[0];
  if (!pedido || String(pagamento.currency_id || '').toUpperCase() !== 'BRL'
    || dinheiro(pagamento.transaction_amount) !== dinheiro(pedido.valor)) {
    console.error(`Pagamento ${idPagamento} sem pedido correspondente ou com valor divergente.`);
    return null;
  }

  const statusPagamento = String(pagamento.status || '').toLowerCase();
  await q('UPDATE pedidos SET payment_status = $2 WHERE id = $1', [pedido.id, statusPagamento]);
  if (statusPagamento === 'approved' && pedido.status === 'aguardando') {
    await confirmarPedido(pedido.id);
  } else if (['cancelled', 'refunded', 'charged_back'].includes(statusPagamento)) {
    if (pedido.status === 'aguardando' && statusPagamento === 'cancelled') {
      await q("UPDATE pedidos SET status = 'cancelado' WHERE id = $1 AND status = 'aguardando'", [pedido.id]);
    } else if (pedido.status === 'pago') {
      await q("UPDATE pedidos SET status = 'reembolsado' WHERE id = $1 AND status = 'pago'", [pedido.id]);
    }
  }
  return { pedidoId: pedido.id, statusPagamento };
}

app.get('/api/checkout/:id/download', limitarTentativas, wrap(async (req, res) => {
  const token = txt(req.get('x-download-token'), 64);
  const pedido = (await q('SELECT produto_id, status, download_token FROM pedidos WHERE id = $1', [req.params.id])).rows[0];
  if (!pedido || !/^[a-f0-9]{64}$/i.test(token) || !pedido.download_token || !igual(token, pedido.download_token)) {
    return res.status(404).json({ erro: 'Pedido não encontrado.' });
  }
  if (pedido.status !== 'pago') return res.status(409).json({ erro: 'Pagamento ainda não confirmado.' });

  const produtos = await lerConfig('produtos', PRODUTOS_INICIAIS);
  const produto = produtos.find(p => norm(p.id) === norm(pedido.produto_id));
  const arquivo = produto ? txt(produto.pdf, 8192) : '';
  if (!arquivo || (/^[a-z][a-z0-9+.-]*:/i.test(arquivo) && !ehUrlWeb(arquivo))) {
    return res.status(404).json({ erro: 'Arquivo do produto não configurado.' });
  }
  res.json({ ok: true, url: arquivo });
}));

app.get('/api/checkout/:id/status', limitarConsultasStatusCheckout, wrap(async (req, res) => {
  const token = txt(req.get('x-download-token'), 64);
  let pedido = (await q('SELECT id, status, payment_id, payment_status, download_token FROM pedidos WHERE id = $1', [req.params.id])).rows[0];
  if (!pedido || !/^[a-f0-9]{64}$/i.test(token) || !pedido.download_token || !igual(token, pedido.download_token)) {
    return res.status(404).json({ erro: 'Pedido não encontrado.' });
  }
  if (pedido.payment_id && MERCADO_PAGO_ACCESS_TOKEN) {
    await sincronizarPagamentoMercadoPago(pedido.payment_id);
    pedido = (await q('SELECT id, status, payment_id, payment_status FROM pedidos WHERE id = $1', [req.params.id])).rows[0];
  }
  res.json({ pedidoId: pedido.id, status: pedido.status, paymentStatus: pedido.payment_status || '' });
}));

// 2) Administração dos pedidos
app.get('/api/pedidos', auth, soAdmin, wrap(async (req, res) => {
  const r = await q(`SELECT * FROM pedidos
    ORDER BY (status = 'aguardando') DESC, criado_em DESC LIMIT 100`);
  res.json(r.rows.map(p => ({
    id: p.id, afiliado: p.afiliado_usuario, produtoId: p.produto_id, produtoNome: p.produto_nome,
    valor: Number(p.valor), comissao: Number(p.comissao), status: p.status, forma: p.forma,
    clienteNome: p.cliente_nome, clienteEmail: p.cliente_email, clienteCpf: p.cliente_cpf,
    criadoEm: p.criado_em, pagoEm: p.pago_em
  })));
}));

// Muda o status de um pedido numa transação (só as transições válidas passam)
async function mudarPedido(id, de, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ped = (await client.query('SELECT * FROM pedidos WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!ped) { await client.query('ROLLBACK'); return { codigo: 404, erro: 'Pedido não encontrado.' }; }
    if (ped.status !== de) { await client.query('ROLLBACK'); return { codigo: 409, erro: `Este pedido está "${ped.status}" e não pode receber essa ação.` }; }
    const resultado = await fn(client, ped);
    await client.query('COMMIT');
    return { codigo: 200, ...resultado };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
const responder = (res, r) => res.status(r.codigo).json(r.codigo === 200 ? { ok: true, ...r } : { erro: r.erro });

async function afiliadoPorReferencia(client, referencia) {
  const ref = norm(referencia);
  if (!ref || ref === 'admin') return null;
  return (await client.query(
    'SELECT usuario, pix, patrocinador_id FROM afiliados WHERE lower(id) = $1 OR usuario = $1 LIMIT 1',
    [ref]
  )).rows[0] || null;
}

// Confirmação de recebimento: grava os três níveis, sem comissões abaixo do avô.
async function confirmarPedido(id) {
  return mudarPedido(id, 'aguardando', async (client, ped) => {
    const taxas = await lerTaxas();
    const valor = Number(ped.valor);
    let vendedor = 0, patrocinador = 0, avo = 0;
    let patrocinadorUsuario = null, avoUsuario = null;
    let pixVendedor = '', pixPatrocinador = '', pixAvo = '';

    if (ped.afiliado_usuario) {
      const af = (await client.query('SELECT usuario, pix, patrocinador_id FROM afiliados WHERE usuario = $1', [ped.afiliado_usuario])).rows[0];
      if (af) {
        vendedor = centavos(valor, taxas.taxaComissao);
        pixVendedor = af.pix || '';
        const pai = await afiliadoPorReferencia(client, af.patrocinador_id);
        if (pai && pai.usuario !== af.usuario) {
          patrocinadorUsuario = pai.usuario;
          patrocinador = centavos(valor, taxas.taxaPatrocinador);
          pixPatrocinador = pai.pix || '';

          const avoAfiliado = await afiliadoPorReferencia(client, pai.patrocinador_id);
          if (avoAfiliado && avoAfiliado.usuario !== af.usuario && avoAfiliado.usuario !== pai.usuario) {
            avoUsuario = avoAfiliado.usuario;
            avo = centavos(valor, TAXA_AVO_PADRAO);
            pixAvo = avoAfiliado.pix || '';
          }
        }
      }
    }
    const central = dinheiro(valor - vendedor - patrocinador - avo);

    await client.query(
      `UPDATE pedidos SET status = 'pago', comissao = $2, patrocinador_usuario = $3,
         comissao_patrocinador = $4, avo_usuario = $5, comissao_avo = $6,
         pix_comissao_direta = $7, pix_comissao_patrocinador = $8, pix_comissao_avo = $9,
         comissao_central = $10, pago_em = now(),
         status_comissao_direta = 'PENDENTE', data_pagamento_comissao_direta = NULL,
         status_comissao_patrocinador = 'PENDENTE', data_pagamento_comissao_patrocinador = NULL,
         status_comissao_avo = 'PENDENTE', data_pagamento_comissao_avo = NULL
       WHERE id = $1`,
      [ped.id, vendedor, patrocinadorUsuario, patrocinador, avoUsuario, avo,
        pixVendedor || '', pixPatrocinador || '', pixAvo || '', central]);
    return {
      comissao: vendedor, comissaoPatrocinador: patrocinador,
      comissaoAvo: avo, comissaoCentral: central
    };
  });
}

app.post('/api/pedidos/:id/confirmar', auth, soAdmin, wrap(async (req, res) => {
  const pedido = (await q('SELECT payment_id FROM pedidos WHERE id = $1', [req.params.id])).rows[0];
  if (pedido && pedido.payment_id) {
    await sincronizarPagamentoMercadoPago(pedido.payment_id);
    const atualizado = (await q('SELECT status FROM pedidos WHERE id = $1', [req.params.id])).rows[0];
    if (atualizado?.status !== 'pago') {
      return res.status(409).json({ erro: 'Este pagamento ainda não foi aprovado pelo Mercado Pago.' });
    }
    return res.json({ ok: true, status: 'pago' });
  }
  const r = await confirmarPedido(req.params.id);
  responder(res, r);
}));

app.post('/api/pedidos/:id/cancelar', auth, soAdmin, wrap(async (req, res) => {
  const r = await mudarPedido(req.params.id, 'aguardando', async (client, ped) => {
    await client.query("UPDATE pedidos SET status = 'cancelado' WHERE id = $1", [ped.id]);
    return {};
  });
  responder(res, r);
}));

app.post('/api/pedidos/:id/estornar', auth, soAdmin, wrap(async (req, res) => {
  const r = await mudarPedido(req.params.id, 'pago', async (client, ped) => {
    await client.query("UPDATE pedidos SET status = 'reembolsado' WHERE id = $1", [ped.id]);
    return {};
  });
  responder(res, r);
}));

// ----- Produtos e configuração -----
app.get('/api/produtos', wrap(async (req, res) => {
  const produtos = await lerConfig('produtos', PRODUTOS_INICIAIS);
  res.json(produtos.map(({ pdf, ...produto }) => produto));
}));

app.get('/api/admin/produtos', auth, soAdmin, wrap(async (req, res) => {
  res.json(await lerConfig('produtos', PRODUTOS_INICIAIS));
}));

app.put('/api/produtos', auth, soAdmin, wrap(async (req, res) => {
  const lista = req.body;
  if (!Array.isArray(lista) || lista.length > 100) return res.status(400).json({ erro: 'Lista de produtos inválida.' });
  const limpa = lista.map(p => ({
    id: txt(p.id, 40), nome: txt(p.nome, 120), desc: txt(p.desc, 500),
    custo: Number(p.custo) || 0, precoDe: Number(p.precoDe) || 0, precoPor: Number(p.precoPor) || 0,
    imagem: /^https?:\/\//.test(txt(p.imagem, 500)) ? txt(p.imagem, 500) : '',
    video: txt(p.video, 500), pdf: txt(p.pdf, 8192)
  }));
  if (limpa.some(p => !p.id || !p.nome)) return res.status(400).json({ erro: 'Todo produto precisa de id e nome.' });
  if (limpa.some(p => p.pdf && /^[a-z][a-z0-9+.-]*:/i.test(p.pdf) && !ehUrlWeb(p.pdf))) {
    return res.status(400).json({ erro: 'O arquivo deve ser uma URL pública HTTP ou HTTPS, ou um caminho relativo válido.' });
  }
  await gravarConfig('produtos', limpa);
  res.json({ ok: true });
}));

app.get('/api/config', wrap(async (req, res) => {
  const calendarioSaque = calendarioSaqueHoje();
  res.json({
    ...(await lerTaxas()),
    valorMinimoSaque: Number(await lerConfig('valorMinimoSaque', VALOR_MINIMO_SAQUE_PADRAO)),
    calendarioSaque,
    pixChave: String(await lerConfig('pixChave', '')),
    whatsappSuporte: String(await lerConfig('whatsappSuporte', ''))
  });
}));

app.put('/api/config', auth, soAdmin, wrap(async (req, res) => {
  const taxasAtuais = await lerTaxas();
  const taxaComissao = req.body.taxaComissao === undefined ? taxasAtuais.taxaComissao : req.body.taxaComissao;
  const taxaPatrocinador = req.body.taxaPatrocinador === undefined ? taxasAtuais.taxaPatrocinador : req.body.taxaPatrocinador;
  if (typeof taxaComissao !== 'number' || !Number.isFinite(taxaComissao) || taxaComissao < 0 || taxaComissao > 100
    || typeof taxaPatrocinador !== 'number' || !Number.isFinite(taxaPatrocinador) || taxaPatrocinador < 0 || taxaPatrocinador > 100) {
    return res.status(400).json({ erro: 'As comissões devem ser números entre 0% e 100%.' });
  }
  if (taxaComissao + taxaPatrocinador + TAXA_AVO_PADRAO > 100) {
    return res.status(400).json({ erro: `A soma das comissões distribuídas, incluindo os ${TAXA_AVO_PADRAO}% do avô, não pode ultrapassar 100%.` });
  }

  if (req.body.valorMinimoSaque !== undefined) {
    const valorMinimoSaque = req.body.valorMinimoSaque;
    if (typeof valorMinimoSaque !== 'number' || !Number.isFinite(valorMinimoSaque) || valorMinimoSaque < 0) {
      return res.status(400).json({ erro: 'O valor mínimo de saque deve ser um valor numérico igual ou superior a zero.' });
    }
    await gravarConfig('valorMinimoSaque', dinheiro(valorMinimoSaque));
  }

  if (req.body.taxaComissao !== undefined) await gravarConfig('taxaComissao', taxaComissao);
  if (req.body.taxaPatrocinador !== undefined) await gravarConfig('taxaPatrocinador', taxaPatrocinador);

  if (req.body.pixChave !== undefined) {
    const chave = txt(req.body.pixChave, 100);
    if (!RE_PIX.test(chave)) return res.status(400).json({ erro: 'Chave Pix com caracteres inválidos.' });
    await gravarConfig('pixChave', chave);
  }

  if (req.body.whatsappSuporte !== undefined) {
    const d = soDigitos(req.body.whatsappSuporte);
    if (d && (d.length < 10 || d.length > 15)) return res.status(400).json({ erro: 'Informe o WhatsApp do suporte com DDD (somente números).' });
    await gravarConfig('whatsappSuporte', d ? paraWhatsApp(d) : '');
  }
  res.json({ ok: true });
}));

// ----- Suporte: busca de contas, senha temporária e troca obrigatória -----
const ALFABETO_SENHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // sem letras que se confundem (0/O, 1/l/I)
const gerarSenhaTemporaria = () => Array.from({ length: 8 }, () => ALFABETO_SENHA[crypto.randomInt(ALFABETO_SENHA.length)]).join('');

app.get('/api/admin/contas', auth, soAdmin, wrap(async (req, res) => {
  const busca = norm(req.query.q);
  const r = await q(`
    SELECT c.usuario, c.nome, c.email, c.cpf, c.telefone, c.criado_em, c.trocar_senha, (a.usuario IS NOT NULL) AS afiliado
    FROM contas c LEFT JOIN afiliados a ON a.usuario = c.usuario
    WHERE $1 = '' OR lower(c.usuario) LIKE '%' || $1 || '%' OR lower(c.nome) LIKE '%' || $1 || '%'
       OR lower(c.email) LIKE '%' || $1 || '%'
       OR ($2 <> '' AND regexp_replace(c.cpf, '\\D', '', 'g') LIKE '%' || $2 || '%')
       OR ($2 <> '' AND regexp_replace(c.telefone, '\\D', '', 'g') LIKE '%' || $2 || '%')
    ORDER BY c.criado_em DESC LIMIT 30`, [busca, soDigitos(busca)]);
  res.json(r.rows.map(c => ({
    usuario: c.usuario, nome: c.nome, email: c.email, cpf: c.cpf, telefone: c.telefone,
    whatsapp: c.telefone ? paraWhatsApp(c.telefone) : '', afiliado: c.afiliado,
    aguardandoTroca: c.trocar_senha, criadoEm: c.criado_em
  })));
}));

// Gera uma senha nova (a antiga deixa de valer), válida por 24h e com troca obrigatória no primeiro acesso.
// A senha aparece UMA vez, só para o administrador; no banco fica apenas o hash.
app.post('/api/admin/contas/:usuario/senha-temporaria', auth, soAdmin, wrap(async (req, res) => {
  const usuario = norm(req.params.usuario);
  const conta = (await q('SELECT usuario, nome, telefone FROM contas WHERE usuario = $1', [usuario])).rows[0];
  if (!conta) return res.status(404).json({ erro: 'Conta não encontrada.' });
  const senhaTemporaria = gerarSenhaTemporaria();
  const hash = await bcrypt.hash(senhaTemporaria, 10);
  await q("UPDATE contas SET senha_hash = $2, trocar_senha = true, temp_expira = now() + interval '24 hours' WHERE usuario = $1", [usuario, hash]);
  await q('UPDATE afiliados SET senha_hash = $2 WHERE usuario = $1', [usuario, hash]);
  res.json({ usuario, nome: conta.nome, senhaTemporaria, validaHoras: 24, whatsapp: conta.telefone ? paraWhatsApp(conta.telefone) : '' });
}));

// Quem entrou com senha temporária define a senha definitiva (único endereço liberado para esse token)
app.post('/api/senha/alterar', auth, wrap(async (req, res) => {
  if (req.user.perfil === 'admin') return res.status(403).json({ erro: 'A senha do administrador é definida nas variáveis do Render.' });
  const nova = String(req.body.novaSenha || '');
  if (nova.length < 6) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });
  const usuario = req.user.usuario;
  const hash = await bcrypt.hash(nova, 10);
  await q('UPDATE contas SET senha_hash = $2, trocar_senha = false, temp_expira = NULL WHERE usuario = $1', [usuario, hash]);
  await q('UPDATE afiliados SET senha_hash = $2 WHERE usuario = $1', [usuario, hash]);
  let row = (await q('SELECT * FROM afiliados WHERE usuario = $1', [usuario])).rows[0];
  let perfil = 'afiliado';
  if (!row) { row = (await q('SELECT * FROM contas WHERE usuario = $1', [usuario])).rows[0]; perfil = 'cliente'; }
  if (!row) return res.status(404).json({ erro: 'Conta não encontrada.' });
  res.json({ token: gerarToken(usuario, perfil), user: dadosUsuario(row, perfil) });
}));

// ----- Administração de afiliados -----
app.get('/api/afiliados', auth, soAdmin, wrap(async (req, res) => {
  res.json(await afiliadosComComissao());
}));

async function baixarComissoesElegiveis(client, usuarios, inicioMes) {
  if (!usuarios.length) return { valorPago: 0, quantidade: 0, afiliados: [] };
  const baixadas = await client.query(`
    WITH elegiveis AS (
      SELECT id, afiliado_usuario, patrocinador_usuario, avo_usuario,
        status_comissao_direta = 'PENDENTE' AND afiliado_usuario = ANY($1::text[]) AS baixa_direta,
        status_comissao_patrocinador = 'PENDENTE' AND patrocinador_usuario = ANY($1::text[]) AS baixa_patrocinador,
        status_comissao_avo = 'PENDENTE' AND avo_usuario = ANY($1::text[]) AS baixa_avo
      FROM pedidos
      WHERE status = 'pago' AND pago_em < $2::timestamptz
        AND ((afiliado_usuario = ANY($1::text[]) AND status_comissao_direta = 'PENDENTE')
          OR (patrocinador_usuario = ANY($1::text[]) AND status_comissao_patrocinador = 'PENDENTE')
          OR (avo_usuario = ANY($1::text[]) AND status_comissao_avo = 'PENDENTE'))
      FOR UPDATE
    )
    UPDATE pedidos AS p
    SET status_comissao_direta = CASE
          WHEN e.baixa_direta THEN 'PAGO'
          ELSE p.status_comissao_direta
        END,
        data_pagamento_comissao_direta = CASE
          WHEN e.baixa_direta THEN now()
          ELSE p.data_pagamento_comissao_direta
        END,
        status_comissao_patrocinador = CASE
          WHEN e.baixa_patrocinador THEN 'PAGO'
          ELSE p.status_comissao_patrocinador
        END,
        data_pagamento_comissao_patrocinador = CASE
          WHEN e.baixa_patrocinador THEN now()
          ELSE p.data_pagamento_comissao_patrocinador
        END,
        status_comissao_avo = CASE
          WHEN e.baixa_avo THEN 'PAGO'
          ELSE p.status_comissao_avo
        END,
        data_pagamento_comissao_avo = CASE
          WHEN e.baixa_avo THEN now()
          ELSE p.data_pagamento_comissao_avo
        END
    FROM elegiveis AS e
    WHERE p.id = e.id
    RETURNING e.afiliado_usuario, e.patrocinador_usuario, e.avo_usuario,
      e.baixa_direta, e.baixa_patrocinador, e.baixa_avo,
      p.comissao, p.comissao_patrocinador, p.comissao_avo`,
    [usuarios, inicioMes]);

  const totais = new Map(usuarios.map(usuario => [usuario, { valorPago: 0, quantidade: 0 }]));
  for (const row of baixadas.rows) {
    for (const [usuario, coluna, baixar] of [
      [row.afiliado_usuario, 'comissao', row.baixa_direta],
      [row.patrocinador_usuario, 'comissao_patrocinador', row.baixa_patrocinador],
      [row.avo_usuario, 'comissao_avo', row.baixa_avo]
    ]) {
      if (!baixar || !totais.has(usuario)) continue;
      const total = totais.get(usuario);
      total.valorPago += Number(row[coluna]) || 0;
      total.quantidade++;
    }
  }
  const afiliados = Array.from(totais, ([usuario, total]) => ({
    usuario, valorPago: dinheiro(total.valorPago), quantidade: total.quantidade
  })).filter(af => af.quantidade > 0);
  return {
    valorPago: dinheiro(afiliados.reduce((soma, af) => soma + af.valorPago, 0)),
    quantidade: afiliados.reduce((soma, af) => soma + af.quantidade, 0),
    afiliados
  };
}

app.post('/api/admin/afiliados/:id/pagar', auth, soAdmin, wrap(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const calendario = calendarioSaqueHoje();
    if (!calendario.liberado) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: `Os pagamentos de comissão são liberados somente no 5º dia útil do mês (${calendario.dataSaque}).` });
    }

    const afiliado = (await client.query(
      'SELECT usuario FROM afiliados WHERE id = $1 FOR UPDATE',
      [req.params.id]
    )).rows[0];
    if (!afiliado) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Afiliado não encontrado.' });
    }

    const valorMinimoSaque = Number(await lerConfig('valorMinimoSaque', VALOR_MINIMO_SAQUE_PADRAO));
    const inicioMes = dataInicioMesBrasil();
    const saldo = (await client.query(`
      SELECT COALESCE(
        (SELECT sum(comissao) FROM pedidos
         WHERE status = 'pago' AND status_comissao_direta = 'PENDENTE'
           AND afiliado_usuario = $1 AND pago_em < $2::timestamptz), 0
      ) + COALESCE(
        (SELECT sum(comissao_patrocinador) FROM pedidos
         WHERE status = 'pago' AND status_comissao_patrocinador = 'PENDENTE'
           AND patrocinador_usuario = $1 AND pago_em < $2::timestamptz), 0
      ) + COALESCE(
        (SELECT sum(comissao_avo) FROM pedidos
         WHERE status = 'pago' AND status_comissao_avo = 'PENDENTE'
           AND avo_usuario = $1 AND pago_em < $2::timestamptz), 0
      ) AS total`, [afiliado.usuario, inicioMes])).rows[0];
    const totalElegivel = dinheiro(saldo.total);
    if (totalElegivel < valorMinimoSaque) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        erro: `Pagamento não realizado: o saldo está abaixo do mínimo exigido de R$ ${valorMinimoSaque.toFixed(2)}. O valor continuará acumulado.`
      });
    }

    const resultado = await baixarComissoesElegiveis(client, [afiliado.usuario], inicioMes);
    await client.query('COMMIT');
    res.json({ ok: true, afiliado: afiliado.usuario, ...resultado });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/api/admin/afiliados/liquidar-lote', auth, soAdmin, wrap(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const calendario = calendarioSaqueHoje();
    if (!calendario.liberado) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: `O fechamento de pagamentos só pode ser processado no 5º dia útil do mês (${calendario.dataSaque}).` });
    }

    const afiliados = await client.query('SELECT usuario FROM afiliados ORDER BY usuario FOR UPDATE');
    const valorMinimoSaque = Number(await lerConfig('valorMinimoSaque', VALOR_MINIMO_SAQUE_PADRAO));
    const inicioMes = dataInicioMesBrasil();
    const elegiveis = await client.query(`
      SELECT u FROM (
        SELECT afiliado_usuario AS u, comissao AS valor
        FROM pedidos
        WHERE status = 'pago' AND status_comissao_direta = 'PENDENTE'
          AND afiliado_usuario IS NOT NULL AND pago_em < $1::timestamptz
        UNION ALL
        SELECT patrocinador_usuario AS u, comissao_patrocinador AS valor
        FROM pedidos
        WHERE status = 'pago' AND status_comissao_patrocinador = 'PENDENTE'
          AND patrocinador_usuario IS NOT NULL AND pago_em < $1::timestamptz
        UNION ALL
        SELECT avo_usuario AS u, comissao_avo AS valor
        FROM pedidos
        WHERE status = 'pago' AND status_comissao_avo = 'PENDENTE'
          AND avo_usuario IS NOT NULL AND pago_em < $1::timestamptz
      ) AS pendentes
      GROUP BY u
      HAVING sum(valor) >= $2 AND sum(valor) > 0`,
      [inicioMes, valorMinimoSaque]);

    const usuariosExistentes = new Set(afiliados.rows.map(af => af.usuario));
    const usuariosElegiveis = elegiveis.rows
      .map(af => af.u)
      .filter(usuario => usuariosExistentes.has(usuario));
    const resultado = await baixarComissoesElegiveis(client, usuariosElegiveis, inicioMes);

    await client.query('COMMIT');
    res.json({
      ok: true,
      valorMinimoSaque,
      afiliadosLiquidados: resultado.afiliados.length,
      valorPago: resultado.valorPago,
      quantidade: resultado.quantidade,
      afiliados: resultado.afiliados
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.delete('/api/afiliados/:id', auth, soAdmin, wrap(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const alvo = (await client.query('SELECT * FROM afiliados WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!alvo) { await client.query('ROLLBACK'); return res.status(404).json({ erro: 'Afiliado não encontrado.' }); }
    // Preserva a rede: os filhos sobem para o patrocinador do excluído
    await client.query(
      'UPDATE afiliados SET patrocinador_id = $2 WHERE id <> $1 AND lower(patrocinador_id) IN (lower($1), lower($3))',
      [alvo.id, alvo.patrocinador_id, alvo.usuario]);
    await client.query('DELETE FROM afiliados WHERE id = $1', [alvo.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// Recebe notificações do Mercado Pago e sincroniza o estado da licença no Neon.
app.post('/api/webhook/mercadopago', async (req, res) => {
  const responderOk = () => res.status(200).send('OK');
  try {
    const idPagamento = req.query.id || req.query['data.id']
      || req.body?.data?.id || req.body?.id || req.body?.payment_id;
    if (!idPagamento) {
      console.warn('Notificação de Webhook recebida sem ID de pagamento.');
      return responderOk();
    }

    const id = String(idPagamento);
    if (!/^\d+$/.test(id)) {
      console.warn('Notificação de Webhook recebida com ID de pagamento inválido.');
      return responderOk();
    }

    const accessToken = MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      console.error('MERCADO_PAGO_ACCESS_TOKEN ou ACCESS_TOKEN não está configurado.');
      return responderOk();
    }

    console.log(`Notificação de pagamento recebida para o ID: ${id}`);
    const resposta = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!resposta.ok) {
      console.error(`Erro ao consultar o pagamento ${id} na API do Mercado Pago: HTTP ${resposta.status}`);
      return responderOk();
    }

    const dadosPagamento = await resposta.json();
    const status = String(dadosPagamento.status || '').toLowerCase();
    const sincronizado = await sincronizarPagamentoMercadoPago(id, dadosPagamento);
    if (!sincronizado) return responderOk();
    const cpf = txt(
      dadosPagamento.payer?.identification?.number
        || dadosPagamento.additional_info?.payer?.identification?.number
        || '',
      30
    );
    const email = txt(dadosPagamento.payer?.email || '', 254);
    const valor = Number(dadosPagamento.transaction_amount);
    const produto = txt(
      dadosPagamento.description
        || dadosPagamento.additional_info?.items?.[0]?.title
        || 'CMV Food Light',
      200
    ) || 'CMV Food Light';

    if (status === 'approved') {
      if (!Number.isFinite(valor) || valor <= 0) {
        console.error(`Pagamento ${id} aprovado, mas o valor retornado é inválido.`);
        return responderOk();
      }

      await q(`
        INSERT INTO vendas_aprovadas (payment_id, cpf, email, produto, valor, hwid, status, ativa)
        VALUES ($1, $2, $3, $4, $5, NULL, 'APROVADO', TRUE)
        ON CONFLICT (payment_id)
        DO UPDATE SET status = 'APROVADO', ativa = TRUE`,
      [id, cpf, email, produto, valor]);

      const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
      console.log(`Pagamento aprovado e licença ativada. ID: ${id} | Comprador: ${email || 'não informado'} | Valor: ${valorFormatado}`);
    } else if (['refunded', 'cancelled', 'charged_back'].includes(status)) {
      const resultado = await q(
        'UPDATE vendas_aprovadas SET ativa = FALSE, status = $1 WHERE payment_id = $2',
        [status, id]
      );
      console.log(`Pagamento ${status === 'refunded' ? 'estornado' : status === 'cancelled' ? 'cancelado' : 'contestado'}; licença desativada. ID: ${id} | Registros atualizados: ${resultado.rowCount}`);
    } else {
      console.log(`Pagamento ${id} recebido com status "${status || 'não informado'}"; nenhuma alteração de licença.`);
    }
  } catch (erro) {
    console.error('Erro no processamento do Webhook do Mercado Pago:', erro);
  }
  return responderOk();
});

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((err, req, res, next) => {
  if (req.path === '/api/webhook/mercadopago') return res.status(200).send('OK');
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Requisição inválida.' });
  if (err.code === '23505') return res.status(409).json({ erro: 'Registro já existe.' });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;
iniciarBanco()
  .then(() => app.listen(PORT, () => console.log('Loja Tech rodando na porta ' + PORT)))
  .catch(e => { console.error('Falha ao iniciar o banco:', e.message); process.exit(1); });
