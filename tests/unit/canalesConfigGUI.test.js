import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import canalesCmd from '../../commands/admin/canales.js';
import interactionEvent from '../../events/server/interactionCreate.js';
import { ConfigService } from '../../src/services/configService.js';
import { prisma } from '../../src/database/prisma.js';
import { PermissionFlagsBits, ChannelSelectMenuBuilder } from 'discord.js';

describe('Admin Canales GUI & Database Persistence', () => {
  beforeEach(async () => {
    await prisma.config.deleteMany({});
    await ConfigService.init();
  });

  afterAll(async () => {
    await prisma.config.deleteMany({});
    await prisma.$disconnect();
  });

  it('should respond to !canales with channel select menus and refresh button', async () => {
    let replyPayload = null;
    const mockMessage = {
      author: { id: 'admin_user_1', tag: 'Admin#0001' },
      member: { permissions: { has: () => true } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await canalesCmd.run(null, mockMessage, [], '!');

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.embeds.length).toBe(1);
    expect(replyPayload.embeds[0].data.title).toContain('Configuración de Canales');
    expect(replyPayload.components.length).toBe(4);
  });

  it('should save historyChannelId in SQLite DB when selected via ChannelSelectMenu', async () => {
    let updatePayload = null;
    const mockInteraction = {
      isButton: () => false,
      isChannelSelectMenu: () => true,
      customId: 'cfg_select_history:admin_user_1',
      user: { id: 'admin_user_1' },
      memberPermissions: { has: (perm) => perm === PermissionFlagsBits.Administrator },
      values: ['987654321098765432'],
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      },
      reply: async (payload) => payload
    };

    await interactionEvent.run(null, mockInteraction);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload.embeds[0].data.description).toContain('Historial actualizado exitosamente');

    const config = await ConfigService.getConfig(true);
    expect(config.historyChannelId).toBe('987654321098765432');
  });

  it('should save adminChannelId in SQLite DB when selected via ChannelSelectMenu', async () => {
    let updatePayload = null;
    const mockInteraction = {
      isButton: () => false,
      isChannelSelectMenu: () => true,
      customId: 'cfg_select_admin:admin_user_1',
      user: { id: 'admin_user_1' },
      memberPermissions: { has: (perm) => perm === PermissionFlagsBits.Administrator },
      values: ['112233445566778899'],
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      },
      reply: async (payload) => payload
    };

    await interactionEvent.run(null, mockInteraction);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload.embeds[0].data.description).toContain('Administración actualizado exitosamente');

    const config = await ConfigService.getConfig(true);
    expect(config.adminChannelId).toBe('112233445566778899');
  });

  it('should save weeklySummaryChannelId in SQLite DB when selected via ChannelSelectMenu', async () => {
    let updatePayload = null;
    const mockInteraction = {
      isButton: () => false,
      isChannelSelectMenu: () => true,
      customId: 'cfg_select_weekly:admin_user_1',
      user: { id: 'admin_user_1' },
      memberPermissions: { has: (perm) => perm === PermissionFlagsBits.Administrator },
      values: ['334455667788990011'],
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      },
      reply: async (payload) => payload
    };

    await interactionEvent.run(null, mockInteraction);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload.embeds[0].data.description).toContain('Resumen Semanal actualizado exitosamente');

    const config = await ConfigService.getConfig(true);
    expect(config.weeklySummaryChannelId).toBe('334455667788990011');
  });

  it('should update channel IDs via !set-tarifa canal_historial / canal_admin / canal_resumen directly', async () => {
    const res1 = await ConfigService.updateConfig('canal_historial', '123456789012345678');
    expect(res1.newValue).toBe('123456789012345678');

    const res2 = await ConfigService.updateConfig('canal_admin', '<#876543210987654321>');
    expect(res2.newValue).toBe('876543210987654321');

    const res3 = await ConfigService.updateConfig('canal_resumen', '<#334455667788990011>');
    expect(res3.newValue).toBe('334455667788990011');

    const config = await ConfigService.getConfig(true);
    expect(config.historyChannelId).toBe('123456789012345678');
    expect(config.adminChannelId).toBe('876543210987654321');
    expect(config.weeklySummaryChannelId).toBe('334455667788990011');
  });
});
