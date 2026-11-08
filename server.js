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
const CJ_TOKEN = (process.env.CJ_TOKEN || '').trim();
const CJ_BASE_URL = 'https://developers.cjdropshipping.com/api2.0/v1';
if (!DATABASE_URL || !JWT_SECRET || !ADMIN_SENHA) {
  console.error('Defina DATABASE_URL, JWT_SECRET e ADMIN_SENHA nas variáveis de ambiente.');
  process.exit(1);
}

// ===== Regras padrão de comissão =====
const TAXA_COMISSAO_PADRAO = 35;
const TAXA_PATROCINADOR_PADRAO = 10;
const TAXA_AVO_PADRAO = 5;
const VALOR_MINIMO_SAQUE_PADRAO = 50;
const MAX_PARCELAS_CARTAO = 12;

const normalizarMaxParcelasSemJuros = valor => {
  const parcelas = Number(valor);
  return Number.isInteger(parcelas) && parcelas >= 0 && parcelas <= MAX_PARCELAS_CARTAO ? parcelas : 1;
};

const dataIso = valor => {
  if (!valor) return null;
  return valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
};

const PRODUTOS_INICIAIS = [
  { id: 'lite', nome: 'CMV Food Lite', desc: 'Início prático e direto para controle de fichas técnicas básicas.', custo: 10.00, precoDe: 69.99, precoPor: 49.99, imagem: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&auto=format&fit=crop&q=60', video: '', pdf: '', repasseJurosComprador: true, maxParcelasSemJuros: 1 },
  { id: 'pro', nome: 'CMV Food Pro', desc: 'Inclui módulo de Metas de Lucro Bruto e painel visual.', custo: 15.00, precoDe: 99.99, precoPor: 79.99, imagem: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60', video: '', pdf: '', repasseJurosComprador: true, maxParcelasSemJuros: 1 },
  { id: 'plus', nome: 'CMV Food Plus', desc: 'Versão definitiva com base de clientes e suporte VIP.', custo: 20.00, precoDe: 119.00, precoPor: 99.99, imagem: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=500&auto=format&fit=crop&q=60', video: '', pdf: '', repasseJurosComprador: true, maxParcelasSemJuros: 1 }
];

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
const q = (sql, params) => pool.query(sql, params);
pool.on('error', err => console.error('ERRO NO NEON:', err));

// ===== Utilitários =====
const norm = t => (t == null ? '' : String(t).trim().toLowerCase());
const normUsuario = t => String(t == null ? '' : t)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, '-');
const txt = (t, max = 120) => String(t == null ? '' : t).trim().slice(0, max);
const codigoPixValido = valor => {
  const codigo = String(valor == null ? '' : valor);
  if (codigo.length < 20 || codigo.length > 10000 || !codigo.startsWith('000201')) return false;
  const inicioCrc = codigo.length - 8;
  const crcInformado = codigo.slice(-4).toUpperCase();
  if (codigo.slice(inicioCrc, inicioCrc + 4) !== '6304' || !/^[0-9A-F]{4}$/.test(crcInformado)) return false;

  let crc = 0xFFFF;
  for (const byte of Buffer.from(codigo.slice(0, -4), 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).padStart(4, '0').toUpperCase() === crcInformado;
};
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
const ehCaminhoImagemLocal = valor => {
  if (!valor.startsWith('/') || valor.startsWith('//') || valor.includes('\\') || /[\u0000-\u001f]/.test(valor)) return false;
  try {
    const pathname = decodeURIComponent(new URL(valor, 'http://localhost').pathname);
    const segmentos = pathname.split('/').slice(1);
    return /^\/(?:imagens|uploads|img)\//i.test(pathname)
      && segmentos.every(segmento => segmento && segment !== '.' && segmento !== '..');
  } catch {
    return false;
  }
};
const normalizarCaminhoImagem = valor => {
  const imagem = txt(valor, 500);
  if (!/^(?:[a-z]:[\\/]|\\\\)/i.test(imagem)) return imagem;

  const segmentos = imagem.replace(/\\/g, '/').split('/').filter(Boolean);
  const pastasPublicas = new Set(['imagens', 'uploads', 'img']);
  let inicio = -1;
  for (let i = 0; i < segmentos.length - 1; i++) {
    if (segmentos[i].toLowerCase() === 'public' && pastasPublicas.has(segmentos[i + 1].toLowerCase())) {
      inicio = i + 1;
    }
  }
  if (inicio === -1) {
    for (let i = 0; i < segmentos.length - 1; i++) {
      if (pastasPublicas.has(segmentos[i].toLowerCase())) inicio = i;
    }
  }
  if (inicio === -1) return imagem;

  const caminho = segmentos.slice(inicio);
  if (caminho.some(segmento => segmento === '.' || segmento === '..' || /[\u0000-\u001f]/.test(segmento))) return imagem;
  return '/' + caminho.map(segmento => encodeURIComponent(segmento)).join('/');
};
const hash256 = s => crypto.createHash('sha256').update(String(s)).digest();
const igual = (a, b) => crypto.timingSafeEqual(hash256(a), hash256(b));
const soDigitos = t => String(t == null ? '' : t).replace(/\D/g, '');
const cpfValido = valor => {
  const cpf = soDigitos(valor);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcularDigito = tamanho => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10]);
};
const RE_TEL = /^\d{10,13}$/;
const paraWhatsApp = t => { const d = soDigitos(t); return d.length === 10 || d.length === 11 ? '55' + d : d; };
const gerarToken = (usuario, perfil, trocar = false) => jwt.sign({ usuario, perfil, trocar }, JWT_SECRET, { expiresIn: trocar ? '1h' : '7d' });
const dadosUsuario = (row, perfil) => ({ usuario: row.usuario, nome: row.nome, email: row.email, cpf: row.cpf, pix: row.pix, telefone: row.telefone || '', perfil });
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

async function lerConfig(chave, padrao) {
  const r = await q('SELECT valor FROM config WHERE chave = $1', [chave]);
  return r.rows.length ? r.rows[0].valor : padrao;
}
async function gravarConfig(chave, valor, client = pool) {
  await client.query(
    'INSERT INTO config (chave, valor) VALUES ($1, $2::jsonb) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor',
    [chave, JSON.stringify(valor)]
  );
}

async function lerTaxas(client = pool) {
  await client.query(`INSERT INTO config (chave, valor) VALUES
    ('taxaComissao', $1::jsonb),
    ('taxaPatrocinador', $2::jsonb),
    ('taxaAvo', $3::jsonb)
    ON CONFLICT (chave) DO NOTHING`,
  [
    JSON.stringify(TAXA_COMISSAO_PADRAO),
    JSON.stringify(TAXA_PATROCINADOR_PADRAO),
    JSON.stringify(TAXA_AVO_PADRAO)
  ]);
  const resultado = await client.query(
    "SELECT chave, valor FROM config WHERE chave IN ('taxaComissao', 'taxaPatrocinador', 'taxaAvo')"
  );
  const configuracoes = Object.fromEntries(resultado.rows.map(({ chave, valor }) => [chave, valor]));
  const direta = Number(configuracoes.taxaComissao ?? TAXA_COMISSAO_PADRAO);
  const patrocinador = Number(configuracoes.taxaPatrocinador ?? TAXA_PATROCINADOR_PADRAO);
  const avo = Number(configuracoes.taxaAvo ?? TAXA_AVO_PADRAO);
  return {
    taxaComissao: direta,
    taxaPatrocinador: patrocinador,
    taxaAvo: avo,
    taxaCentral: 100 - direta - patrocinador - avo
  };
}
const centavos = (valor, taxa) => Math.round(valor * taxa) / 100;
const dinheiro = v => Math.round(Number(v || 0) * 100) / 100;
const precoCJ = valor => {
  const primeiro = String(valor == null ? '' : valor).match(/-?\d+(?:[.,]\d+)?/);
  if (!primeiro) return null;
  const preco = Number(primeiro[0].replace(',', '.'));
  return Number.isFinite(preco) && preco >= 0 ? dinheiro(preco) : null;
};

let cjTokenCache = '';
let cjTokenExpiraEm = 0;
async function obterTokenCJ() {
  if (!CJ_TOKEN) throw new Error('CJ_TOKEN não configurado no servidor.');
  if (cjTokenCache && Date.now() < cjTokenExpiraEm) return cjTokenCache;
  const resposta = await fetch(`${CJ_BASE_URL}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: CJ_TOKEN }),
    signal: AbortSignal.timeout(15000)
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !dados.result || !dados.data?.accessToken) {
    throw new Error('Não foi possível autenticar na API da CJ Dropshipping.');
  }
  cjTokenCache = dados.data.accessToken;
  cjTokenExpiraEm = Date.now() + 50 * 60 * 1000;
  return cjTokenCache;
}

async function listarProdutosCJ(pagina = 1, tamanho = 50) {
  const token = await obterTokenCJ();
  const resposta = await fetch(`${CJ_BASE_URL}/product/list?pageNum=${pagina}&pageSize=${tamanho}`, {
    headers: { 'CJ-Access-Token': token, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !dados.result) throw new Error('A consulta de produtos à CJ Dropshipping falhou.');
  return Array.isArray(dados.data?.list) ? dados.data.list : [];
}

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
  lista.forEach(a => visitar(a, 1));
  return saida;
}

async function usuarioDoPatrocinador(patrocinadorId, client = pool) {
  if (!patrocinadorId || norm(patrocinadorId) === 'admin') return null;
  const r = await client.query('SELECT usuario FROM afiliados WHERE lower(id) = $1 OR usuario = $1', [norm(patrocinadorId)]);
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
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS payment_idempotency_key text');
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT ''");
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS payment_qr_code text NOT NULL DEFAULT ''");
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS payment_qr_code_base64 text NOT NULL DEFAULT ''");
  
  await q(`CREATE TABLE IF NOT EXISTS config (chave text PRIMARY KEY, valor jsonb NOT NULL)`);
  await q("DELETE FROM config WHERE chave = 'pixChave'");
  
  const produtosSalvos = await lerConfig('produtos', PRODUTOS_INICIAIS);
  await gravarConfig('produtos', produtosSalvos.map(produto => ({
    ...produto,
    repasseJurosComprador: produto.repasseJurosComprador !== false,
    maxParcelasSemJuros: normalizarMaxParcelasSemJuros(produto.maxParcelasSemJuros)
  })));
  
  await q(`CREATE TABLE IF NOT EXISTS afiliado_cupons (
    id serial PRIMARY KEY,
    afiliado_usuario text NOT NULL UNIQUE REFERENCES afiliados(usuario) ON DELETE CASCADE,
    codigo_cupom varchar(50) NOT NULL UNIQUE,
    ativo boolean NOT NULL DEFAULT false,
    data_validade date,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now()
  )`);
  await q('CREATE UNIQUE INDEX IF NOT EXISTS afiliado_cupons_codigo_lower_uidx ON afiliado_cupons (lower(codigo_cupom))');
  
  await q(`CREATE TABLE IF NOT EXISTS notificacoes_afiliados (
    id serial PRIMARY KEY,
    titulo varchar(255) NOT NULL,
    mensagem text NOT NULL,
    data_criacao timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ativa boolean NOT NULL DEFAULT true
  )`);
  
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS valor_original numeric(12,2) NOT NULL DEFAULT 0');
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cupom_codigo text NOT NULL DEFAULT ''");
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cupom_desconto numeric(12,2) NOT NULL DEFAULT 0');
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repasse_juros_comprador boolean NOT NULL DEFAULT true');
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS max_parcelas_sem_juros integer NOT NULL DEFAULT 1');
  await q("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo_pedido text NOT NULL DEFAULT 'software'");
  await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS custo_total numeric(12,2) NOT NULL DEFAULT 0');

  await q(`CREATE TABLE IF NOT EXISTS produtos_cj (
    pid text PRIMARY KEY, nome text NOT NULL, descricao text NOT NULL DEFAULT '',
    preco numeric(12,2) NOT NULL CHECK (preco >= 0),
    custo numeric(12,2) NOT NULL DEFAULT 0 CHECK (custo >= 0),
    categoria text NOT NULL DEFAULT '', imagem text NOT NULL DEFAULT '',
    ativo boolean NOT NULL DEFAULT true, atualizado_em timestamptz NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS itens_pedido (
    id bigserial PRIMARY KEY, pedido_id text NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    produto_pid text NOT NULL, produto_nome text NOT NULL,
    quantidade integer NOT NULL CHECK (quantidade > 0),
    preco_unitario numeric(12,2) NOT NULL CHECK (preco_unitario >= 0),
    custo_unitario numeric(12,2) NOT NULL CHECK (custo_unitario >= 0),
    imagem text NOT NULL DEFAULT '')`);
  await q('CREATE INDEX IF NOT EXISTS itens_pedido_pedido_id_idx ON itens_pedido (pedido_id)');
  
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
  await q('CREATE UNIQUE INDEX IF NOT EXISTS vendas_aprovadas_payment_id_uidx ON vendas_aprovadas (payment_id)');
}

// ===== App =====
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));
app.use('/imagens', express.static(path.join(__dirname, 'public', 'imagens')));
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
  } catch (e) {
    return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  }
  if (req.user.trocar && !req.path.startsWith('/api/senha/')) {
    return res.status(403).json({ erro: 'Defina uma nova senha antes de continuar.', trocarSenha: true });
  }
  if (req.user.perfil === 'admin') return next();

  const consultaConta = req.user.perfil === 'afiliado'
    ? 'SELECT 1 FROM afiliados WHERE usuario = $1'
    : 'SELECT 1 FROM contas WHERE usuario = $1';
  q(consultaConta, [norm(req.user.usuario)])
    .then(({ rows }) => {
      if (!rows.length) return res.status(401).json({ erro: 'Conta removida. Faça login novamente.' });
      next();
    })
    .catch(next);
}
const soAdmin = (req, res, next) =>
  req.user.perfil === 'admin' ? next() : res.status(403).json({ erro: 'Acesso exclusivo do Administrador.' });

app.get('/api/saude', wrap(async (req, res) => {
  await q('SELECT 1');
  res.json({ ok: true, banco: 'conectado' });
}));

app.get('/api/admin/diagnostico-banco', auth, soAdmin, wrap(async (req, res) => {
  const nomesTabelas = [
    'contas', 'afiliados', 'pedidos', 'afiliado_cupons',
    'vendas_aprovadas', 'config', 'notificacoes_afiliados'
  ];
  const [identidade, relacoes] = await Promise.all([
    q(`SELECT current_database() AS banco, current_schema() AS esquema,
        current_setting('search_path') AS search_path`),
    q(`SELECT nome, to_regclass(nome)::text AS relacao
      FROM unnest($1::text[]) AS tabelas(nome)`, [nomesTabelas])
  ]);
  const relacoesPorNome = new Map(relacoes.rows.map(({ nome, relacao }) => [nome, relacao]));
  const tabelas = {};
  for (const nome of nomesTabelas) {
    if (!relacoesPorNome.get(nome)) {
      tabelas[nome] = { existe: false, linhas: null };
      continue;
    }
    const resultado = await q(`SELECT count(*)::int AS linhas FROM ${nome}`);
    tabelas[nome] = { existe: true, linhas: resultado.rows[0].linhas };
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    endpoint: new URL(DATABASE_URL).hostname,
    ...identidade.rows[0],
    tabelas
  });
}));

app.get('/api/pagamento/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ publicKey: String(MERCADO_PAGO_PUBLIC_KEY || '').trim() });
});

// Validação segura de persistência no Neon sem bloquear transações válidas
function exigirUmaLinhaPersistida(resultado, tabela) {
  if (!resultado || (resultado.rowCount !== null && resultado.rowCount !== undefined && resultado.rowCount < 1) || (resultado.rows && resultado.rows.length === 0)) {
    throw new Error(`O Neon não confirmou a gravação esperada na tabela ${tabela}.`);
  }
}

app.post('/api/registrar', limitarTentativas, wrap(async (req, res) => {
  const usuario = normUsuario(req.body.usuario);
  const nome = txt(req.body.nome, 100), email = txt(req.body.email, 120);
  const cpf = txt(req.body.cpf, 20), pix = txt(req.body.pix, 100);
  const telefone = soDigitos(req.body.telefone);
  const senha = String(req.body.senha || '');
  const perfil = req.body.perfil || 'cliente';

  if (!['cliente', 'afiliado'].includes(perfil)) return res.status(400).json({ erro: 'Tipo de cadastro inválido.' });
  if (!RE_USUARIO.test(usuario)) return res.status(400).json({ erro: 'Usuário inválido.' });
  if (!nome || !semTags(nome)) return res.status(400).json({ erro: 'Informe um nome válido.' });
  if (!RE_EMAIL.test(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  if (!cpf || !RE_CPF.test(cpf)) return res.status(400).json({ erro: 'Informe um CPF válido.' });
  if (perfil === 'afiliado' && !pix) return res.status(400).json({ erro: 'Informe uma chave Pix.' });
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
    const contaInserida = await client.query('INSERT INTO contas (usuario, nome, email, cpf, pix, telefone, senha_hash) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING usuario',
      [usuario, nome, email, cpf, pixConta, telefone, senhaHash]);
    exigirUmaLinhaPersistida(contaInserida, 'contas');

    if (perfil === 'afiliado') {
      let patrocinadorId = 'admin', patrocinadorUsuario = null;
      const indicador = normUsuario(req.body.indicador);
      if (indicador && indicador !== 'admin' && indicador !== usuario) {
        const pai = (await client.query('SELECT id, usuario FROM afiliados WHERE usuario = $1', [indicador])).rows[0];
        if (pai) {
          patrocinadorId = pai.id;
          patrocinadorUsuario = pai.usuario;
        }
      }
      const id = 'AF-' + usuario.toUpperCase();
      const afiliadoInserido = await client.query(`INSERT INTO afiliados (id, usuario, nome, email, cpf, pix, telefone, senha_hash, patrocinador_id)
                          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING usuario`,
        [id, usuario, nome, email, cpf, pix, telefone, senhaHash, patrocinadorId]);
      exigirUmaLinhaPersistida(afiliadoInserido, 'afiliados');
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
  const usuario = normUsuario(req.body.usuario);
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

  const flag = (await q('SELECT trocar_senha, temp_expira FROM contas WHERE usuario = $1', [row.usuario])).rows[0] || {};
  const trocar = !!flag.trocar_senha;
  if (trocar && flag.temp_expira && new Date(flag.temp_expira) < new Date()) {
    return res.status(401).json({ erro: 'Senha temporária expirada.' });
  }
  res.json({ token: gerarToken(row.usuario, perfil, trocar), trocarSenha: trocar, user: dadosUsuario(row, perfil) });
}));

app.post('/api/afiliar', auth, wrap(async (req, res) => {
  if (req.user.perfil === 'admin') return res.status(403).json({ erro: 'O administrador não precisa se afiliar.' });
  const usuario = req.user.usuario;
  const nome = txt(req.body.nome, 100), email = txt(req.body.email, 120);
  const cpf = txt(req.body.cpf, 20), pix = txt(req.body.pix, 100);
  const telefone = soDigitos(req.body.telefone);

  if (!nome || !semTags(nome)) return res.status(400).json({ erro: 'Informe um nome válido.' });
  if (!RE_EMAIL.test(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  if (!cpf || !RE_CPF.test(cpf)) return res.status(400).json({ erro: 'Informe um CPF válido.' });
  if (!pix || !RE_PIX.test(pix)) return res.status(400).json({ erro: 'Informe uma chave Pix válida.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const conta = (await client.query('SELECT senha_hash FROM contas WHERE usuario = $1 FOR UPDATE', [usuario])).rows[0];
    if (!conta) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Conta não encontrada.' });
    }

    await client.query('UPDATE contas SET telefone = $2 WHERE usuario = $1', [usuario, telefone]);
    const existente = (await client.query('SELECT * FROM afiliados WHERE usuario = $1 FOR UPDATE', [usuario])).rows[0];
    
    if (existente) {
      await client.query('UPDATE afiliados SET nome=$2, email=$3, cpf=$4, pix=$5, telefone=$6 WHERE usuario=$1', [usuario, nome, email, cpf, pix, telefone]);
      const patrocinadorUsuario = await usuarioDoPatrocinador(existente.patrocinador_id, client);
      await client.query('COMMIT');
      return res.json({ ok: true, id: existente.id, patrocinadorId: existente.patrocinador_id, patrocinadorUsuario });
    }

    let patrocinadorId = 'admin', patrocinadorUsuario = null;
    const indicador = normUsuario(req.body.indicador);
    if (indicador && indicador !== 'admin' && indicador !== usuario) {
      const pai = (await client.query('SELECT id, usuario FROM afiliados WHERE usuario = $1', [indicador])).rows[0];
      if (pai) { patrocinadorId = pai.id; patrocinadorUsuario = pai.usuario; }
    }

    const id = 'AF-' + usuario.toUpperCase();
    const afiliadoInserido = await client.query(`INSERT INTO afiliados (id, usuario, nome, email, cpf, pix, telefone, senha_hash, patrocinador_id)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING usuario`,
      [id, usuario, nome, email, cpf, pix, telefone, conta.senha_hash, patrocinadorId]);
    exigirUmaLinhaPersistida(afiliadoInserido, 'afiliados');
    await client.query('COMMIT');
    res.json({ ok: true, id, patrocinadorId, patrocinadorUsuario });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.get('/api/patrocinador/:usuario', limitarTentativas, wrap(async (req, res) => {
  const u = normUsuario(req.params.usuario);
  if (u === 'admin' || u === ADMIN_USUARIO) return res.json({ usuario: 'admin', nome: 'Central (Administrador)' });
  const r = await q('SELECT usuario, nome FROM afiliados WHERE usuario = $1 OR lower(id) = $1', [u]);
  if (!r.rows.length) return res.status(404).json({ erro: 'Patrocinador não encontrado.' });
  res.json(r.rows[0]);
}));

app.get('/api/rede', auth, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
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
  if (!eu) return res.status(404).json({ erro: 'Você ainda não é afiliado.' });
  const pai = lista.find(p => p !== eu && ehFilhoDe(eu, p));
  const ganhos = (await q(`SELECT afiliado_usuario AS u, sum(comissao_patrocinador) AS total
      FROM pedidos WHERE status = 'pago' AND patrocinador_usuario = $1 GROUP BY 1`, [eu.usuario])).rows;
  const filhos = lista.filter(f => ehFilhoDe(f, eu)).map(f => ({
    usuario: f.usuario, nome: f.nome, criadoEm: f.criadoEm, vendas: f.vendasDiretas,
    minhaComissao: dinheiro((ganhos.find(g => g.u === f.usuario) || {}).total)
  }));
  const extrato = (await q(`SELECT pedido_id, produto_nome, data, geracao, valor, situacao
    FROM (
      SELECT id AS pedido_id, produto_nome, pago_em AS data, 'Direta' AS geracao,
        comissao AS valor, status_comissao_direta AS situacao
      FROM pedidos
      WHERE status = 'pago' AND afiliado_usuario = $1 AND comissao > 0
      UNION ALL
      SELECT id AS pedido_id, produto_nome, pago_em AS data, 'Pai' AS geracao,
        comissao_patrocinador AS valor, status_comissao_patrocinador AS situacao
      FROM pedidos
      WHERE status = 'pago' AND patrocinador_usuario = $1 AND comissao_patrocinador > 0
      UNION ALL
      SELECT id AS pedido_id, produto_nome, pago_em AS data, 'Avô' AS geracao,
        comissao_avo AS valor, status_comissao_avo AS situacao
      FROM pedidos
      WHERE status = 'pago' AND avo_usuario = $1 AND comissao_avo > 0
    ) comissoes
    ORDER BY data DESC NULLS LAST, pedido_id DESC`, [eu.usuario])).rows.map(item => ({
    pedidoId: item.pedido_id,
    produtoNome: item.produto_nome,
    data: item.data,
    geracao: item.geracao,
    valor: dinheiro(item.valor),
    situacao: item.situacao
  }));
  res.json({
    visao: 'afiliado', taxas, filhos, extrato, valorMinimoSaque,
    calendarioSaque,
    eu: {
      id: eu.id, usuario: eu.usuario, nome: eu.nome, vendasDiretas: eu.vendasDiretas, vendasRede: eu.vendasRede,
      comissaoDireta: eu.comissaoDireta, comissaoRede: eu.comissaoRede, comissaoTotal: eu.comissaoTotal,
      comissaoPendente: eu.comissaoPendente, comissaoLiberar: eu.comissaoLiberar,
      filhosDiretos: eu.filhosDiretos, patrocinadorNome: pai ? pai.nome : 'Central (Administrador)'
    }
  });
}));

app.get('/api/afiliado/dashboard', auth, wrap(async (req, res) => {
  if (req.user.perfil !== 'afiliado') {
    return res.status(403).json({ erro: 'Este painel é exclusivo para afiliados.' });
  }
  const usuario = norm(req.user.usuario);
  const afiliado = (await q(`SELECT usuario, nome FROM afiliados WHERE usuario = $1`, [usuario])).rows[0];
  if (!afiliado) return res.status(404).json({ erro: 'Conta de afiliado não encontrada.' });
  const [saldo, extrato] = await Promise.all([
    q(`SELECT COALESCE(sum(comissao), 0) AS direta,
        COALESCE(sum(comissao_patrocinador), 0) AS patrocinador,
        COALESCE(sum(comissao_avo), 0) AS avo
      FROM pedidos WHERE status = 'pago'
        AND (afiliado_usuario = $1 OR patrocinador_usuario = $1 OR avo_usuario = $1)`, [usuario]),
    q(`SELECT pedido_id, produto_nome, data, geracao, valor, situacao FROM (
        SELECT id AS pedido_id, produto_nome, pago_em AS data, 'Direta' AS geracao,
          comissao AS valor, status_comissao_direta AS situacao
        FROM pedidos WHERE status = 'pago' AND afiliado_usuario = $1 AND comissao > 0
        UNION ALL
        SELECT id, produto_nome, pago_em, 'Patrocinador', comissao_patrocinador, status_comissao_patrocinador
        FROM pedidos WHERE status = 'pago' AND patrocinador_usuario = $1 AND comissao_patrocinador > 0
        UNION ALL
        SELECT id, produto_nome, pago_em, 'Avô', comissao_avo, status_comissao_avo
        FROM pedidos WHERE status = 'pago' AND avo_usuario = $1 AND comissao_avo > 0
      ) comissoes ORDER BY data DESC NULLS LAST, pedido_id DESC`, [usuario])
  ]);
  const totais = saldo.rows[0];
  res.set('Cache-Control', 'no-store');
  res.json({
    usuario: afiliado.usuario,
    nome: afiliado.nome,
    linkIndicacao: `${req.protocol}://${req.get('host')}/?afiliado=${encodeURIComponent(usuario)}`,
    ganhos: {
      direta: dinheiro(totais.direta),
      patrocinador: dinheiro(totais.patrocinador),
      avo: dinheiro(totais.avo),
      total: dinheiro(Number(totais.direta) + Number(totais.patrocinador) + Number(totais.avo))
    },
    extrato: extrato.rows.map(item => ({
      pedidoId: item.pedido_id,
      produtoNome: item.produto_nome,
      data: item.data,
      geracao: item.geracao,
      valor: dinheiro(item.valor),
      situacao: item.situacao
    }))
  });
}));

async function configuracaoCupons() {
  const [ativo, percentualMaximo] = await Promise.all([
    lerConfig('cupom_global_ativo', false),
    lerConfig('cupom_porcentagem_maxima', 0)
  ]);
  return { ativo: ativo === true, percentualMaximo: Number(percentualMaximo) || 0 };
}

app.get('/api/admin/cupons', auth, soAdmin, wrap(async (req, res) => {
  const configuracao = await configuracaoCupons();
  const afiliados = await q(`SELECT a.id, a.usuario, a.nome, c.id AS cupom_id,
      c.codigo_cupom, c.ativo AS cupom_ativo, c.data_validade,
      (c.data_validade IS NOT NULL AND c.data_validade < CURRENT_DATE) AS expirado,
      c.atualizado_em
    FROM afiliados a LEFT JOIN afiliado_cupons c ON c.afiliado_usuario = a.usuario
    ORDER BY a.nome, a.usuario`);
  res.json({ ...configuracao, afiliados: afiliados.rows.map(a => ({
    id: a.id, usuario: a.usuario, nome: a.nome, cupomId: a.cupom_id,
    codigo: a.codigo_cupom, ativo: a.cupom_ativo === true, expirado: a.expirado === true,
    dataValidade: dataIso(a.data_validade), atualizadoEm: a.atualizado_em
  })) });
}));

app.put('/api/admin/cupons/config', auth, soAdmin, wrap(async (req, res) => {
  const { ativo } = req.body;
  const percentualMaximo = Number(req.body.percentualMaximo);
  if (typeof ativo !== 'boolean' || !Number.isFinite(percentualMaximo) || percentualMaximo < 0 || percentualMaximo > 100) {
    return res.status(400).json({ erro: 'Informe um percentual de cupom entre 0% e 100%.' });
  }
  await gravarConfig('cupom_global_ativo', ativo);
  await gravarConfig('cupom_porcentagem_maxima', percentualMaximo);
  res.json({ ok: true, ativo, percentualMaximo });
}));

app.patch('/api/admin/cupons/:id', auth, soAdmin, wrap(async (req, res) => {
  const atualizaAtivo = Object.prototype.hasOwnProperty.call(req.body, 'ativo');
  const atualizaValidade = Object.prototype.hasOwnProperty.call(req.body, 'dataValidade');
  const dataValidade = atualizaValidade && req.body.dataValidade ? String(req.body.dataValidade) : null;
  const dataValidadeParsed = dataValidade && /^\d{4}-\d{2}-\d{2}$/.test(dataValidade)
    ? new Date(`${dataValidade}T00:00:00.000Z`)
    : null;
  if (dataValidade && (!dataValidadeParsed || Number.isNaN(dataValidadeParsed.getTime())
    || dataValidadeParsed.toISOString().slice(0, 10) !== dataValidade)) {
    return res.status(400).json({ erro: 'Informe a validade no formato AAAA-MM-DD.' });
  }

  const result = await q(`UPDATE afiliado_cupons
    SET ativo = COALESCE($2, ativo),
        data_validade = CASE WHEN $3 THEN $4::date ELSE data_validade END,
        atualizado_em = now()
    WHERE id = $1
    RETURNING id, ativo, data_validade, (data_validade IS NOT NULL AND data_validade < CURRENT_DATE) AS expirado`,
  [req.params.id, atualizaAtivo ? req.body.ativo : null, atualizaValidade, dataValidade]);
  if (!result.rows.length) return res.status(404).json({ erro: 'Cupom não encontrado.' });
  res.json({ ok: true, ...result.rows[0], data_validade: dataIso(result.rows[0].data_validade) });
}));

app.get('/api/afiliado/cupom', auth, wrap(async (req, res) => {
  if (req.user.perfil !== 'afiliado') return res.status(403).json({ erro: 'Acesso exclusivo.' });
  const [configuracao, result] = await Promise.all([
    configuracaoCupons(),
    q(`SELECT id, codigo_cupom, ativo, data_validade, (data_validade IS NOT NULL AND data_validade < CURRENT_DATE) AS expirado
      FROM afiliado_cupons WHERE afiliado_usuario = $1`, [req.user.usuario])
  ]);
  const cupom = result.rows[0];
  res.json({ ...configuracao, cupom: cupom ? { id: cupom.id, codigo: cupom.codigo_cupom, ativo: cupom.ativo, dataValidade: dataIso(cupom.data_validade), expirado: cupom.expirado } : null });
}));

app.put('/api/afiliado/cupom', auth, wrap(async (req, res) => {
  if (req.user.perfil !== 'afiliado') return res.status(403).json({ erro: 'Acesso exclusivo.' });
  const { ativo, percentualMaximo } = await configuracaoCupons();
  if (!ativo || percentualMaximo <= 0) return res.status(403).json({ erro: 'Campanha de cupons desativada.' });
  const codigo = txt(req.body.codigo, 50).toUpperCase().replace(/\s+/g, '-');
  
  const result = await q(`INSERT INTO afiliado_cupons (afiliado_usuario, codigo_cupom)
    VALUES ($1, $2)
    ON CONFLICT (afiliado_usuario) DO UPDATE SET codigo_cupom = EXCLUDED.codigo_cupom, atualizado_em = now()
    RETURNING id, codigo_cupom, ativo`,
  [req.user.usuario, codigo]);
  res.json({ ok: true, cupom: { id: result.rows[0].id, codigo: result.rows[0].codigo_cupom, ativo: result.rows[0].ativo } });
}));

app.post('/api/checkout/cupom', limitarTentativas, wrap(async (req, res) => {
  const codigo = txt(req.body.codigoCupom, 50).toUpperCase();
  const produtoId = norm(req.body.produtoId);
  if (!codigo || !produtoId) return res.status(400).json({ erro: 'Informe o produto e o código do cupom.' });

  const [configuracao, produtos] = await Promise.all([
    configuracaoCupons(),
    lerConfig('produtos', PRODUTOS_INICIAIS)
  ]);
  if (!configuracao.ativo || configuracao.percentualMaximo <= 0) {
    return res.status(400).json({ erro: 'Campanha de cupons indisponível.' });
  }
  const produto = produtos.find(item => norm(item.id) === produtoId);
  if (!produto) return res.status(400).json({ erro: 'Produto não encontrado.' });

  const cupom = (await q(`SELECT codigo_cupom FROM afiliado_cupons
    WHERE lower(codigo_cupom) = lower($1) AND ativo = true
      AND (data_validade IS NULL OR data_validade >= CURRENT_DATE)`, [codigo])).rows[0];
  if (!cupom) return res.status(400).json({ erro: 'Cupom inválido ou expirado.' });

  const desconto = dinheiro(Number(produto.precoPor) * configuracao.percentualMaximo / 100);
  res.json({
    codigo: cupom.codigo_cupom,
    percentual: configuracao.percentualMaximo,
    desconto,
    valor: dinheiro(Number(produto.precoPor) - desconto)
  });
}));

app.get('/api/afiliado/notificacoes', auth, wrap(async (req, res) => {
  if (req.user.perfil !== 'afiliado') return res.status(403).json({ erro: 'Acesso exclusivo.' });
  const afiliado = (await q('SELECT nome FROM afiliados WHERE usuario = $1', [req.user.usuario])).rows[0];
  if (!afiliado) return res.status(404).json({ erro: 'Afiliado não encontrado.' });
  const notificacoes = await q('SELECT id, titulo, mensagem, data_criacao FROM notificacoes_afiliados WHERE ativa = true ORDER BY data_criacao DESC');
  const nome = txt(afiliado.nome, 100);
  const primeiroNome = nome.split(/\s+/)[0] || nome;
  res.json(notificacoes.rows.map(n => ({
    id: n.id, titulo: n.titulo,
    mensagem: n.mensagem.replace(/\{nome\}/gi, nome).replace(/\{primeiro_nome\}/gi, primeiroNome),
    dataCriacao: n.data_criacao
  })));
}));

app.get('/api/admin/notificacoes', auth, soAdmin, wrap(async (req, res) => {
  const result = await q('SELECT id, titulo, mensagem, data_criacao, ativa FROM notificacoes_afiliados ORDER BY data_criacao DESC');
  res.json(result.rows);
}));

app.post('/api/admin/notificacoes', auth, soAdmin, wrap(async (req, res) => {
  const titulo = txt(req.body.titulo, 255), mensagem = txt(req.body.mensagem, 10000);
  if (!titulo || !mensagem) return res.status(400).json({ erro: 'Informe título e mensagem.' });
  const result = await q('INSERT INTO notificacoes_afiliados (titulo, mensagem) VALUES ($1, $2) RETURNING id, titulo, mensagem, data_criacao, ativa', [titulo, mensagem]);
  res.status(201).json(result.rows[0]);
}));

app.patch('/api/admin/notificacoes/:id', auth, soAdmin, wrap(async (req, res) => {
  const result = await q('UPDATE notificacoes_afiliados SET ativa = $2 WHERE id = $1 RETURNING id, ativa', [req.params.id, req.body.ativa]);
  res.json({ ok: true, ...result.rows[0] });
}));

app.delete('/api/admin/notificacoes/:id', auth, soAdmin, wrap(async (req, res) => {
  await q('DELETE FROM notificacoes_afiliados WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ----- Checkout e Pagamentos -----
const FORMAS = ['pix', 'cartao', 'debito'];

app.post('/api/checkout', limitarTentativas, wrap(async (req, res) => {
  const produtoId = norm(req.body.produtoId);
  const nome = txt(req.body.nome, 100), email = txt(req.body.email, 120);
  const cpf = soDigitos(req.body.cpf);
  const forma = norm(req.body.forma);
  let afiliado = normUsuario(req.body.afiliado).replace(/[^a-z0-9_.-]/g, '');
  const codigoCupom = txt(req.body.codigoCupom, 50).toUpperCase();

  if (!nome || !semTags(nome)) return res.status(400).json({ erro: 'Informe seu nome.' });
  if (!RE_EMAIL.test(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
  if (!cpfValido(cpf)) return res.status(400).json({ erro: 'CPF inválido. Informe um CPF válido com 11 números.' });
  if (!FORMAS.includes(forma)) return res.status(400).json({ erro: 'Forma de pagamento inválida.' });

  const produtos = await lerConfig('produtos', PRODUTOS_INICIAIS);
  const prod = produtos.find(p => norm(p.id) === produtoId);
  if (!prod) return res.status(400).json({ erro: 'Produto não encontrado.' });

  let desconto = 0;
  if (codigoCupom) {
    const cfgCupom = await configuracaoCupons();
    const cupom = (await q(`SELECT c.afiliado_usuario FROM afiliado_cupons c
      WHERE lower(c.codigo_cupom) = lower($1) AND c.ativo = true
        AND (c.data_validade IS NULL OR c.data_validade >= CURRENT_DATE)`, [codigoCupom])).rows[0];
    if (!cfgCupom.ativo || cfgCupom.percentualMaximo <= 0) {
      return res.status(400).json({ erro: 'Campanha de cupons indisponível.' });
    }
    if (!cupom) return res.status(400).json({ erro: 'Cupom inválido ou expirado.' });
    afiliado = cupom.afiliado_usuario;
    desconto = dinheiro(Number(prod.precoPor) * cfgCupom.percentualMaximo / 100);
  }

  let afiliadoValido = false;
  if (afiliado) {
    const af = (await q('SELECT usuario FROM afiliados WHERE usuario = $1', [afiliado])).rows[0];
    if (af) afiliadoValido = true;
    else afiliado = '';
  }

  const pedidoId = crypto.randomBytes(8).toString('hex');
  const downloadToken = crypto.randomBytes(32).toString('hex');
  const valorOriginal = Number(prod.precoPor);
  const valorFinal = dinheiro(valorOriginal - desconto);
  const paymentIdempotencyKey = crypto.randomUUID();

  const pedidoInserido = await q(`INSERT INTO pedidos (id, afiliado_usuario, produto_id, produto_nome, valor, valor_original,
      cupom_codigo, cupom_desconto, forma, cliente_nome, cliente_email, cliente_cpf, download_token, payment_idempotency_key)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
  [pedidoId, afiliadoValido ? afiliado : null, prod.id, prod.nome, valorFinal, valorOriginal,
    codigoCupom, desconto, forma, nome, email, cpf, downloadToken, paymentIdempotencyKey]);
  exigirUmaLinhaPersistida(pedidoInserido, 'pedidos');

  res.json({ pedidoId, produtoNome: prod.nome, valor: valorFinal, valorOriginal, desconto, forma, afiliadoValido, downloadToken });
}));

async function consultarPagamentoMercadoPago(id) {
  const accessToken = MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error('Token do Mercado Pago não configurado.');
  const resposta = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const dados = await resposta.json().catch(() => ({}));
  return { ok: resposta.ok, statusCode: resposta.status, dados };
}

app.post('/api/checkout/:id/pagar', limitarTentativas, wrap(async (req, res) => {
  const tokenPedido = txt(req.get('x-download-token'), 64);
  let pedido = (await q('SELECT * FROM pedidos WHERE id = $1', [req.params.id])).rows[0];
  if (!pedido || !igual(tokenPedido, pedido.download_token)) {
    return res.status(404).json({ erro: 'Pedido não encontrado.' });
  }
  if (pedido.status === 'pago') return res.status(409).json({ erro: 'Pedido já pago.' });

  let paymentData = null;
  let parcelas = 1;
  if (pedido.forma === 'cartao') {
    paymentData = req.body.paymentData || {};
    parcelas = Number(paymentData.installments);
    if (!txt(paymentData.token, 500) || !/^[a-z0-9_-]{1,40}$/i.test(txt(paymentData.payment_method_id, 40))) {
      return res.status(400).json({ erro: 'Os dados tokenizados do cartão são inválidos.' });
    }
    if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS_CARTAO) {
      return res.status(400).json({ erro: `Escolha de 1 a ${MAX_PARCELAS_CARTAO} parcelas.` });
    }
  }

  const paymentIdempotencyKey = pedido.payment_idempotency_key || crypto.randomUUID();
  const idempotencyResult = await q(`UPDATE pedidos
    SET payment_idempotency_key = COALESCE(NULLIF(payment_idempotency_key, ''), $2)
    WHERE id = $1
    RETURNING payment_idempotency_key`, [pedido.id, paymentIdempotencyKey]);
  const chaveIdempotencia = idempotencyResult.rows[0]?.payment_idempotency_key;
  if (!chaveIdempotencia) throw new Error('Não foi possível garantir a idempotência do pagamento.');

  const pagamento = {
    transaction_amount: Number(pedido.valor),
    description: pedido.produto_nome,
    external_reference: pedido.id,
    payment_method_id: pedido.forma === 'pix' ? 'pix' : paymentData.payment_method_id,
    token: paymentData?.token,
    installments: parcelas,
    issuer_id: paymentData?.issuer_id,
    payer: { email: pedido.cliente_email, identification: { type: 'CPF', number: soDigitos(pedido.cliente_cpf) } }
  };

  const resposta = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': chaveIdempotencia
    },
    body: JSON.stringify(pagamento)
  });
  const dados = await resposta.json();
  if (!resposta.ok || !dados.id) return res.status(502).json({ erro: dados.message || 'Erro no pagamento.' });

  const valorPagamento = Number(dados.transaction_amount);
  if (String(dados.external_reference || '') !== pedido.id
    || !Number.isFinite(valorPagamento)
    || dinheiro(valorPagamento) !== dinheiro(pedido.valor)) {
    console.error('Mercado Pago retornou pagamento incompatível com o pedido.', {
      pedidoId: pedido.id,
      paymentId: String(dados.id),
      externalReference: String(dados.external_reference || ''),
      transactionAmount: dados.transaction_amount
    });
    return res.status(502).json({ erro: 'O Mercado Pago retornou um pagamento que não corresponde a este pedido. O Pix não foi exibido; fale com o suporte.' });
  }

  const qr = dados.point_of_interaction?.transaction_data || {};
  const codigoPix = typeof qr.qr_code === 'string' ? qr.qr_code : '';
  const statusPagamento = String(dados.status || '').toLowerCase();
  const pagamentoFinalizado = ['approved', 'rejected', 'cancelled', 'refunded', 'charged_back'].includes(statusPagamento);
  if (pedido.forma === 'pix' && !pagamentoFinalizado && !codigoPixValido(codigoPix)) {
    const motivo = codigoPix ? 'código Pix com formato ou CRC inválido' : 'código Pix ausente';
    console.error(`Mercado Pago retornou ${motivo}.`, { paymentId: String(dados.id), tamanhoCodigo: codigoPix.length });
    return res.status(502).json({ erro: 'O Mercado Pago não retornou um código Pix válido. O código não foi alterado nem exibido; tente novamente ou fale com o suporte.' });
  }
  await q(`UPDATE pedidos SET payment_id = $2, payment_status = $3, payment_qr_code = $4, payment_qr_code_base64 = $5 WHERE id = $1`,
    [pedido.id, String(dados.id), txt(statusPagamento, 40), codigoPix, txt(qr.qr_code_base64, 100000)]);

  res.json({ pedidoId: pedido.id, paymentId: String(dados.id), status: dados.status, qrCode: codigoPix, qrCodeBase64: qr.qr_code_base64 || '' });
}));

async function sincronizarPagamentoMercadoPago(idPagamento, pagamentoRecebido, pedidoEsperadoId) {
  if (!MERCADO_PAGO_ACCESS_TOKEN && !pagamentoRecebido) return { ok: false, statusCode: 503 };
  let consulta;
  try {
    consulta = pagamentoRecebido ? { ok: true, dados: pagamentoRecebido } : await consultarPagamentoMercadoPago(idPagamento);
  } catch (err) {
    console.error('Erro ao consultar pagamento no Mercado Pago:', err);
    return { ok: false, statusCode: 502 };
  }
  if (!consulta.ok) return { ok: false, statusCode: consulta.statusCode };
  const pagamento = consulta.dados;
  const pedidoId = txt(pagamento.external_reference, 64);
  if (!pagamento.id || String(pagamento.id) !== String(idPagamento)
    || !pedidoId || (pedidoEsperadoId && pedidoId !== pedidoEsperadoId)) {
    return { ok: false, statusCode: 409 };
  }
  const pedido = (await q('SELECT * FROM pedidos WHERE id = $1', [pedidoId])).rows[0];
  if (!pedido) return null;

  const valorPagamento = Number(pagamento.transaction_amount);
  if (!Number.isFinite(valorPagamento) || dinheiro(valorPagamento) !== dinheiro(pedido.valor)) {
    return { ok: false, statusCode: 409 };
  }
  const statusPagamento = String(pagamento.status || '').toLowerCase();
  await q('UPDATE pedidos SET payment_status = $2 WHERE id = $1', [pedido.id, statusPagamento]);
  if (statusPagamento === 'approved' && pedido.status === 'aguardando') {
    await confirmarPedido(pedido.id, pagamento.id || idPagamento);
  }
  return { ok: true, pedidoId: pedido.id, statusPagamento };
}

app.get('/api/checkout/:id/status', limitarConsultasStatusCheckout, wrap(async (req, res) => {
  const token = txt(req.get('x-download-token'), 64);
  let pedido = (await q('SELECT id, status, payment_id, payment_status, download_token FROM pedidos WHERE id = $1', [req.params.id])).rows[0];
  if (!pedido || !igual(token, pedido.download_token)) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  if (pedido.status !== 'pago' && pedido.payment_id) {
    const sincronizacao = await sincronizarPagamentoMercadoPago(pedido.payment_id, null, pedido.id);
    if (!sincronizacao?.ok) {
      if (sincronizacao?.statusCode === 409) {
        return res.status(409).json({ erro: 'Os dados do pagamento não correspondem a este pedido. Entre em contato com o suporte.' });
      }
      if (sincronizacao?.statusCode === 503) {
        return res.status(503).json({ erro: 'A consulta ao Mercado Pago não está configurada neste servidor.' });
      }
      return res.status(502).json({ erro: 'Não foi possível consultar o pagamento no Mercado Pago. Tente novamente.' });
    }
    pedido = (await q('SELECT id, status, payment_status FROM pedidos WHERE id = $1', [pedido.id])).rows[0];
  }
  res.json({ pedidoId: pedido.id, status: pedido.status, paymentStatus: pedido.payment_status });
}));

app.get('/api/checkout/:id/download', wrap(async (req, res) => {
  const token = txt(req.get('x-download-token'), 64);
  const pedido = (await q('SELECT id, status, produto_id, download_token FROM pedidos WHERE id = $1', [req.params.id])).rows[0];
  if (!pedido || !igual(token, pedido.download_token)) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  if (pedido.status !== 'pago') return res.status(409).json({ erro: 'Pagamento ainda não confirmado.' });

  const produtos = await lerConfig('produtos', PRODUTOS_INICIAIS);
  const produto = produtos.find(item => norm(item.id) === norm(pedido.produto_id));
  const url = txt(produto?.pdf, 2000);
  if (!ehUrlWeb(url)) {
    return res.status(503).json({ erro: 'Pagamento aprovado, mas o link do arquivo não está configurado. Entre em contato com o suporte.' });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ url });
}));

async function confirmarPedido(id, paymentIdRecebido) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ped = (await client.query('SELECT * FROM pedidos WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!ped || ped.status !== 'aguardando') { await client.query('ROLLBACK'); return; }
    const paymentId = txt(paymentIdRecebido || ped.payment_id, 100);
    const cpf = soDigitos(ped.cliente_cpf);
    if (!paymentId) throw new Error(`Pagamento aprovado sem payment_id para o pedido ${ped.id}.`);
    if (!cpfValido(cpf)) throw new Error(`Pedido ${ped.id} possui CPF ausente ou inválido para ativação da licença.`);
    if (!ped.cliente_email || !ped.produto_nome || !Number.isFinite(Number(ped.valor))) {
      throw new Error(`Pedido ${ped.id} não possui os dados obrigatórios para sincronizar a licença.`);
    }
    
    const taxas = await lerTaxas(client);
    const valor = Number(ped.valor);
    let vendedor = 0, patrocinador = 0, avo = 0;
    let patrocinadorUsuario = ped.tipo_pedido === 'cj' ? ped.patrocinador_usuario : null;
    let avoUsuario = ped.tipo_pedido === 'cj' ? ped.avo_usuario : null;
    let afiliadoExiste = false;

    if (ped.afiliado_usuario) {
      const af = (await client.query('SELECT usuario, patrocinador_id FROM afiliados WHERE usuario = $1', [ped.afiliado_usuario])).rows[0];
      if (af) {
        afiliadoExiste = true;
        vendedor = centavos(valor, taxas.taxaComissao);
        if (ped.tipo_pedido !== 'cj') {
          const pai = (await client.query('SELECT usuario, patrocinador_id FROM afiliados WHERE usuario = $1 OR id = $1', [af.patrocinador_id])).rows[0];
          if (pai) {
            patrocinadorUsuario = pai.usuario;
            patrocinador = centavos(valor, taxas.taxaPatrocinador);
            const afiliadoAvo = (await client.query('SELECT usuario FROM afiliados WHERE usuario = $1 OR id = $1', [pai.patrocinador_id])).rows[0];
            if (afiliadoAvo) { avoUsuario = afiliadoAvo.usuario; avo = centavos(valor, taxas.taxaAvo); }
          }
        }
      }
    }
    let central;
    if (ped.tipo_pedido === 'cj') {
      const itens = (await client.query(
        'SELECT quantidade, preco_unitario, custo_unitario FROM itens_pedido WHERE pedido_id = $1',
        [ped.id]
      )).rows;
      if (!itens.length) throw new Error(`Pedido físico ${ped.id} não possui itens para calcular os repasses.`);
      let custoTotal = 0;
      vendedor = 0;
      patrocinador = 0;
      avo = 0;
      for (const item of itens) {
        const quantidade = Number(item.quantidade);
        const precoUnitario = Number(item.preco_unitario);
        const custoUnitario = Number(item.custo_unitario);
        const margemUnitario = dinheiro(precoUnitario - custoUnitario);
        if (!Number.isInteger(quantidade) || quantidade < 1 || margemUnitario < 0) {
          throw new Error(`Snapshot financeiro inválido no pedido ${ped.id}.`);
        }
        custoTotal = dinheiro(custoTotal + custoUnitario * quantidade);
        if (afiliadoExiste) {
          vendedor = dinheiro(vendedor + centavos(margemUnitario, taxas.taxaComissao) * quantidade);
          if (patrocinadorUsuario) {
            patrocinador = dinheiro(patrocinador + centavos(margemUnitario, taxas.taxaPatrocinador) * quantidade);
          }
          if (avoUsuario) avo = dinheiro(avo + centavos(margemUnitario, taxas.taxaAvo) * quantidade);
        }
      }
      central = dinheiro(valor - custoTotal - vendedor - patrocinador - avo);
      await client.query('UPDATE pedidos SET custo_total = $2 WHERE id = $1', [ped.id, custoTotal]);
    } else {
      central = dinheiro(valor - vendedor - patrocinador - avo);
    }

    await client.query(`UPDATE pedidos SET status = 'pago', payment_id = $8, comissao = $2, patrocinador_usuario = $3,
       comissao_patrocinador = $4, avo_usuario = $5, comissao_avo = $6, comissao_central = $7, pago_em = now() WHERE id = $1`,
      [ped.id, vendedor, patrocinadorUsuario, patrocinador, avoUsuario, avo, central, paymentId]);
    if (ped.tipo_pedido !== 'cj') {
      const vendaSincronizada = await client.query(`INSERT INTO vendas_aprovadas (payment_id, cpf, email, produto, valor, status, ativa)
        VALUES ($1, $2, $3, $4, $5, 'APROVADO', true)
        ON CONFLICT (payment_id) DO UPDATE SET
          cpf = EXCLUDED.cpf,
          email = EXCLUDED.email,
          produto = EXCLUDED.produto,
          valor = EXCLUDED.valor,
          status = EXCLUDED.status,
          ativa = EXCLUDED.ativa
        RETURNING payment_id`,
      [paymentId, cpf, ped.cliente_email, ped.produto_nome, dinheiro(ped.valor)]);
      exigirUmaLinhaPersistida(vendaSincronizada, 'vendas_aprovadas');
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ----- Produtos, Configurações e Exclusões -----
app.get('/api/produtos', (req, res, next) => {
  if (req.query.origem !== 'cj') return next();
  auth(req, res, () => soAdmin(req, res, next));
}, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.query.origem === 'cj') {
    try {
      return res.json(await listarProdutosCJ());
    } catch (err) {
      console.error('Erro ao consultar catálogo da CJ:', err.message);
      return res.status(502).json({ erro: 'Não foi possível consultar os produtos da CJ Dropshipping.' });
    }
  }
  const softwares = await lerConfig('produtos', PRODUTOS_INICIAIS);
  res.json(softwares.map(({ custo, ...produto }) => produto));
}));

app.get('/api/produtos-salvos', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const softwares = (await lerConfig('produtos', PRODUTOS_INICIAIS)).map(({ custo, ...produto }) => ({
    ...produto,
    pid: produto.id,
    tipo: 'software',
    preco: Number(produto.precoPor)
  }));
  const fisicos = await q(`SELECT pid, nome, descricao, preco, categoria, imagem
    FROM produtos_cj WHERE ativo = true AND preco > custo ORDER BY atualizado_em DESC, nome`);
  res.json([
    ...softwares,
    ...fisicos.rows.map(produto => ({
      ...produto,
      preco: Number(produto.preco),
      tipo: 'cj'
    }))
  ]);
}));

async function sincronizarCatalogoCJ() {
  const itens = await listarProdutosCJ();
  const client = await pool.connect();
  let sincronizados = 0;
  try {
    await client.query('BEGIN');
    for (const item of itens) {
      const pid = txt(item.pid, 100);
      const nome = txt(item.productName || item.entryName, 255);
      const custo = precoCJ(item.sellPrice || item.productPrice);
      if (!pid || !nome || custo === null || custo <= 0) continue;
      const categoria = txt(item.categoryName || item.category, 120);
      const imagem = txt(item.productImage || item.bigImage || item.image, 1000);
      const descricao = txt(item.description || item.productDescription, 2000);
      const inserido = await client.query(`INSERT INTO produtos_cj
          (pid, nome, descricao, preco, custo, categoria, imagem)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (pid) DO UPDATE SET
          nome = EXCLUDED.nome, descricao = EXCLUDED.descricao,
          custo = EXCLUDED.custo, categoria = EXCLUDED.categoria,
          imagem = EXCLUDED.imagem, atualizado_em = now()
        RETURNING pid`, [pid, nome, descricao, dinheiro(custo * 2), custo, categoria, imagem]);
      if (inserido.rowCount) sincronizados++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return sincronizados;
}

app.get('/api/sincronizar-produtos', auth, soAdmin, wrap(async (req, res) => {
  const sincronizados = await sincronizarCatalogoCJ();
  res.json({ ok: true, sincronizados });
}));

app.post('/api/sincronizar-produtos', auth, soAdmin, wrap(async (req, res) => {
  const sincronizados = await sincronizarCatalogoCJ();
  res.json({ ok: true, sincronizados });
}));

app.get('/api/admin/produtos-cj', auth, soAdmin, wrap(async (req, res) => {
  const resultado = await q(`SELECT pid, nome, descricao, preco, custo, categoria, imagem, ativo, atualizado_em
    FROM produtos_cj ORDER BY atualizado_em DESC, nome`);
  res.json(resultado.rows.map(produto => ({
    ...produto,
    preco: Number(produto.preco),
    custo: Number(produto.custo)
  })));
}));

app.put('/api/admin/produtos-cj/:pid', auth, soAdmin, wrap(async (req, res) => {
  const preco = Number(req.body.preco);
  if (!Number.isFinite(preco) || preco < 0 || Math.abs(preco * 100 - Math.round(preco * 100)) > 1e-8) {
    return res.status(400).json({ erro: 'Informe um preço de venda válido em centavos.' });
  }
  if (typeof req.body.ativo !== 'boolean') {
    return res.status(400).json({ erro: 'Informe se o produto está ativo.' });
  }
  const resultado = await q(`UPDATE produtos_cj SET preco = $2, ativo = $3, atualizado_em = now()
    WHERE pid = $1 AND (NOT $3 OR $2 > custo) RETURNING pid, preco, custo, ativo`,
  [txt(req.params.pid, 100), dinheiro(preco), req.body.ativo]);
  if (!resultado.rowCount) {
    const existe = await q('SELECT pid FROM produtos_cj WHERE pid = $1', [txt(req.params.pid, 100)]);
    if (!existe.rowCount) return res.status(404).json({ erro: 'Produto CJ não encontrado.' });
    return res.status(400).json({ erro: 'O preço de venda precisa ser maior que o custo do fornecedor.' });
  }
  res.json({ ok: true });
}));

app.post('/api/checkout/unificado', auth, limitarTentativas, wrap(async (req, res) => {
  const itens = req.body.items;
  const forma = norm(req.body.forma || 'pix');
  if (!Array.isArray(itens) || itens.length < 1 || itens.length > 50) {
    return res.status(400).json({ erro: 'Informe de 1 a 50 produtos no carrinho.' });
  }
  if (!FORMAS.includes(forma) || forma === 'debito') {
    return res.status(400).json({ erro: 'O carrinho unificado aceita pagamento por PIX ou cartão de crédito.' });
  }
  if (!['cliente', 'afiliado'].includes(req.user.perfil)) {
    return res.status(403).json({ erro: 'Entre com uma conta de cliente ou afiliado para finalizar a compra.' });
  }
  const contaTabela = req.user.perfil === 'afiliado' ? 'afiliados' : 'contas';
  const usuario = normUsuario(req.user.usuario);
  const conta = (await q(`SELECT nome, email, cpf FROM ${contaTabela} WHERE usuario = $1`, [usuario])).rows[0];
  if (!conta || !RE_EMAIL.test(conta.email) || !cpfValido(conta.cpf)) {
    return res.status(400).json({ erro: 'Atualize seu cadastro com nome, e-mail e CPF válidos antes de comprar.' });
  }

  const agregados = new Map();
  for (const item of itens) {
    const pid = txt(item?.pid, 100);
    const quantidade = Number(item?.quantidade);
    if (!pid || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20) {
      return res.status(400).json({ erro: 'Cada item deve ter um identificador e uma quantidade entre 1 e 20.' });
    }
    agregados.set(pid, (agregados.get(pid) || 0) + quantidade);
    if (agregados.get(pid) > 20) return res.status(400).json({ erro: 'A quantidade máxima por produto é 20.' });
  }

  const produtos = await q(`SELECT pid, nome, preco, custo, imagem
    FROM produtos_cj WHERE ativo = true AND preco > custo AND pid = ANY($1::text[])`, [[...agregados.keys()]]);
  const porPid = new Map(produtos.rows.map(produto => [produto.pid, produto]));
  if (porPid.size !== agregados.size) return res.status(400).json({ erro: 'Um ou mais produtos não estão mais disponíveis.' });

  const itensPedido = [...agregados.entries()].map(([pid, quantidade]) => {
    const produto = porPid.get(pid);
    const precoUnitario = dinheiro(produto.preco);
    const custoUnitario = dinheiro(produto.custo);
    return { ...produto, quantidade, precoUnitario, custoUnitario };
  });
  const valor = dinheiro(itensPedido.reduce((total, item) => total + item.precoUnitario * item.quantidade, 0));
  const custoTotal = dinheiro(itensPedido.reduce((total, item) => total + item.custoUnitario * item.quantidade, 0));
  if (valor <= custoTotal) return res.status(409).json({ erro: 'O catálogo está sendo atualizado. Tente novamente em instantes.' });
  let afiliado = normUsuario(req.body.afiliado || '');
  let patrocinadorUsuario = null;
  let avoUsuario = null;
  if (afiliado) {
    const indicado = (await q('SELECT usuario, email, cpf, patrocinador_id FROM afiliados WHERE usuario = $1', [afiliado])).rows[0];
    if (!indicado) return res.status(400).json({ erro: 'O link de indicação informado não é válido.' });
    if (norm(indicado.email) === norm(conta.email)
      || (soDigitos(indicado.cpf) && soDigitos(indicado.cpf) === soDigitos(conta.cpf))) {
      afiliado = null;
    } else if (indicado.patrocinador_id && norm(indicado.patrocinador_id) !== 'admin') {
      const pai = (await q('SELECT usuario, patrocinador_id FROM afiliados WHERE usuario = $1 OR id = $1', [norm(indicado.patrocinador_id)])).rows[0];
      if (pai && pai.usuario !== indicado.usuario) {
        patrocinadorUsuario = pai.usuario;
        if (pai.patrocinador_id && norm(pai.patrocinador_id) !== 'admin') {
          const avo = (await q('SELECT usuario FROM afiliados WHERE usuario = $1 OR id = $1', [norm(pai.patrocinador_id)])).rows[0];
          if (avo && avo.usuario !== pai.usuario && avo.usuario !== indicado.usuario) avoUsuario = avo.usuario;
        }
      }
    }
  } else {
    afiliado = null;
  }

  const pedidoId = crypto.randomBytes(8).toString('hex');
  const downloadToken = crypto.randomBytes(32).toString('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserido = await client.query(`INSERT INTO pedidos
      (id, afiliado_usuario, produto_id, produto_nome, valor, valor_original, forma,
       cliente_nome, cliente_email, cliente_cpf, download_token, payment_idempotency_key,
       tipo_pedido, custo_total, patrocinador_usuario, avo_usuario)
      VALUES ($1, $2, 'carrinho-cj', $3, $4, $4, $5, $6, $7, $8, $9, $10, 'cj', $11, $12, $13)
      RETURNING id`,
    [pedidoId, afiliado, `Carrinho físico (${itensPedido.length} produtos)`, valor, forma,
      txt(conta.nome, 100), txt(conta.email, 120), soDigitos(conta.cpf), downloadToken, crypto.randomUUID(),
      custoTotal, patrocinadorUsuario, avoUsuario]);
    exigirUmaLinhaPersistida(inserido, 'pedidos');
    for (const item of itensPedido) {
      await client.query(`INSERT INTO itens_pedido
        (pedido_id, produto_pid, produto_nome, quantidade, preco_unitario, custo_unitario, imagem)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [pedidoId, item.pid, item.nome, item.quantidade, item.precoUnitario, item.custoUnitario, item.imagem || '']);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json({
    pedidoId,
    downloadToken,
    valor,
    quantidadeItens: itensPedido.reduce((total, item) => total + item.quantidade, 0)
  });
}));

app.get('/api/admin/produtos', auth, soAdmin, wrap(async (req, res) => {
  res.json(await lerConfig('produtos', PRODUTOS_INICIAIS));
}));

app.put('/api/produtos', auth, soAdmin, wrap(async (req, res) => {
  await gravarConfig('produtos', req.body);
  res.json({ ok: true });
}));

app.get('/api/config', wrap(async (req, res) => {
  const resposta = { whatsappSuporte: String(await lerConfig('whatsappSuporte', '')) };
  const bearer = req.headers.authorization || '';
  const usuario = await new Promise(resolve => {
    jwt.verify(bearer.startsWith('Bearer ') ? bearer.slice(7) : '', JWT_SECRET, (err, payload) => {
      resolve(err ? null : payload);
    });
  });
  if (usuario?.perfil === 'admin' && !usuario.trocar) {
    Object.assign(resposta, await lerTaxas(), {
      valorMinimoSaque: Number(await lerConfig('valorMinimoSaque', VALOR_MINIMO_SAQUE_PADRAO)),
      calendarioSaque: calendarioSaqueHoje()
    });
  }
  res.json(resposta);
}));

app.get('/api/admin/config', auth, soAdmin, wrap(async (req, res) => {
  res.json({
    ...(await lerTaxas()),
    valorMinimoSaque: Number(await lerConfig('valorMinimoSaque', VALOR_MINIMO_SAQUE_PADRAO)),
    calendarioSaque: calendarioSaqueHoje(),
    whatsappSuporte: String(await lerConfig('whatsappSuporte', ''))
  });
}));

app.get('/api/admin/dashboard', auth, soAdmin, wrap(async (req, res) => {
  const [financeiro, catalogo] = await Promise.all([
    q(`SELECT count(*)::int AS pedidos,
        COALESCE(sum(valor), 0) AS faturamento,
        COALESCE(sum(custo_total), 0) AS custo_fornecedor,
        COALESCE(sum(comissao), 0) AS comissao_nivel_1,
        COALESCE(sum(comissao_patrocinador), 0) AS comissao_nivel_2,
        COALESCE(sum(comissao_avo), 0) AS comissao_nivel_3,
        COALESCE(sum(comissao_central), 0) AS central
      FROM pedidos WHERE status = 'pago'`),
    q(`SELECT count(*)::int AS produtos,
        count(*) FILTER (WHERE ativo = true)::int AS ativos
      FROM produtos_cj`)
  ]);
  const valores = financeiro.rows[0];
  res.set('Cache-Control', 'no-store');
  res.json({
    pedidosPagos: valores.pedidos,
    faturamento: dinheiro(valores.faturamento),
    custoFornecedor: dinheiro(valores.custo_fornecedor),
    comissoes: {
      nivel1: dinheiro(valores.comissao_nivel_1),
      nivel2: dinheiro(valores.comissao_nivel_2),
      nivel3: dinheiro(valores.comissao_nivel_3)
    },
    central: dinheiro(valores.central),
    catalogoCJ: catalogo.rows[0]
  });
}));

app.put('/api/config', auth, soAdmin, wrap(async (req, res) => {
  const chavesTaxa = ['taxaComissao', 'taxaPatrocinador', 'taxaAvo'];
  const novasTaxas = {};
  for (const chave of chavesTaxa) {
    if (req.body[chave] === undefined) continue;
    const valor = Number(req.body[chave]);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      return res.status(400).json({ erro: 'Informe cada comissão entre 0% e 100%.' });
    }
    novasTaxas[chave] = valor;
  }
  const taxasAtuais = await lerTaxas();
  const taxasFinais = {
    taxaComissao: novasTaxas.taxaComissao ?? taxasAtuais.taxaComissao,
    taxaPatrocinador: novasTaxas.taxaPatrocinador ?? taxasAtuais.taxaPatrocinador,
    taxaAvo: novasTaxas.taxaAvo ?? taxasAtuais.taxaAvo
  };
  if (Object.keys(novasTaxas).length
    && taxasFinais.taxaComissao + taxasFinais.taxaPatrocinador + taxasFinais.taxaAvo > 100) {
    return res.status(400).json({ erro: 'A soma das comissões não pode ultrapassar 100%.' });
  }

  let valorMinimo;
  if (req.body.valorMinimoSaque !== undefined) {
    valorMinimo = Number(req.body.valorMinimoSaque);
    if (!Number.isFinite(valorMinimo) || valorMinimo < 0) {
      return res.status(400).json({ erro: 'Informe um valor mínimo de saque válido.' });
    }
  }

  for (const [chave, valor] of Object.entries(novasTaxas)) await gravarConfig(chave, valor);
  if (valorMinimo !== undefined) await gravarConfig('valorMinimoSaque', valorMinimo);
  if (req.body.whatsappSuporte !== undefined) await gravarConfig('whatsappSuporte', req.body.whatsappSuporte);
  res.json({
    ok: true,
    ...(await lerTaxas()),
    valorMinimoSaque: Number(await lerConfig('valorMinimoSaque', VALOR_MINIMO_SAQUE_PADRAO))
  });
}));

app.get('/api/admin/contas', auth, soAdmin, wrap(async (req, res) => {
  const r = await q('SELECT c.usuario, c.nome, c.email, c.cpf, c.telefone, c.criado_em, (a.usuario IS NOT NULL) AS afiliado FROM contas c LEFT JOIN afiliados a ON a.usuario = c.usuario LIMIT 50');
  res.json(r.rows.map(c => ({ ...c, whatsapp: c.telefone ? paraWhatsApp(c.telefone) : '' })));
}));

app.get('/api/afiliados', auth, soAdmin, wrap(async (req, res) => {
  res.json(await afiliadosComComissao());
}));

app.delete('/api/afiliados/:id', auth, soAdmin, wrap(async (req, res) => {
  await q('DELETE FROM afiliados WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/admin/contas/:usuario', auth, soAdmin, wrap(async (req, res) => {
  const usuario = norm(req.params.usuario);
  await q('DELETE FROM contas WHERE usuario = $1', [usuario]);
  await q('DELETE FROM afiliados WHERE usuario = $1', [usuario]);
  res.json({ ok: true });
}));

app.post('/api/webhook/mercadopago', async (req, res) => {
  try {
    const idPagamento = req.query.id || req.body?.data?.id;
    if (idPagamento) await sincronizarPagamentoMercadoPago(String(idPagamento));
  } catch (e) {
    console.error('Erro no webhook:', e);
  }
  res.status(200).send('OK');
});

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((err, req, res, next) => {
  console.error(`Erro na API ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente.' });
});

const PORT = process.env.PORT || 3000;
iniciarBanco()
  .then(() => app.listen(PORT, () => console.log(`Loja Tech rodando na porta ${PORT}`)))
  .catch(e => { console.error('ERRO NO NEON:', e); process.exit(1); });