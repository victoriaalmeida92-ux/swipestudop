import { syncMarkdownLibrary } from '../lib/store.mjs';

syncMarkdownLibrary()
  .then(() => {
    console.log('[rebuild-library] Todos os arquivos Markdown em ./library/ foram regenerados com sucesso.');
  })
  .catch((err) => {
    console.error('[rebuild-library] Erro:', err);
    process.exit(1);
  });
