FROM node:20-bookworm-slim

WORKDIR /app

# erlpack dan native module lain dikompilasi oleh node-gyp.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        git \
        python3 \
        make \
        g++ \
    && npm config set python /usr/bin/python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["npm", "start"]
