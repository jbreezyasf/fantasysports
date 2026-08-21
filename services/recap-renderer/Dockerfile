FROM mcr.microsoft.com/playwright:v1.55.0-noble

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

ENV NODE_ENV=production \
    RECAP_RENDER_PROVIDER=self_hosted \
    RECAP_FPS=24 \
    RECAP_HTTP_PORT=8787 \
    RECAP_OUTPUT_ROOT=/var/lib/bigexec-recaps

EXPOSE 8787
VOLUME ["/var/lib/bigexec-recaps"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD curl -fsS http://127.0.0.1:8787/health || exit 1
CMD ["npm","start"]
