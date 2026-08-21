FROM mcr.microsoft.com/playwright:v1.55.0-noble

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

ENV NODE_ENV=production \
    RECAP_RENDER_PROVIDER=self_hosted \
    RECAP_FPS=24 \
    RECAP_OUTPUT_ROOT=/var/lib/bigexec-recaps

VOLUME ["/var/lib/bigexec-recaps"]
CMD ["npm","start"]
