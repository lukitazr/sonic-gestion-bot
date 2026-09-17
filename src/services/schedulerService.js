import { prisma } from '../database/prisma.js';
import { ConfigService } from './configService.js';
import { YouTubeService } from './youtubeService.js';
import { PayoutService } from './payoutService.js';
import { NotificationService } from './notificationService.js';
import { WeeklySummaryService } from './weeklySummaryService.js';

/**
 * Scheduler Service
 * Handles periodic polling for mature videos, pure settlement calculation,
 * atomic idempotency locking, database updates, and notification dispatching.
 */
export class SchedulerService {
  static intervalId = null;
  static isRunning = false;
  static client = null;
  static processingVideos = new Set();

  /**
   * Starts the non-blocking background polling engine.
   *
   * @param {Object} [client=null] - Discord Client instance
   * @param {number} [intervalMs=60000] - Polling interval in milliseconds (default: 60s)
   * @returns {boolean} True if started, false if already running
   */
  static startScheduler(client = null, intervalMs = 60000) {
    if (this.isRunning) {
      return false;
    }

    this.client = client;
    this.isRunning = true;

    this.intervalId = setInterval(async () => {
      try {
        await this.processPendingVideos(this.client);
      } catch (error) {
        console.error('[SchedulerService] Error en ciclo de liquidación periódica:', error);
      }

      try {
        await this.checkAndRunWeeklySummary(this.client);
      } catch (wsError) {
        console.error('[SchedulerService] Error en ciclo de resumen semanal:', wsError);
      }
    }, intervalMs);

    // Allow process to exit cleanly if interval is still active in Node/Bun runtimes
    if (this.intervalId && typeof this.intervalId.unref === 'function') {
      this.intervalId.unref();
    }

    return true;
  }

  /**
   * Evaluates weekly summary schedule and triggers automated report when day/hour/minute match.
   *
   * @param {Object} [client=null] - Discord Client
   * @param {Date} [referenceDate=new Date()] - Reference date
   * @returns {Promise<boolean>} True if summary was triggered
   */
  static async checkAndRunWeeklySummary(client = null, referenceDate = new Date()) {
    const config = await ConfigService.getConfig(true);
    if (!config || !config.weeklySummaryEnabled) {
      return false;
    }

    const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    const day = now.getDay();
    const hour = now.getHours();
    const minute = now.getMinutes();

    if (day === config.weeklySummaryDay && hour === config.weeklySummaryHour && minute === config.weeklySummaryMinute) {
      const lastRun = config.lastWeeklySummaryAt ? new Date(config.lastWeeklySummaryAt) : null;
      // Guard against running multiple times within the same 2 minutes
      const isAlreadyRunRecently = lastRun && Math.abs(now.getTime() - lastRun.getTime()) < 120000;

      if (!isAlreadyRunRecently) {
        console.log(`[SchedulerService] Disparando Resumen Semanal automático programado (Día: ${day}, Hora: ${hour}:${String(minute).padStart(2, '0')})...`);
        const activeClient = client || this.client;
        await WeeklySummaryService.executeWeeklySummary(activeClient, {
          pingEveryone: true,
          referenceDate: now
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Stops the background polling loop cleanly.
   * @returns {boolean} True if stopped
   */
  static stopScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    this.client = null;
    this.processingVideos.clear();
    return true;
  }

  /**
   * Checks if scheduler polling engine is actively running.
   * @returns {boolean}
   */
  static isSchedulerRunning() {
    return this.isRunning;
  }

  /**
   * Manually settles a single video by ID or YouTube Video ID.
   * Implements multi-layer atomic idempotency and dispatches admin orders and participant DMs.
   *
   * @param {string} idOrVideoId - Internal UUID or YouTube Video ID / URL
   * @param {Object} [client=null] - Optional Discord Client for notification dispatch
   * @returns {Promise<{ videoRecord: Object, settlement: Object, views: number }>}
   */
  static async settleVideo(idOrVideoId, client = null) {
    if (!idOrVideoId || typeof idOrVideoId !== 'string') {
      throw new Error('Debes proporcionar un ID de video o ID/enlace de YouTube válido.');
    }

    const cleanInput = idOrVideoId.trim();
    const extractedYtId = YouTubeService.extractVideoId(cleanInput);
    const lookupKey = extractedYtId || cleanInput;

    const video = await prisma.videoRecord.findFirst({
      where: {
        OR: [
          { id: lookupKey },
          { youtubeVideoId: lookupKey }
        ]
      },
      include: {
        editor: true,
        participants: {
          include: {
            talent: true
          }
        }
      }
    });

    if (!video) {
      throw new Error(`No se encontró ningún video registrado con el identificador '${idOrVideoId}'.`);
    }

    if (video.status === 'CALCULATED' || video.status === 'PAID') {
      throw new Error(`El video '${video.videoTitle || video.youtubeVideoId}' ya ha sido liquidado previamente (Estado: ${video.status}).`);
    }

    // Layer 1 Lock
    if (this.processingVideos.has(video.id)) {
      throw new Error(`El video '${video.videoTitle || video.youtubeVideoId}' ya está siendo procesado en este momento.`);
    }

    this.processingVideos.add(video.id);

    try {
      // Layer 2 Lock: Atomic DB state transition (PENDING -> CALCULATING)
      const lockAcquired = await prisma.videoRecord.updateMany({
        where: {
          id: video.id,
          status: 'PENDING'
        },
        data: {
          status: 'CALCULATING'
        }
      });

      if (lockAcquired.count === 0) {
        throw new Error(`El video '${video.videoTitle || video.youtubeVideoId}' ya no se encuentra en estado pendiente para liquidación.`);
      }

      // Query active configuration
      const config = await ConfigService.getConfig();

      // Query YouTube views
      let youtubeDetails;
      try {
        youtubeDetails = await YouTubeService.getVideoDetails(video.youtubeVideoId);
      } catch (ytErr) {
        console.warn(`[SchedulerService] No se pudo obtener vistas de YouTube (${video.youtubeVideoId}), usando fallback:`, ytErr.message || ytErr);
        youtubeDetails = {
          videoId: video.youtubeVideoId,
          title: video.videoTitle || `YouTube Video (${video.youtubeVideoId})`,
          viewCount: 0,
          thumbnailUrl: YouTubeService.getThumbnailUrl(video.youtubeVideoId)
        };
      }

      const views = youtubeDetails.viewCount ?? 0;
      const videoTitle = youtubeDetails.title || video.videoTitle || `YouTube Video (${video.youtubeVideoId})`;

      // Compute pure settlement
      const participantsList = video.participants.map(p => p.talent || { discordId: p.talentId, role: p.role || 'ACTOR' });
      const editorObj = video.editor || (video.editorId ? { discordId: video.editorId, role: 'EDITOR' } : null);
      const settlement = PayoutService.calculateVideoSettlement({
        editor: editorObj,
        participants: participantsList,
        views,
        config
      });

      // Update participant rows
      for (const actorSettlement of settlement.actors) {
        const talentId = actorSettlement.talent.discordId || actorSettlement.talent.id;
        await prisma.videoParticipant.updateMany({
          where: {
            videoId: video.id,
            talentId: talentId
          },
          data: {
            baseAmount: actorSettlement.payout.base,
            bonusAmount: actorSettlement.payout.totalBonus,
            totalAmount: actorSettlement.payout.total
          }
        });
      }

      // Update VideoRecord
      const updatedVideoRecord = await prisma.videoRecord.update({
        where: { id: video.id },
        data: {
          status: 'CALCULATED',
          finalViews: views,
          totalAmount: settlement.totalPayout,
          videoTitle,
          calculatedAt: new Date()
        },
        include: {
          editor: true,
          participants: {
            include: {
              talent: true
            }
          }
        }
      });

      // Dispatch notifications
      const activeClient = client || this.client;
      if (activeClient) {
        try {
          const adminChannelId = config.adminChannelId || activeClient.adminChannelId || process.env.ADMIN_CHANNEL_ID;
          if (adminChannelId && typeof NotificationService.sendAdminPaymentOrder === 'function') {
            const adminMsg = await NotificationService.sendAdminPaymentOrder(activeClient, adminChannelId, {
              ...settlement,
              videoRecord: updatedVideoRecord
            }).catch(err => {
              console.warn('[SchedulerService] Error enviando orden a canal admin:', err);
              return null;
            });

            if (adminMsg?.id) {
              await prisma.videoRecord.update({
                where: { id: updatedVideoRecord.id },
                data: { adminMessageId: adminMsg.id }
              }).catch(err => console.warn('[SchedulerService] Error guardando adminMessageId:', err));
              updatedVideoRecord.adminMessageId = adminMsg.id;
            }
          }

          // Nota: Los DMs a los participantes/talentos se envían cuando el video es marcado como PAGADO (!pagar o botón), no durante el cálculo.
        } catch (notifyErr) {
          console.warn('[SchedulerService] Advertencia en envío de notificaciones de liquidación:', notifyErr);
        }
      }

      return {
        videoId: video.id,
        youtubeVideoId: video.youtubeVideoId,
        views,
        settlement,
        videoRecord: updatedVideoRecord
      };
    } catch (processErr) {
      // Revert status to PENDING on failure
      await prisma.videoRecord.updateMany({
        where: {
          id: video.id,
          status: 'CALCULATING'
        },
        data: {
          status: 'PENDING'
        }
      }).catch(revertErr => console.error('[SchedulerService] Error revirtiendo estado a PENDING:', revertErr));

      throw processErr;
    } finally {
      this.processingVideos.delete(video.id);
    }
  }

  /**
   * Processes all pending videos whose scheduled calculation date has matured.
   * Implements multi-layer idempotency lock (in-memory Set + atomic DB transition to CALCULATING).
   *
   * @param {Object} [client=null] - Optional Discord Client for notification dispatch
   * @param {Date} [targetDate=new Date()] - Optional date reference for maturity comparison
   * @returns {Promise<Array<Object>>} List of processed video settlement results
   */
  static async processPendingVideos(client = null, targetDate = new Date()) {
    const activeClient = client || this.client;
    const now = targetDate instanceof Date ? targetDate : new Date(targetDate);

    // 1. Fetch pending videos whose calculation date is due
    const matureVideos = await prisma.videoRecord.findMany({
      where: {
        status: 'PENDING',
        scheduledCalculationAt: {
          lte: now
        }
      },
      include: {
        editor: true,
        participants: {
          include: {
            talent: true
          }
        }
      },
      orderBy: {
        scheduledCalculationAt: 'asc'
      }
    });

    const processedResults = [];

    for (const video of matureVideos) {
      // Layer 1 Idempotency Lock: In-Memory Set
      if (this.processingVideos.has(video.id)) {
        continue;
      }

      this.processingVideos.add(video.id);

      try {
        // Layer 2 Idempotency Lock: Atomic DB status transition (PENDING -> CALCULATING)
        const lockAcquired = await prisma.videoRecord.updateMany({
          where: {
            id: video.id,
            status: 'PENDING'
          },
          data: {
            status: 'CALCULATING'
          }
        });

        // If another process/worker updated status before us, skip
        if (lockAcquired.count === 0) {
          this.processingVideos.delete(video.id);
          continue;
        }

        // 2. Query active system configuration
        const config = await ConfigService.getConfig();

        // 3. Fetch real YouTube view count and metadata
        let youtubeDetails;
        try {
          youtubeDetails = await YouTubeService.getVideoDetails(video.youtubeVideoId);
        } catch (ytErr) {
          console.warn(`[SchedulerService] No se pudo obtener vistas de YouTube (${video.youtubeVideoId}), usando fallback:`, ytErr.message || ytErr);
          youtubeDetails = {
            videoId: video.youtubeVideoId,
            title: video.videoTitle || `YouTube Video (${video.youtubeVideoId})`,
            viewCount: 0,
            thumbnailUrl: YouTubeService.getThumbnailUrl(video.youtubeVideoId)
          };
        }

        const views = youtubeDetails.viewCount ?? 0;
        const videoTitle = youtubeDetails.title || video.videoTitle || `YouTube Video (${video.youtubeVideoId})`;

        // 4. Compute settlement amounts using pure PayoutService
        const participantsList = video.participants.map(p => p.talent || { discordId: p.talentId, role: p.role || 'ACTOR' });
        const settlement = PayoutService.calculateVideoSettlement({
          editor: video.editor || { discordId: video.editorId, role: 'EDITOR' },
          participants: participantsList,
          views,
          config
        });

        // 5. Persist calculated amounts into SQLite via Prisma
        // 5.1 Update participant rows
        for (const actorSettlement of settlement.actors) {
          const talentId = actorSettlement.talent.discordId || actorSettlement.talent.id;
          await prisma.videoParticipant.updateMany({
            where: {
              videoId: video.id,
              talentId: talentId
            },
            data: {
              baseAmount: actorSettlement.payout.base,
              bonusAmount: actorSettlement.payout.totalBonus,
              totalAmount: actorSettlement.payout.total
            }
          });
        }

        // 5.2 Transition VideoRecord to CALCULATED
        const updatedVideoRecord = await prisma.videoRecord.update({
          where: { id: video.id },
          data: {
            status: 'CALCULATED',
            finalViews: views,
            totalAmount: settlement.totalPayout,
            videoTitle,
            calculatedAt: new Date()
          },
          include: {
            editor: true,
            participants: {
              include: {
                talent: true
              }
            }
          }
        });

        // 6. Safe dispatch of Admin Payment Order / Calculation notice to Admin Channel
        if (activeClient) {
          try {
            const adminChannelId = config.adminChannelId || activeClient.adminChannelId || process.env.ADMIN_CHANNEL_ID;
            if (adminChannelId && typeof NotificationService.sendAdminPaymentOrder === 'function') {
              const adminMsg = await NotificationService.sendAdminPaymentOrder(activeClient, adminChannelId, {
                ...settlement,
                videoRecord: updatedVideoRecord
              }).catch(err => {
                console.warn('[SchedulerService] Error enviando orden a canal admin:', err);
                return null;
              });

              if (adminMsg?.id) {
                await prisma.videoRecord.update({
                  where: { id: updatedVideoRecord.id },
                  data: { adminMessageId: adminMsg.id }
                }).catch(err => console.warn('[SchedulerService] Error guardando adminMessageId:', err));
                updatedVideoRecord.adminMessageId = adminMsg.id;
              }
            }

            // Nota: Los DMs a los participantes/talentos se envían cuando el video es marcado como PAGADO (!pagar o botón), no durante el cálculo.
          } catch (notifyErr) {
            console.warn('[SchedulerService] Advertencia en envío de notificaciones de liquidación:', notifyErr);
          }
        }

        processedResults.push({
          videoId: video.id,
          youtubeVideoId: video.youtubeVideoId,
          views,
          settlement,
          videoRecord: updatedVideoRecord
        });
      } catch (processErr) {
        console.error(`[SchedulerService] Error procesando liquidación para video ${video.id}:`, processErr);

        // Revert DB status back to PENDING so it can be retried on subsequent cycles
        await prisma.videoRecord.updateMany({
          where: {
            id: video.id,
            status: 'CALCULATING'
          },
          data: {
            status: 'PENDING'
          }
        }).catch(revertErr => console.error('[SchedulerService] Error revirtiendo estado a PENDING:', revertErr));
      } finally {
        this.processingVideos.delete(video.id);
      }
    }

    return processedResults;
  }
}

export default SchedulerService;

