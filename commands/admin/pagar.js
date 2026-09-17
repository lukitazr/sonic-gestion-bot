import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { VideoService } from '../../src/services/videoService.js';
import { YouTubeService } from '../../src/services/youtubeService.js';
import { NotificationService } from '../../src/services/notificationService.js';
import { ConfigService } from '../../src/services/configService.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export default {
  name: 'pagar',
  aliases: [
    'marcar-pagado', 'marcarpagado', 'pagado',
    'mark-paid', 'set-paid', 'pagar-video', 'pago'
  ],
  desc: 'Marca un video calculado como pagado (PAID), actualizando el registro y la orden de pago en administración.',
  permisos: [PermissionFlagsBits.Administrator],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';

    if (!args || args.length === 0) {
      const usageEmbed = new EmbedBuilder()
        .setTitle('⚠️ Uso del Comando Pagar')
        .setColor(EMBED_COLORS.WARNING)
        .setDescription(
          `Uso: \`${currentPrefix}pagar <id_interno_o_enlace_youtube>\`\n\n` +
          `**Descripción:**\n` +
          `Marca un video que ya fue calculado (\`CALCULATED\`) como efectivamente pagado (\`PAID\`), actualizando el estado en la base de datos y reflejándolo en la orden del canal de administración.\n\n` +
          `**Ejemplos:**\n` +
          `• \`${currentPrefix}pagar dQw4w9WgXcQ\`\n` +
          `• \`${currentPrefix}pagar https://youtu.be/dQw4w9WgXcQ\`\n` +
          `• \`${currentPrefix}pagar 550e8400-e29b-41d4-a716-446655440000\``
        )
        .setFooter({ text: 'Sonic Gestión Bot • Administración' });

      return message.reply({ embeds: [usageEmbed] });
    }

    const inputTarget = args[0].trim();
    const extractedYtId = YouTubeService.extractVideoId(inputTarget);
    const lookupKey = extractedYtId || inputTarget;

    try {
      const existingVideo = await VideoService.getVideoById(lookupKey);

      if (!existingVideo) {
        return message.reply(`❌ **No se encontró ningún video** registrado con el identificador: \`${inputTarget}\`.`);
      }

      if (existingVideo.status === 'PENDING') {
        return message.reply(
          `⚠️ **El video aún no ha sido calculado.**\n` +
          `Estado actual: \`⏳ PENDIENTE\`\n\n` +
          `Para marcarlo como pagado, primero debe liquidarse y calcularse el desglose de montos. ` +
          `Puedes forzar el cálculo ahora usando:\n\`${currentPrefix}liquidar ${inputTarget}\``
        );
      }

      if (existingVideo.status === 'PAID') {
        const alreadyPaidEmbed = new EmbedBuilder()
          .setTitle('ℹ️ Video Ya Marcado como Pagado')
          .setColor(EMBED_COLORS.PRIMARY)
          .setDescription(
            `El video **${existingVideo.videoTitle || existingVideo.youtubeVideoId}** ya se encuentra registrado con estado **\`💰 PAGADO\`**.`
          )
          .setFooter({ text: `ID: ${existingVideo.id} • Sonic Gestión Bot` })
          .setTimestamp();

        return message.reply({ embeds: [alreadyPaidEmbed] });
      }

      // Transition to PAID
      const updatedVideo = await VideoService.markVideoAsPaid(existingVideo.id);
      const config = await ConfigService.getConfig();
      const currency = config.currency || 'MXN';

      // Synchronize Admin Channel Order Message if registered
      if (updatedVideo.adminMessageId) {
        const adminChannelId = config.adminChannelId || process.env.ADMIN_CHANNEL_ID;
        if (adminChannelId) {
          await NotificationService.updateAdminPaymentOrderMessage(
            client,
            adminChannelId,
            updatedVideo.adminMessageId,
            updatedVideo,
            message.author?.tag || message.author?.username || 'Admin'
          ).catch(err => console.warn('[pagar] Error actualizando mensaje en canal admin:', err));
        }
      }

      // Notificar a los participantes/talentos del video por mensaje privado (DM)
      const dmResults = await NotificationService.sendPaymentCompletionDMs(client, {
        videoRecord: updatedVideo,
        adminUser: message.author,
        config
      }).catch(err => {
        console.warn('[pagar] Error enviando DMs de pago completado:', err);
        return { sent: [], failed: [] };
      });

      const videoId = updatedVideo.youtubeVideoId;
      const videoUrl = updatedVideo.youtubeUrl || `https://youtu.be/${videoId}`;
      const videoTitle = updatedVideo.videoTitle || `YouTube Video (${videoId})`;

      const editorDisplay = updatedVideo.editor
        ? `<@${updatedVideo.editorId}>`
        : '*Ninguno*';

      const actorsDisplay = updatedVideo.participants && updatedVideo.participants.length > 0
        ? updatedVideo.participants.map(p => {
          const amountText = p.totalAmount != null ? ` ($${p.totalAmount} ${currency})` : '';
          return `<@${p.talentId}>${amountText}`;
        }).join(', ')
        : '*Ninguno*';

      const dmCountText = dmResults?.sent?.length
        ? `✅ Enviadas con éxito a **${dmResults.sent.length}** talento(s)${dmResults?.failed?.length > 0 ? `\n⚠️ Fallidas (DMs cerrados): **${dmResults.failed.length}**` : ''}`
        : (dmResults?.failed?.length > 0 ? `⚠️ DMs cerrados en **${dmResults.failed.length}** talento(s)` : '*Sin participantes que notificar*');

      const successEmbed = new EmbedBuilder()
        .setTitle('💰 Video Marcado como Pagado')
        .setURL(videoUrl)
        .setColor(EMBED_COLORS.SUCCESS)
        .setThumbnail(YouTubeService.getThumbnailUrl(videoId))
        .setDescription(
          `Las transferencias para el video han sido registradas como completadas con éxito. ` +
          `El estado ha sido actualizado a **\`PAGADO\`** y se ha notificado a los talentos correspondientes por DM.`
        )
        .addFields(
          {
            name: '📺 Video',
            value: `[${videoTitle}](${videoUrl})`,
            inline: false
          },
          {
            name: '💵 Total Liquidado',
            value: `**$${updatedVideo.totalAmount ?? 0} ${currency}**`,
            inline: true
          },
          {
            name: '✂️ Editor Asignado',
            value: editorDisplay,
            inline: true
          },
          {
            name: '🎭 Actores Participantes',
            value: actorsDisplay,
            inline: false
          },
          {
            name: '📩 Notificaciones por DM a Talentos',
            value: dmCountText,
            inline: false
          },
          {
            name: '📌 Estado Actual',
            value: '`💰 PAGADO` *(Transferencias completadas)*',
            inline: true
          },
          {
            name: '👤 Gestionado por',
            value: `<@${message.author.id}>`,
            inline: true
          }
        )
        .setFooter({ text: `Marcado por ${message.author?.tag || 'Admin'} • ID: ${updatedVideo.id}` })
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    } catch (error) {
      console.error('[pagar] Error ejecutando comando pagar:', error);
      return message.reply(`❌ **Error al marcar video como pagado:** ${error.message}`);
    }
  }
};
