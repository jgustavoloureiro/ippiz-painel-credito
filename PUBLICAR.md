# Como publicar este projeto

## 1. Gerar o `.pbix` a partir do `.pbip` (2 minutos, uma vez só)

O `.pbip` já tem o modelo semântico inteiro pronto (tabelas, relacionamentos, medidas DAX). Só falta
apontar a fonte de dados para o seu computador e salvar como `.pbix`:

1. Instale o **Power BI Desktop** (Microsoft Store, gratuito) se ainda não tiver.
2. Abra `powerbi/Ippiz.pbip` — dá duplo clique, ele abre no Power BI Desktop.
3. Se aparecer erro de fonte de dados (provável, na primeira vez): vá em **Página Inicial → Transformar
   Dados → Configurações de Origem de Dados**. Selecione a origem que aparece com o caminho
   `C:\CAMINHO\PARA\...` e clique em **Alterar Origem**. Aponte para o arquivo real:
   `[onde você extraiu o projeto]\ippiz-portfolio\data\ippiz_data.json`. Clique OK e depois **Fechar**.
4. Clique em **Atualizar** na faixa de opções para carregar os dados.
5. **Arquivo → Salvar Como → Power BI (.pbix)** → salve como `Ippiz.pbix` dentro da pasta `powerbi/`.
6. Pronto — agora você tem os dois: `Ippiz.pbip` (o que vai pro Git) e `Ippiz.pbix` (o artefato final
   para anexar/compartilhar).

> Dica: como a página do relatório vem em branco, esse também é o momento de arrastar as medidas da
> tabela `_Medidas` para uns cartões e gráficos — 10 minutos e você tem um relatório visual completo
> pra mostrar print no LinkedIn também, se quiser.

## 2. Publicar no GitHub

```bash
# dentro da pasta ippiz-portfolio/
git init
git add .
git commit -m "Case de portfólio: painel executivo Ippiz (BA - crédito PIX)"

# crie o repositório vazio em github.com/new (sem README/gitignore, pra não conflitar)
# nome sugerido: ippiz-painel-credito  ou  ippiz-business-analyst-case

git branch -M main
git remote add origin https://github.com/jgustavoloureiro/ippiz-painel-credito.git
git push -u origin main
```

Se preferir sem terminal, o **GitHub Desktop** faz a mesma coisa visualmente (Add Local Repository →
Publish Repository).

> O `Ippiz.pbix` pode pesar alguns MB depois de gerado — GitHub aceita numa branch normal até 100 MB
> por arquivo, então não deve ter problema, mas se ficar pesado dá pra usar Git LFS (`git lfs track
> "*.pbix"`) antes do primeiro commit.

## 3. Deixar o dashboard "clicável" direto do GitHub (GitHub Pages)

O jeito mais simples: como `index.html` está na raiz do repositório e não depende de mais nada, o
GitHub Pages já carrega o dashboard automaticamente na URL principal, sem precisar apontar pra um
arquivo específico:

1. No repositório, **Settings → Pages**.
2. Em **Source**, selecione a branch `main` e a pasta **/ (root)**.
3. Salve. Em 1–2 minutos o link fica em:
   `https://jgustavoloureiro.github.io/ippiz-painel-credito/`
4. Esse é o link que você cola no post do LinkedIn e no README — quem clicar vê o painel funcionando
   de verdade, sem precisar baixar nada.

## 4. Sugestão de descrição curta do repositório (campo "About" do GitHub)

> Painel executivo interativo (BI + IA local) para uma fintech fictícia de crédito via PIX — case de
> portfólio construído a partir de uma vaga real de Business Analyst. HTML/JS + Power BI (DAX) + Excel.
