FROM node:22.17.1-slim

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
COPY package.json package-lock.json* ./

# Install app dependencies
RUN npm install

# Bundle app source
COPY . .

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "server.js"]