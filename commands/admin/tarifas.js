import {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { ConfigService } from '../../src/services/configService.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export function buildTarifasEmbed(config, prefix = '!') {
  return new EmbedBuilder()
    .setTitle('⚙️ Configuración Dinámica de Tarifas y Umbrales')
    .setDescription('A continuación se detallan las tarifas base, bonos por vistas y parámetros activos para las liquidaciones:')
    .setColor(EMBED_COLORS.PRIMARY)
    .addFields(
      {
        name: '🎭 Tarifa Base - Actor',
        value: `**$${config.actorBase.toFixed(2)} ${config.currency}**`,
        inline: true
      },
      {
        name: '🎬 Tarifa Base - Editor',
        value: `**$${config.editorBase.toFixed(2)} ${config.currency}**`,
        inline: true
      },
      {
        name: '💵 Moneda / Divisa',
        value: `**${config.currency}**`,
        inline: true
      },
      {
        name: `🎯 Bono Umbral 1 (≥ ${config.threshold1.toLocaleString()} vistas)`,
        value: `**+$${config.bonus1.toFixed(2)} ${config.currency}** (para editor y actores)`,
        inline: false
      },
      {
        name: `🚀 Bono Umbral 2 (≥ ${config.threshold2.toLocaleString()} vistas)`,
        value: `**+$${config.bonus2.toFixed(2)} ${config.currency}** (para editor y actores)`,
        inline: false
      },
      {
        name: '⏳ Plazo de Liquidación',
        value: `**${config.waitDays} días** tras la publicación del video`,
        inline: false
      }
    )
    .setFooter({
      text: `Usa los botones inferiores para editar parámetros en grupo o ${prefix}set-tarifa <parámetro> <nuevo_valor>`
    })
    .setTimestamp();
}

export function buildTarifasActionRows(authorId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg_modal_rates:${authorId}`)
      .setLabel('Editar Tarifas y Divisa')
      .setEmoji('💵')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`cfg_modal_bonuses:${authorId}`)
      .setLabel('Editar Umbrales y Bonos')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg_modal_waitdays:${authorId}`)
      .setLabel('Editar Días de Espera')
      .setEmoji('⏳')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cfg_refresh_rates:${authorId}`)
      .setLabel('Actualizar Vista')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

export default {
  name: 'tarifas',
  aliases: [
    'config-tarifas', 'ver-tarifas', 'editar-tarifas', 'config-tarifa',
    'tarifa', 'precios', 'precio', 'tasas', 'tasa',
    'rates', 'rate', 'pricing', 'fees', 'fee',
    'vertarifas', 'configtarifas', 'editartarifas', 'panel-tarifas', 'tarifas-panel'
  ],
  desc: 'Muestra la tabla de tarifas y permite modificarlas mediante interfaz interactiva o por comando.',
  permisos: [PermissionFlagsBits.Administrator],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';

    try {
      const config = await ConfigService.getConfig();
      const embed = buildTarifasEmbed(config, currentPrefix);
      const authorId = message?.author?.id || 'admin';
      const rows = buildTarifasActionRows(authorId);

      return message.reply({ embeds: [embed], components: rows });
    } catch (error) {
      console.error('Error in command tarifas:', error);
      return message.reply(`❌ Ocurrió un error al consultar las tarifas: ${error.message}`);
    }
  }
};
