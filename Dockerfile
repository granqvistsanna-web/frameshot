# Hosted-mode image. Official Playwright base ships the matching Chromium build
# (v1.60.0) plus every system lib it needs — no apt dance, no browser download.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Public mode: bind 0.0.0.0, require password, SSRF guard, serialized captures.
# --no-sandbox because the base image runs as root and containers drop the
# user-namespace privileges Chromium's sandbox needs.
ENV FRAMESHOTTER_PUBLIC=1 \
    FRAMESHOTTER_NO_SANDBOX=1 \
    NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Platform hosts inject PORT (startServer reads it); 5173 is the local fallback.
EXPOSE 5173

# serve = start the UI without trying to open a browser. FRAMESHOTTER_PASSWORD
# must be supplied at runtime as a platform secret, or the server refuses to boot.
CMD ["node", "index.js", "serve"]
