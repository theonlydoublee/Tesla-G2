# Stage 1: Build Vite app (context: project root)
FROM node:20-alpine AS app-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: API + static app
FROM node:20-alpine
WORKDIR /app

# API dependencies
COPY Docker/package*.json ./
RUN npm ci --omit=dev

# API source
COPY Docker/server.js .

# Built static app from stage 1
COPY --from=app-build /app/dist ./dist

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
