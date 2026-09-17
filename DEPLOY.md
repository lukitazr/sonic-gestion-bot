# Guía de Despliegue en Producción (Debian Linux con Docker)

Esta guía describe los pasos necesarios para desplegar **Sonic Gestión Bot** en un servidor o máquina virtual con sistema operativo Linux basado en Debian (Debian 11/12, Ubuntu 22.04/24.04 LTS, etc.) utilizando Docker y Docker Compose con persistencia de base de datos de producción y protección estricta contra reinicio de datos.

---

## 1. Requisitos Previos

En tu servidor Debian Linux, asegúrate de tener instalado Docker y Docker Compose v2:

```bash
# Actualizar repositorios e instalar paquetes base
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Instalar Docker Engine (si no está instalado)
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Permitir a tu usuario ejecutar Docker sin sudo (opcional pero recomendado)
sudo usermod -aG docker $USER
newgrp docker
```

---

## 2. Clonación y Configuración del Entorno

1. Clona el repositorio en tu servidor:
   ```bash
   git clone <URL_DEL_REPOSITORIO> sonic-gestion-bot
   cd sonic-gestion-bot
   ```

2. Crea tu archivo de variables de entorno a partir de la plantilla:
   ```bash
   cp .env.example .env
   nano .env
   ```

3. Completa los valores de producción en `.env`:
   - `DISCORD_TOKEN`: Token secreto de tu bot de Discord.
   - `CLIENT_ID`: Application ID de la aplicación de Discord.
   - `GUILD_ID`: ID del servidor de Discord donde opera el bot.
   - `HISTORY_CHANNEL_ID`: ID del canal de texto para historial y fichas de videos.
   - `ADMIN_CHANNEL_ID`: ID del canal privado de administración para liquidaciones.
   - `YOUTUBE_API_KEY`: API Key de Google Cloud Console con YouTube Data API v3 habilitada.
   - `PREFIX`: Prefijo por defecto (ej. `!`).
   - `RESET_DB_ON_START=false`: **ESTRICTAMENTE `false`** en producción para evitar cualquier pérdida de datos.
   - `DEV_RESET_DB=false`: **ESTRICTAMENTE `false`**.
   - `DATABASE_URL=file:/app/data/production.db`: Ubicación de la base de datos persistente en el volumen.

---

## 3. Construcción y Despliegue con Docker Compose

Para construir la imagen basada en Debian Bookworm con Bun runtime y levantar el contenedor en segundo plano:

```bash
# Construir la imagen y arrancar el contenedor en segundo plano
docker compose up -d --build
```

El script de arranque (`docker-entrypoint.sh`):
1. Forzará automáticamente `RESET_DB_ON_START=false` y `DEV_RESET_DB=false` como medida de seguridad activa.
2. Ejecutará `bunx prisma db push --skip-generate` para asegurar que las tablas de la base de datos SQLite estén creadas o actualizadas sin borrar ningún registro existente.
3. Iniciará el proceso del bot con Bun bajo el usuario no root `bun`.

---

## 4. Gestión y Monitoreo del Bot

- **Ver logs en tiempo real:**
  ```bash
  docker compose logs -f sonic-bot
  ```

- **Ver el estado del contenedor:**
  ```bash
  docker compose ps
  ```

- **Reiniciar el bot:**
  ```bash
  docker compose restart sonic-bot
  ```

- **Detener el bot:**
  ```bash
  docker compose down
  ```
  *(La base de datos se mantendrá intacta en el volumen `sonic_data`).*

- **Actualizar el bot con nueva versión de código:**
  ```bash
  git pull
  docker compose up -d --build
  ```

---

## 5. Respaldo (Backup) de la Base de Datos de Producción

La base de datos SQLite se almacena en el volumen persistente de Docker llamado `sonic_data` (mapeado a `/app/data/production.db` en el contenedor).

Para realizar un respaldo en caliente o en frío sin entrar al volumen manualmente:

```bash
# Crear directorio de respaldos
mkdir -p ./backups

# Copiar la base de datos de producción fuera del contenedor
docker compose cp sonic-bot:/app/data/production.db ./backups/production_$(date +%Y%m%d_%H%M%S).db

echo "Respaldo completado en ./backups/"
```

Para restaurar un respaldo en caso de emergencia:
```bash
docker compose stop sonic-bot
docker compose cp ./backups/tu_archivo_de_respaldo.db sonic-bot:/app/data/production.db
docker compose start sonic-bot
```

