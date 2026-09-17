# ===================================================================
# Dockerfile - Sonic Gestión Bot (Producción en Linux Debian)
# Base: Debian Bookworm Slim con Bun Runtime y OpenSSL para Prisma
# ===================================================================

FROM oven/bun:debian AS runner

# 1. Instalar dependencias del sistema operativo Debian necesarias para Prisma y llamadas HTTPS
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Copiar manifiestos de dependencias y esquema de base de datos
COPY package.json ./
COPY prisma ./prisma/

# 3. Instalar dependencias y generar el cliente Prisma nativo para Linux Debian
RUN bun install
RUN bunx prisma generate

# 4. Copiar el código fuente de la aplicación y scripts
COPY . .

# 5. Crear el directorio de datos para la base de datos persistente y asignar permisos al usuario 'bun'
RUN mkdir -p /app/data && \
    chmod +x /app/docker-entrypoint.sh && \
    chown -R bun:bun /app

# 6. Ejecutar bajo el usuario seguro no root 'bun'
USER bun

# 7. Variables de entorno de producción por defecto
ENV NODE_ENV=production
ENV RESET_DB_ON_START=false
ENV DEV_RESET_DB=false
ENV DATABASE_URL="file:/app/data/production.db"

# 8. Punto de entrada de arranque seguro
ENTRYPOINT ["/app/docker-entrypoint.sh"]

