FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./

# Desenvolvimento (docker-compose.yml): inclui devDependencies para rodar os testes no container.
FROM base AS dev
RUN npm ci
COPY . .
EXPOSE 4000
CMD ["node", "src/server.js"]

# Produção (docker-compose.prod.yml): alvo padrão.
FROM base AS prod
ENV NODE_ENV=production
RUN npm ci --omit=dev
COPY src ./src
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/api/saude || exit 1
CMD ["node", "src/server.js"]
