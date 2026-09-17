import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { ConfigService } from '../../src/services/configService.js';
import { EMBED_COLORS, CONFIG_FIELD_META } from '../../src/config/constants.js';

export default {
  name: 'set-tarifa',
  aliases: [
    'settarifa', 'config-tarifa', 'cambiar-tarifa', 'modificar-tarifa',
    'set-tarifas', 'settarifas', 'editar-tarifa', 'editartarifa',
    'set-rate', 'setrate', 'set-price', 'setprice',
    'update-tarifa', 'updatetarifa', 'set-fee', 'setfee'
  ],
  desc: 'Actualiza dinámicamente un parámetro de tarifa, bono, umbral o plazo.',
  permisos: [PermissionFlagsBits.Administrator],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';

    if (!args || args.length < 2) {
      const validFields = Object.keys(CONFIG_FIELD_META)
        .map(f => `\`${f}\``)
        .join(', ');

      const usageEmbed = new EmbedBuilder()
        .setTitle('⚠️ Uso Incorrecto del Comando')
        .setDescription(`Uso: \`${currentPrefix}set-tarifa <parámetro> <nuevo_valor>\`\n\n**Parámetros reconocidos:**\n${validFields}\n\n**Alias soportados:**\n\`actor_base\`, \`editor_base\`, \`bono_500k\`, \`bono_1m\`, \`umbral_1\`, \`umbral_2\`, \`dias_espera\`, \`moneda\`\n\n**Ejemplos:**\n- \`${currentPrefix}set-tarifa actor_base 30\`\n- \`${currentPrefix}set-tarifa editor_base 150\`\n- \`${currentPrefix}set-tarifa bono_500k 35\`\n- \`${currentPrefix}set-tarifa bono_1m 40\`\n- \`${currentPrefix}set-tarifa umbral_1 600000\`\n- \`${currentPrefix}set-tarifa dias_espera 7\``)
        .setColor(EMBED_COLORS.WARNING);

      return message.reply({ embeds: [usageEmbed] });
    }

    const [paramKey, ...valueParts] = args;
    const rawValue = valueParts.join(' ');

    try {
      const result = await ConfigService.updateConfig(paramKey, rawValue);

      const formatVal = (val, meta) => {
        if (meta.unit === 'currency') return `$${Number(val).toFixed(2)} ${result.config.currency}`;
        if (meta.unit === 'views') return `${Number(val).toLocaleString()} vistas`;
        if (meta.unit === 'days') return `${val} días`;
        return `${val}`;
      };

      const oldFormatted = formatVal(result.oldValue, result.meta);
      const newFormatted = formatVal(result.newValue, result.meta);

      const embed = new EmbedBuilder()
        .setTitle('✅ Tarifa Actualizada Exitosamente')
        .setDescription(`Se ha modificado el parámetro **${result.meta.label}** (\`${result.key}\`) en la configuración del sistema. Los cálculos subsiguientes aplicarán este nuevo valor inmediatamente.`)
        .setColor(EMBED_COLORS.SUCCESS)
        .addFields(
          {
            name: 'Valor Anterior',
            value: `\`${oldFormatted}\``,
            inline: true
          },
          {
            name: 'Nuevo Valor',
            value: `**\`${newFormatted}\`**`,
            inline: true
          }
        )
        .setFooter({ text: `Actualizado por ${message.author?.tag || 'Admin'}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in set-tarifa command:', error);
      return message.reply(`❌ **Error al actualizar:** ${error.message}`);
    }
  }
};

