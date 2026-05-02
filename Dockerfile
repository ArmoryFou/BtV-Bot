FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 py3-pip py3-pillow

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
