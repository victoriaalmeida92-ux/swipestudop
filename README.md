# Swipe Studio — Auxiliar de Produção de Conteúdo & Studio de Vídeo

Plataforma local (Node.js 20+, zero dependências externas) para monitorar perfis de Instagram por **Assunto / Nicho** via **Apify**, curar e treinar seu próprio filtro de relevância, descobrir novos perfis automaticamente, modelar vídeos via API (**Gemini Omni 1.2 Flash**, **Seedance 2.0** e **OmniHuman v2**) e legendar Reels com **FFmpeg local** ou **Google Vids**.

## Principais Recursos

- **Swipe File organizado por Assunto / Nicho:** coleta automática de Reels (e suporte opcional a Stories) via Apify, com filtros por nicho, perfil, formato, estágio de funil, tipo de gancho e busca textual.
- **Player embutido + Cache local de mídia:** assista aos Reels direto nos cards ou no player vertical `9:16` sem precisar abrir o Instagram (proxy local + cache em `data/media/` para evitar bloqueio de CORS e expiração de links).
- **Curadoria (👍 / 👎) & Algoritmo de Relevância:** avalie itens para treinar automaticamente o filtro por nicho, bloqueando conteúdo fora do assunto nas próximas coletas e mantendo a biblioteca IA limpa.
- **🧭 Radar de Perfis:** busca automática no Instagram (`apify~instagram-search-scraper`) usando o nicho + termos aprovados no treino para sugerir 3 a 5 novos perfis para você aprovar no escopo do Swipe File.
- **🎬 Studio de Vídeo via API:**
  - **Gemini Omni 1.2 Flash** (Google Flow via Gemini Interactions API — `GEMINI_API_KEY`)
  - **Seedance 2.0 Omni Reference-to-Video / I2V / T2V** (ByteDance via `fal.ai` — `FAL_KEY`)
  - **OmniHuman v2** (Avatar falante foto + áudio via `fal.ai` — `FAL_KEY`)
  - Atalho 1-clique para usar créditos do **Google Flow Web** (`labs.google/fx/tools/flow`).
- **💬 Editor de Legendas (FFmpeg) & Google Vids:** gera timestamps `.srt` automáticos com `ffprobe`, queima legendas estilizadas estilo Reels/TikTok direto no MP4 com `ffmpeg` local e inclui fluxo rápido de envio para o **Google Vids** (`vids.new`).
- **Biblioteca IA em Markdown (`./library/`):** espelha automaticamente DNA da marca, perfis, banco de ganchos, regras de curadoria e itens aprovados para uso com assistentes de IA (`AGENTS.md` + skill `.agents/skills/modelar-conteudo/SKILL.md`).

## Início Rápido

Requisitos: **Node.js 20+** (e **FFmpeg** no `PATH` para queimar legendas localmente).

```bash
# 1. Copie o exemplo de variáveis (opcional — também dá para configurar pelo Dashboard)
cp .env.example .env

# 2. Inicie o Dashboard local
npm start
```

Acesse: **http://127.0.0.1:3456**

> No Windows, você também pode dar um duplo clique em `Abrir-Swipe-Studio.bat`.

## Comandos Úteis

```bash
npm start                                # Inicia o Dashboard local (porta 3456)
npm run sync                             # Coleta automática via Apify (todos os perfis ativos)
npm run sync -- --niche "Nome do Nicho"  # Coleta apenas os perfis de um nicho específico
npm run rebuild-library                  # Regenera os arquivos Markdown em ./library/
```

## Segurança & Dados Locais

O arquivo `.gitignore` bloqueia automaticamente `.env` (chaves de API), `data/` (base local e vídeos em cache) e `library/` (arquivos gerados em runtime). Ao clonar em outra máquina, essas pastas são recriadas automaticamente na primeira execução.
