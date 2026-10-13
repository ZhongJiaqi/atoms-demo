FROM node:22-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --ignore-scripts
COPY . ./

USER node
EXPOSE 4173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "4173", "--strictPort"]
