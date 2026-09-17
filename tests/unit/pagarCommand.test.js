import { describe, it, expect } from 'bun:test';
import { PermissionFlagsBits } from 'discord.js';
import pagarCommand from '../../commands/admin/pagar.js';
import { NotificationService } from '../../src/services/notificationService.js';
import { VideoService } from '../../src/services/videoService.js';

describe('Admin Pagar Command & Notification Components (Unit Tests)', () => {
  describe('1. pagar Command Structure & Metadata', () => {
    it('1.1 should conform to discord.js command structure', () => {
      expect(pagarCommand.name).toBe('pagar');
      expect(Array.isArray(pagarCommand.aliases)).toBe(true);
      expect(pagarCommand.aliases).toContain('marcar-pagado');
      expect(pagarCommand.aliases).toContain('pagado');
      expect(pagarCommand.aliases).toContain('mark-paid');
      expect(pagarCommand.permisos).toContain(PermissionFlagsBits.Administrator);
      expect(typeof pagarCommand.run).toBe('function');
    });

    it('1.2 should display usage embed when called with no arguments', async () => {
      let sentEmbed = null;
      const mockMessage = {
        author: { tag: 'AdminUser#0001' },
        reply: async (payload) => {
          sentEmbed = payload.embeds?.[0];
          return payload;
        }
      };

      await pagarCommand.run({}, mockMessage, [], '!');
      expect(sentEmbed).not.toBeNull();
      expect(sentEmbed.data.title).toContain('Uso del Comando Pagar');
      expect(sentEmbed.data.description).toContain('!pagar <id_interno_o_enlace_youtube>');
    });
  });

  describe('2. NotificationService Payment Components & Embeds', () => {
    it('2.1 should generate active "Marcar como Pagado" button for CALCULATED video', () => {
      const videoRecord = { id: 'vid_test_123', status: 'CALCULATED' };
      const components = NotificationService.buildAdminPaymentComponents(videoRecord, false);

      expect(Array.isArray(components)).toBe(true);
      expect(components.length).toBe(1);

      const actionRow = components[0];
      const button = actionRow.components[0];
      expect(button.data.custom_id).toBe('order_btn_mark_paid:vid_test_123');
      expect(button.data.label).toBe('Marcar como Pagado');
      expect(button.data.disabled).toBeFalsy();
    });

    it('2.2 should generate disabled "Pagado" button for PAID video', () => {
      const videoRecord = { id: 'vid_test_123', status: 'PAID' };
      const components = NotificationService.buildAdminPaymentComponents(videoRecord, true, 'Admin#0001');

      expect(components.length).toBe(1);
      const button = components[0].components[0];
      expect(button.data.custom_id).toBe('order_btn_paid_done:vid_test_123');
      expect(button.data.label).toBe('Pagado (Admin#0001)');
      expect(button.data.disabled).toBe(true);
    });

    it('2.3 should reflect PAID status in embed when videoRecord status is PAID', () => {
      const settlement = {
        views: 1000000,
        totalPayout: 200,
        videoRecord: {
          id: 'vid_paid_embed',
          youtubeVideoId: 'paid_embed_yt',
          status: 'PAID'
        }
      };

      const embed = NotificationService.buildAdminPaymentOrder(settlement);
      expect(embed).not.toBeNull();

      const estadoField = embed.data.fields.find(f => f.name === '📌 Estado');
      expect(estadoField).toBeDefined();
      expect(estadoField.value).toContain('PAGADO');
    });
  });

  describe('3. VideoService Validation Checks', () => {
    it('3.1 should reject markVideoAsPaid if id is missing or invalid', async () => {
      expect(VideoService.markVideoAsPaid(null)).rejects.toThrow('Debe proporcionar un ID interno');
      expect(VideoService.markVideoAsPaid('')).rejects.toThrow('Debe proporcionar un ID interno');
    });
  });
});
