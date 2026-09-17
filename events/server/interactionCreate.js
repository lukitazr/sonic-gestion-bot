import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  InteractionType,
  ComponentType,
  ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  ActivityType
} from 'discord.js';
import { TalentService } from '../../src/services/talentService.js';
import { VideoService } from '../../src/services/videoService.js';
import { YouTubeService } from '../../src/services/youtubeService.js';
import { ConfigService } from '../../src/services/configService.js';
import { NotificationService } from '../../src/services/notificationService.js';
import { WeeklySummaryService, DAYS_OF_WEEK } from '../../src/services/weeklySummaryService.js';
import { EMBED_COLORS, DEFAULT_CONFIG } from '../../src/config/constants.js';
import {
  isValidPaypal,
  isValidBinance,
  verifyPaypalMeOnline,
  isValidEmail,
  isPaypalMeId,
  normalizePaypal
} from '../../src/utils/validators.js';
import { buildTarifasEmbed, buildTarifasActionRows } from '../../commands/admin/tarifas.js';
import {
  buildAdminTalentSelectEmbed,
  buildAdminTalentSelectRows,
  buildAdminTalentCardEmbed,
  buildAdminTalentCardRows
} from '../../commands/admin/registrartalento.js';

// In-memory registration drafts for interactive video creation
export const videoRegDrafts = new Map();

// In-memory sessions for the !setup interactive wizard
export const setupSessions = new Map();

/**
 * Retrieves or initializes an in-memory setup session populated with current DB values.
 * @param {string} authorId - Discord User ID
 * @returns {Promise<Object>}
 */
export async function getOrCreateSetupSession(authorId) {
  if (setupSessions.has(authorId)) {
    return setupSessions.get(authorId);
  }
  const currentConfig = await ConfigService.getConfig();
  const session = {
    authorId,
    step: 'prefix',
    data: {
      prefix: currentConfig.prefix || '!',
      historyChannelId: currentConfig.historyChannelId || null,
      adminChannelId: currentConfig.adminChannelId || null,
      youtubeChannelUrl: currentConfig.youtubeChannelUrl || null,
      youtubeChannelId: currentConfig.youtubeChannelId || null,
      youtubeChannelTitle: currentConfig.youtubeChannelTitle || null,
      actorBase: currentConfig.actorBase ?? 25.0,
      editorBase: currentConfig.editorBase ?? 125.0,
      threshold1: currentConfig.threshold1 ?? 500000,
      bonus1: currentConfig.bonus1 ?? 25.0,
      threshold2: currentConfig.threshold2 ?? 1000000,
      bonus2: currentConfig.bonus2 ?? 25.0,
      currency: currentConfig.currency || 'MXN',
      waitDays: currentConfig.waitDays ?? 5
    },
    startedAt: Date.now()
  };
  setupSessions.set(authorId, session);
  return session;
}

/**
 * Builds the embed and interactive components for a given step of the !setup wizard.
 * @param {Object} session
 * @param {Object} client
 * @returns {Promise<{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }>}
 */
export async function buildSetupStepPayload(session, client) {
  const { authorId, step, data } = session;
  const embed = new EmbedBuilder().setColor(EMBED_COLORS.PRIMARY).setTimestamp();
  const components = [];

  switch (step) {
    case 'prefix': {
      embed
        .setTitle('🛠️ Asistente [Paso 1/6]: Prefijo del Bot')
        .setDescription(
          `Configura el prefijo de comandos para invocar al bot en el servidor.\n\n` +
          `• **Prefijo Actual / Borrador:** \`${data.prefix || '!'}\`\n\n` +
          `Haz clic en **✏️ Cambiar Prefijo** para abrir una ventana emergente e ingresar el nuevo prefijo (1 a 5 caracteres, ej: \`!\`, \`?\`, \`.\`, \`$\`), o haz clic en **Siguiente** para mantener el valor actual.`
        )
        .setFooter({ text: 'Asistente de Configuración • Paso 1 de 6' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_modal_prefix:${authorId}`)
          .setLabel('Cambiar Prefijo')
          .setEmoji('✏️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:channels:${authorId}`)
          .setLabel('Siguiente (Canales)')
          .setEmoji('➡️')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`setup_btn_cancel:${authorId}`)
          .setLabel('Cancelar')
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger)
      );
      components.push(row);
      break;
    }

    case 'channels': {
      embed
        .setTitle('🛠️ Asistente [Paso 2/6]: Canales de Discord')
        .setDescription(
          `Selecciona los canales oficiales de texto donde se publicarán las fichas y liquidaciones.\n\n` +
          `• 📜 **Canal de Historial de Videos:** ${data.historyChannelId ? `<#${data.historyChannelId}>` : '*No seleccionado*'}\n` +
          `• 👑 **Canal de Administración / Liquidaciones:** ${data.adminChannelId ? `<#${data.adminChannelId}>` : '*No seleccionado*'}\n\n` +
          `Utiliza los menús desplegables de abajo para asignar cada canal, o haz clic en **Siguiente** para continuar.`
        )
        .setFooter({ text: 'Asistente de Configuración • Paso 2 de 6' });

      const historySelect = new ChannelSelectMenuBuilder()
        .setCustomId(`setup_select_channel_history:${authorId}`)
        .setPlaceholder('📜 Seleccionar Canal de Historial...')
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1);

      const adminSelect = new ChannelSelectMenuBuilder()
        .setCustomId(`setup_select_channel_admin:${authorId}`)
        .setPlaceholder('👑 Seleccionar Canal de Administración...')
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1);

      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:prefix:${authorId}`)
          .setLabel('Anterior (Prefijo)')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:youtube:${authorId}`)
          .setLabel('Siguiente (Canal YT)')
          .setEmoji('➡️')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`setup_btn_cancel:${authorId}`)
          .setLabel('Cancelar')
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger)
      );

      components.push(new ActionRowBuilder().addComponents(historySelect));
      components.push(new ActionRowBuilder().addComponents(adminSelect));
      components.push(navRow);
      break;
    }

    case 'youtube': {
      const channelDisplay = data.youtubeChannelUrl
        ? `**[${data.youtubeChannelTitle || 'Canal Oficial'}](${data.youtubeChannelUrl})**\n\`ID: ${data.youtubeChannelId || 'Detectado'}\``
        : '*No hay canal vinculado actualmente.*';

      embed
        .setTitle('🛠️ Asistente [Paso 3/6]: Canal Oficial de YouTube')
        .setDescription(
          `Vincula el canal de YouTube de tu servidor para autocompletar los últimos **25 videos recientes** en el selector de registro interactivo.\n\n` +
          `• 📺 **Canal Configurado:**\n${channelDisplay}\n\n` +
          `Pulsa **Vincular Canal** para introducir el enlace o handle (\`@SonicChannel\`), o **Omitir / Limpiar** si no deseas vincular ninguno por ahora.`
        )
        .setFooter({ text: 'Asistente de Configuración • Paso 3 de 6' });

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_modal_youtube:${authorId}`)
          .setLabel('Vincular Canal YT')
          .setEmoji('📺')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`setup_btn_clear_yt:${authorId}`)
          .setLabel('Omitir / Sin Canal')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Secondary)
      );

      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:channels:${authorId}`)
          .setLabel('Anterior (Canales)')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:rates:${authorId}`)
          .setLabel('Siguiente (Tarifas)')
          .setEmoji('➡️')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`setup_btn_cancel:${authorId}`)
          .setLabel('Cancelar')
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger)
      );

      components.push(actionRow);
      components.push(navRow);
      break;
    }

    case 'rates': {
      embed
        .setTitle('🛠️ Asistente [Paso 4/6]: Tarifas Base de Talentos')
        .setDescription(
          `Define el pago base garantizado que recibe cada talento por video antes de calcular bonos por rendimiento.\n\n` +
          `• 🎭 **Tarifa Base Actor:** $${data.actorBase} ${data.currency}\n` +
          `• ✂️ **Tarifa Base Editor:** $${data.editorBase} ${data.currency}\n\n` +
          `Haz clic en **Editar Tarifas Base** para modificar estos montos o en **Siguiente** para continuar.`
        )
        .setFooter({ text: 'Asistente de Configuración • Paso 4 de 6' });

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_modal_rates:${authorId}`)
          .setLabel('Editar Tarifas Base')
          .setEmoji('💵')
          .setStyle(ButtonStyle.Primary)
      );

      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:youtube:${authorId}`)
          .setLabel('Anterior (Canal YT)')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:bonuses:${authorId}`)
          .setLabel('Siguiente (Bonos)')
          .setEmoji('➡️')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`setup_btn_cancel:${authorId}`)
          .setLabel('Cancelar')
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger)
      );

      components.push(actionRow);
      components.push(navRow);
      break;
    }

    case 'bonuses': {
      embed
        .setTitle('🛠️ Asistente [Paso 5/6]: Metas de Vistas y Bonos')
        .setDescription(
          `Configura los umbrales de vistas que activan bonos adicionales para actores y editores.\n\n` +
          `• 🌟 **Meta 1 (Umbral 1):** ${Number(data.threshold1).toLocaleString()} vistas ➔ **+$${data.bonus1} ${data.currency}**\n` +
          `• 🚀 **Meta 2 (Umbral 2):** ${Number(data.threshold2).toLocaleString()} vistas ➔ **+$${data.bonus2} ${data.currency}**\n\n` +
          `*(💡 Si un video alcanza la Meta 2, acumula ambos bonos: +$${Number(data.bonus1) + Number(data.bonus2)} ${data.currency})*`
        )
        .setFooter({ text: 'Asistente de Configuración • Paso 5 de 6' });

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_modal_bonuses:${authorId}`)
          .setLabel('Editar Metas y Bonos')
          .setEmoji('🌟')
          .setStyle(ButtonStyle.Primary)
      );

      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:rates:${authorId}`)
          .setLabel('Anterior (Tarifas)')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:general:${authorId}`)
          .setLabel('Siguiente (Moneda y Días)')
          .setEmoji('➡️')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`setup_btn_cancel:${authorId}`)
          .setLabel('Cancelar')
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger)
      );

      components.push(actionRow);
      components.push(navRow);
      break;
    }

    case 'general': {
      embed
        .setTitle('🛠️ Asistente [Paso 6/6]: Moneda y Plazo de Espera')
        .setDescription(
          `Configura el código monetario y el periodo de maduración de vistas para las liquidaciones automáticas.\n\n` +
          `• 💱 **Código de Moneda:** \`${data.currency}\` (ej: MXN, USD, EUR)\n` +
          `• ⏳ **Plazo de Espera:** \`${data.waitDays}\` días (tiempo antes de consultar vistas y liquidar)\n\n` +
          `Pulsa **Editar Moneda y Plazo** para modificar o **Revisar Resumen** para ir a la confirmación final.`
        )
        .setFooter({ text: 'Asistente de Configuración • Paso 6 de 6' });

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_modal_general:${authorId}`)
          .setLabel('Editar Moneda y Plazo')
          .setEmoji('⚙️')
          .setStyle(ButtonStyle.Primary)
      );

      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:bonuses:${authorId}`)
          .setLabel('Anterior (Bonos)')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:summary:${authorId}`)
          .setLabel('Revisar Resumen')
          .setEmoji('📋')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`setup_btn_cancel:${authorId}`)
          .setLabel('Cancelar')
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger)
      );

      components.push(actionRow);
      components.push(navRow);
      break;
    }

    case 'summary':
    default: {
      embed
        .setTitle('📋 Resumen Final • Asistente de Configuración')
        .setDescription(
          `Revisa todos los parámetros configurados antes de aplicarlos a la base de datos de producción.\n\n` +
          `Ningún cambio se guardará hasta que pulses el botón verde **💾 Confirmar y Guardar Todo**.`
        )
        .addFields(
          {
            name: '1️⃣ Prefijo y Canales de Discord',
            value:
              `• **Prefijo:** \`${data.prefix || '!'}\`\n` +
              `• **Canal de Historial:** ${data.historyChannelId ? `<#${data.historyChannelId}>` : '⚠️ *No configurado*'}\n` +
              `• **Canal de Administración:** ${data.adminChannelId ? `<#${data.adminChannelId}>` : '⚠️ *No configurado*'}`,
            inline: false
          },
          {
            name: '2️⃣ Canal Oficial de YouTube',
            value: data.youtubeChannelUrl
              ? `• **Título:** [${data.youtubeChannelTitle || 'Canal'}](${data.youtubeChannelUrl})\n• **ID:** \`${data.youtubeChannelId || 'N/A'}\``
              : '• *Sin canal vinculado (selección manual en !registrar-video)*',
            inline: false
          },
          {
            name: '3️⃣ Tarifas Base de Talentos',
            value:
              `• **Actor Base:** $${data.actorBase} ${data.currency}\n` +
              `• **Editor Base:** $${data.editorBase} ${data.currency}`,
            inline: true
          },
          {
            name: '4️⃣ Metas y Bonificaciones',
            value:
              `• **Meta 1 (${Number(data.threshold1).toLocaleString()} vistas):** +$${data.bonus1} ${data.currency}\n` +
              `• **Meta 2 (${Number(data.threshold2).toLocaleString()} vistas):** +$${data.bonus2} ${data.currency}`,
            inline: true
          },
          {
            name: '5️⃣ Parámetros Generales',
            value:
              `• **Moneda Activa:** \`${data.currency}\`\n` +
              `• **Plazo de Espera:** \`${data.waitDays}\` días`,
            inline: false
          }
        )
        .setFooter({ text: 'Sonic Gestión Bot • Pulsa Confirmar para guardar atómicamente en la BD' });

      const saveRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_btn_save:${authorId}`)
          .setLabel('Confirmar y Guardar Todo')
          .setEmoji('💾')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`setup_btn_defaults:${authorId}`)
          .setLabel('Valores por Defecto')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Secondary)
      );

      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:general:${authorId}`)
          .setLabel('Volver a Editar')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`setup_btn_cancel:${authorId}`)
          .setLabel('Cancelar sin Guardar')
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger)
      );

      components.push(saveRow);
      components.push(navRow);
      break;
    }
  }

  return { embeds: [embed], components };
}

/**
 * Builds the embed and interactive StringSelectMenu components
 * containing ONLY registered talents from SQLite for video registration.
 *
 * @param {Object} draft - { id, authorId, videoId, videoTitle, actorIds, editorId }
 * @param {Object} client - Discord client
 * @returns {Promise<{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }>}
 */
export async function buildTalentSelectionPayload(draft, client) {
  const allTalents = await TalentService.getAllTalents();

  const actorTalents = allTalents.filter(t => t.role === 'ACTOR');
  const editorTalents = allTalents.filter(t => t.role === 'EDITOR');

  const actorOptionsSource = actorTalents.length > 0 ? actorTalents : allTalents;
  const editorOptionsSource = editorTalents.length > 0 ? editorTalents : allTalents;

  const selectedActorsDisplay = draft.actorIds && draft.actorIds.length > 0
    ? draft.actorIds.map(id => `<@${id}>`).join(', ')
    : '*Ninguno seleccionado todavía*';

  const selectedEditorDisplay = draft.editorId
    ? `<@${draft.editorId}>`
    : '*Ninguno seleccionado (Opcional)*';

  const embed = new EmbedBuilder()
    .setTitle('Paso 2: Selecciona los Talentos y Confirma')
    .setColor(EMBED_COLORS.PRIMARY)
    .setThumbnail(YouTubeService.getThumbnailUrl(draft.videoId))
    .setDescription(
      `📺 **Video Seleccionado:** [${draft.videoTitle || draft.videoId}](https://youtu.be/${draft.videoId})\n\n` +
      `Selecciona en los menús inferiores a los talentos que participaron en el video.\n` +
      `*(💡 Los menús contienen **ÚNICAMENTE** talentos registrados en la base de datos).*`
    )
    .addFields(
      {
        name: '🎭 Actores Seleccionados',
        value: selectedActorsDisplay,
        inline: false
      },
      {
        name: '✂️ Editor Seleccionado',
        value: selectedEditorDisplay,
        inline: false
      },
      {
        name: '📌 Instrucciones',
        value:
          '1. Selecciona 1 o más actores en el primer menú.\n' +
          '2. Selecciona al editor en el segundo menú (opcional).\n' +
          '3. Pulsa el botón **"✅ Confirmar y Registrar Video"** para guardar el registro.',
        inline: false
      }
    )
    .setFooter({ text: 'Sonic Gestión Bot • Registro Interactivo de Videos' });

  const components = [];

  if (allTalents.length === 0) {
    embed.addFields({
      name: '⚠️ Sin Talentos Registrados',
      value: 'No hay talentos registrados en la base de datos. Usa `!registro` o `!admin-registro` para registrar usuarios antes de vincular videos.',
      inline: false
    });

    const emptyActorSelect = new StringSelectMenuBuilder()
      .setCustomId(`vidreg_select_registered_actors:${draft.id}`)
      .setPlaceholder('⚠️ Sin talentos registrados en la base de datos')
      .setMinValues(0)
      .setMaxValues(1)
      .setDisabled(true)
      .addOptions([
        {
          label: 'Ningún talento registrado',
          value: '__no_talents__',
          description: 'Usa !registro o !admin-registro primero',
          emoji: '⚠️'
        }
      ]);

    const emptyEditorSelect = new StringSelectMenuBuilder()
      .setCustomId(`vidreg_select_registered_editor:${draft.id}`)
      .setPlaceholder('⚠️ Sin talentos registrados en la base de datos')
      .setMinValues(0)
      .setMaxValues(1)
      .setDisabled(true)
      .addOptions([
        {
          label: 'Ningún talento registrado',
          value: '__no_talents__',
          description: 'Usa !registro o !admin-registro primero',
          emoji: '⚠️'
        }
      ]);

    components.push(new ActionRowBuilder().addComponents(emptyActorSelect));
    components.push(new ActionRowBuilder().addComponents(emptyEditorSelect));
  } else {
    // 1. StringSelectMenu para Actores (SOLO registrados)
    const actorSelect = new StringSelectMenuBuilder()
      .setCustomId(`vidreg_select_registered_actors:${draft.id}`)
      .setPlaceholder('🎭 Selecciona los Actores (de la base de datos)...')
      .setMinValues(0)
      .setMaxValues(Math.min(actorOptionsSource.length, 25))
      .addOptions(
        actorOptionsSource.slice(0, 25).map(t => {
          let userTag = `Usuario (${t.discordId})`;
          const cachedUser = client?.users?.cache?.get(t.discordId);
          if (cachedUser) userTag = cachedUser.tag || cachedUser.username;
          return {
            label: userTag.slice(0, 100),
            value: t.discordId,
            description: `Rol: ${t.role} • PayPal: ${t.paypal ? 'Sí' : 'No'} | Binance: ${t.binance ? 'Sí' : 'No'}`.slice(0, 100),
            emoji: '🎭',
            default: draft.actorIds.includes(t.discordId)
          };
        })
      );

    // 2. StringSelectMenu para Editor (SOLO registrados)
    const editorSelect = new StringSelectMenuBuilder()
      .setCustomId(`vidreg_select_registered_editor:${draft.id}`)
      .setPlaceholder('✂️ Selecciona el Editor (Opcional)...')
      .setMinValues(0)
      .setMaxValues(1)
      .addOptions(
        editorOptionsSource.slice(0, 25).map(t => {
          let userTag = `Usuario (${t.discordId})`;
          const cachedUser = client?.users?.cache?.get(t.discordId);
          if (cachedUser) userTag = cachedUser.tag || cachedUser.username;
          return {
            label: userTag.slice(0, 100),
            value: t.discordId,
            description: `Rol: ${t.role} • PayPal: ${t.paypal ? 'Sí' : 'No'} | Binance: ${t.binance ? 'Sí' : 'No'}`.slice(0, 100),
            emoji: '🎬',
            default: draft.editorId === t.discordId
          };
        })
      );

    components.push(new ActionRowBuilder().addComponents(actorSelect));
    components.push(new ActionRowBuilder().addComponents(editorSelect));
  }

  // Fila de botones de confirmación y cancelación
  const hasParticipants = (draft.actorIds && draft.actorIds.length > 0) || !!draft.editorId;
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vidreg_btn_confirm:${draft.id}`)
      .setLabel('Confirmar y Registrar Video')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!hasParticipants || allTalents.length === 0),
    new ButtonBuilder()
      .setCustomId(`vidreg_btn_cancel:${draft.authorId}`)
      .setLabel('Cancelar')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger)
  );

  components.push(actionRow);

  return { embeds: [embed], components };
}

export default {
  name: 'interactionCreate',
  once: false,
  run: async (client, interaction) => {
    try {
      // 1. Manejo de Botones del Flujo de Registro
      if (interaction.isButton()) {
        const customId = interaction.customId;

        // ==========================================
        // Resumen Semanal: Paginación Interactiva
        // ==========================================
        if (
          customId.startsWith('summary_page:prev:') ||
          customId.startsWith('summary_page:next:') ||
          customId.startsWith('summary_page:goto:')
        ) {
          const targetPage = parseInt(customId.split(':')[2], 10) || 1;
          const config = await ConfigService.getConfig();
          const videos = await WeeklySummaryService.getWeeklyCalculatedVideos(new Date());
          const totalPages = Math.max(1, videos.length);
          const safePage = Math.min(Math.max(1, targetPage), totalPages);

          const embed = WeeklySummaryService.buildWeeklySummaryPage({
            videos,
            page: safePage,
            config
          });
          const components = WeeklySummaryService.buildWeeklySummaryComponents(safePage, totalPages);

          return await interaction.update({
            embeds: [embed],
            components
          });
        }

        // ==========================================
        // Resumen Semanal: Acciones del Panel Admin
        // ==========================================
        if (customId.startsWith('weekly_action:')) {
          const [, action, authorId] = customId.split(':');

          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({
              content: '❌ Solo los administradores pueden interactuar con este panel de control.',
              ephemeral: true
            });
          }

          if (action === 'send_now') {
            await interaction.deferReply({ ephemeral: true });
            const result = await WeeklySummaryService.executeWeeklySummary(client, {
              force: true,
              pingEveryone: true
            });

            if (!result.success) {
              return await interaction.editReply(`❌ **No se pudo emitir el resumen semanal:** ${result.reason || 'Error desconocido'}`);
            }

            const config = await ConfigService.getConfig();
            const currency = config.currency || 'MXN';
            const targetChannelId = config.weeklySummaryChannelId || config.adminChannelId || process.env.ADMIN_CHANNEL_ID;

            return await interaction.editReply(
              `✅ **Resumen Semanal emitido exitosamente:**\n` +
              `• **Canal:** <#${targetChannelId}>\n` +
              `• **Mención:** \`@everyone\` enviada\n` +
              `• **Videos Procesados:** \`${result.totalVideos}\`\n` +
              `• **Monto Total:** \`$${result.totalPayout.toFixed(2)} ${currency}\`\n` +
              `• **Vistas Totales:** \`${result.totalViews.toLocaleString()}\``
            );
          }

          if (action === 'preview') {
            await interaction.deferReply({ ephemeral: true });
            await WeeklySummaryService.settleSameDayPendingVideos(client, new Date());
            const videos = await WeeklySummaryService.getWeeklyCalculatedVideos(new Date());
            const config = await ConfigService.getConfig();
            const totalPages = Math.max(1, videos.length);

            const previewEmbed = WeeklySummaryService.buildWeeklySummaryPage({
              videos,
              page: 1,
              config
            });
            const components = WeeklySummaryService.buildWeeklySummaryComponents(1, totalPages);

            return await interaction.editReply({
              content: '👁️ **[Vista Previa de Administrador]** Desglose actual de la semana (sin ping):',
              embeds: [previewEmbed],
              components
            });
          }

          if (action === 'send_my_dm') {
            await interaction.deferReply({ ephemeral: true });
            const result = await WeeklySummaryService.sendWeeklySummaryDM(client, interaction.user.id);
            if (!result.success) {
              return await interaction.editReply(`❌ **No se pudo enviar el resumen por MD:** ${result.error}`);
            }
            return await interaction.editReply('✅ **¡Resumen Semanal enviado a tus mensajes directos exitosamente!** Revisa tus MDs.');
          }

          if (action === 'toggle') {
            const currentConfig = await ConfigService.getConfig();
            const newStatus = !currentConfig.weeklySummaryEnabled;
            await ConfigService.updateConfig('weeklySummaryEnabled', newStatus);
            const updatedConfig = await ConfigService.getConfig(true);

            const dayName = DAYS_OF_WEEK[updatedConfig.weeklySummaryDay] ?? 'Viernes';
            const timeFormatted = `${String(updatedConfig.weeklySummaryHour).padStart(2, '0')}:${String(updatedConfig.weeklySummaryMinute).padStart(2, '0')} hrs`;
            const targetChannelId = updatedConfig.weeklySummaryChannelId || updatedConfig.adminChannelId || process.env.ADMIN_CHANNEL_ID;
            const channelDisplay = targetChannelId ? `<#${targetChannelId}>` : '*No configurado*';

            const lastRunUnix = updatedConfig.lastWeeklySummaryAt ? Math.floor(new Date(updatedConfig.lastWeeklySummaryAt).getTime() / 1000) : null;
            const lastRunDisplay = lastRunUnix ? `<t:${lastRunUnix}:F> (<t:${lastRunUnix}:R>)` : '*Ninguno registrado aún*';

            const dmDisplay = updatedConfig.weeklySummaryDmUserId
              ? `<@${updatedConfig.weeklySummaryDmUserId}> (${updatedConfig.weeklySummaryDmEnabled ? '`🟢 Activado`' : '`🔴 Desactivado`'})`
              : '*No configurado (desactivado)*';

            const panelEmbed = new EmbedBuilder()
              .setTitle('📊 Control del Resumen Semanal de Liquidaciones')
              .setDescription(
                `Sistema automatizado de resumen semanal. Cada semana en el día y hora configurados, el bot recopila todos los videos calculados (pre-liquidando automáticamente aquellos que vencen el mismo día) y realiza un ping a \`@everyone\` con el desglose y métodos de pago paginados.`
              )
              .setColor(EMBED_COLORS.PRIMARY)
              .addFields(
                {
                  name: '⚡ Estado del Sistema',
                  value: updatedConfig.weeklySummaryEnabled ? '`🟢 ACTIVADO` *(Envío automático encendido)*' : '`🔴 DESACTIVADO` *(Pausado)*',
                  inline: false
                },
                {
                  name: '🗓️ Día Programado',
                  value: `**${dayName}** (Código: \`${updatedConfig.weeklySummaryDay}\`)`,
                  inline: true
                },
                {
                  name: '⏰ Hora Programada',
                  value: `**${timeFormatted}**`,
                  inline: true
                },
                {
                  name: '📢 Canal de Emisión',
                  value: channelDisplay,
                  inline: true
                },
                {
                  name: '📩 Envío por MD (Opcional)',
                  value: dmDisplay,
                  inline: true
                },
                {
                  name: '🕒 Última Emisión',
                  value: lastRunDisplay,
                  inline: false
                }
              )
              .setFooter({ text: `Sonic Gestión • Administración` })
              .setTimestamp();

            const btnSendNow = new ButtonBuilder()
              .setCustomId(`weekly_action:send_now:${interaction.user.id}`)
              .setLabel('📢 Enviar Ahora (@everyone)')
              .setStyle(ButtonStyle.Danger);

            const btnPreview = new ButtonBuilder()
              .setCustomId(`weekly_action:preview:${interaction.user.id}`)
              .setLabel('👁️ Vista Previa')
              .setStyle(ButtonStyle.Primary);

            const btnToggle = new ButtonBuilder()
              .setCustomId(`weekly_action:toggle:${interaction.user.id}`)
              .setLabel(updatedConfig.weeklySummaryEnabled ? '⏸️ Pausar Automatización' : '▶️ Activar Automatización')
              .setStyle(updatedConfig.weeklySummaryEnabled ? ButtonStyle.Secondary : ButtonStyle.Success);

            const btnSendMyDm = new ButtonBuilder()
              .setCustomId(`weekly_action:send_my_dm:${interaction.user.id}`)
              .setLabel('📩 Enviar a mi MD')
              .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(btnSendNow, btnPreview, btnToggle, btnSendMyDm);

            return await interaction.update({
              embeds: [panelEmbed],
              components: [row]
            });
          }
        }

        // ==========================================
        // Orden de Pago: Marcar como Pagado (PAID)
        // ==========================================
        if (customId.startsWith('order_btn_mark_paid:')) {
          const [, videoId] = customId.split(':');

          // Permiso estricto de Administrador
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
              content: '❌ Solo los administradores tienen permiso para marcar órdenes de pago como completadas.',
              ephemeral: true
            });
          }

          try {
            const updatedVideo = await VideoService.markVideoAsPaid(videoId);

            const existingEmbed = interaction.message.embeds?.[0];
            let newEmbed = null;
            if (existingEmbed) {
              const embedBuilder = EmbedBuilder.from(existingEmbed);
              embedBuilder.setColor(EMBED_COLORS.SUCCESS);

              const fields = embedBuilder.data.fields || [];
              const updatedFields = fields.map(f => {
                if (f.name === '📌 Estado') {
                  return {
                    ...f,
                    value: `\`💰 PAGADO\` *(Transferencias realizadas por <@${interaction.user.id}>)*`
                  };
                }
                return f;
              });
              embedBuilder.setFields(updatedFields);
              newEmbed = embedBuilder;
            }

            const updatedComponents = NotificationService.buildAdminPaymentComponents(
              updatedVideo,
              true,
              interaction.user.username || interaction.user.tag
            );

            const config = await ConfigService.getConfig();

            // Notificar a los participantes/talentos del video por mensaje directo (DM)
            const dmResults = await NotificationService.sendPaymentCompletionDMs(client, {
              videoRecord: updatedVideo,
              adminUser: interaction.user,
              config
            }).catch(err => {
              console.warn('[order_btn_mark_paid] Error enviando DMs de pago completado:', err);
              return { sent: [], failed: [] };
            });

            await interaction.update({
              embeds: newEmbed ? [newEmbed] : interaction.message.embeds,
              components: updatedComponents
            });

            if (dmResults && (dmResults.sent.length > 0 || dmResults.failed.length > 0)) {
              await interaction.followUp({
                content: `📬 **Aviso a Talentos:** Se enviaron **${dmResults.sent.length}** notificación(es) de pago por DM${dmResults.failed.length > 0 ? ` (${dmResults.failed.length} talento(s) con DMs cerrados)` : ''}.`,
                ephemeral: true
              }).catch(() => {});
            }

            return;
          } catch (error) {
            console.error('[order_btn_mark_paid] Error al marcar como pagado:', error);
            return interaction.reply({
              content: `❌ **Error al actualizar el estado del video:** ${error.message}`,
              ephemeral: true
            });
          }
        }

        // ==========================================
        // Asistente de Configuración (!setup) - Botones
        // ==========================================
        if (customId.startsWith('setup_btn_step:')) {
          const [, targetStep, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden usar el asistente de configuración.', ephemeral: true });
          }

          const session = await getOrCreateSetupSession(authorId);
          session.step = targetStep;
          const payload = await buildSetupStepPayload(session, client);
          return interaction.update(payload);
        }

        if (customId.startsWith('setup_btn_cancel:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden usar el asistente de configuración.', ephemeral: true });
          }

          setupSessions.delete(authorId);
          const cancelEmbed = new EmbedBuilder()
            .setTitle('❌ Asistente Cancelado')
            .setColor(EMBED_COLORS.WARNING)
            .setDescription('El asistente de configuración ha sido cancelado. No se modificó ningún dato en la base de datos.')
            .setFooter({ text: 'Puedes volver a iniciar el asistente en cualquier momento con !setup' })
            .setTimestamp();

          return interaction.update({ embeds: [cancelEmbed], components: [] });
        }

        if (customId.startsWith('setup_btn_clear_yt:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden usar el asistente de configuración.', ephemeral: true });
          }

          const session = await getOrCreateSetupSession(authorId);
          session.data.youtubeChannelUrl = null;
          session.data.youtubeChannelId = null;
          session.data.youtubeChannelTitle = null;

          const payload = await buildSetupStepPayload(session, client);
          return interaction.update(payload);
        }

        if (customId.startsWith('setup_btn_defaults:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden usar el asistente de configuración.', ephemeral: true });
          }

          const session = await getOrCreateSetupSession(authorId);
          session.data = {
            ...DEFAULT_CONFIG,
            prefix: '!',
            historyChannelId: session.data.historyChannelId,
            adminChannelId: session.data.adminChannelId
          };

          const payload = await buildSetupStepPayload(session, client);
          return interaction.update(payload);
        }

        if (customId.startsWith('setup_btn_save:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden guardar la configuración.', ephemeral: true });
          }

          const session = setupSessions.get(authorId);
          if (!session) {
            return interaction.reply({
              content: '⚠️ La sesión del asistente ha expirado o no existe. Inicia nuevamente con `!setup`.',
              ephemeral: true
            });
          }

          try {
            const saved = await ConfigService.saveFullConfig(session.data);
            setupSessions.delete(authorId);

            if (client?.user?.setActivity) {
              try {
                client.user.setActivity(`${saved.prefix || '!'}ayuda | Gestión de Videos`, { type: ActivityType.Watching });
              } catch {}
            }

            const successEmbed = new EmbedBuilder()
              .setTitle('✅ ¡Configuración Integral Aplicada Exitosamente!')
              .setColor(EMBED_COLORS.SUCCESS)
              .setDescription(
                `Todos los parámetros variables del sistema han sido guardados atómicamente en la base de datos de producción.\n` +
                `El bot ya está operando con la nueva configuración en tiempo real.`
              )
              .addFields(
                {
                  name: '🔤 Prefijo',
                  value: `\`${saved.prefix}\``,
                  inline: true
                },
                {
                  name: '📜 Historial',
                  value: saved.historyChannelId ? `<#${saved.historyChannelId}>` : '*No configurado*',
                  inline: true
                },
                {
                  name: '👑 Administración',
                  value: saved.adminChannelId ? `<#${saved.adminChannelId}>` : '*No configurado*',
                  inline: true
                },
                {
                  name: '📺 Canal de YouTube',
                  value: saved.youtubeChannelUrl ? `[${saved.youtubeChannelTitle || 'Canal Oficial'}](${saved.youtubeChannelUrl})` : '*Ninguno vinculado*',
                  inline: false
                },
                {
                  name: '💵 Tarifas Base',
                  value: `Actor: $${saved.actorBase} ${saved.currency} | Editor: $${saved.editorBase} ${saved.currency}`,
                  inline: true
                },
                {
                  name: '🌟 Bonos y Metas',
                  value: `500k: +$${saved.bonus1} | 1M: +$${saved.bonus2}`,
                  inline: true
                },
                {
                  name: '⏳ Plazo y Moneda',
                  value: `${saved.waitDays} días • Moneda: \`${saved.currency}\``,
                  inline: false
                }
              )
              .setFooter({ text: 'Sonic Gestión Bot • Configuración Completa' })
              .setTimestamp();

            return interaction.update({ embeds: [successEmbed], components: [] });
          } catch (err) {
            console.error('Error saving full config in setup wizard:', err);
            return interaction.reply({
              content: `❌ **Error al guardar la configuración:** ${err.message}`,
              ephemeral: true
            });
          }
        }

        // Modales de cada paso del Asistente
        if (customId.startsWith('setup_modal_prefix:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden configurar el prefijo.', ephemeral: true });
          }

          const session = await getOrCreateSetupSession(authorId);
          const modal = new ModalBuilder()
            .setCustomId(`setup_submit_prefix:${authorId}`)
            .setTitle('Paso 1: Prefijo del Bot');

          const input = new TextInputBuilder()
            .setCustomId('prefix_input')
            .setLabel('Prefijo de Comandos (1 a 5 caracteres)')
            .setPlaceholder('ej. !, ?, ., s!, sonic!')
            .setValue(session.data.prefix || '!')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }

        if (customId.startsWith('setup_modal_youtube:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden configurar el canal de YouTube.', ephemeral: true });
          }

          const session = await getOrCreateSetupSession(authorId);
          const modal = new ModalBuilder()
            .setCustomId(`setup_submit_youtube:${authorId}`)
            .setTitle('Paso 3: Canal de YouTube');

          const input = new TextInputBuilder()
            .setCustomId('youtube_input')
            .setLabel('Enlace, @Handle o ID del Canal')
            .setPlaceholder('https://www.youtube.com/@SonicChannel o @SonicChannel')
            .setValue(session.data.youtubeChannelUrl || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }

        if (customId.startsWith('setup_modal_rates:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden configurar las tarifas.', ephemeral: true });
          }

          const session = await getOrCreateSetupSession(authorId);
          const modal = new ModalBuilder()
            .setCustomId(`setup_submit_rates:${authorId}`)
            .setTitle('Paso 4: Tarifas Base de Talentos');

          const actorInput = new TextInputBuilder()
            .setCustomId('actor_base_input')
            .setLabel('Tarifa Base Actor')
            .setPlaceholder('ej. 25')
            .setValue(String(session.data.actorBase))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const editorInput = new TextInputBuilder()
            .setCustomId('editor_base_input')
            .setLabel('Tarifa Base Editor')
            .setPlaceholder('ej. 125')
            .setValue(String(session.data.editorBase))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(actorInput),
            new ActionRowBuilder().addComponents(editorInput)
          );
          return interaction.showModal(modal);
        }

        if (customId.startsWith('setup_modal_bonuses:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden configurar los bonos.', ephemeral: true });
          }

          const session = await getOrCreateSetupSession(authorId);
          const modal = new ModalBuilder()
            .setCustomId(`setup_submit_bonuses:${authorId}`)
            .setTitle('Paso 5: Metas de Vistas y Bonos');

          const t1Input = new TextInputBuilder()
            .setCustomId('threshold1_input')
            .setLabel('Umbral 1 (Vistas requeridas)')
            .setPlaceholder('ej. 500000')
            .setValue(String(session.data.threshold1))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const b1Input = new TextInputBuilder()
            .setCustomId('bonus1_input')
            .setLabel('Bono Umbral 1')
            .setPlaceholder('ej. 25')
            .setValue(String(session.data.bonus1))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const t2Input = new TextInputBuilder()
            .setCustomId('threshold2_input')
            .setLabel('Umbral 2 (Vistas requeridas)')
            .setPlaceholder('ej. 1000000')
            .setValue(String(session.data.threshold2))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const b2Input = new TextInputBuilder()
            .setCustomId('bonus2_input')
            .setLabel('Bono Umbral 2')
            .setPlaceholder('ej. 25')
            .setValue(String(session.data.bonus2))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(t1Input),
            new ActionRowBuilder().addComponents(b1Input),
            new ActionRowBuilder().addComponents(t2Input),
            new ActionRowBuilder().addComponents(b2Input)
          );
          return interaction.showModal(modal);
        }

        if (customId.startsWith('setup_modal_general:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden configurar los parámetros generales.', ephemeral: true });
          }

          const session = await getOrCreateSetupSession(authorId);
          const modal = new ModalBuilder()
            .setCustomId(`setup_submit_general:${authorId}`)
            .setTitle('Paso 6: Moneda y Plazo de Espera');

          const currInput = new TextInputBuilder()
            .setCustomId('currency_input')
            .setLabel('Código de Moneda (ej. MXN, USD)')
            .setPlaceholder('MXN')
            .setValue(String(session.data.currency))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const waitInput = new TextInputBuilder()
            .setCustomId('wait_days_input')
            .setLabel('Días de Espera para Cálculo (ej. 5)')
            .setPlaceholder('5')
            .setValue(String(session.data.waitDays))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(currInput),
            new ActionRowBuilder().addComponents(waitInput)
          );
          return interaction.showModal(modal);
        }

        // Iniciar selección de rol
        if (customId === 'reg_btn_start' || customId.startsWith('reg_btn_change_role:')) {
          const targetUserId = customId.includes(':') ? customId.split(':')[1] : interaction.user.id;
          if (interaction.user.id !== targetUserId) {
            return interaction.reply({ content: '❌ Solo el usuario que inició el registro puede interactuar con estos botones.', ephemeral: true });
          }

          const roleRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`reg_role_actor:${targetUserId}`)
              .setLabel('Soy Actor')
              .setEmoji('🎭')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`reg_role_editor:${targetUserId}`)
              .setLabel('Soy Editor')
              .setEmoji('🎬')
              .setStyle(ButtonStyle.Success)
          );

          const embed = new EmbedBuilder()
            .setTitle('Paso 1: Elige tu Rol')
            .setColor(EMBED_COLORS.PRIMARY)
            .setDescription('Selecciona si participas en los videos como **Actor** (voz / actuación) o como **Editor** (edición de video).');

          return interaction.update({ embeds: [embed], components: [roleRow] });
        }

        // Selección de Rol (Actor o Editor) -> Mostrar Opciones de Pago
        if (customId.startsWith('reg_role_actor:') || customId.startsWith('reg_role_editor:')) {
          const [action, targetUserId] = customId.split(':');
          if (interaction.user.id !== targetUserId) {
            return interaction.reply({ content: '❌ Solo el usuario que inició el registro puede interactuar con estos botones.', ephemeral: true });
          }

          const selectedRole = action === 'reg_role_actor' ? 'ACTOR' : 'EDITOR';
          const roleIcon = selectedRole === 'EDITOR' ? '🎬' : '🎭';

          // Consultar datos previos si existen
          const existing = await TalentService.getTalent(targetUserId);

          const payRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`reg_modal_paypal:${selectedRole}:${targetUserId}`)
              .setLabel('Configurar PayPal')
              .setEmoji('💳')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`reg_modal_binance:${selectedRole}:${targetUserId}`)
              .setLabel('Configurar Binance')
              .setEmoji('🪙')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`reg_btn_change_role:${targetUserId}`)
              .setLabel('Cambiar Rol')
              .setStyle(ButtonStyle.Light || ButtonStyle.Secondary)
          );

          const embed = new EmbedBuilder()
            .setTitle(`Paso 2: Métodos de Pago (${roleIcon} ${selectedRole})`)
            .setColor(EMBED_COLORS.PRIMARY)
            .setDescription(
              `Has seleccionado el rol: **${roleIcon} ${selectedRole}**\n\n` +
              `Haz clic en los botones de abajo para abrir una ventana donde ingresarás tus datos sin complicaciones:\n` +
              `• **PayPal:** Correo o enlace de paypal.me (\`paypal.me/usuario\`)\n` +
              `• **Binance:** Pay ID numérico, Payment Link o correo\n\n` +
              `*(Puedes configurar ambos o al menos uno de ellos).*`
            )
            .addFields(
              {
                name: '💳 PayPal Actual',
                value: existing?.paypal ? `\`${existing.paypal}\`` : '*No configurado*',
                inline: true
              },
              {
                name: '🪙 Binance Actual',
                value: existing?.binance ? `\`${existing.binance}\`` : '*No configurado*',
                inline: true
              }
            );

          return interaction.update({ embeds: [embed], components: [payRow] });
        }

        // Abrir Modal de PayPal
        if (customId.startsWith('reg_modal_paypal:')) {
          const [, role, targetUserId] = customId.split(':');
          if (interaction.user.id !== targetUserId) {
            return interaction.reply({ content: '❌ Solo el usuario que inició el registro puede interactuar con estos botones.', ephemeral: true });
          }

          const existing = await TalentService.getTalent(targetUserId);

          const modal = new ModalBuilder()
            .setCustomId(`reg_submit_paypal:${role}:${targetUserId}`)
            .setTitle('Configurar PayPal');

          const paypalInput = new TextInputBuilder()
            .setCustomId('paypal_value')
            .setLabel('Correo PayPal o Link de paypal.me')
            .setPlaceholder('ej. mi_correo@gmail.com o paypal.me/mi_usuario')
            .setStyle(TextInputStyle.Short)
            .setValue(existing?.paypal || '')
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(paypalInput));
          return interaction.showModal(modal);
        }

        // Abrir Modal de Binance
        if (customId.startsWith('reg_modal_binance:')) {
          const [, role, targetUserId] = customId.split(':');
          if (interaction.user.id !== targetUserId) {
            return interaction.reply({ content: '❌ Solo el usuario que inició el registro puede interactuar con estos botones.', ephemeral: true });
          }

          const existing = await TalentService.getTalent(targetUserId);

          const modal = new ModalBuilder()
            .setCustomId(`reg_submit_binance:${role}:${targetUserId}`)
            .setTitle('Configurar Binance');

          const binanceInput = new TextInputBuilder()
            .setCustomId('binance_value')
            .setLabel('Binance Pay ID o Enlace de Pago')
            .setPlaceholder('ej. 12345678 o https://app.binance.com/qr/...')
            .setStyle(TextInputStyle.Short)
            .setValue(existing?.binance || '')
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(binanceInput));
          return interaction.showModal(modal);
        }

        // ==========================================
        // Botones del Flujo de Registro de Videos
        // ==========================================
        if (customId.startsWith('vidreg_btn_start:') || customId.startsWith('vidreg_btn_manual_url:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ Solo quien inició el panel o moderadores pueden registrar videos.', ephemeral: true });
          }

          const modal = new ModalBuilder()
            .setCustomId(`vidreg_submit_url:${authorId}`)
            .setTitle('Paso 1: Enlace de YouTube');

          const urlInput = new TextInputBuilder()
            .setCustomId('youtube_url_value')
            .setLabel('Enlace o ID de Video de YouTube')
            .setPlaceholder('https://youtu.be/... o https://www.youtube.com/watch?v=...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
          return interaction.showModal(modal);
        }

        // Salir del Registro de Video
        if (customId.startsWith('vidreg_btn_exit:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ Solo quien inició el panel o moderadores pueden finalizar la interacción.', ephemeral: true });
          }

          // Limpiar cualquier borrador de este autor
          for (const [key, d] of videoRegDrafts.entries()) {
            if (d.authorId === authorId || key.startsWith(authorId)) {
              videoRegDrafts.delete(key);
            }
          }

          const exitEmbed = new EmbedBuilder()
            .setTitle('👋 Registro Finalizado')
            .setColor(EMBED_COLORS.WARNING)
            .setDescription('Has salido del proceso interactivo de registro de videos.')
            .setFooter({ text: 'Puedes volver a abrir el panel en cualquier momento con !registrar-video' });

          return interaction.update({ embeds: [exitEmbed], components: [] });
        }

        // Cancelar Registro de Video
        if (customId.startsWith('vidreg_btn_cancel:')) {
          const [, authorId] = customId.split(':');
          for (const [key, d] of videoRegDrafts.entries()) {
            if (d.authorId === authorId || key.startsWith(authorId)) {
              videoRegDrafts.delete(key);
            }
          }

          const cancelEmbed = new EmbedBuilder()
            .setTitle('❌ Registro Cancelado')
            .setColor(EMBED_COLORS.WARNING)
            .setDescription('El proceso interactivo de registro de video ha sido cancelado.')
            .setFooter({ text: 'Puedes volver a iniciar en cualquier momento con !registrar-video' });

          return interaction.update({ embeds: [cancelEmbed], components: [] });
        }

        // Confirmar y Registrar Video (Paso final con validación)
        if (customId.startsWith('vidreg_btn_confirm:')) {
          const [, draftId] = customId.split(':');
          const draft = videoRegDrafts.get(draftId);

          if (!draft) {
            return interaction.reply({
              content: '⚠️ La sesión de registro ha expirado o no existe. Inicia nuevamente con `!registrar-video`.',
              ephemeral: true
            });
          }

          if (interaction.user.id !== draft.authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ Solo quien inició el registro o moderadores pueden confirmar el envío.', ephemeral: true });
          }

          if ((!draft.actorIds || draft.actorIds.length === 0) && !draft.editorId) {
            return interaction.reply({
              content: '⚠️ Debes seleccionar al menos un participante (actores o editor) antes de confirmar.',
              ephemeral: true
            });
          }

          try {
            const videoRecord = await VideoService.registerVideo({
              youtubeUrl: `https://www.youtube.com/watch?v=${draft.videoId}`,
              editorDiscordId: draft.editorId || null,
              actorDiscordIds: draft.actorIds || [],
              client
            });

            videoRegDrafts.delete(draftId);

            const scheduledUnix = Math.floor(new Date(videoRecord.scheduledCalculationAt).getTime() / 1000);
            const editorDisplay = videoRecord.editorId ? `<@${videoRecord.editorId}>` : '*Ninguno / No asignado*';
            const actorsDisplay = videoRecord.participants && videoRecord.participants.length > 0
              ? videoRecord.participants.map(p => `<@${p.talentId}>`).join(', ')
              : '*Ninguno*';

            const successEmbed = new EmbedBuilder()
              .setTitle('✅ ¡Video Registrado Exitosamente!')
              .setURL(videoRecord.youtubeUrl)
              .setColor(EMBED_COLORS.SUCCESS)
              .setThumbnail(YouTubeService.getThumbnailUrl(draft.videoId))
              .setDescription('El video ha sido registrado correctamente mediante el panel interactivo. Se crearon las fichas de seguimiento.')
              .addFields(
                {
                  name: '📺 Video',
                  value: `[${videoRecord.videoTitle || draft.videoTitle || draft.videoId}](${videoRecord.youtubeUrl})`,
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
              .setFooter({ text: `ID Interno: ${videoRecord.id} • Sonic Gestión Bot` })
              .setTimestamp();

            return interaction.update({
              embeds: [successEmbed],
              components: []
            });
          } catch (regError) {
            return interaction.reply({
              content: `❌ **Error al registrar el video:** ${regError.message}`,
              ephemeral: true
            });
          }
        }

        // ==========================================
        // Botones de Configuración de Prefijo
        // ==========================================
        if (customId.startsWith('cfg_btn_change_prefix:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden cambiar el prefijo del bot.', ephemeral: true });
          }

          const currentPfx = ConfigService.getPrefix();
          const modal = new ModalBuilder()
            .setCustomId(`cfg_modal_prefix:${authorId}`)
            .setTitle('Cambiar Prefijo del Bot');

          const prefixInput = new TextInputBuilder()
            .setCustomId('new_prefix_val')
            .setLabel('Nuevo Prefijo (1 a 5 caracteres)')
            .setPlaceholder('ej. !, ?, ., s!, sonic!')
            .setValue(currentPfx)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(prefixInput));
          return interaction.showModal(modal);
        }

        if (customId.startsWith('cfg_btn_reset_prefix:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden cambiar el prefijo del bot.', ephemeral: true });
          }

          await ConfigService.updateConfig('prefix', '!');
          if (client?.user?.setActivity) {
            try {
              client.user.setActivity(`!ayuda | Gestión de Videos`, { type: ActivityType.Watching });
            } catch {}
          }

          const resetEmbed = new EmbedBuilder()
            .setTitle('🔄 Prefijo Restablecido')
            .setColor(EMBED_COLORS.SUCCESS)
            .setDescription(`El prefijo del bot ha sido restablecido a su valor predeterminado: **\`!\`**.`)
            .setFooter({ text: 'Sonic Gestión Bot • Configuración' })
            .setTimestamp();

          return interaction.update({ embeds: [resetEmbed], components: [] });
        }

        // ==========================================
        // Botones de Configuración de Canal de YouTube
        // ==========================================
        if (customId.startsWith('cfg_btn_modal_channel:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden configurar el canal de YouTube.', ephemeral: true });
          }

          const config = await ConfigService.getConfig();
          const modal = new ModalBuilder()
            .setCustomId(`cfg_modal_set_canal:${authorId}`)
            .setTitle('Vincular Canal de YouTube');

          const channelInput = new TextInputBuilder()
            .setCustomId('youtube_channel_val')
            .setLabel('URL, Handle (@Canal) o ID de YouTube')
            .setPlaceholder('https://www.youtube.com/@Canal o @Canal')
            .setValue(config.youtubeChannelUrl || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
          return interaction.showModal(modal);
        }

        if (customId.startsWith('cfg_btn_unlink_channel:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden configurar el canal de YouTube.', ephemeral: true });
          }

          await ConfigService.setYoutubeChannel({ channelId: null, url: null, title: null });

          const unlinkEmbed = new EmbedBuilder()
            .setTitle('🗑️ Canal de YouTube Desvinculado')
            .setColor(EMBED_COLORS.WARNING)
            .setDescription('Se ha desvinculado el canal de YouTube del sistema. Ya no se cargarán videos automáticos al usar `!registrar-video`.')
            .setFooter({ text: 'Sonic Gestión Bot • Administración' })
            .setTimestamp();

          return interaction.update({ embeds: [unlinkEmbed], components: [] });
        }

        // ==========================================
        // Botones de Configuración Interactiva de Tarifas
        // ==========================================
        // Modal 1: Tarifas Base y Divisa
        if (customId.startsWith('cfg_modal_rates:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden modificar las tarifas.', ephemeral: true });
          }

          const config = await ConfigService.getConfig();

          const modal = new ModalBuilder()
            .setCustomId(`cfg_submit_rates:${authorId}`)
            .setTitle('Editar Tarifas Base y Moneda');

          const actorInput = new TextInputBuilder()
            .setCustomId('actor_base')
            .setLabel('Tarifa Base Actor')
            .setValue(String(config.actorBase))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const editorInput = new TextInputBuilder()
            .setCustomId('editor_base')
            .setLabel('Tarifa Base Editor')
            .setValue(String(config.editorBase))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const currencyInput = new TextInputBuilder()
            .setCustomId('currency')
            .setLabel('Moneda / Divisa (ej. MXN, USD, EUR)')
            .setValue(config.currency || 'MXN')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(actorInput),
            new ActionRowBuilder().addComponents(editorInput),
            new ActionRowBuilder().addComponents(currencyInput)
          );

          return interaction.showModal(modal);
        }

        // Modal 2: Umbrales y Bonos
        if (customId.startsWith('cfg_modal_bonuses:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden modificar los bonos.', ephemeral: true });
          }

          const config = await ConfigService.getConfig();

          const modal = new ModalBuilder()
            .setCustomId(`cfg_submit_bonuses:${authorId}`)
            .setTitle('Editar Umbrales y Bonos');

          const threshold1Input = new TextInputBuilder()
            .setCustomId('threshold1')
            .setLabel('Umbral 1 (Vistas mínimas)')
            .setValue(String(config.threshold1))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const bonus1Input = new TextInputBuilder()
            .setCustomId('bonus1')
            .setLabel('Bono Umbral 1 ($)')
            .setValue(String(config.bonus1))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const threshold2Input = new TextInputBuilder()
            .setCustomId('threshold2')
            .setLabel('Umbral 2 (Vistas mínimas)')
            .setValue(String(config.threshold2))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const bonus2Input = new TextInputBuilder()
            .setCustomId('bonus2')
            .setLabel('Bono Umbral 2 ($)')
            .setValue(String(config.bonus2))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(threshold1Input),
            new ActionRowBuilder().addComponents(bonus1Input),
            new ActionRowBuilder().addComponents(threshold2Input),
            new ActionRowBuilder().addComponents(bonus2Input)
          );

          return interaction.showModal(modal);
        }

        // Modal 3: Días de Espera
        if (customId.startsWith('cfg_modal_waitdays:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden modificar los días de espera.', ephemeral: true });
          }

          const config = await ConfigService.getConfig();

          const modal = new ModalBuilder()
            .setCustomId(`cfg_submit_waitdays:${authorId}`)
            .setTitle('Editar Plazo de Liquidación');

          const waitDaysInput = new TextInputBuilder()
            .setCustomId('wait_days')
            .setLabel('Días de Espera para Liquidar')
            .setValue(String(config.waitDays))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(waitDaysInput));
          return interaction.showModal(modal);
        }

        // Botón: Actualizar Vista de Tarifas
        if (customId.startsWith('cfg_refresh_rates:')) {
          const config = await ConfigService.getConfig(true);
          const embed = buildTarifasEmbed(config);
          const rows = buildTarifasActionRows(interaction.user.id);

          return interaction.update({ embeds: [embed], components: rows });
        }

        // ==========================================
        // Botones de Registro Administrativo de Talentos
        // ==========================================
        // Abrir Modal de Datos de Talento
        if (customId.startsWith('admreg_open_modal:')) {
          const [, authorId, targetUserId, defaultRole] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden gestionar expedientes de talentos.', ephemeral: true });
          }

          const existing = await TalentService.getTalent(targetUserId);

          const modal = new ModalBuilder()
            .setCustomId(`admreg_submit_form:${authorId}:${targetUserId}`)
            .setTitle(`Expediente: ${targetUserId.slice(-8)}`);

          const roleInput = new TextInputBuilder()
            .setCustomId('role_val')
            .setLabel('Rol del Talento (ACTOR o EDITOR)')
            .setValue(existing?.role || defaultRole || 'ACTOR')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const paypalInput = new TextInputBuilder()
            .setCustomId('paypal_val')
            .setLabel('PayPal (Correo o Link paypal.me)')
            .setValue(existing?.paypal || '')
            .setPlaceholder('ej. talento@gmail.com o paypal.me/usuario')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

          const binanceInput = new TextInputBuilder()
            .setCustomId('binance_val')
            .setLabel('Binance (Pay ID o Enlace de Pago)')
            .setValue(existing?.binance || '')
            .setPlaceholder('ej. 12345678 o link de Binance Pay')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

          const notifyInput = new TextInputBuilder()
            .setCustomId('notify_val')
            .setLabel('¿Notificar al talento por DM? (SI o NO)')
            .setValue('SI')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(roleInput),
            new ActionRowBuilder().addComponents(paypalInput),
            new ActionRowBuilder().addComponents(binanceInput),
            new ActionRowBuilder().addComponents(notifyInput)
          );

          return interaction.showModal(modal);
        }

        // Volver al selector de usuario
        if (customId.startsWith('admreg_btn_newuser:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden gestionar expedientes de talentos.', ephemeral: true });
          }

          const embed = buildAdminTalentSelectEmbed();
          const rows = buildAdminTalentSelectRows(interaction.user.id);
          return interaction.update({ embeds: [embed], components: rows });
        }

        // Eliminar expediente de talento
        if (customId.startsWith('admreg_btn_delete:')) {
          const [, authorId, targetUserId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden eliminar expedientes.', ephemeral: true });
          }

          await TalentService.deleteTalent(targetUserId);

          const deletedEmbed = new EmbedBuilder()
            .setTitle('🗑️ Expediente Eliminado')
            .setColor(EMBED_COLORS.ERROR)
            .setDescription(`El expediente de talento de <@${targetUserId}> (\`${targetUserId}\`) ha sido eliminado de la base de datos.`)
            .setFooter({ text: 'Sonic Gestión Bot • Administración' })
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`admreg_btn_newuser:${interaction.user.id}`)
              .setLabel('Registrar Otro Talento')
              .setEmoji('👥')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`admreg_btn_cancel:${interaction.user.id}`)
              .setLabel('Cerrar')
              .setEmoji('✖️')
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.update({ embeds: [deletedEmbed], components: [row] });
        }

        // Cancelar panel administrativo de talento
        if (customId.startsWith('admreg_btn_cancel:')) {
          const cancelEmbed = new EmbedBuilder()
            .setTitle('🔒 Panel Administrativo Cerrado')
            .setColor(EMBED_COLORS.PRIMARY)
            .setDescription('El panel administrativo de gestión de talentos ha sido cerrado.')
            .setFooter({ text: 'Usa !registrar-talento para abrirlo de nuevo' });

          return interaction.update({ embeds: [cancelEmbed], components: [] });
        }
      }

      // 2. Manejo de Envíos de Modales
      if (interaction.type === InteractionType.ModalSubmit) {
        const customId = interaction.customId;

        // ==========================================
        // Modal Submits: Asistente de Configuración (!setup)
        // ==========================================
        if (customId.startsWith('setup_submit_prefix:')) {
          const [, authorId] = customId.split(':');
          const session = await getOrCreateSetupSession(authorId);
          const raw = interaction.fields.getTextInputValue('prefix_input').trim();

          if (!raw || raw.length > 5 || /\s/.test(raw) || raw.includes('<@')) {
            return interaction.reply({
              content: '❌ El prefijo debe tener entre 1 y 5 caracteres sin espacios ni menciones.',
              ephemeral: true
            });
          }

          session.data.prefix = raw;
          const payload = await buildSetupStepPayload(session, client);
          return interaction.update(payload);
        }

        if (customId.startsWith('setup_submit_youtube:')) {
          const [, authorId] = customId.split(':');
          const session = await getOrCreateSetupSession(authorId);
          const raw = interaction.fields.getTextInputValue('youtube_input').trim();

          try {
            const channel = await YouTubeService.getChannelDetails(raw);
            session.data.youtubeChannelUrl = channel.url;
            session.data.youtubeChannelId = channel.channelId;
            session.data.youtubeChannelTitle = channel.title;

            const payload = await buildSetupStepPayload(session, client);
            return interaction.update(payload);
          } catch (err) {
            return interaction.reply({
              content: `❌ **Error al verificar el canal de YouTube:** ${err.message}`,
              ephemeral: true
            });
          }
        }

        if (customId.startsWith('setup_submit_rates:')) {
          const [, authorId] = customId.split(':');
          const session = await getOrCreateSetupSession(authorId);

          const actorBase = parseFloat(interaction.fields.getTextInputValue('actor_base_input'));
          const editorBase = parseFloat(interaction.fields.getTextInputValue('editor_base_input'));

          if (isNaN(actorBase) || actorBase < 0) {
            return interaction.reply({ content: '❌ La tarifa base del actor debe ser un número mayor o igual a 0.', ephemeral: true });
          }
          if (isNaN(editorBase) || editorBase < 0) {
            return interaction.reply({ content: '❌ La tarifa base del editor debe ser un número mayor o igual a 0.', ephemeral: true });
          }

          session.data.actorBase = Number(actorBase.toFixed(2));
          session.data.editorBase = Number(editorBase.toFixed(2));

          const payload = await buildSetupStepPayload(session, client);
          return interaction.update(payload);
        }

        if (customId.startsWith('setup_submit_bonuses:')) {
          const [, authorId] = customId.split(':');
          const session = await getOrCreateSetupSession(authorId);

          const t1 = parseInt(interaction.fields.getTextInputValue('threshold1_input'), 10);
          const b1 = parseFloat(interaction.fields.getTextInputValue('bonus1_input'));
          const t2 = parseInt(interaction.fields.getTextInputValue('threshold2_input'), 10);
          const b2 = parseFloat(interaction.fields.getTextInputValue('bonus2_input'));

          if (isNaN(t1) || t1 < 0) {
            return interaction.reply({ content: '❌ El Umbral 1 debe ser un número entero mayor o igual a 0.', ephemeral: true });
          }
          if (isNaN(b1) || b1 < 0) {
            return interaction.reply({ content: '❌ El Bono 1 debe ser un número mayor o igual a 0.', ephemeral: true });
          }
          if (isNaN(t2) || t2 < 0) {
            return interaction.reply({ content: '❌ El Umbral 2 debe ser un número entero mayor o igual a 0.', ephemeral: true });
          }
          if (isNaN(b2) || b2 < 0) {
            return interaction.reply({ content: '❌ El Bono 2 debe ser un número mayor o igual a 0.', ephemeral: true });
          }
          if (t1 >= t2) {
            return interaction.reply({
              content: `❌ El Umbral 1 (${t1.toLocaleString()}) debe ser estrictamente menor que el Umbral 2 (${t2.toLocaleString()}).`,
              ephemeral: true
            });
          }

          session.data.threshold1 = t1;
          session.data.bonus1 = Number(b1.toFixed(2));
          session.data.threshold2 = t2;
          session.data.bonus2 = Number(b2.toFixed(2));

          const payload = await buildSetupStepPayload(session, client);
          return interaction.update(payload);
        }

        if (customId.startsWith('setup_submit_general:')) {
          const [, authorId] = customId.split(':');
          const session = await getOrCreateSetupSession(authorId);

          const curr = interaction.fields.getTextInputValue('currency_input').trim().toUpperCase();
          const days = parseInt(interaction.fields.getTextInputValue('wait_days_input'), 10);

          if (!curr) {
            return interaction.reply({ content: '❌ El código de moneda no puede estar vacío.', ephemeral: true });
          }
          if (isNaN(days) || days < 1) {
            return interaction.reply({ content: '❌ Los días de espera deben ser un número entero mayor o igual a 1.', ephemeral: true });
          }

          session.data.currency = curr.slice(0, 10);
          session.data.waitDays = days;

          const payload = await buildSetupStepPayload(session, client);
          return interaction.update(payload);
        }

        // Guardar PayPal
        if (customId.startsWith('reg_submit_paypal:')) {
          const [, role, targetUserId] = customId.split(':');
          const rawPaypal = interaction.fields.getTextInputValue('paypal_value').trim();

          if (!isValidPaypal(rawPaypal) && !isPaypalMeId(rawPaypal)) {
            return interaction.reply({
              content: `❌ El identificador de PayPal \`${rawPaypal}\` no es válido. Debe ser un correo electrónico válido, un enlace de paypal.me o un ID de paypal.me.`,
              ephemeral: true
            });
          }

          // Si es un ID o link de paypal.me (no es un correo), verificar en vivo haciendo ping a paypal.me/<id> y comprobando status 200
          if (!isValidEmail(rawPaypal)) {
            if (typeof interaction.deferUpdate === 'function') {
              await interaction.deferUpdate();
            }
            const verification = await verifyPaypalMeOnline(rawPaypal);
            if (!verification.valid) {
              const errorMsg = `❌ **Verificación fallida de PayPal.me:**\n${verification.error}\nVerifica que el ID o enlace devuelva el status 200 OK en PayPal.`;
              if (interaction.deferred && typeof interaction.followUp === 'function') {
                return interaction.followUp({ content: errorMsg, ephemeral: true });
              }
              return interaction.reply({ content: errorMsg, ephemeral: true });
            }
          }

          const cleanPaypal = !isValidEmail(rawPaypal) ? normalizePaypal(rawPaypal) : rawPaypal;

          const talent = await TalentService.upsertTalent({
            discordId: targetUserId,
            role,
            paypal: cleanPaypal
          });

          const roleIcon = talent.role === 'EDITOR' ? '🎬' : '🎭';

          const nextRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`reg_modal_binance:${role}:${targetUserId}`)
              .setLabel('Configurar Binance También')
              .setEmoji('🪙')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`reg_modal_paypal:${role}:${targetUserId}`)
              .setLabel('Editar PayPal')
              .setEmoji('✏️')
              .setStyle(ButtonStyle.Light || ButtonStyle.Secondary)
          );

          const successEmbed = new EmbedBuilder()
            .setTitle('✅ ¡Expediente Guardado Exitosamente!')
            .setColor(EMBED_COLORS.SUCCESS)
            .setDescription(`Tu cuenta de PayPal ha sido vinculada correctamente para tu rol de **${roleIcon} ${talent.role}**.`)
            .addFields(
              { name: '👤 Usuario', value: `<@${talent.discordId}>`, inline: true },
              { name: '🎭 Rol Asignado', value: `**${roleIcon} ${talent.role}**`, inline: true },
              { name: '💳 PayPal', value: `\`${talent.paypal}\``, inline: false },
              { name: '🪙 Binance', value: talent.binance ? `\`${talent.binance}\`` : '*No configurado (opcional)*', inline: false }
            )
            .setFooter({ text: 'Puedes volver a actualizar tus datos con !registro o consultar tu perfil con !miperfil' })
            .setTimestamp();

          if (interaction.deferred) {
            return interaction.editReply({ embeds: [successEmbed], components: [nextRow] });
          }
          return interaction.update({ embeds: [successEmbed], components: [nextRow] });
        }

        // Guardar Binance
        if (customId.startsWith('reg_submit_binance:')) {
          const [, role, targetUserId] = customId.split(':');
          const rawBinance = interaction.fields.getTextInputValue('binance_value').trim();

          if (!isValidBinance(rawBinance)) {
            return interaction.reply({
              content: `❌ El identificador de Binance \`${rawBinance}\` no es válido. Debe ser un Pay ID numérico (ej. 12345678), un Payment Link de Binance o correo.`,
              ephemeral: true
            });
          }

          const talent = await TalentService.upsertTalent({
            discordId: targetUserId,
            role,
            binance: rawBinance
          });

          const roleIcon = talent.role === 'EDITOR' ? '🎬' : '🎭';

          const nextRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`reg_modal_paypal:${role}:${targetUserId}`)
              .setLabel('Configurar PayPal También')
              .setEmoji('💳')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`reg_modal_binance:${role}:${targetUserId}`)
              .setLabel('Editar Binance')
              .setEmoji('✏️')
              .setStyle(ButtonStyle.Light || ButtonStyle.Secondary)
          );

          const successEmbed = new EmbedBuilder()
            .setTitle('✅ ¡Expediente Guardado Exitosamente!')
            .setColor(EMBED_COLORS.SUCCESS)
            .setDescription(`Tu cuenta de Binance ha sido vinculada correctamente para tu rol de **${roleIcon} ${talent.role}**.`)
            .addFields(
              { name: '👤 Usuario', value: `<@${talent.discordId}>`, inline: true },
              { name: '🎭 Rol Asignado', value: `**${roleIcon} ${talent.role}**`, inline: true },
              { name: '💳 PayPal', value: talent.paypal ? `\`${talent.paypal}\`` : '*No configurado (opcional)*', inline: false },
              { name: '🪙 Binance', value: `\`${talent.binance}\``, inline: false }
            )
            .setFooter({ text: 'Puedes volver a actualizar tus datos con !registro o consultar tu perfil con !miperfil' })
            .setTimestamp();

          return interaction.update({ embeds: [successEmbed], components: [nextRow] });
        }

        // Enviar URL de Video para Registro Interactivo
        if (customId.startsWith('vidreg_submit_url:')) {
          const [, authorId] = customId.split(':');
          const rawUrl = interaction.fields.getTextInputValue('youtube_url_value').trim();

          const videoId = YouTubeService.extractVideoId(rawUrl);
          if (!videoId) {
            return interaction.reply({
              content: `❌ El texto introducido \`${rawUrl}\` no corresponde a un enlace o ID válido de YouTube.`,
              ephemeral: true
            });
          }

          let videoTitle = `YouTube Video (${videoId})`;
          try {
            const details = await YouTubeService.getVideoDetails(videoId);
            if (details?.title) videoTitle = details.title;
          } catch {
            // Offline/mock fallback
          }

          const draftId = `${authorId}_${videoId}_${Date.now()}`;
          const draft = {
            id: draftId,
            authorId,
            videoId,
            videoTitle,
            actorIds: [],
            editorId: null,
            createdAt: Date.now()
          };
          videoRegDrafts.set(draftId, draft);

          const payload = await buildTalentSelectionPayload(draft, client);
          return interaction.reply({
            embeds: payload.embeds,
            components: payload.components,
            ephemeral: false
          });
        }

        // ==========================================
        // Modal Submit: Cambiar Prefijo
        // ==========================================
        if (customId.startsWith('cfg_modal_prefix:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden cambiar el prefijo del bot.', ephemeral: true });
          }

          const newPrefixVal = interaction.fields.getTextInputValue('new_prefix_val').trim();

          try {
            const result = await ConfigService.updateConfig('prefix', newPrefixVal);

            if (client?.user?.setActivity) {
              try {
                client.user.setActivity(`${result.newValue}ayuda | Gestión de Videos`, { type: ActivityType.Watching });
              } catch {}
            }

            const successEmbed = new EmbedBuilder()
              .setTitle('✅ Prefijo Actualizado Exitosamente')
              .setColor(EMBED_COLORS.SUCCESS)
              .setDescription(`Se ha configurado el prefijo del bot a **\`${result.newValue}\`** en la base de datos.`)
              .setFooter({ text: 'Sonic Gestión Bot • Configuración' })
              .setTimestamp();

            return interaction.reply({ embeds: [successEmbed], ephemeral: false });
          } catch (err) {
            return interaction.reply({ content: `❌ **Error al actualizar prefijo:** ${err.message}`, ephemeral: true });
          }
        }

        // ==========================================
        // Modal Submit: Vincular Canal de YouTube
        // ==========================================
        if (customId.startsWith('cfg_modal_set_canal:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden configurar el canal de YouTube.', ephemeral: true });
          }

          const channelVal = interaction.fields.getTextInputValue('youtube_channel_val').trim();

          try {
            const channel = await YouTubeService.getChannelDetails(channelVal);
            await ConfigService.setYoutubeChannel({
              channelId: channel.channelId,
              url: channel.url,
              title: channel.title
            });

            const successEmbed = new EmbedBuilder()
              .setTitle('✅ Canal de YouTube Vinculado Exitosamente')
              .setColor(EMBED_COLORS.SUCCESS)
              .setDescription(
                `Se ha vinculado el canal **[${channel.title}](${channel.url})** (\`${channel.channelId}\`).\n\n` +
                `Al usar \`!registrar-video\` se cargarán automáticamente los últimos 25 videos de este canal.`
              )
              .setFooter({ text: 'Sonic Gestión Bot • Administración' })
              .setTimestamp();

            return interaction.reply({ embeds: [successEmbed], ephemeral: false });
          } catch (err) {
            return interaction.reply({ content: `❌ **Error al vincular canal:** ${err.message}`, ephemeral: true });
          }
        }

        // ==========================================
        // Modal Submit: Actualizar Tarifas Base y Moneda
        // ==========================================
        if (customId.startsWith('cfg_submit_rates:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden modificar las tarifas.', ephemeral: true });
          }

          const actorBaseRaw = interaction.fields.getTextInputValue('actor_base');
          const editorBaseRaw = interaction.fields.getTextInputValue('editor_base');
          const currencyRaw = interaction.fields.getTextInputValue('currency');

          try {
            if (actorBaseRaw) await ConfigService.updateConfig('actorBase', actorBaseRaw);
            if (editorBaseRaw) await ConfigService.updateConfig('editorBase', editorBaseRaw);
            if (currencyRaw) await ConfigService.updateConfig('currency', currencyRaw);

            const updatedConfig = await ConfigService.getConfig(true);
            const embed = buildTarifasEmbed(updatedConfig);
            const rows = buildTarifasActionRows(interaction.user.id);

            return interaction.update({
              embeds: [embed],
              components: rows
            });
          } catch (err) {
            return interaction.reply({
              content: `❌ **Error al actualizar tarifas:** ${err.message}`,
              ephemeral: true
            });
          }
        }

        // ==========================================
        // Modal Submit: Actualizar Umbrales y Bonos
        // ==========================================
        if (customId.startsWith('cfg_submit_bonuses:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden modificar los bonos.', ephemeral: true });
          }

          const threshold1Raw = interaction.fields.getTextInputValue('threshold1');
          const bonus1Raw = interaction.fields.getTextInputValue('bonus1');
          const threshold2Raw = interaction.fields.getTextInputValue('threshold2');
          const bonus2Raw = interaction.fields.getTextInputValue('bonus2');

          try {
            if (threshold1Raw) await ConfigService.updateConfig('threshold1', threshold1Raw);
            if (bonus1Raw) await ConfigService.updateConfig('bonus1', bonus1Raw);
            if (threshold2Raw) await ConfigService.updateConfig('threshold2', threshold2Raw);
            if (bonus2Raw) await ConfigService.updateConfig('bonus2', bonus2Raw);

            const updatedConfig = await ConfigService.getConfig(true);
            const embed = buildTarifasEmbed(updatedConfig);
            const rows = buildTarifasActionRows(interaction.user.id);

            return interaction.update({
              embeds: [embed],
              components: rows
            });
          } catch (err) {
            return interaction.reply({
              content: `❌ **Error al actualizar umbrales/bonos:** ${err.message}`,
              ephemeral: true
            });
          }
        }

        // ==========================================
        // Modal Submit: Actualizar Días de Espera
        // ==========================================
        if (customId.startsWith('cfg_submit_waitdays:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden modificar los días de espera.', ephemeral: true });
          }

          const waitDaysRaw = interaction.fields.getTextInputValue('wait_days');

          try {
            if (waitDaysRaw) await ConfigService.updateConfig('waitDays', waitDaysRaw);

            const updatedConfig = await ConfigService.getConfig(true);
            const embed = buildTarifasEmbed(updatedConfig);
            const rows = buildTarifasActionRows(interaction.user.id);

            return interaction.update({
              embeds: [embed],
              components: rows
            });
          } catch (err) {
            return interaction.reply({
              content: `❌ **Error al actualizar días de espera:** ${err.message}`,
              ephemeral: true
            });
          }
        }

        // ==========================================
        // Modal Submit: Guardar Expediente Administrativo de Talento
        // ==========================================
        if (customId.startsWith('admreg_submit_form:')) {
          const [, authorId, targetUserId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden registrar o editar expedientes de talentos.', ephemeral: true });
          }

          const roleInput = interaction.fields.getTextInputValue('role_val').trim().toUpperCase();
          const paypalInput = interaction.fields.getTextInputValue('paypal_val').trim();
          const binanceInput = interaction.fields.getTextInputValue('binance_val').trim();
          const notifyInput = interaction.fields.getTextInputValue('notify_val').trim().toUpperCase();

          if (roleInput !== 'ACTOR' && roleInput !== 'EDITOR') {
            return interaction.reply({
              content: '❌ **Rol no válido:** El rol debe ser estrictamente `ACTOR` o `EDITOR`.',
              ephemeral: true
            });
          }

          if (!paypalInput && !binanceInput) {
            return interaction.reply({
              content: '❌ **Métodos de pago incompletos:** Debes proporcionar al menos un método de pago válido (PayPal o Binance).',
              ephemeral: true
            });
          }

          if (paypalInput && !isValidPaypal(paypalInput) && !isPaypalMeId(paypalInput)) {
            return interaction.reply({
              content: `❌ El identificador de PayPal \`${paypalInput}\` no es válido. Debe ser un correo electrónico o un enlace/ID de paypal.me.`,
              ephemeral: true
            });
          }

          if (binanceInput && !isValidBinance(binanceInput)) {
            return interaction.reply({
              content: `❌ El identificador de Binance \`${binanceInput}\` no es válido. Debe ser un Binance Pay ID numérico, enlace de Binance Pay o correo electrónico válido.`,
              ephemeral: true
            });
          }

          // Si PayPal es un paypal.me (no email), verificar online que la URL esté activa
          if (paypalInput && !isValidEmail(paypalInput)) {
            if (typeof interaction.deferUpdate === 'function') {
              await interaction.deferUpdate();
            }
            const verification = await verifyPaypalMeOnline(paypalInput);
            if (!verification.valid) {
              const errContent = `❌ **Verificación fallida de PayPal.me:**\n${verification.error}\nVerifica que el ID o enlace devuelva el status 200 OK en PayPal.`;
              if (interaction.deferred && typeof interaction.followUp === 'function') {
                return interaction.followUp({ content: errContent, ephemeral: true });
              }
              return interaction.reply({ content: errContent, ephemeral: true });
            }
          }

          try {
            const cleanPaypal = (paypalInput && !isValidEmail(paypalInput)) ? normalizePaypal(paypalInput) : (paypalInput || null);
            const talent = await TalentService.upsertTalent({
              discordId: targetUserId,
              role: roleInput,
              paypal: cleanPaypal,
              binance: binanceInput || null
            });

            // Notificación opcional por DM al talento
            let dmStatus = '⚪ Omitida por configuración';
            const shouldNotify = ['SI', 'S', 'YES', 'Y', 'TRUE'].includes(notifyInput);

            if (shouldNotify) {
              try {
                let targetUser = client.users.cache.get(targetUserId);
                if (!targetUser && client.users.fetch) {
                  targetUser = await client.users.fetch(targetUserId).catch(() => null);
                }

                if (targetUser && targetUser.send) {
                  const roleIcon = talent.role === 'EDITOR' ? '🎬' : '🎭';
                  const dmEmbed = new EmbedBuilder()
                    .setTitle('📋 Expediente de Talento Actualizado')
                    .setColor(EMBED_COLORS.PRIMARY)
                    .setDescription(
                      `¡Hola <@${targetUserId}>! La administración de **Sonic Gestión** ha registrado/actualizado tu expediente de talento en el sistema.\n\n` +
                      `Ya estás habilitado para ser asignado a videos de YouTube y recibir liquidaciones por vistas.`
                    )
                    .addFields(
                      { name: '🎭 Rol Asignado', value: `**${roleIcon} ${talent.role}**`, inline: true },
                      { name: '💳 PayPal', value: talent.paypal ? `\`${talent.paypal}\`` : '*No configurado*', inline: true },
                      { name: '🪙 Binance', value: talent.binance ? `\`${talent.binance}\`` : '*No configurado*', inline: true }
                    )
                    .setFooter({ text: 'Puedes consultar tu expediente en cualquier momento con !miperfil' })
                    .setTimestamp();

                  await targetUser.send({ embeds: [dmEmbed] });
                  dmStatus = '✅ Notificación enviada al talento vía DM';
                }
              } catch (dmErr) {
                console.warn(`[AdminRegistro] DMs cerrados para ${targetUserId}:`, dmErr.message);
                dmStatus = '⚠️ No se pudo enviar DM (el usuario tiene mensajes directos cerrados)';
              }
            }

            const roleIcon = talent.role === 'EDITOR' ? '🎬' : '🎭';
            const successEmbed = new EmbedBuilder()
              .setTitle('✅ ¡Expediente de Talento Guardado Exitosamente!')
              .setColor(EMBED_COLORS.SUCCESS)
              .setDescription(
                `Se ha guardado el expediente de <@${targetUserId}> (\`${targetUserId}\`) en la base de datos de SQLite.`
              )
              .addFields(
                { name: '👤 Talento', value: `<@${targetUserId}>`, inline: true },
                { name: '🎭 Rol Asignado', value: `**${roleIcon} ${talent.role}**`, inline: true },
                { name: '💳 PayPal', value: talent.paypal ? `\`${talent.paypal}\`` : '*No configurado*', inline: false },
                { name: '🪙 Binance', value: talent.binance ? `\`${talent.binance}\`` : '*No configurado*', inline: false },
                { name: '📩 Notificación al Talento', value: dmStatus, inline: false }
              )
              .setFooter({ text: 'Sonic Gestión Bot • Administración de Talentos' })
              .setTimestamp();

            const actionRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`admreg_open_modal:${interaction.user.id}:${targetUserId}:${talent.role}`)
                .setLabel('Volver a Editar')
                .setEmoji('✏️')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`admreg_btn_newuser:${interaction.user.id}`)
                .setLabel('Registrar Otro Talento')
                .setEmoji('👥')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`admreg_btn_cancel:${interaction.user.id}`)
                .setLabel('Finalizar')
                .setEmoji('✖️')
                .setStyle(ButtonStyle.Secondary)
            );

            if (interaction.deferred && typeof interaction.editReply === 'function') {
              return interaction.editReply({ embeds: [successEmbed], components: [actionRow] });
            }
            return interaction.update({ embeds: [successEmbed], components: [actionRow] });
          } catch (dbErr) {
            console.error('Error in admreg_submit_form:', dbErr);
            const errMsg = `❌ **Error al guardar expediente:** ${dbErr.message}`;
            if (interaction.deferred && typeof interaction.followUp === 'function') {
              return interaction.followUp({ content: errMsg, ephemeral: true });
            }
            return interaction.reply({ content: errMsg, ephemeral: true });
          }
        }
      }

      // 3. Manejo de Selección de Canales (ChannelSelectMenu)
      if (interaction.isChannelSelectMenu()) {
        const customId = interaction.customId;

        // ==========================================
        // Channel Selects: Asistente de Configuración (!setup)
        // ==========================================
        if (customId.startsWith('setup_select_channel_history:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden configurar los canales.', ephemeral: true });
          }

          const session = await getOrCreateSetupSession(authorId);
          session.data.historyChannelId = interaction.values[0];
          const payload = await buildSetupStepPayload(session, client);
          return interaction.update(payload);
        }

        if (customId.startsWith('setup_select_channel_admin:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden configurar los canales.', ephemeral: true });
          }

          const session = await getOrCreateSetupSession(authorId);
          session.data.adminChannelId = interaction.values[0];
          const payload = await buildSetupStepPayload(session, client);
          return interaction.update(payload);
        }

        if (
          customId.startsWith('cfg_select_history:') ||
          customId.startsWith('cfg_select_admin:') ||
          customId.startsWith('cfg_select_weekly:')
        ) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden cambiar los canales del sistema.', ephemeral: true });
          }

          const selectedChannelId = interaction.values[0];
          const isHistory = customId.startsWith('cfg_select_history:');
          const isAdmin = customId.startsWith('cfg_select_admin:');
          const configKey = isHistory
            ? 'historyChannelId'
            : isAdmin
              ? 'adminChannelId'
              : 'weeklySummaryChannelId';

          await ConfigService.updateConfig(configKey, selectedChannelId);
          const config = await ConfigService.getConfig(true);

          const historyChannelId = config.historyChannelId || process.env.HISTORY_CHANNEL_ID;
          const adminChannelId = config.adminChannelId || process.env.ADMIN_CHANNEL_ID;
          const weeklyDisplay = config.weeklySummaryChannelId
            ? `<#${config.weeklySummaryChannelId}> (\`${config.weeklySummaryChannelId}\`)`
            : adminChannelId
              ? `<#${adminChannelId}> *(Heredado de Canal de Administración)*`
              : '*No configurado (hereda de Canal de Administración)*';

          const historyDisplay = historyChannelId ? `<#${historyChannelId}> (\`${historyChannelId}\`)` : '*No configurado (usando .env o no asignado)*';
          const adminDisplay = adminChannelId ? `<#${adminChannelId}> (\`${adminChannelId}\`)` : '*No configurado (usando .env o no asignado)*';

          const channelName = isHistory ? 'Historial' : isAdmin ? 'Administración' : 'Resumen Semanal';

          const embed = new EmbedBuilder()
            .setTitle('📢 Configuración de Canales del Sistema')
            .setDescription(
              `✅ **¡Canal de ${isHistory ? 'Historial' : 'Administración'} actualizado exitosamente!**\n\n` +
              `✅ **¡Canal de ${channelName} actualizado exitosamente!**\n\n` +
              `Configura directamente los canales de destino del bot seleccionándolos en los menús inferiores.\n` +
              `Los cambios se guardan permanentemente en la **base de datos SQLite** sin necesidad de editar variables de entorno ni reiniciar el bot.`
            )
            .setColor(EMBED_COLORS.SUCCESS)
            .addFields(
              {
                name: '📜 Canal de Historial (Fichas de Registro)',
                value: historyDisplay,
                inline: false
              },
              {
                name: '👑 Canal de Administración (Órdenes de Pago)',
                value: adminDisplay,
                inline: false
              },
              {
                name: '📊 Canal de Resumen Semanal (Desglose y Ping @everyone)',
                value: weeklyDisplay,
                inline: false
              }
            )
            .setFooter({ text: 'Sonic Gestión Bot • Canales Guardados en Base de Datos' })
            .setTimestamp();

          const historySelectMenu = new ChannelSelectMenuBuilder()
            .setCustomId(`cfg_select_history:${interaction.user.id}`)
            .setPlaceholder('📜 Selecciona el Canal de Historial de Videos...')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

          const adminSelectMenu = new ChannelSelectMenuBuilder()
            .setCustomId(`cfg_select_admin:${interaction.user.id}`)
            .setPlaceholder('👑 Selecciona el Canal de Administración (Pagos)...')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

          const weeklySelectMenu = new ChannelSelectMenuBuilder()
            .setCustomId(`cfg_select_weekly:${interaction.user.id}`)
            .setPlaceholder('📊 Selecciona el Canal de Resumen Semanal...')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

          const row1 = new ActionRowBuilder().addComponents(historySelectMenu);
          const row2 = new ActionRowBuilder().addComponents(adminSelectMenu);
          const row3 = new ActionRowBuilder().addComponents(weeklySelectMenu);

          const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`cfg_refresh_channels:${interaction.user.id}`)
              .setLabel('Actualizar Vista')
              .setEmoji('🔄')
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.update({
            embeds: [embed],
            components: [row1, row2, row3, buttonRow]
          });
        }
      }

      // 4. Botón de Actualizar Canales
      if (interaction.isButton() && interaction.customId.startsWith('cfg_refresh_channels:')) {
        const config = await ConfigService.getConfig(true);

        const historyChannelId = config.historyChannelId || process.env.HISTORY_CHANNEL_ID;
        const adminChannelId = config.adminChannelId || process.env.ADMIN_CHANNEL_ID;
        const weeklyDisplay = config.weeklySummaryChannelId
          ? `<#${config.weeklySummaryChannelId}> (\`${config.weeklySummaryChannelId}\`)`
          : adminChannelId
            ? `<#${adminChannelId}> *(Heredado de Canal de Administración)*`
            : '*No configurado (hereda de Canal de Administración)*';

        const historyDisplay = historyChannelId ? `<#${historyChannelId}> (\`${historyChannelId}\`)` : '*No configurado (usando .env o no asignado)*';
        const adminDisplay = adminChannelId ? `<#${adminChannelId}> (\`${adminChannelId}\`)` : '*No configurado (usando .env o no asignado)*';

        const embed = new EmbedBuilder()
          .setTitle('📢 Configuración de Canales del Sistema')
          .setDescription(
            `Configura directamente los canales de destino del bot seleccionándolos en los menús inferiores.\n` +
            `Los cambios se guardan permanentemente en la **base de datos SQLite** sin necesidad de editar variables de entorno ni reiniciar el bot.`
          )
          .setColor(EMBED_COLORS.PRIMARY)
          .addFields(
            {
              name: '📜 Canal de Historial (Fichas de Registro)',
              value: historyDisplay,
              inline: false
            },
            {
              name: '👑 Canal de Administración (Órdenes de Pago)',
              value: adminDisplay,
              inline: false
            },
            {
              name: '📊 Canal de Resumen Semanal (Desglose y Ping @everyone)',
              value: weeklyDisplay,
              inline: false
            }
          )
          .setFooter({ text: 'Sonic Gestión Bot • Administración' })
          .setTimestamp();

        const historySelectMenu = new ChannelSelectMenuBuilder()
          .setCustomId(`cfg_select_history:${interaction.user.id}`)
          .setPlaceholder('📜 Selecciona el Canal de Historial de Videos...')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

        const adminSelectMenu = new ChannelSelectMenuBuilder()
          .setCustomId(`cfg_select_admin:${interaction.user.id}`)
          .setPlaceholder('👑 Selecciona el Canal de Administración (Pagos)...')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

        const weeklySelectMenu = new ChannelSelectMenuBuilder()
          .setCustomId(`cfg_select_weekly:${interaction.user.id}`)
          .setPlaceholder('📊 Selecciona el Canal de Resumen Semanal...')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

        const row1 = new ActionRowBuilder().addComponents(historySelectMenu);
        const row2 = new ActionRowBuilder().addComponents(adminSelectMenu);
        const row3 = new ActionRowBuilder().addComponents(weeklySelectMenu);

        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`cfg_refresh_channels:${interaction.user.id}`)
            .setLabel('Actualizar Vista')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({
          embeds: [embed],
          components: [row1, row2, row3, buttonRow]
        });
      }

      // 5. Manejo de Selección de Usuarios (UserSelectMenu)
      if (interaction.isUserSelectMenu()) {
        const customId = interaction.customId;

        // Selección de miembro para registro administrativo de talento
        if (customId.startsWith('admreg_select_user:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden gestionar expedientes de talentos.', ephemeral: true });
          }

          const targetId = interaction.values[0];
          let targetUser = client.users.cache.get(targetId);
          if (!targetUser && client.users.fetch) {
            try {
              targetUser = await client.users.fetch(targetId);
            } catch {
              targetUser = { id: targetId, username: `Usuario (${targetId})` };
            }
          }
          if (!targetUser) targetUser = { id: targetId, username: `Usuario (${targetId})` };

          const talent = await TalentService.getTalent(targetId);
          const embed = buildAdminTalentCardEmbed(targetUser, talent);
          const rows = buildAdminTalentCardRows(interaction.user.id, targetId, !!talent);

          return interaction.update({ embeds: [embed], components: rows });
        }

        if (customId.startsWith('vidreg_select_actors:') || customId.startsWith('vidreg_select_editor:')) {
          const parts = customId.split(':');
          const authorId = parts[1];
          const videoId = parts[2];

          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ Solo quien inició el registro o moderadores pueden completar este paso.', ephemeral: true });
          }

          const selectedIds = interaction.values;
          const isActorSelect = customId.startsWith('vidreg_select_actors:');

          // Consultar talentos seleccionados en la base de datos
          const talents = await TalentService.getTalents(selectedIds);
          const talentMap = new Map(talents.map(t => [t.discordId, t]));
          const unregistered = selectedIds.filter(id => !talentMap.has(id));

          if (unregistered.length > 0) {
            const missingMentions = unregistered.map(id => `<@${id}>`).join(', ');
            return interaction.reply({
              content: `❌ Los siguientes usuarios no están registrados como talentos: ${missingMentions}.\nDeben usar \`!registro\` primero.`,
              ephemeral: true
            });
          }

          // Si es selección de actores, procedemos a registrar el video con estos actores
          let actorIds = [];
          let editorId = null;

          if (isActorSelect) {
            actorIds = selectedIds;
          } else {
            editorId = selectedIds[0] || null;
          }

          try {
            const videoRecord = await VideoService.registerVideo({
              youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
              editorDiscordId: editorId,
              actorDiscordIds: actorIds,
              client
            });

            const scheduledUnix = Math.floor(new Date(videoRecord.scheduledCalculationAt).getTime() / 1000);
            const editorDisplay = videoRecord.editorId ? `<@${videoRecord.editorId}>` : '*Ninguno / No asignado*';
            const actorsDisplay = videoRecord.participants && videoRecord.participants.length > 0
              ? videoRecord.participants.map(p => `<@${p.talentId}>`).join(', ')
              : '*Ninguno*';

            const successEmbed = new EmbedBuilder()
              .setTitle('✅ ¡Video Registrado Exitosamente!')
              .setURL(videoRecord.youtubeUrl)
              .setColor(EMBED_COLORS.SUCCESS)
              .setThumbnail(YouTubeService.getThumbnailUrl(videoId))
              .setDescription('El video ha sido registrado correctamente mediante el panel interactivo. Se crearon las fichas de seguimiento.')
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
              .setFooter({ text: `ID Interno: ${videoRecord.id} • Sonic Gestión Bot` })
              .setTimestamp();

            return interaction.update({
              embeds: [successEmbed],
              components: []
            });
          } catch (regError) {
            return interaction.reply({
              content: `❌ **Error al registrar el video:** ${regError.message}`,
              ephemeral: true
            });
          }
        }
      }

      // 6. Manejo de Selección de Cadenas (StringSelectMenu)
      if (interaction.isStringSelectMenu()) {
        const customId = interaction.customId;

        // Selección de video reciente del canal de YouTube
        if (customId.startsWith('vidreg_select_recent_video:')) {
          const [, authorId] = customId.split(':');
          if (interaction.user.id !== authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ Solo quien inició el panel o moderadores pueden seleccionar un video.', ephemeral: true });
          }

          const videoId = interaction.values[0];
          let videoTitle = `Video (${videoId})`;
          try {
            const details = await YouTubeService.getVideoDetails(videoId);
            if (details?.title) videoTitle = details.title;
          } catch {
            // Offline/mock fallback
          }

          const draftId = `${authorId}_${videoId}_${Date.now()}`;
          const draft = {
            id: draftId,
            authorId,
            videoId,
            videoTitle,
            actorIds: [],
            editorId: null,
            createdAt: Date.now()
          };
          videoRegDrafts.set(draftId, draft);

          const payload = await buildTalentSelectionPayload(draft, client);
          return interaction.update(payload);
        }

        // Selección de Actores (SOLO registrados en BD)
        if (customId.startsWith('vidreg_select_registered_actors:')) {
          const [, draftId] = customId.split(':');
          const draft = videoRegDrafts.get(draftId);

          if (!draft) {
            return interaction.reply({ content: '⚠️ La sesión ha expirado o no existe. Vuelve a iniciar con `!registrar-video`.', ephemeral: true });
          }
          if (interaction.user.id !== draft.authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ Solo quien inició el registro o moderadores pueden seleccionar talentos.', ephemeral: true });
          }

          draft.actorIds = interaction.values;
          const payload = await buildTalentSelectionPayload(draft, client);
          return interaction.update(payload);
        }

        // Selección de Editor (SOLO registrados en BD)
        if (customId.startsWith('vidreg_select_registered_editor:')) {
          const [, draftId] = customId.split(':');
          const draft = videoRegDrafts.get(draftId);

          if (!draft) {
            return interaction.reply({ content: '⚠️ La sesión ha expirado o no existe. Vuelve a iniciar con `!registrar-video`.', ephemeral: true });
          }
          if (interaction.user.id !== draft.authorId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ Solo quien inició el registro o moderadores pueden seleccionar talentos.', ephemeral: true });
          }

          draft.editorId = interaction.values[0] || null;
          const payload = await buildTalentSelectionPayload(draft, client);
          return interaction.update(payload);
        }
      }
    } catch (err) {
      console.error('Error in interactionCreate event:', err);
      const canReply = typeof interaction.isRepliable === 'function' ? interaction.isRepliable() : typeof interaction.reply === 'function';
      if (canReply && !interaction.replied && !interaction.deferred) {
        return interaction.reply({ content: `⚠️ Ocurrió un error al procesar la interacción: ${err.message}`, ephemeral: true });
      }
    }
  }
};
