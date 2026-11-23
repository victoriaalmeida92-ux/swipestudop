import { syncWithApify } from '../lib/apify.mjs';

async function main() {
  const args = process.argv.slice(2);
  let niche = null;
  const nicheIdx = args.indexOf('--niche');
  if (nicheIdx !== -1 && args[nicheIdx + 1]) {
    niche = args[nicheIdx + 1];
  }
  console.log(
    niche
      ? `[sync-apify] Iniciando coleta automática do assunto/nicho "${niche}"...`
      : '[sync-apify] Iniciando coleta automática de perfis monitorados...'
  );
  const result = await syncWithApify({ niche });
  console.log(`[sync-apify] Status: ${result.status}`);
  console.log(`[sync-apify] Perfis verificados: ${result.profilesChecked.map((h) => '@' + h).join(', ')}`);
  console.log(`[sync-apify] Novos itens importados: ${result.newItemsCount}`);
  if (result.newItemIds.length) {
    console.log(`[sync-apify] IDs adicionados: ${result.newItemIds.join(', ')}`);
  }
  if (result.errors.length) {
    console.warn('[sync-apify] Avisos/Erros:');
    for (const err of result.errors) {
      console.warn(`  - ${err}`);
    }
  }
  console.log('[sync-apify] Biblioteca Markdown em ./library/ atualizada com sucesso.');
}

main().catch((err) => {
  console.error(`[sync-apify] Erro fatal: ${err.message}`);
  process.exit(1);
});
