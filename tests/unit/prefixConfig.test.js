import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../src/database/prisma.js';
import { ConfigService } from '../../src/services/configService.js';
import prefixCmd from '../../commands/admin/prefix.js';
import messageCreateEvent from '../../events/server/messageCreate.js';

describe('Dynamic Prefix Configuration', () => {
  beforeEach(async () => {
    await prisma.config.deleteMany({});
    await ConfigService.init();
  });

  afterAll(async () => {
    await prisma.config.deleteMany({});
    await prisma.$disconnect();
  });

  it('should initialize with default prefix "!"', () => {
    expect(ConfigService.getPrefix()).toBe('!');
  });

  it('should update prefix directly via command with admin permissions', async () => {
    let replyPayload = null;
    const mockMessage = {
      author: { id: 'admin_1', tag: 'Admin#0001' },
      member: { permissions: { has: () => true } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await prefixCmd.run(null, mockMessage, ['?'], '!');

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.embeds[0].data.title).toContain('Prefijo Actualizado');
    expect(ConfigService.getPrefix()).toBe('?');

    const configInDb = await prisma.config.findFirst();
    expect(configInDb.prefix).toBe('?');
  });

  it('should reject invalid prefix (too long or whitespace)', async () => {
    let replyPayload = null;
    const mockMessage = {
      author: { id: 'admin_1', tag: 'Admin#0001' },
      member: { permissions: { has: () => true } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await prefixCmd.run(null, mockMessage, ['superlongprefix'], '!');

    expect(replyPayload).not.toBeNull();
    const replyText = typeof replyPayload === 'string' ? replyPayload : (replyPayload.content || '');
    expect(replyText).toContain('más de 5 caracteres');
    expect(ConfigService.getPrefix()).toBe('!');
  });

  it('should reject non-admin users attempting to change prefix', async () => {
    let replyPayload = null;
    const mockMessage = {
      author: { id: 'regular_user_1', tag: 'User#0001' },
      member: { permissions: { has: () => false } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await prefixCmd.run(null, mockMessage, ['?'], '!');

    expect(replyPayload).not.toBeNull();
    const replyText = typeof replyPayload === 'string' ? replyPayload : (replyPayload.content || '');
    expect(replyText).toContain('permisos');
    expect(ConfigService.getPrefix()).toBe('!');
  });

  it('should show interactive management panel when invoked with no arguments', async () => {
    let replyPayload = null;
    const mockMessage = {
      author: { id: 'admin_1', tag: 'Admin#0001' },
      member: { permissions: { has: () => true } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await prefixCmd.run(null, mockMessage, [], '!');

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.embeds[0].data.title).toContain('Configuración del Prefijo');
    expect(replyPayload.components.length).toBe(1);
    expect(replyPayload.components[0].components.length).toBe(2);
  });

  it('should process messages matching updated prefix and respond to direct bot mentions', async () => {
    await ConfigService.updateConfig('prefix', '.');
    expect(ConfigService.getPrefix()).toBe('.');

    let pingCalled = false;
    const mockClient = {
      user: { id: 'bot_id_123', tag: 'SonicBot#0001' },
      commands: new Map([
        ['ping', {
          name: 'ping',
          aliases: [],
          permisos: [],
          permisos_bot: [],
          run: async () => { pingCalled = true; }
        }]
      ])
    };

    // Message using old prefix should be ignored
    const oldPrefixMsg = {
      content: '!ping',
      author: { bot: false },
      guild: { id: 'guild_1' },
      reply: async () => {}
    };
    await messageCreateEvent.run(mockClient, oldPrefixMsg);
    expect(pingCalled).toBe(false);

    // Message using new prefix should execute command
    const newPrefixMsg = {
      content: '.ping',
      author: { bot: false },
      guild: { id: 'guild_1' },
      member: { permissions: { has: () => true } },
      reply: async () => {}
    };
    await messageCreateEvent.run(mockClient, newPrefixMsg);
    expect(pingCalled).toBe(true);

    // Mentioning the bot should inform user about current prefix
    let mentionReply = null;
    const mentionMsg = {
      content: '<@bot_id_123>',
      author: { bot: false },
      guild: { id: 'guild_1' },
      reply: async (payload) => {
        mentionReply = payload;
        return payload;
      }
    };
    await messageCreateEvent.run(mockClient, mentionMsg);
    expect(mentionReply).not.toBeNull();
    const mentionContent = typeof mentionReply === 'string' ? mentionReply : (mentionReply.content || (mentionReply.embeds && mentionReply.embeds[0]?.data?.description) || '');
    expect(mentionContent).toContain('.');
  });
});
