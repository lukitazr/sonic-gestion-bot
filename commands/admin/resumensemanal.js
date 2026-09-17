import {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { ConfigService } from '../../src/services/configService.js';
import { WeeklySummaryService, parseDayOfWeek, DAYS_OF_WEEK } from '../../src/services/weeklySummaryService.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export default {
  name: 'resumen-semanal',
  aliases: [
    'resumen', 'semanal', 'weekly-summary', 'weeklysummary',
    'resumensemanal', 'resumen_semanal'
  ],
  desc: 'Configura, previsualiza o despacha el resumen semanal de liquidaciones con ping a @everyone.',
  permisos: [PermissionFlagsBits.Administrator],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';
    const subCommand = args[0]?.toLowerCase();

    try {
      // Subcommand 1: Enviar / Now / Force
      if (['enviar', 'now', 'forzar', 'force', 'run'].includes(subCommand)) {
        const loadingMsg = await message.reply('⏳ Procesando pre-liquidación del mismo día y generando el resumen semanal...');
        const result = await WeeklySummaryService.executeWeeklySummary(client, {
          force: true,
          pingEveryone: true
        });

        if (!result.success) {
          return await loadingMsg.edit(`❌ **No se pudo emitir el resumen semanal:** ${result.reason || 'Error desconocido'}`);
        }

        const config = await ConfigService.getConfig();
        const currency = config.currency || 'MXN';
        const targetChannelId = config.weeklySummaryChannelId || config.adminChannelId || process.env.ADMIN_CHANNEL_ID;

        return await loadingMsg.edit(
          `✅ **Resumen Semanal emitido exitosamente:**\n` +
          `• **Canal:** <#${targetChannelId}>\n` +
          `• **Mención:** \`@everyone\` activada\n` +
          `• **Videos Procesados:** \`${result.totalVideos}\`\n` +
          `• **Monto Total:** \`$${result.totalPayout.toFixed(2)} ${currency}\`\n` +
          `• **Vistas Totales:** \`${result.totalViews.toLocaleString()}\``
        );
      }

      // Subcommand 2: Preview / Vista previa sin ping a @everyone
      if (['preview', 'ver', 'previsualizar', 'test'].includes(subCommand)) {
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

        return await message.reply({
          content: '👁️ **[Vista Previa de Administrador]** Así se verá el resumen semanal (sin ping a @everyone):',
          embeds: [previewEmbed],
          components
        });
      }

      // Subcommand 3: Configurar día y hora por comando directo
      if (['config', 'set', 'horario', 'hora', 'dia'].includes(subCommand)) {
        const rawDay = args[1];
        const rawHour = args[2];
        const rawMinute = args[3] ?? 0;

        if (!rawDay || rawHour === undefined) {
          return await message.reply(
            `⚠️ **Uso incorrecto.** Formato:\n` +
            `\`${currentPrefix}resumen-semanal config <dia (0-6 | nombre)> <hora (0-23)> [minuto (0-59)]\`\n` +
            `*Ejemplos:*\n` +
            `• \`${currentPrefix}resumen-semanal config viernes 20\` *(Viernes a las 20:00 hrs)*\n` +
            `• \`${currentPrefix}resumen-semanal config 5 18 30\` *(Viernes a las 18:30 hrs)*`
          );
        }

        const parsedDay = parseDayOfWeek(rawDay);
        if (parsedDay === null) {
          return await message.reply('❌ **Día no válido.** Usa un número del 0 (Domingo) al 6 (Sábado) o un nombre (ej: `viernes`, `lunes`, `domingo`).');
        }

        const hourNum = parseInt(rawHour, 10);
        if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) {
          return await message.reply('❌ **Hora no válida.** Debe ser un número entero entre 0 y 23.');
        }

        const minuteNum = parseInt(rawMinute, 10);
        if (isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) {
          return await message.reply('❌ **Minuto no válido.** Debe ser un número entero entre 0 y 59.');
        }

        await ConfigService.updateConfig('weeklySummaryDay', parsedDay);
        await ConfigService.updateConfig('weeklySummaryHour', hourNum);
        await ConfigService.updateConfig('weeklySummaryMinute', minuteNum);
        const updatedConfig = await ConfigService.getConfig(true);

        const dayName = DAYS_OF_WEEK[updatedConfig.weeklySummaryDay] || 'Desconocido';
        const timeFormatted = `${String(updatedConfig.weeklySummaryHour).padStart(2, '0')}:${String(updatedConfig.weeklySummaryMinute).padStart(2, '0')} hrs`;

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Horario de Resumen Semanal Actualizado')
          .setColor(EMBED_COLORS.SUCCESS)
          .setDescription(
            `El bot emitirá el resumen semanal con ping a \`@everyone\` automáticamente según el nuevo horario programado.`
          )
          .addFields(
            { name: '🗓️ Día de Envío', value: `**${dayName}** (Día ${updatedConfig.weeklySummaryDay})`, inline: true },
            { name: '⏰ Hora de Envío', value: `**${timeFormatted}**`, inline: true },
            { name: '📢 Estado', value: updatedConfig.weeklySummaryEnabled ? '`🟢 ACTIVADO`' : '`🔴 DESACTIVADO`', inline: true }
          )
          .setFooter({ text: `Sonic Gestión • Usa ${currentPrefix}resumen-semanal para gestionar` })
          .setTimestamp();

        return await message.reply({ embeds: [successEmbed] });
      }

      // Subcommand 4: Configurar canal de emisión
      if (['canal', 'channel', 'setcanal', 'set-canal'].includes(subCommand)) {
        const rawChannel = args[1];
        if (!rawChannel) {
          const config = await ConfigService.getConfig();
          const curChannelId = config.weeklySummaryChannelId || config.adminChannelId;
          const display = curChannelId ? `<#${curChannelId}>` : '*No configurado*';
          return await message.reply(`📢 El canal actual del resumen semanal es: ${display}.\nPara cambiarlo usa: \`${currentPrefix}resumen-semanal canal #canal\``);
        }

        const cleanId = rawChannel.replace(/^<#/, '').replace(/>$/, '').trim();
        if (!/^\d{16,21}$/.test(cleanId)) {
          return await message.reply('❌ Debes mencionar un canal válido de Discord (`#canal`) o ingresar su ID numérico.');
        }

        await ConfigService.updateConfig('weeklySummaryChannelId', cleanId);
        return await message.reply(`✅ **Canal de Resumen Semanal actualizado:** Los resúmenes semanales con mención a \`@everyone\` se enviarán a <#${cleanId}>.`);
      }

      // Subcommand 5: Configurar envío opcional por Mensaje Directo (MD)
      if (['md', 'dm', 'privado'].includes(subCommand)) {
        const actionOrUser = args[1];

        // Caso a: !resumen-semanal md enviar [@usuario]
        if (actionOrUser?.toLowerCase() === 'enviar' || actionOrUser?.toLowerCase() === 'send') {
          const targetUserArg = args[2] || message.author.id;
          const cleanId = String(targetUserArg).replace(/^<@!?/, '').replace(/>$/, '').trim();
          const loadingMsg = await message.reply(`⏳ Enviando resumen semanal por mensaje directo a <@${cleanId}>...`);

          const result = await WeeklySummaryService.sendWeeklySummaryDM(client, cleanId);
          if (!result.success) {
            return await loadingMsg.edit(`❌ **No se pudo enviar el DM a <@${cleanId}>:** ${result.error}`);
          }
          return await loadingMsg.edit(`✅ **Resumen semanal enviado por mensaje directo a <@${cleanId}> exitosamente.**`);
        }

        // Caso b: !resumen-semanal md desactivar / off
        if (['desactivar', 'off', 'disable', 'quitar'].includes(actionOrUser?.toLowerCase())) {
          await ConfigService.updateConfig('weeklySummaryDmEnabled', false);
          return await message.reply('🔴 **Envío de resumen semanal por MD desactivado.** Ya no se enviará por mensaje privado de forma automática.');
        }

        // Caso c: !resumen-semanal md activar / on
        if (['activar', 'on', 'enable'].includes(actionOrUser?.toLowerCase())) {
          const config = await ConfigService.getConfig();
          if (!config.weeklySummaryDmUserId) {
            return await message.reply(`⚠️ No hay ningún usuario configurado para recibir el MD. Usa: \`${currentPrefix}resumen-semanal md @usuario\``);
          }
          await ConfigService.updateConfig('weeklySummaryDmEnabled', true);
          return await message.reply(`🟢 **Envío de resumen semanal por MD activado.** Se enviará automáticamente a <@${config.weeklySummaryDmUserId}>.`);
        }

        // Caso d: !resumen-semanal md @usuario
        if (actionOrUser) {
          const cleanId = String(actionOrUser).replace(/^<@!?/, '').replace(/>$/, '').trim();
          if (!/^\d{16,21}$/.test(cleanId)) {
            return await message.reply('❌ Debes mencionar a un usuario válido (`@usuario`) o ingresar su ID numérico.');
          }

          await ConfigService.updateConfig('weeklySummaryDmUserId', cleanId);
          await ConfigService.updateConfig('weeklySummaryDmEnabled', true);

          return await message.reply(
            `✅ **Usuario de recepción por MD configurado:**\n` +
            `• **Destinatario:** <@${cleanId}>\n` +
            `• **Estado:** \`🟢 ACTIVADO\` *(Recibirá una copia del resumen semanal por MD automáticamente)*`
          );
        }

        // Caso e: Consulta del estado actual
        const config = await ConfigService.getConfig();
        const userDisplay = config.weeklySummaryDmUserId ? `<@${config.weeklySummaryDmUserId}>` : '*Ninguno configurado*';
        const statusDisplay = config.weeklySummaryDmEnabled ? '`🟢 ACTIVADO`' : '`🔴 DESACTIVADO`';

        return await message.reply(
          `📩 **Configuración de Envío Opcional por Mensaje Directo (MD):**\n` +
          `• **Usuario Receptor:** ${userDisplay}\n` +
          `• **Estado del Envío:** ${statusDisplay}\n\n` +
          `*Comandos disponibles:*\n` +
          `• \`${currentPrefix}resumen-semanal md @usuario\` -> Asigna usuario y activa el envío\n` +
          `• \`${currentPrefix}resumen-semanal md activar\` -> Activa el envío automático por MD\n` +
          `• \`${currentPrefix}resumen-semanal md desactivar\` -> Pausa el envío automático por MD\n` +
          `• \`${currentPrefix}resumen-semanal md enviar [@usuario]\` -> Envía el resumen por MD ahora mismo`
        );
      }

      // Default: Panel de Estado y Controles Interactivos
      const config = await ConfigService.getConfig();
      const dayName = DAYS_OF_WEEK[config.weeklySummaryDay] ?? 'Viernes';
      const timeFormatted = `${String(config.weeklySummaryHour).padStart(2, '0')}:${String(config.weeklySummaryMinute).padStart(2, '0')} hrs`;
      const targetChannelId = config.weeklySummaryChannelId || config.adminChannelId || process.env.ADMIN_CHANNEL_ID;
      const channelDisplay = targetChannelId ? `<#${targetChannelId}>` : '*No configurado*';

      const lastRunUnix = config.lastWeeklySummaryAt ? Math.floor(new Date(config.lastWeeklySummaryAt).getTime() / 1000) : null;
      const lastRunDisplay = lastRunUnix ? `<t:${lastRunUnix}:F> (<t:${lastRunUnix}:R>)` : '*Ninguno registrado aún*';

      const dmDisplay = config.weeklySummaryDmUserId
        ? `<@${config.weeklySummaryDmUserId}> (${config.weeklySummaryDmEnabled ? '`🟢 Activado`' : '`🔴 Desactivado`'})`
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
            value: config.weeklySummaryEnabled ? '`🟢 ACTIVADO` *(Envío automático encendido)*' : '`🔴 DESACTIVADO` *(Pausado)*',
            inline: false
          },
          {
            name: '🗓️ Día Programado',
            value: `**${dayName}** (Código: \`${config.weeklySummaryDay}\`)`,
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
          },
          {
            name: '💡 Comandos Rápidos por Texto',
            value: `• \`${currentPrefix}resumen-semanal enviar\` -> Emite ahora mismo con ping @everyone\n` +
                   `• \`${currentPrefix}resumen-semanal preview\` -> Muestra la vista previa aquí sin ping\n` +
                   `• \`${currentPrefix}resumen-semanal config <dia> <hora> [minuto]\` -> Cambia el horario\n` +
                   `• \`${currentPrefix}resumen-semanal canal #canal\` -> Cambia el canal de emisión\n` +
                   `• \`${currentPrefix}resumen-semanal md @usuario\` -> Activa el envío opcional al MD de un usuario\n` +
                   `• \`${currentPrefix}resumen-semanal md enviar\` -> Envía el resumen a tu MD ahora mismo`,
            inline: false
          }
        )
        .setFooter({ text: `Sonic Gestión • Administración` })
        .setTimestamp();

      const btnSendNow = new ButtonBuilder()
        .setCustomId(`weekly_action:send_now:${message.author.id}`)
        .setLabel('📢 Enviar Ahora (@everyone)')
        .setStyle(ButtonStyle.Danger);

      const btnPreview = new ButtonBuilder()
        .setCustomId(`weekly_action:preview:${message.author.id}`)
        .setLabel('👁️ Vista Previa')
        .setStyle(ButtonStyle.Primary);

      const btnToggle = new ButtonBuilder()
        .setCustomId(`weekly_action:toggle:${message.author.id}`)
        .setLabel(config.weeklySummaryEnabled ? '⏸️ Pausar Automatización' : '▶️ Activar Automatización')
        .setStyle(config.weeklySummaryEnabled ? ButtonStyle.Secondary : ButtonStyle.Success);

      const btnSendMyDm = new ButtonBuilder()
        .setCustomId(`weekly_action:send_my_dm:${message.author.id}`)
        .setLabel('📩 Enviar a mi MD')
        .setStyle(ButtonStyle.Secondary);

      const actionRow = new ActionRowBuilder().addComponents(btnSendNow, btnPreview, btnToggle, btnSendMyDm);

      return await message.reply({
        embeds: [panelEmbed],
        components: [actionRow]
      });
    } catch (err) {
      console.error('[resumen-semanal] Error ejecutando comando:', err);
      return await message.reply(`❌ Ocurrió un error inesperado al procesar el resumen semanal: ${err.message}`);
    }
  }
};

