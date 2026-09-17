import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { PermissionFlagsBits } from 'discord.js';
import tarifasCommand from '../../commands/admin/tarifas.js';
import setTarifaCommand from '../../commands/admin/settarifa.js';
import { ConfigService } from '../../src/services/configService.js';
import { prisma } from '../../src/database/prisma.js';

describe('Admin Commands (Unit Tests)', () => {
  beforeEach(async () => {
    ConfigService.invalidateCache();
    await ConfigService.resetDefaults();
  });

  afterAll(async () => {
    ConfigService.invalidateCache();
    await ConfigService.resetDefaults();
    await prisma.$disconnect();
  });

  describe('tarifas command definition and execution', () => {
    it('1. should match discord-bot-architecture command structure', () => {
      expect(tarifasCommand.name).toBe('tarifas');
      expect(tarifasCommand.aliases).toContain('config-tarifas');
      expect(tarifasCommand.aliases).toContain('ver-tarifas');
      expect(tarifasCommand.permisos).toContain(PermissionFlagsBits.Administrator);
      expect(typeof tarifasCommand.run).toBe('function');
    });

    it('2. should execute and reply with formatted embed', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await tarifasCommand.run(null, mockMessage, [], '!');
      expect(repliedPayload).not.toBeNull();
      expect(repliedPayload.embeds).toBeDefined();
      expect(repliedPayload.embeds.length).toBe(1);

      const embedData = repliedPayload.embeds[0].data;
      expect(embedData.title).toContain('Configuración Dinámica');
      expect(embedData.fields.some(f => f.name.includes('Tarifa Base - Actor'))).toBe(true);
      expect(embedData.fields.some(f => f.name.includes('Tarifa Base - Editor'))).toBe(true);
      expect(embedData.fields.some(f => f.name.includes('Bono Umbral 1'))).toBe(true);
      expect(embedData.fields.some(f => f.name.includes('Bono Umbral 2'))).toBe(true);
    });
  });

  describe('set-tarifa command definition and execution', () => {
    it('3. should match discord-bot-architecture command structure', () => {
      expect(setTarifaCommand.name).toBe('set-tarifa');
      expect(setTarifaCommand.aliases).toContain('settarifa');
      expect(setTarifaCommand.aliases).toContain('config-tarifa');
      expect(setTarifaCommand.permisos).toContain(PermissionFlagsBits.Administrator);
      expect(typeof setTarifaCommand.run).toBe('function');
    });

    it('4. should show usage help when args are missing', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await setTarifaCommand.run(null, mockMessage, ['actor_base'], '!');
      expect(repliedPayload.embeds[0].data.title).toContain('Uso Incorrecto');
    });

    it('5. should update rate and reply with confirmation embed', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await setTarifaCommand.run(null, mockMessage, ['actor_base', '35'], '!');
      expect(repliedPayload.embeds[0].data.title).toContain('Tarifa Actualizada');

      const config = await ConfigService.getConfig();
      expect(config.actorBase).toBe(35);
    });

    it('6. should handle invalid values gracefully without throwing unhandled exceptions', async () => {
      let repliedText = null;
      const mockMessage = {
        author: { tag: 'Admin#0001' },
        reply: (payload) => {
          repliedText = typeof payload === 'string' ? payload : payload.content;
          return Promise.resolve(payload);
        }
      };

      await setTarifaCommand.run(null, mockMessage, ['actor_base', 'abc'], '!');
      expect(repliedText).toContain('Error');
    });
  });
});

