import {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import { VideoService } from '../../src/services/videoService.js';
import { YouTubeService } from '../../src/services/youtubeService.js';
import { TalentService } from '../../src/services/talentService.js';
import { ConfigService } from '../../src/services/configService.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export default {
  name: 'registrar-video',
  aliases: [
    'registrarvideo', 'nuevo-video', 'nuevo_video', 'regvideo', 'subir-video',
    'reg-video', 'nuevovideo', 'subirvideo', 'add-video', 'addvideo',
    'new-video', 'newvideo', 'video-nuevo', 'videonuevo',
    'registrar-yt', 'subir-yt', 'registro-video', 'registrovideo'
  ],
  desc: 'Registra un nuevo video de YouTube con interfaz interactiva o por comando de texto.',
  permisos: [PermissionFlagsBits.ManageMessages],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';

    // 1. Si no se pasan argumentos, mostrar la INTERFAZ GRÁFICA INTERACTIVA
    if (!args || args.length === 0) {
      const config = await ConfigService.getConfig();
      const channelId = config.youtubeChannelId;
      const channelUrl = config.youtubeChannelUrl;
      const channelTitle = config.youtubeChannelTitle || 'Canal Configurado';

      let recentVideos = [];
      if (channelId) {
        try {
          recentVideos = await YouTubeService.getLatestVideosFromChannel(channelId, 25);
        } catch (err) {
          console.error('[RegistrarVideo] Error fetching recent videos:', err.message);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🎬 Registro de Video para Liquidación')
        .setColor(EMBED_COLORS.PRIMARY)
        .setTimestamp();

      const components = [];

      if (recentVideos.length > 0) {
        embed.setDescription(
          `Canal vinculado: **[${channelTitle}](${channelUrl || '#'})**\n\n` +
          `Selecciona uno de los **últimos ${recentVideos.length} videos** en el menú inferior para proceder con la asignación de talentos.\n\n` +
          `O si el video que deseas registrar no está en la lista, pulsa **"Introducir link de video"**.`
        );
        embed.setFooter({ text: `Sonic Gestión Bot • Mostrando ${recentVideos.length} videos más recientes` });

        const videoSelect = new StringSelectMenuBuilder()
          .setCustomId(`vidreg_select_recent_video:${message.author.id}`)
          .setPlaceholder('🎬 Selecciona un video reciente de la lista...')
          .addOptions(
            recentVideos.slice(0, 25).map((v, idx) => {
              const pubDate = v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : 'Reciente';
              return {
                label: `${idx + 1}. ${v.title}`.slice(0, 100),
                value: v.videoId,
                description: `ID: ${v.videoId} • Publicado: ${pubDate}`.slice(0, 100),
                emoji: '🎥'
              };
            })
          );

        components.push(new ActionRowBuilder().addComponents(videoSelect));
      } else {
        embed.setDescription(
          `Bienvenido al panel interactivo de registro de videos.\n\n` +
          (channelId
            ? `⚠️ No se pudieron obtener videos del canal configurado (**${channelTitle}**) en este momento.\n`
            : `💡 *Nota: Aún no se ha vinculado un canal de YouTube con \`${currentPrefix}set-canal\`. Al vincularlo, aquí aparecerán automáticamente los últimos 25 videos.*\n\n`) +
          `Haz clic en **"Introducir link de video"** para ingresar el enlace de YouTube o **"Salir"** para cancelar.`
        );
        embed.setFooter({ text: `Sonic Gestión Bot • O usa ${currentPrefix}registrar-video <url> @talento1...` });
      }

      // Fila de botones alternativos requeridos: "Introducir link de video" y "Salir"
      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`vidreg_btn_start:${message.author.id}`)
          .setLabel('Introducir link de video')
          .setEmoji('🔗')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`vidreg_btn_exit:${message.author.id}`)
          .setLabel('Salir')
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger)
      );

      components.push(buttonsRow);

      return message.reply({ embeds: [embed], components });
    }

    // 2. Si se suministran argumentos pero faltan participantes
    if (args.length < 2) {
      const guideEmbed = new EmbedBuilder()
        .setTitle('📋 Registro de Video para Liquidación')
        .setColor(EMBED_COLORS.PRIMARY)
        .setDescription(
          `Uso: \`${currentPrefix}registrar-video <url_youtube> @talento1 [@talento2...]\`\n\n` +
          `**Parámetros:**\n` +
          `• **URL:** Enlace o ID de YouTube (\`youtube.com/watch?v=...\`, \`youtu.be/...\`, shorts, etc.)\n` +
          `• **Menciones:** Menciona a los talentos participantes (actores y/o editor si participó).\n\n` +
          `*(💡 El editor es totalmente opcional. El bot detecta automáticamente el rol de cada talento en la base de datos).*`
        )
        .setFooter({ text: 'Sonic Gestión Bot • Módulo de Videos' });

      return message.reply({ embeds: [guideEmbed] });
    }

    // Parse YouTube URL / ID from args
    let youtubeUrl = null;
    let urlIndex = -1;

    for (let i = 0; i < args.length; i++) {
      const token = args[i];
      if (YouTubeService.extractVideoId(token)) {
        youtubeUrl = token;
        urlIndex = i;
        break;
      }
    }

    if (!youtubeUrl) {
      return message.reply(
        `❌ No se encontró un enlace o ID válido de YouTube en los argumentos.\n` +
        `Asegúrate de incluir una URL como \`https://youtu.be/ID\` o \`https://www.youtube.com/watch?v=ID\`.`
      );
    }

    // Remaining tokens after removing the YouTube URL
    const remainingTokens = args.filter((_, idx) => idx !== urlIndex);

    if (remainingTokens.length < 1) {
      return message.reply(
        `⚠️ Debes especificar los talentos participantes del video.\n` +
        `Sintaxis: \`${currentPrefix}registrar-video <url> @talento1 [@talento2...]\``
      );
    }

    // Clean user mentions/IDs
    const cleanUserIds = [];
    for (const token of remainingTokens) {
      const cleaned = token.replace(/^<@!?/, '').replace(/>$/, '').trim();
      if (cleaned && !cleanUserIds.includes(cleaned)) {
        cleanUserIds.push(cleaned);
      }
    }

    if (cleanUserIds.length === 0) {
      return message.reply(`⚠️ Debes mencionar al menos a un participante del video.`);
    }

    // Consultar talentos en la base de datos
    const talents = await TalentService.getTalents(cleanUserIds);
    const talentMap = new Map(talents.map(t => [t.discordId, t]));

    // Identificar usuarios no registrados
    const unregistered = cleanUserIds.filter(id => !talentMap.has(id));

    if (unregistered.length > 0) {
      if (unregistered.includes(cleanUserIds[0]) && (!talentMap.get(cleanUserIds[0]) && cleanUserIds.length >= 2 && talentMap.get(cleanUserIds[1])?.role === 'ACTOR')) {
        return message.reply(`❌ El editor <@${cleanUserIds[0]}> no está registrado en el sistema. Debe usar !registro primero.`);
      }

      const missingMentions = unregistered.map(id => `<@${id}>`).join(', ');
      return message.reply(`❌ Los siguientes actores no están registrados: ${missingMentions}. Deben usar !registro primero.`);
    }

    // Separar por roles registrados
    const editorsFound = cleanUserIds.filter(id => talentMap.get(id)?.role === 'EDITOR');
    const actorsFound = cleanUserIds.filter(id => talentMap.get(id)?.role === 'ACTOR');

    // El editor es opcional. Si hay editor, asignamos el primero como editor principal
    const editorId = editorsFound.length > 0 ? editorsFound[0] : null;
    const otherEditors = editorsFound.slice(1);
    const actorIds = [...actorsFound, ...otherEditors];

    // Al menos debe haber un participante (actor o editor)
    if (!editorId && actorIds.length === 0) {
      return message.reply(
        `⚠️ **Faltan participantes:** Debes mencionar al menos a un actor o editor registrado para este video.`
      );
    }

    try {
      const videoRecord = await VideoService.registerVideo({
        youtubeUrl,
        editorDiscordId: editorId,
        actorDiscordIds: actorIds,
        client
      });

      const videoId = videoRecord.youtubeVideoId;
      const scheduledUnix = Math.floor(new Date(videoRecord.scheduledCalculationAt).getTime() / 1000);
      const editorDisplay = videoRecord.editorId ? `<@${videoRecord.editorId}>` : '*Ninguno / No asignado*';
      const actorsDisplay = videoRecord.participants && videoRecord.participants.length > 0
        ? videoRecord.participants.map(p => `<@${p.talentId}>`).join(', ')
        : '*Ninguno*';

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Video Registrado Exitosamente')
        .setURL(videoRecord.youtubeUrl)
        .setColor(EMBED_COLORS.SUCCESS)
        .setThumbnail(YouTubeService.getThumbnailUrl(videoId))
        .setDescription('El video ha sido registrado. Se validaron los talentos participantes y se crearon las fichas de seguimiento.')
        .addFields(
          {
            name: '📺 Video',
            value: `[${videoRecord.videoTitle || videoId}](${videoRecord.youtubeUrl})`,
            inline: false
          },
          {
            name: '✂️ Editor Asignado',
            value: editorDisplay,
            inline: true
          },
          {
            name: '🎭 Actores Participantes',
            value: actorsDisplay,
            inline: true
          },
          {
            name: '⏳ Fecha de Liquidación',
            value: `<t:${scheduledUnix}:F> (<t:${scheduledUnix}:R>)`,
            inline: false
          },
          {
            name: '📊 Estado',
            value: '`⏳ PENDIENTE` *(Cálculo automático programado a los 5 días)*',
            inline: false
          }
        )
        .setFooter({ text: `ID Interno: ${videoRecord.id}` })
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    } catch (error) {
      console.error('Error in registrar-video command:', error);
      return message.reply(`❌ **Error al registrar el video:** ${error.message}`);
    }
  }
};
