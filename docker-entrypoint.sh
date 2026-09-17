#!/bin/sh
set -e

echo "=========================================================="
echo "🚀 Iniciando Sonic Gestión Bot en Debian Linux (Producción)"
echo "=========================================================="
echo "• Node Environment     : ${NODE_ENV:-production}"
echo "• Database URL         : ${DATABASE_URL:-file:/app/data/production.db}"
echo "• Reset DB on Start    : ${RESET_DB_ON_START:-false}"
echo "=========================================================="

# 1. Asegurar que la flag de reinicio de BD esté desactivada en producción
if [ "$RESET_DB_ON_START" = "true" ] || [ "$DEV_RESET_DB" = "true" ]; then
  echo "⚠️ ADVERTENCIA: La flag RESET_DB_ON_START o DEV_RESET_DB está activa en el entorno."
  echo "⚠️ Forzando desactivación para proteger la base de datos de producción..."
  export RESET_DB_ON_START=false
  export DEV_RESET_DB=false
fi

# 2. Asegurar que el directorio de datos persistentes exista
mkdir -p /app/data

# 3. Aplicar esquema de base de datos de producción con Prisma sin borrar datos
echo "📦 Verificando y sincronizando esquema de la base de datos SQLite..."
bunx prisma db push --skip-generate

echo "🤖 Arrancando proceso del bot..."
exec bun run index.js

