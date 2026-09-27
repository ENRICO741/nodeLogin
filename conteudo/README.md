# Conteúdo das aulas

Cada aula é uma pasta em `aulas/`. Ela é importada automaticamente quando a API sobe: no `docker compose up --watch` isso acontece em segundos, e na VM, no próximo deploy.

```
aulas/
  04-engenharia-social/      NN-assunto: NN = ordem da aula · assunto = identidade (não renomeie)
    aula.html                título, conteúdo e perguntas
    imagens/                 imagens usadas no aula.html
      mensagem-falsa.png
```

## Criar uma aula nova

1. Copie a pasta `modelo/` para `aulas/NN-assunto`. Use o próximo número livre e letras minúsculas com hífen.
2. Edite o `aula.html` seguindo os comentários do modelo.
3. Abra o `aula.html` no navegador. O `modelo/previa.css` mostra a aula com o visual do app, com a alternativa correta marcada.
4. Valide:
   ```bash
   docker compose exec api npm run importar-aulas -- --validar
   ```
   Se algo estiver errado, a mensagem diz o arquivo, a pergunta e o problema. Por exemplo: `04-engenharia-social/aula.html: pergunta "pedido-de-senha": precisa de exatamente 1 alternativa com data-correta, tem 2`.
5. Com o `docker compose up --watch` rodando, a aula aparece no app em http://localhost:5173.

## Regras

| O quê | Regra |
| --- | --- |
| Título | Vem do `<title>`. O conteúdo começa em `<h2>`: não use `<h1>` |
| Ordem | O número da pasta. Para reordenar, troque os números das pastas |
| Identidade da aula | O nome depois do número (`engenharia-social`). **Renomear cria outra aula** e a antiga continua no banco |
| Bônus de conclusão | `<meta name="aula:pontos-conclusao" content="20">`, entre 0 e 1000. É pago uma vez por pessoa |
| Pergunta | `data-pergunta` único na aula, com 4 alternativas em `<ol>` e exatamente uma `data-correta` |
| Identidade da pergunta | O `data-pergunta`. **Não mude depois de publicada**: é ele que liga a pergunta às respostas e pontos já dados |
| Pontos da pergunta | `data-pontos`, entre 0 e 100 (padrão 10). Contam **só no primeiro acerto** de cada pessoa |
| Imagens | Ficam em `imagens/` (png, jpg, webp, gif ou svg) e precisam de `alt`. Use `alt=""` só se a imagem for decorativa |
| Destaques | `<aside class="nota">`, `<aside class="dica">`, `<aside class="atencao">` |
| O que é removido | Scripts, estilos, atributos `on…` e links que não sejam `https:` ou `mailto:` |

## Atualizar ou remover

- **Editar uma aula publicada:** mude o `aula.html`. Na próxima importação, a aula é atualizada, e as respostas e os pontos já dados continuam.
- **Remover uma pergunta:** apague o bloco dela. Ela sai do quiz, e as respostas antigas continuam nas estatísticas.
- **Ocultar uma aula:** use a área admin (Aulas → Desativar aula). Apagar a pasta não remove a aula do banco.

Aulas vindas de arquivo ficam **somente leitura** na área admin, porque a próxima importação desfaria qualquer edição feita por lá. Aulas criadas pela própria área admin continuam editáveis.
