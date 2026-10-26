// Monta a pasta `dist/` com apenas o que o site publicado precisa:
// index.html, JavaScript compilado, estilos, marca e public/config.json.
// Código-fonte (.ts), testes e scripts NÃO são publicados.
//
// A configuração do Supabase vem das variáveis de ambiente SUPABASE_URL e
// SUPABASE_ANON_KEY (definidas no netlify.toml). Sem elas o build falha: o
// site publicado nunca abre no modo protótipo, sem login.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseSupabaseConfig } from '../build/integrations/supabase/config.js';

const OUT = 'dist';

if (!existsSync('build/main.js')) {
  console.error('Rode "npm run build" antes (o comando build:site já faz isso).');
  process.exit(1);
}

let config;
try {
  config = parseSupabaseConfig({ supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY });
} catch (error) {
  console.error(`Configuração do Supabase inválida para publicação: ${error.message}`);
  console.error('Defina SUPABASE_URL e SUPABASE_ANON_KEY (chave pública) — veja docs/PUBLICACAO.md.');
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/public`, { recursive: true });
await cp('index.html', `${OUT}/index.html`);
await cp('build', `${OUT}/build`, { recursive: true, filter: (src) => !src.endsWith('.map') });
await cp('src/styles', `${OUT}/src/styles`, { recursive: true });
await cp('public/brand', `${OUT}/public/brand`, { recursive: true, filter: (src) => !src.endsWith('.md') });
await writeFile(`${OUT}/public/config.json`, JSON.stringify(config, null, 2));

console.log(`Site montado em ${OUT}/ (Supabase: ${config.supabaseUrl})`);
