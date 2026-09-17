import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { VideoService } from '../../src/services/videoService.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export default {
  name: 'videos',
  aliases: [
    'listar-videos', 'pendientes', 'mis-videos', 'listavideos',
    'video', 'list-videos', 'listvideos', 'listarvideos',
    'ver-videos', 'vervideos', 'videos-pendientes', 'videospendientes',
    'videos-lista', 'historial-videos', 'misvideos', 'all-videos'
  ],
  desc: 'Muestra la lista de videos registrados en el sistema, pendientes o calculados.',
  permisos: [],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';
    const firstArg = (args && args[0]) ? args[0].toLowerCase() : '';

    let filterStatus = null;
    let titleHeader = '📋 Lista de Videos Registrados';

    if (firstArg === 'pendientes' || message.content.toLowerCase().includes('pendientes')) {
      filterStatus = 'PENDING';
      titleHeader = '⏳ Videos Pendientes de Cálculo';
    } else if (firstArg === 'calculados' || firstArg === 'liquidados') {
      filterStatus = 'CALCULATED';
      titleHeader = '✅ Videos Calculados';
    } else if (firstArg === 'pagados') {
      filterStatus = 'PAID';
      titleHeader = '💰 Videos Pagados';
    } else if (firstArg === 'todos') {
      filterStatus = null;
      titleHeader = '📋 Todos los Videos Registrados';
    }

    try {
      const videos = await VideoService.getAllVideos({ status: filterStatus, limit: 15 });

      if (!videos || videos.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setTitle(titleHeader)
          .setColor(EMBED_COLORS.PRIMARY)
          .setDescription(
            `No se encontraron videos ${filterStatus ? `con estado \`${filterStatus}\`` : 'registrados en el sistema'}.\n\n` +
            `Puedes registrar un nuevo video con:\n` +
            `\`${currentPrefix}registrar-video <url_youtube> @editor @actor1 [@actor2...]\``
          )
          .setFooter({ text: 'Sonic Gestión Bot • Historial de Videos' });

        return message.reply({ embeds: [emptyEmbed] });
      }

      const embed = new EmbedBuilder()
        .setTitle(titleHeader)
        .setColor(EMBED_COLORS.PRIMARY)
        .setDescription(`Mostrando **${videos.length}** video(s) registrado(s):\n`)
        .setFooter({ text: `Usa ${currentPrefix}videos [pendientes|calculados|pagados|todos] • Usa ${currentPrefix}liquidar / ${currentPrefix}pagar` })
        .setTimestamp();

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const statusBadge = video.status === 'PENDING'
          ? '⏳ `PENDIENTE`'
          : video.status === 'CALCULATED'
            ? '✅ `CALCULADO`'
            : '💰 `PAGADO`';

        const scheduledUnix = Math.floor(new Date(video.scheduledCalculationAt).getTime() / 1000);
        const registeredUnix = Math.floor(new Date(video.registeredAt).getTime() / 1000);

        const actorsList = video.participants && video.participants.length > 0
          ? video.participants.map(p => `<@${p.talentId}>`).join(', ')
          : '*Ninguno*';

        let extraInfo = '';
        if (video.status === 'CALCULATED' && video.finalViews !== null) {
          extraInfo = `\n📊 **Vistas Finales:** ${video.finalViews.toLocaleString()} | **Total:** $${video.totalAmount?.toFixed(2) || '0.00'}`;
        }

        const editorDisplay = video.editorId ? `<@${video.editorId}>` : '*Ninguno*';

        embed.addFields({
          name: `${i + 1}. ${video.videoTitle || video.youtubeVideoId}`,
          value:
            `📺 **Enlace:** [Ver en YouTube](${video.youtubeUrl}) (ID: \`${video.youtubeVideoId}\`)\n` +
            `🆔 **ID Interno:** \`${video.id}\`\n` +
            `✂️ **Editor:** ${editorDisplay} | 🎭 **Actores:** ${actorsList}\n` +
            `📅 **Registro:** <t:${registeredUnix}:d> | ⏳ **Liquidación:** <t:${scheduledUnix}:R>\n` +
            `📌 **Estado:** ${statusBadge}${extraInfo}`,
          inline: false
        });
      }

      return message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in videos command:', error);
      return message.reply(`❌ **Error al consultar la lista de videos:** ${error.message}`);
    }
  }
};
