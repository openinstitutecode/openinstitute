FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=^API_UPSTREAM(_SCHEME)?$
ENV API_UPSTREAM=127.0.0.1:10000
ENV API_UPSTREAM_SCHEME=http
EXPOSE 10000
