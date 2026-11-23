# Regras do Workspace — Swipe Studio (Auxiliar de Conteúdo)

Este workspace é uma biblioteca viva de referências (**Swipe File**) + motor de modelagem de conteúdo para Instagram (**Reels** e **Stories**).

## Onde estão os arquivos de referência para a IA
Sempre consulte a pasta `library/` (mantida automaticamente sincronizada com o Dashboard Web):
- `library/brand-dna.md` — DNA da marca, produto, público-alvo (ICP), dores, objeções, tom de voz e clichês proibidos. **Leia antes de criar qualquer conteúdo.**
- `library/swipe-file-index.md` — Índice geral de todos os Reels e Stories coletados (incluindo coluna **Assunto / Nicho**).
- `library/hooks-bank.md` — Banco de ganchos (hooks) agrupados por categoria.
- `library/profiles.md` — Perfis de referência monitorados, organizados por **Assunto / Nicho**.
- `library/items/SWP-XXX.md` — Desconstrução completa de cada item do Swipe File.

## Regra de Ouro da Modelagem (Anti-Plágio)
1. **Nunca copie** frases, roteiros ou legendas literalmente dos perfis de referência.
2. Extraia apenas o **esqueleto estratégico**: mecanismo de retenção do gancho (0–3s), ordem lógica dos argumentos/frames, gatilhos psicológicos e estilo de CTA.
3. Reescreva 100% no **tom de voz**, **contexto do produto** e **linguagem do público** definidos em `library/brand-dna.md`.
4. Respeite rigorosamente as palavras e clichês proibidos do DNA da Marca.

## Comandos úteis do projeto
- Iniciar o Dashboard local: `npm start` (abre em `http://127.0.0.1:3456`)
- Rodar coleta automática na Apify (todos os perfis ou filtrando por nicho): `npm run sync` ou `npm run sync -- --niche "Nome do Nicho"`
- Regerar todos os Markdowns da biblioteca: `npm run rebuild-library`
