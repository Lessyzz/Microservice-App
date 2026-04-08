FROM node:24 AS builder

WORKDIR /work

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:24

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /work/dist ./dist

EXPOSE 1002

CMD ["serve", "-s", "dist", "-l", "1002"]
