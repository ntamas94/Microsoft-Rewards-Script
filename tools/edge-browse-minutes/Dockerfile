# Microsoft Edge only ships for linux/amd64 - this image cannot be built for arm64.
FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PATCHRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    DISPLAY=:99 \
    EDGE_USER_DATA_DIR=/profile

# X server + a window manager (Edge needs a focusable window), xdotool for the focus keeper,
# and x11vnc/noVNC so the one-off Microsoft sign-in can be done by hand in a browser.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        dumb-init \
        procps \
        xvfb \
        x11-utils \
        x11vnc \
        xdotool \
        fluxbox \
        novnc \
        websockify \
        fonts-liberation \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
        | gpg --dearmor -o /usr/share/keyrings/microsoft.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/edge stable main" \
        > /etc/apt/sources.list.d/microsoft-edge.list \
    && apt-get update && apt-get install -y --no-install-recommends microsoft-edge-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN chmod +x docker-entrypoint.sh src/keep-awake.sh

VOLUME ["/profile"]
EXPOSE 6080

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/app/docker-entrypoint.sh"]
CMD ["run"]
