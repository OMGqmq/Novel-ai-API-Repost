FROM node:22-alpine

WORKDIR /app

# 复制项目代码与资源文件
COPY package*.json ./
COPY init_db.sql ./
COPY d1-adapter.js ./
COPY server.js ./
COPY functions ./functions
COPY src ./src
COPY images ./images
COPY index.html ./
COPY .env.example ./

# 创建 SQLite 持久化数据目录
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/nai.db

VOLUME ["/app/data"]

CMD ["node", "server.js"]
