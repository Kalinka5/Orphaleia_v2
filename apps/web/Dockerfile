FROM node:22-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_UMAMI_WEBSITE_ID=
ARG VITE_UMAMI_SCRIPT_URL=
ARG VITE_UMAMI_DOMAINS=
ENV VITE_UMAMI_WEBSITE_ID=$VITE_UMAMI_WEBSITE_ID
ENV VITE_UMAMI_SCRIPT_URL=$VITE_UMAMI_SCRIPT_URL
ENV VITE_UMAMI_DOMAINS=$VITE_UMAMI_DOMAINS
RUN npm run build
RUN find dist/assets -maxdepth 1 -type f \( -name '*.js' -o -name '*.css' \) -exec gzip -k -6 {} \;

FROM nginx:1.29-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
