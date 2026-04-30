FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN mkdir -p /app/data

VOLUME /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/login || exit 1

CMD ["node", "server.js"]
