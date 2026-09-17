import { Events, ActivityType } from 'discord.js';
import { ConfigService } from '../../src/services/configService.js';
import { SchedulerService } from '../../src/services/schedulerService.js';
import { prisma } from '../../src/database/prisma.js';

export default {
  name: Events.ClientReady || 'ready',
  once: true,
  run: async (client) => {
    try {
      // Flag de desarrollo opcional para reiniciar la BD (RESET_DB_ON_START=true o DEV_RESET_DB=true)
      const shouldResetDb = process.env.RESET_DB_ON_START === 'true' || process.env.DEV_RESET_DB === 'true';

      if (shouldResetDb) {
        console.warn('[DEV] ⚠️ Flag de reinicio de base de datos activa (RESET_DB_ON_START=true). Vaciando tablas...');
        await prisma.videoParticipant.deleteMany({});
        await prisma.videoRecord.deleteMany({});
        await prisma.talent.deleteMany({});
        await prisma.config.deleteMany({});
        console.log('[DEV] Base de datos reiniciada para entorno de pruebas/desarrollo.');
      }

      // 1. Initialize dynamic configuration (auto-seeds default Config row if empty)
      await ConfigService.init();
      console.log('[ConfigService] Configuración global inicializada y verificada.');

      // 2. Start background settlement polling engine (evaluates mature 5-day videos every 60s)
      SchedulerService.startScheduler(client);
      console.log('[SchedulerService] Motor de liquidación periódica iniciado.');

      // 3. Set bot activity presence
      if (client.user?.setActivity) {
        const activePrefix = ConfigService.getPrefix() || '!';
        client.user.setActivity(`${activePrefix}ayuda | Gestión de Videos`, { type: ActivityType.Watching });
      }

      console.log(`[Bot] Sesión iniciada con éxito como ${client.user?.tag || 'Sonic Bot'}`);
    } catch (error) {
      console.error('[Bot] Error durante el inicio del ciclo de vida:', error);
    }
  }
};
