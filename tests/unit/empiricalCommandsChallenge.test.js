import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import tarifasCommand from '../../commands/admin/tarifas.js';
import setTarifaCommand from '../../commands/admin/settarifa.js';
import messageCreateEvent from '../../events/server/messageCreate.js';
import { ConfigService } from '../../src/services/configService.js';
import { EMBED_COLORS, DEFAULT_CONFIG, CONFIG_KEY_ALIASES } from '../../src/config/constants.js';
import { prisma } from '../../src/database/prisma.js';

describe('Empirical Challenge: Discord Admin Commands & Permissions', () => {
  beforeEach(async () => {
    await ConfigService.resetDefaults();
  });

  afterAll(async () => {
    await ConfigService.resetDefaults();
    await prisma.$disconnect();
  });

  describe('1. Command Interface & Contract Specification', () => {
    it('tarifas command should expose valid metadata and Administrator permission', () => {
      expect(tarifasCommand.name).toBe('tarifas');
      expect(Array.isArray(tarifasCommand.aliases)).toBe(true);
      expect(tarifasCommand.aliases).toContain('config-tarifas');
      expect(tarifasCommand.aliases).toContain('ver-tarifas');
      expect(tarifasCommand.desc).toBeDefined();
      expect(typeof tarifasCommand.desc).toBe('string');
      expect(tarifasCommand.permisos).toEqual([PermissionFlagsBits.Administrator]);
      expect(tarifasCommand.permisos_bot).toContain(PermissionFlagsBits.SendMessages);
      expect(tarifasCommand.permisos_bot).toContain(PermissionFlagsBits.EmbedLinks);
      expect(typeof tarifasCommand.run).toBe('function');
    });

    it('set-tarifa command should expose valid metadata and Administrator permission', () => {
      expect(setTarifaCommand.name).toBe('set-tarifa');
      expect(Array.isArray(setTarifaCommand.aliases)).toBe(true);
      expect(setTarifaCommand.aliases).toContain('settarifa');
      expect(setTarifaCommand.aliases).toContain('config-tarifa');
      expect(setTarifaCommand.desc).toBeDefined();
      expect(typeof setTarifaCommand.desc).toBe('string');
      expect(setTarifaCommand.permisos).toEqual([PermissionFlagsBits.Administrator]);
      expect(setTarifaCommand.permisos_bot).toContain(PermissionFlagsBits.SendMessages);
      expect(setTarifaCommand.permisos_bot).toContain(PermissionFlagsBits.EmbedLinks);
      expect(typeof setTarifaCommand.run).toBe('function');
    });
  });

  describe('2. Security & Permission Interception via messageCreate Event', () => {
    const createMockClient = () => {
      const commands = new Map();
      const aliases = new Map();

      commands.set(tarifasCommand.name, tarifasCommand);
      tarifasCommand.aliases.forEach(a => aliases.set(a, tarifasCommand.name));

      commands.set(setTarifaCommand.name, setTarifaCommand);
      setTarifaCommand.aliases.forEach(a => aliases.set(a, setTarifaCommand.name));

      return { commands, aliases };
    };

    it('should reject non-admin users attempting !tarifas', async () => {
      const client = createMockClient();
      let replyContent = null;

      const nonAdminMessage = {
        author: { bot: false, tag: 'User#1234' },
        guild: {
          members: {
            me: {
              permissions: new PermissionsBitField([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
            }
          }
        },
        member: {
          permissions: new PermissionsBitField([])
        },
        content: '!tarifas',
        reply: (payload) => {
          replyContent = typeof payload === 'string' ? payload : payload.content;
          return Promise.resolve(payload);
        }
      };

      await messageCreateEvent.run(client, nonAdminMessage);
      expect(replyContent).toContain('No tienes los permisos necesarios');
    });

    it('should allow admin users to execute !tarifas via messageCreate', async () => {
      const client = createMockClient();
      let repliedPayload = null;

      const adminMessage = {
        author: { bot: false, tag: 'Admin#9999' },
        guild: {
          members: {
            me: {
              permissions: new PermissionsBitField([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
            }
          }
        },
        member: {
          permissions: new PermissionsBitField([PermissionFlagsBits.Administrator])
        },
        content: '!tarifas',
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await messageCreateEvent.run(client, adminMessage);
      expect(repliedPayload).not.toBeNull();
      expect(repliedPayload.embeds).toBeDefined();
      expect(repliedPayload.embeds.length).toBe(1);
    });

    it('should reject execution if bot lacks required permissions (SendMessages/EmbedLinks)', async () => {
      const client = createMockClient();
      let replyContent = null;

      const adminMessageNoBotPerms = {
        author: { bot: false, tag: 'Admin#9999' },
        guild: {
          members: {
            me: {
              permissions: new PermissionsBitField([])
            }
          }
        },
        member: {
          permissions: new PermissionsBitField([PermissionFlagsBits.Administrator])
        },
        content: '!tarifas',
        reply: (payload) => {
          replyContent = typeof payload === 'string' ? payload : payload.content;
          return Promise.resolve(payload);
        }
      };

      await messageCreateEvent.run(client, adminMessageNoBotPerms);
      expect(replyContent).toContain('No tengo los permisos necesarios');
    });

    it('should route command aliases correctly through messageCreate', async () => {
      const client = createMockClient();
      let repliedPayload = null;

      const adminMessage = {
        author: { bot: false, tag: 'Admin#9999' },
        guild: {
          members: {
            me: {
              permissions: new PermissionsBitField([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
            }
          }
        },
        member: {
          permissions: new PermissionsBitField([PermissionFlagsBits.Administrator])
        },
        content: '!config-tarifas',
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await messageCreateEvent.run(client, adminMessage);
      expect(repliedPayload).not.toBeNull();
      expect(repliedPayload.embeds[0].data.title).toContain('Configuración Dinámica');
    });
  });

  describe('3. Embed Structure & Data Accuracy in !tarifas', () => {
    it('should generate complete embed with default configuration values', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { tag: 'Owner#0001' },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await tarifasCommand.run(null, mockMessage, [], '!');

      expect(repliedPayload).toBeDefined();
      expect(repliedPayload.embeds).toBeDefined();
      expect(repliedPayload.embeds.length).toBe(1);

      const embed = repliedPayload.embeds[0].data;
      expect(embed.title).toBe('⚙️ Configuración Dinámica de Tarifas y Umbrales');
      expect(embed.color).toBe(parseInt(EMBED_COLORS.PRIMARY.replace('#', ''), 16));

      const fields = embed.fields;
      expect(fields.length).toBe(6);

      const actorField = fields.find(f => f.name.includes('Tarifa Base - Actor'));
      expect(actorField.value).toBe('**$25.00 MXN**');
      expect(actorField.inline).toBe(true);

      const editorField = fields.find(f => f.name.includes('Tarifa Base - Editor'));
      expect(editorField.value).toBe('**$125.00 MXN**');
      expect(editorField.inline).toBe(true);

      const currencyField = fields.find(f => f.name.includes('Moneda / Divisa'));
      expect(currencyField.value).toBe('**MXN**');
      expect(currencyField.inline).toBe(true);

      const bonus1Field = fields.find(f => f.name.includes('Bono Umbral 1'));
      expect(bonus1Field.value).toBe('**+$25.00 MXN** (para editor y actores)');
      expect(bonus1Field.name).toContain(DEFAULT_CONFIG.threshold1.toLocaleString());

      const bonus2Field = fields.find(f => f.name.includes('Bono Umbral 2'));
      expect(bonus2Field.value).toBe('**+$25.00 MXN** (para editor y actores)');
      expect(bonus2Field.name).toContain(DEFAULT_CONFIG.threshold2.toLocaleString());

      const waitDaysField = fields.find(f => f.name.includes('Plazo de Liquidación'));
      expect(waitDaysField.value).toBe('**5 días** tras la publicación del video');

      expect(embed.footer.text).toContain('!set-tarifa <parámetro> <nuevo_valor>');
    });

    it('should respect custom prefix in embed footer', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { tag: 'Owner#0001' },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await tarifasCommand.run(null, mockMessage, [], '.');
      expect(repliedPayload.embeds[0].data.footer.text).toContain('.set-tarifa');
    });
  });

  describe('4. Argument Parsing, Edge Cases & Error Handling in !set-tarifa', () => {
    it('should return usage warning embed when 0 arguments provided', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (p) => { repliedPayload = p; return Promise.resolve(p); }
      };

      await setTarifaCommand.run(null, mockMessage, [], '!');
      expect(repliedPayload.embeds).toBeDefined();
      expect(repliedPayload.embeds[0].data.title).toContain('Uso Incorrecto');
      expect(repliedPayload.embeds[0].data.color).toBe(parseInt(EMBED_COLORS.WARNING.replace('#', ''), 16));
    });

    it('should return usage warning embed when only 1 argument provided', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (p) => { repliedPayload = p; return Promise.resolve(p); }
      };

      await setTarifaCommand.run(null, mockMessage, ['actor_base'], '!');
      expect(repliedPayload.embeds[0].data.title).toContain('Uso Incorrecto');
    });

    it('should return error reply when parameter name is unknown', async () => {
      let repliedText = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (p) => { repliedText = typeof p === 'string' ? p : p.content; return Promise.resolve(p); }
      };

      await setTarifaCommand.run(null, mockMessage, ['parametro_fantasma', '100'], '!');
      expect(repliedText).toContain('Parámetro desconocido');
    });

    it('should reject negative numbers for numeric rates', async () => {
      let repliedText = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (p) => { repliedText = typeof p === 'string' ? p : p.content; return Promise.resolve(p); }
      };

      await setTarifaCommand.run(null, mockMessage, ['actor_base', '-10'], '!');
      expect(repliedText).toContain('no puede ser menor que 0');
    });

    it('should reject invalid string for float parameters', async () => {
      let repliedText = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (p) => { repliedText = typeof p === 'string' ? p : p.content; return Promise.resolve(p); }
      };

      await setTarifaCommand.run(null, mockMessage, ['editor_base', 'no_es_numero'], '!');
      expect(repliedText).toContain('requiere un número decimal o entero válido');
    });

    it('should reject non-integer or negative for waitDays', async () => {
      let repliedText = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (p) => { repliedText = typeof p === 'string' ? p : p.content; return Promise.resolve(p); }
      };

      await setTarifaCommand.run(null, mockMessage, ['dias_espera', '0'], '!');
      expect(repliedText).toContain('no puede ser menor que 1');
    });

    it('should reject out-of-order threshold updates (threshold1 >= threshold2)', async () => {
      let repliedText = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (p) => { repliedText = typeof p === 'string' ? p : p.content; return Promise.resolve(p); }
      };

      // Current threshold2 is 1,000,000. Try setting threshold1 to 1,200,000
      await setTarifaCommand.run(null, mockMessage, ['umbral_1', '1200000'], '!');
      expect(repliedText).toContain('no puede ser mayor o igual que el Umbral 2');
    });

    it('should reject out-of-order threshold updates (threshold2 <= threshold1)', async () => {
      let repliedText = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (p) => { repliedText = typeof p === 'string' ? p : p.content; return Promise.resolve(p); }
      };

      // Current threshold1 is 500,000. Try setting threshold2 to 400,000
      await setTarifaCommand.run(null, mockMessage, ['umbral_2', '400000'], '!');
      expect(repliedText).toContain('no puede ser menor o igual que el Umbral 1');
    });
  });

  describe('5. Comprehensive Key Aliases & State Mutation Stress Test', () => {
    it('should correctly update each parameter across all known aliases', async () => {
      const aliasTests = [
        { alias: 'actor', value: '30.50', expectedKey: 'actorBase', expectedVal: 30.5 },
        { alias: 'actor_base', value: '35', expectedKey: 'actorBase', expectedVal: 35.0 },
        { alias: 'editor_base', value: '140.75', expectedKey: 'editorBase', expectedVal: 140.75 },
        { alias: 'bono_500k', value: '30', expectedKey: 'bonus1', expectedVal: 30.0 },
        { alias: 'bono_1m', value: '45', expectedKey: 'bonus2', expectedVal: 45.0 },
        { alias: 'umbral_1', value: '400000', expectedKey: 'threshold1', expectedVal: 400000 },
        { alias: 'umbral_2', value: '1500000', expectedKey: 'threshold2', expectedVal: 1500000 },
        { alias: 'moneda', value: 'usd', expectedKey: 'currency', expectedVal: 'USD' },
        { alias: 'dias_espera', value: '7', expectedKey: 'waitDays', expectedVal: 7 }
      ];

      for (const item of aliasTests) {
        let repliedPayload = null;
        const mockMessage = {
          author: { tag: 'AdminTester#0001' },
          reply: (p) => { repliedPayload = p; return Promise.resolve(p); }
        };

        await setTarifaCommand.run(null, mockMessage, [item.alias, item.value], '!');

        expect(repliedPayload).toBeDefined();
        expect(repliedPayload.embeds).toBeDefined();
        expect(repliedPayload.embeds[0].data.title).toContain('Tarifa Actualizada');
        expect(repliedPayload.embeds[0].data.color).toBe(parseInt(EMBED_COLORS.SUCCESS.replace('#', ''), 16));

        // Verify in ConfigService in-memory state
        const config = await ConfigService.getConfig();
        expect(config[item.expectedKey]).toBe(item.expectedVal);

        // Verify in SQLite database
        const dbRow = await prisma.config.findUnique({ where: { id: 1 } });
        expect(dbRow[item.expectedKey]).toBe(item.expectedVal);
      }
    });

    it('should reflect updated rates immediately in subsequent !tarifas command', async () => {
      // 1. Update actor_base to 50
      const mockMsgSet = {
        author: { tag: 'Admin#0001' },
        reply: () => Promise.resolve()
      };
      await setTarifaCommand.run(null, mockMsgSet, ['actor_base', '50'], '!');

      // 2. Query !tarifas
      let repliedPayload = null;
      const mockMsgView = {
        author: { tag: 'Admin#0001' },
        reply: (p) => { repliedPayload = p; return Promise.resolve(p); }
      };
      await tarifasCommand.run(null, mockMsgView, [], '!');

      const fields = repliedPayload.embeds[0].data.fields;
      const actorField = fields.find(f => f.name.includes('Tarifa Base - Actor'));
      expect(actorField.value).toBe('**$50.00 MXN**');
    });
  });
});
