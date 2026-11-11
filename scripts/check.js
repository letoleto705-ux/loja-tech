'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const files = ['index.html', 'checkout_sacola.html', 'afiliado.html', 'pagamento.html'];
const failures = [];
for (const name of files) {
  const htmlPath = path.join(root, 'public', name);
  if (!fs.existsSync(htmlPath)) { failures.push(`Arquivo ausente: public/${name}`); continue; }
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  scripts.forEach((match, i) => {
    const check = spawnSync(process.execPath, ['--check', '-'], { input: match[1], encoding: 'utf8' });
    if (check.status !== 0) failures.push(`${name}, script inline ${i + 1}: ${check.stderr}`);
  });
}
const required = [
  ["rota de checkout unificado", "app.post('/api/checkout/sacola'"],
  ['persistência de itens', 'INSERT INTO pedido_itens'],
  ['webhook Mercado Pago', "app.post('/api/webhook/mercadopago'"],
  ['compatibilidade afiliado_ref', 'req.body.afiliado_ref'],
  ['apuração do mês anterior', 'periodoApuracaoAnteriorBrasil'],
  ['quinto dia útil', 'quintoDiaUtilBrasil(hoje.year, hoje.month)']
];
for (const [label, token] of required) if (!server.includes(token)) failures.push(`Integração ausente: ${label}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('OK: arquivos HTML encontrados; scripts inline válidos; integrações essenciais presentes.');
