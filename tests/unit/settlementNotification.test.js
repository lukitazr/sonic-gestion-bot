import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { NotificationService } from '../../src/services/notificationService.js';
import { DEFAULT_CONFIG, EMBED_COLORS } from '../../src/config/constants.js';

describe('Milestone 5: Settlement Dispatch & Notifications (Unit Tests)', () => {
  const sampleConfig = {
    actorBase: 25.0,
    editorBase: 125.0,
    threshold1: 500000,
    bonus1: 25.0,
    threshold2: 1000000,
    bonus2: 25.0,
    currency: 'MXN',
    waitDays: 5
  };

  const sampleVideoRecord = {
    id: 'vid_uuid_123',
    youtubeVideoId: 'dQw4w9WgXcQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    videoTitle: 'Sonic Unleashed Final Boss Gameplay',
    editorId: 'ed_111',
    status: 'CALCULATED',
    calculatedAt: new Date()
  };

  const sampleSettlement = {
    views: 1250000,
    config: sampleConfig,
    editor: {
      talent: {
        discordId: 'ed_111',
        role: 'EDITOR',
        paypal: 'editor@paypal.com',
        binance: 'BINANCE_ED_99'
      },
      payout: {
        role: 'EDITOR',
        base: 125,
        bonus1: 25,
        bonus2: 25,
        totalBonus: 50,
        total: 175,
        threshold1Passed: true,
        threshold2Passed: true,
        currency: 'MXN'
      }
    },
    actors: [
      {
        talent: {
          discordId: 'act_222',
          role: 'ACTOR',
          paypal: 'actor1@paypal.com',
          binance: null
        },
        payout: {
          role: 'ACTOR',
          base: 25,
          bonus1: 25,
          bonus2: 25,
          totalBonus: 50,
          total: 75,
          threshold1Passed: true,
          threshold2Passed: true,
          currency: 'MXN'
        }
      },
      {
        talent: {
          discordId: 'act_333',
          role: 'ACTOR',
          paypal: null,
          binance: 'BINANCE_ACT2'
        },
        payout: {
          role: 'ACTOR',
          base: 25,
          bonus1: 25,
          bonus2: 25,
          totalBonus: 50,
          total: 75,
          threshold1Passed: true,
          threshold2Passed: true,
          currency: 'MXN'
        }
      }
    ],
    totalPayout: 325,
    videoRecord: sampleVideoRecord
  };

  // =========================================================================
  // 1. Admin Payment Order Embed Builder
  // =========================================================================
  describe('1. Admin Payment Order Embed (buildAdminPaymentOrder)', () => {
    it('1.1 should construct complete payment order embed with all required fields', () => {
      const embed = NotificationService.buildAdminPaymentOrder(sampleSettlement);

      expect(embed.data.title).toBe('💰 Orden de Pago y Liquidación de Video');
      expect(embed.data.color).toBe(parseInt(EMBED_COLORS.GOLD.replace('#', ''), 16));

      const fields = embed.data.fields;
      expect(fields.length).toBeGreaterThanOrEqual(4);

      const videoField = fields.find(f => f.name === '📺 Video');
      expect(videoField).toBeDefined();
      expect(videoField.value).toContain('dQw4w9WgXcQ');

      const viewsField = fields.find(f => f.name === '📊 Vistas Finales');
      expect(viewsField).toBeDefined();
      expect(viewsField.value).toMatch(/1[.,]250[.,]000/);

      const totalField = fields.find(f => f.name === '💵 Total Liquidado');
      expect(totalField).toBeDefined();
      expect(totalField.value).toContain('$325 MXN');

      const breakdownField = fields.find(f => f.name === '📋 Desglose y Cuentas');
      expect(breakdownField).toBeDefined();
      expect(breakdownField.value).toContain('=== MÉTODOS DE PAGO ===');
      expect(breakdownField.value).toContain('[EDITOR] ed_111');
      expect(breakdownField.value).toContain('PayPal: editor@paypal.com');
      expect(breakdownField.value).toContain('Binance: BINANCE_ED_99');
      expect(breakdownField.value).toContain('[ACTOR] act_222');
      expect(breakdownField.value).toContain('PayPal: actor1@paypal.com');
      expect(breakdownField.value).toContain('[ACTOR] act_333');
      expect(breakdownField.value).toContain('Binance: BINANCE_ACT2');
      expect(breakdownField.value).toContain('TOTAL GENERAL: $325 MXN');
      expect(breakdownField.value.startsWith('```')).toBe(true);
      expect(breakdownField.value.endsWith('```')).toBe(true);

      const checkoutField = fields.find(f => f.name.includes('Enlaces Directos de Checkout'));
      expect(checkoutField).toBeDefined();
      expect(checkoutField.value).toContain('Pagar en PayPal');
      expect(checkoutField.value).toContain('Pagar en Binance Pay');
    });

    it('1.2 should render direct paypal.me payment links when paypal.me handle is stored', () => {
      const paypalMeSettlement = {
        views: 600000,
        config: sampleConfig,
        editor: {
          talent: {
            discordId: 'ed_me',
            role: 'EDITOR',
            paypal: 'paypal.me/editor_pro',
            binance: 'https://app.binance.com/qr/dplk12345'
          },
          payout: { total: 150 }
        },
        actors: [
          {
            talent: {
              discordId: 'act_me',
              role: 'ACTOR',
              paypal: 'https://paypal.me/actor_star',
              binance: '998877'
            },
            payout: { total: 50 }
          }
        ],
        totalPayout: 200,
        videoRecord: sampleVideoRecord
      };

      const embed = NotificationService.buildAdminPaymentOrder(paypalMeSettlement);
      const checkoutField = embed.data.fields.find(f => f.name.includes('Enlaces Directos de Checkout'));

      expect(checkoutField).toBeDefined();
      expect(checkoutField.value).toContain('https://paypal.me/editor_pro/150MXN');
      expect(checkoutField.value).toContain('https://paypal.me/actor_star/50MXN');
      expect(checkoutField.value).toContain('https://app.binance.com/qr/dplk12345');
    });

    it('1.2 should gracefully format N/A for talents with missing payment channels', () => {
      const partialSettlement = {
        views: 100000,
        config: sampleConfig,
        editor: {
          talent: { discordId: 'ed_nopay' },
          payout: { total: 125 }
        },
        actors: [
          {
            talent: { discordId: 'act_nopay' },
            payout: { total: 25 }
          }
        ],
        totalPayout: 150,
        videoRecord: { videoId: 'partial_1' }
      };

      const embed = NotificationService.buildAdminPaymentOrder(partialSettlement);
      const breakdown = embed.data.fields.find(f => f.name === '📋 Desglose y Cuentas').value;

      expect(breakdown).toContain('[EDITOR] ed_nopay');
      expect(breakdown).toContain('PayPal: N/A');
      expect(breakdown).toContain('Binance: N/A');
      expect(breakdown).toContain('[ACTOR] act_nopay');
      expect(breakdown).toContain('TOTAL GENERAL: $150 MXN');
    });
  });

  // =========================================================================
  // 2. Admin Payment Order Dispatcher
  // =========================================================================
  describe('2. Admin Payment Order Dispatcher (sendAdminPaymentOrder)', () => {
    it('2.1 should dispatch payment order to admin channel successfully', async () => {
      let dispatchedPayload = null;
      const mockChannel = {
        id: 'admin_channel_123',
        send: async (payload) => {
          dispatchedPayload = payload;
          return { id: 'msg_admin_order_001', ...payload };
        }
      };

      const mockClient = {
        channels: {
          cache: new Map([['admin_channel_123', mockChannel]]),
          fetch: async (id) => id === 'admin_channel_123' ? mockChannel : null
        }
      };

      const result = await NotificationService.sendAdminPaymentOrder(mockClient, 'admin_channel_123', sampleSettlement);
      expect(result).not.toBeNull();
      expect(result.id).toBe('msg_admin_order_001');
      expect(dispatchedPayload).not.toBeNull();
      expect(dispatchedPayload.embeds.length).toBe(1);
      expect(dispatchedPayload.embeds[0].data.title).toBe('💰 Orden de Pago y Liquidación de Video');
    });

    it('2.2 should return null safely when client or channel is missing or invalid', async () => {
      const resNullClient = await NotificationService.sendAdminPaymentOrder(null, 'admin_chan', sampleSettlement);
      expect(resNullClient).toBeNull();

      const resNullChan = await NotificationService.sendAdminPaymentOrder({}, null, sampleSettlement);
      expect(resNullChan).toBeNull();

      const mockEmptyClient = {
        channels: {
          cache: new Map(),
          fetch: async () => null
        }
      };
      const resNotFound = await NotificationService.sendAdminPaymentOrder(mockEmptyClient, 'non_existent_chan', sampleSettlement);
      expect(resNotFound).toBeNull();
    });
  });

  // =========================================================================
  // 3. Settlement DM Embed Builder
  // =========================================================================
  describe('3. Participant Settlement DM Embed (buildSettlementDM)', () => {
    it('3.1 should format complete settlement DM for Editor', () => {
      const embed = NotificationService.buildSettlementDM({
        talent: sampleSettlement.editor.talent,
        payout: sampleSettlement.editor.payout,
        views: sampleSettlement.views,
        config: sampleConfig,
        videoRecord: sampleVideoRecord
      });

      expect(embed.data.title).toBe('🎉 Liquidación de Video Completada');
      expect(embed.data.color).toBe(parseInt(EMBED_COLORS.SUCCESS.replace('#', ''), 16));

      const fields = embed.data.fields;
      const roleField = fields.find(f => f.name === '🎭 Rol');
      expect(roleField.value).toBe('🎬 Editor');

      const baseField = fields.find(f => f.name === '💵 Tarifa Base');
      expect(baseField.value).toBe('$125 MXN');

      const bonusField = fields.find(f => f.name === '🌟 Bonos Obtenidos');
      expect(bonusField.value).toContain('$50 MXN (500k: $25 | 1M: $25)');

      const totalField = fields.find(f => f.name === '💰 Total a Transferir');
      expect(totalField.value).toBe('**$175 MXN**');

      const accountsField = fields.find(f => f.name === '💳 Cuentas Registradas');
      expect(accountsField.value).toContain('PayPal:  editor@paypal.com');
      expect(accountsField.value).toContain('Binance: BINANCE_ED_99');
    });

    it('3.2 should format complete settlement DM for Actor', () => {
      const actor = sampleSettlement.actors[0];
      const embed = NotificationService.buildSettlementDM({
        talent: actor.talent,
        payout: actor.payout,
        views: sampleSettlement.views,
        config: sampleConfig,
        videoRecord: sampleVideoRecord
      });

      const roleField = embed.data.fields.find(f => f.name === '🎭 Rol');
      expect(roleField.value).toBe('🎭 Actor');

      const baseField = embed.data.fields.find(f => f.name === '💵 Tarifa Base');
      expect(baseField.value).toBe('$25 MXN');

      const totalField = embed.data.fields.find(f => f.name === '💰 Total a Transferir');
      expect(totalField.value).toBe('**$75 MXN**');
    });
  });

  // =========================================================================
  // 4. Settlement DM Dispatcher & Error Boundary
  // =========================================================================
  describe('4. Settlement DM Dispatcher (sendSettlementDMs)', () => {
    it('4.1 should dispatch DMs to all recipients and handle closed DMs safely', async () => {
      const deliveredDMs = new Map();

      const mockClient = {
        users: {
          cache: new Map([
            [
              'ed_111',
              {
                id: 'ed_111',
                send: async (msg) => {
                  deliveredDMs.set('ed_111', msg);
                  return msg;
                }
              }
            ],
            [
              'act_222',
              {
                id: 'act_222',
                send: async (msg) => {
                  deliveredDMs.set('act_222', msg);
                  return msg;
                }
              }
            ],
            [
              'act_333',
              {
                id: 'act_333',
                send: async () => {
                  const err = new Error('Cannot send messages to this user');
                  err.code = 50007;
                  throw err;
                }
              }
            ]
          ]),
          fetch: async (id) => mockClient.users.cache.get(id) || null
        }
      };

      const results = await NotificationService.sendSettlementDMs(mockClient, sampleSettlement);

      expect(results.sent).toContain('ed_111');
      expect(results.sent).toContain('act_222');
      expect(results.failed).toContain('act_333');
      expect(deliveredDMs.size).toBe(2);

      const edDM = deliveredDMs.get('ed_111');
      expect(edDM.embeds[0].data.title).toBe('🎉 Liquidación de Video Completada');
    });
  });
});
