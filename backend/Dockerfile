# Construído a partir da raiz do repositório (precisa de backend/ e conteudo/):
#   docker build -f backend/Dockerfile .
FROM node:24-alpine AS base
WORKDIR /app
ENV CONTEUDO_DIR=/app/conteudo
COPY backend/package*.json ./

# Desenvolvimento (docker-compose.yml): inclui devDependencies para rodar os testes no container.
FROM base AS dev
RUN npm ci
COPY backend/ ./
COPY conteudo ./conteudo
EXPOSE 4000
CMD ["node", "src/server.js"]

# Produção (docker-compose.prod.yml): alvo padrão.
FROM base AS prod
ENV NODE_ENV=production
# O npm da imagem base não é usado em execução e traz CVEs próprias: sai depois de instalar.
RUN npm ci --omit=dev && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY backend/src ./src
COPY conteudo ./conteudo
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/api/saude || exit 1
CMD ["node", "src/server.js"]
