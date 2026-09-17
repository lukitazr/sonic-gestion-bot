import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { SchedulerService } from '../../src/services/schedulerService.js';
import { YouTubeService } from '../../src/services/youtubeService.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export default {
  name: 'liquidar',
  aliases: [
    'forzar-calculo', 'liquidar-video', 'calcular-video',
    'calcular', 'calcularvideo', 'liquidarvideo', 'liquidacion',
    'liquidar-manual', 'forzar-liquidar', 'settle', 'settle-video', 'force-settle'
  ],
  desc: 'Fuerza el cálculo y liquidación inmediata de un video pendiente, despachando la orden de pago y notificaciones.',
  permisos: [PermissionFlagsBits.Administrator],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';

    if (!args || args.length === 0) {
      const usageEmbed = new EmbedBuilder()
        .setTitle('⚠️ Uso del Comando Liquidar')
        .setColor(EMBED_COLORS.WARNING)
        .setDescription(
          `Uso: \`${currentPrefix}liquidar <id_interno_o_enlace_youtube>\`\n\n` +
          `**Descripción:**\n` +
          `Fuerza de manera inmediata la consulta de vistas en YouTube, el cálculo determinista de tarifas y bonos, la actualización del estado a \`CALCULATED\`, el envío de la orden de pago al canal de administración y los DMs a los participantes.\n\n` +
          `**Ejemplos:**\n` +
          `• \`${currentPrefix}liquidar dQw4w9WgXcQ\`\n` +
          `• \`${currentPrefix}liquidar https://youtu.be/dQw4w9WgXcQ\`\n` +
          `• \`${currentPrefix}liquidar vid_123456789\``
        )
        .setFooter({ text: 'Sonic Gestión Bot • Administración' });

      return message.reply({ embeds: [usageEmbed] });
    }

    const inputTarget = args[0].trim();

    try {
      const result = await SchedulerService.settleVideo(inputTarget, client);
      const { videoRecord, settlement, views } = result;

      const currency = settlement.config?.currency || 'MXN';
      const videoId = videoRecord.youtubeVideoId;
      const videoUrl = videoRecord.youtubeUrl || `https://youtu.be/${videoId}`;
      const videoTitle = videoRecord.videoTitle || `YouTube Video (${videoId})`;

      const editorPayout = settlement.editor?.payout?.total ?? 0;
      const actorsDisplay = settlement.actors && settlement.actors.length > 0
        ? settlement.actors.map(a => `<@${a.talent.discordId || a.talent.id}> ($${a.payout.total} ${currency})`).join(', ')
        : '*Ninguno*';

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Video Liquidado Exitosamente')
        .setURL(videoUrl)
        .setColor(EMBED_COLORS.SUCCESS)
        .setThumbnail(YouTubeService.getThumbnailUrl(videoId))
        .setDescription('El video ha sido liquidado con éxito. La orden de pago detallada fue emitida en el canal de administración. Los talentos recibirán su notificación por DM en cuanto el video sea marcado como PAGADO.')
        .addFields(
          {
            name: '📺 Video',
            value: `[${videoTitle}](${videoUrl})`,
            inline: false
          },
          {
            name: '📊 Vistas Consultadas',
            value: `${Number(views).toLocaleString()} vistas`,
            inline: true
          },
          {
            name: '💵 Total Liquidado',
            value: `**$${settlement.totalPayout} ${currency}**`,
            inline: true
          },
          {
            name: '✂️ Editor Asignado',
            value: `${videoRecord.editor ? `<@${videoRecord.editorId}>` : '❌'}  ($${editorPayout} ${currency})`,
            inline: true
          },
          {
            name: '🎭 Actores Participantes',
            value: actorsDisplay,
            inline: false
          },
          {
            name: '📌 Estado',
            value: '`📝 CALCULADO` *(Listo para procesar transferencias)*',
            inline: false
          }
        )
        .setFooter({ text: `Liquidado por ${message.author?.tag || 'Admin'} • ID: ${videoRecord.id}` })
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    } catch (error) {
      console.error('[liquidar] Error ejecutando liquidación manual:', error);
      return message.reply(`❌ **Error al liquidar video:** ${error.message}`);
    }
  }
};

