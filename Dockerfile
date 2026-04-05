# Build client + compile server
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
COPY server ./server
COPY tsconfig.json tsconfig.server.json vite.config.ts ./
RUN npm run build

# Production image
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5070
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 5070
CMD ["node", "dist/server/index.js"]
