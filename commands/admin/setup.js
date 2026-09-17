import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} from 'discord.js';
import { EMBED_COLORS } from '../../src/config/constants.js';
import { getOrCreateSetupSession } from '../../events/server/interactionCreate.js';

export default {
  name: 'setup',
  alias: [
    'config-setup', 'setup-bot', 'inicializar', 'configurar',
    'config-wizard', 'wizard', 'bot-setup', 'asistente-config',
    'configuracion-inicial', 'setupbot'
  ],
  aliases: [
    'config-setup', 'setup-bot', 'inicializar', 'configurar',
    'config-wizard', 'wizard', 'bot-setup', 'asistente-config',
    'configuracion-inicial', 'setupbot'
  ],
  desc: 'Asistente interactivo guiado para configurar todos los parámetros variables del bot en una sola sesión (prefijo, canales, YouTube, tarifas, bonos y umbrales).',
  uso: '!setup',
  permisos: [PermissionFlagsBits.Administrator],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    // 1. Verificación de permisos de administrador
    if (message.member && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({
        content: '⛔ No tienes permisos suficientes para usar este comando. Se requiere el permiso de **Administrador**.'
      });
    }

    try {
      // 2. Inicializar o resetear el borrador de configuración en memoria para este administrador
      const session = await getOrCreateSetupSession(message.author.id, true);

      // 3. Crear embed de bienvenida al asistente
      const embed = new EmbedBuilder()
        .setTitle('🛠️ Asistente de Configuración Integral')
        .setDescription(
          '¡Bienvenido al asistente guiado de configuración de **Sonic Gestión Bot**!\n\n' +
          'A través de esta sucesión interactiva podrás revisar y modificar todos los parámetros variables del sistema antes de aplicarlos de forma segura en la base de datos:\n\n' +
          '1. 🔤 **Prefijo del Bot:** Carácter activador de comandos (ej. `!`, `?`, `.`).\n' +
          '2. 📢 **Canales del Servidor:** Canal de historial público y canal privado de administración.\n' +
          '3. 🎬 **Canal de YouTube:** Enlace o handle del canal oficial para selector de últimos videos.\n' +
          '4. 💰 **Tarifas Base:** Montos garantizados para Actores y Editores.\n' +
          '5. 🎯 **Bonos y Umbrales:** Metas de vistas (ej. 500k, 1M) y montos adicionales.\n' +
          '6. ⚙️ **Ajustes Generales:** Moneda de liquidación (ej. `MXN`, `USD`) y días de espera.\n\n' +
          '💡 *Los cambios se mantendrán en un borrador temporal y solo se guardarán en la base de datos tras tu confirmación en el resumen final.*'
        )
        .setColor(EMBED_COLORS.PRIMARY)
        .setFooter({ text: 'Sonic Gestión Bot • Asistente de Configuración' })
        .setTimestamp();

      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_btn_step:prefix:${message.author.id}`)
          .setLabel('Comenzar Asistente (Paso 1)')
          .setEmoji('🚀')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`setup_btn_cancel:${message.author.id}`)
          .setLabel('Cancelar')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Secondary)
      );

      return message.reply({
        embeds: [embed],
        components: [buttonsRow]
      });
    } catch (error) {
      console.error('Error en comando setup:', error);
      return message.reply(`❌ Ocurrió un error al iniciar el asistente de configuración: ${error.message}`);
    }
  }
};

