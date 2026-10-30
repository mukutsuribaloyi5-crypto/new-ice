# Debian-based image avoids the Alpine musl/native SQLite add-on complications.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY client ./client
COPY vite.config.mjs ./
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/app/data/data.db
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm", "start"]
