/**
 * Unified Test Context & Harness for E2E Test Suite
 * Discord Talent Management & Automated YouTube Settlement Bot
 */

export class VirtualClock {
  constructor(initialTimestamp = Date.now()) {
    this.current = initialTimestamp;
  }

  now() {
    return this.current;
  }

  get Date() {
    return new Date(this.current);
  }

  advanceHours(hours) {
    this.current += hours * 60 * 60 * 1000;
  }

  advanceDays(days) {
    this.current += days * 24 * 60 * 60 * 1000;
  }

  reset(timestamp = Date.now()) {
    this.current = timestamp;
  }
}

export class MockUser {
  constructor({ id, username, tag, dmsOpen = true }) {
    this.id = id;
    this.username = username || `User_${id}`;
    this.tag = tag || `${this.username}#0001`;
    this.dmsOpen = dmsOpen;
    this.dms = [];
  }

  async send(options) {
    if (!this.dmsOpen) {
      const err = new Error('Cannot send messages to this user');
      err.code = 50007; // DiscordAPIError: Cannot send messages to this user
      throw err;
    }
    const message = {
      id: `dm_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recipient: this,
      content: typeof options === 'string' ? options : options.content,
      embeds: options.embeds || [],
      createdAt: new Date()
    };
    this.dms.push(message);
    return message;
  }
}

export class MockTextChannel {
  constructor({ id, name = 'general' }) {
    this.id = id;
    this.name = name;
    this.messages = [];
  }

  async send(options) {
    const message = {
      id: `chan_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      channel: this,
      content: typeof options === 'string' ? options : options.content,
      embeds: options.embeds || [],
      createdAt: new Date()
    };
    this.messages.push(message);
    return message;
  }
}

export class MockDiscordClient {
  constructor() {
    this.channels = new Map();
    this.users = new Map();
    this.commands = new Map();
    this.color = '#5865F2';
  }

  getChannel(id, name = 'channel') {
    if (!this.channels.has(id)) {
      this.channels.set(id, new MockTextChannel({ id, name }));
    }
    return this.channels.get(id);
  }

  getUser(id, username) {
    if (!this.users.has(id)) {
      this.users.set(id, new MockUser({ id, username }));
    }
    return this.users.get(id);
  }

  createMessage({ authorId, channelId, content, isAdmin = false, mentions = {} }) {
    const user = this.getUser(authorId);
    const channel = this.getChannel(channelId);
    const replies = [];

    return {
      author: user,
      channel,
      content,
      member: {
        permissions: {
          has: (perm) => isAdmin
        }
      },
      mentions: {
        users: new Map(Object.entries(mentions.users || {})),
        members: new Map(Object.entries(mentions.members || {}))
      },
      replies,
      reply: async (options) => {
        const replyMsg = {
          content: typeof options === 'string' ? options : options.content,
          embeds: options.embeds || []
        };
        replies.push(replyMsg);
        return replyMsg;
      }
    };
  }
}

/**
 * In-Memory Relational Database implementing Prisma Client interface for all project models
 */
export class MockDatabase {
  constructor() {
    this._config = [];
    this._talents = new Map();
    this._videos = new Map();
    this._participants = [];
  }

  reset() {
    this._config = [];
    this._talents.clear();
    this._videos.clear();
    this._participants = [];
  }

  get config() {
    return {
      findFirst: async () => {
        return this._config[0] ? { ...this._config[0] } : null;
      },
      create: async ({ data }) => {
        const row = {
          id: data.id || 1,
          actorBase: data.actorBase ?? 25,
          editorBase: data.editorBase ?? 125,
          threshold1: data.threshold1 ?? 500000,
          bonus1: data.bonus1 ?? 25,
          threshold2: data.threshold2 ?? 1000000,
          bonus2: data.bonus2 ?? 25,
          currency: data.currency || 'MXN',
          waitDays: data.waitDays ?? 5,
          historyChannelId: data.historyChannelId || null,
          adminChannelId: data.adminChannelId || null,
          prefix: data.prefix || '!',
          youtubeChannelId: data.youtubeChannelId || null,
          youtubeChannelUrl: data.youtubeChannelUrl || null,
          youtubeChannelTitle: data.youtubeChannelTitle || null,
          updatedAt: new Date()
        };
        this._config = [row];
        return { ...row };
      },
      update: async ({ where, data }) => {
        if (!this._config[0]) {
          throw new Error('Config record not found');
        }
        this._config[0] = {
          ...this._config[0],
          ...data,
          updatedAt: new Date()
        };
        return { ...this._config[0] };
      },
      deleteMany: async () => {
        const count = this._config.length;
        this._config = [];
        return { count };
      }
    };
  }

  get talent() {
    return {
      findUnique: async ({ where }) => {
        const t = this._talents.get(where.discordId);
        return t ? { ...t } : null;
      },
      findMany: async ({ where } = {}) => {
        let list = Array.from(this._talents.values());
        if (where?.discordId?.in) {
          list = list.filter(t => where.discordId.in.includes(t.discordId));
        }
        return list.map(t => ({ ...t }));
      },
      upsert: async ({ where, update, create }) => {
        const existing = this._talents.get(where.discordId);
        if (existing) {
          const updated = {
            ...existing,
            ...update,
            updatedAt: new Date()
          };
          this._talents.set(where.discordId, updated);
          return { ...updated };
        } else {
          const created = {
            discordId: where.discordId,
            role: create.role,
            paypal: create.paypal || null,
            binance: create.binance || null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          this._talents.set(where.discordId, created);
          return { ...created };
        }
      },
      deleteMany: async () => {
        const count = this._talents.size;
        this._talents.clear();
        return { count };
      }
    };
  }

  get videoRecord() {
    return {
      findUnique: async ({ where, include }) => {
        const v = this._videos.get(where.id || where.videoId);
        if (!v) return null;
        const res = { ...v };
        if (include?.participants) {
          res.participants = this._participants.filter(p => p.videoId === v.id);
        }
        return res;
      },
      findMany: async ({ where, include } = {}) => {
        let list = Array.from(new Set(this._videos.values()));
        if (where?.status) {
          list = list.filter(v => v.status === where.status);
        }
        if (where?.scheduledDate?.lte) {
          const lteDate = new Date(where.scheduledDate.lte).getTime();
          list = list.filter(v => new Date(v.scheduledDate).getTime() <= lteDate);
        }
        return list.map(v => {
          const res = { ...v };
          if (include?.participants) {
            res.participants = this._participants.filter(p => p.videoId === v.id);
          }
          return res;
        });
      },
      create: async ({ data, include }) => {
        const id = data.id || `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const record = {
          id,
          youtubeUrl: data.youtubeUrl,
          videoId: data.videoId,
          editorId: data.editorId,
          status: data.status || 'PENDING',
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : new Date(),
          calculatedAt: data.calculatedAt ? new Date(data.calculatedAt) : null,
          finalViews: data.finalViews ?? null,
          totalPayout: data.totalPayout ?? null,
          title: data.title || `Video ${data.videoId}`,
          thumbnailUrl: data.thumbnailUrl || `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`
        };
        this._videos.set(id, record);
        this._videos.set(record.videoId, record);

        if (data.participants?.create) {
          for (const p of data.participants.create) {
            this._participants.push({
              id: `part_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              videoId: id,
              talentId: p.talentId,
              role: p.role || 'ACTOR'
            });
          }
        }

        const res = { ...record };
        if (include?.participants) {
          res.participants = this._participants.filter(p => p.videoId === id);
        }
        return res;
      },
      update: async ({ where, data }) => {
        const v = this._videos.get(where.id || where.videoId);
        if (!v) throw new Error('VideoRecord not found');
        const updated = {
          ...v,
          ...data,
          calculatedAt: data.calculatedAt ? new Date(data.calculatedAt) : v.calculatedAt
        };
        this._videos.set(updated.id, updated);
        this._videos.set(updated.videoId, updated);
        return { ...updated };
      },
      deleteMany: async () => {
        const count = new Set(this._videos.values()).size;
        this._videos.clear();
        this._participants = [];
        return { count };
      }
    };
  }

  get videoParticipant() {
    return {
      findMany: async ({ where } = {}) => {
        let list = this._participants;
        if (where?.videoId) {
          list = list.filter(p => p.videoId === where.videoId);
        }
        if (where?.talentId) {
          list = list.filter(p => p.talentId === where.talentId);
        }
        return list.map(p => ({ ...p }));
      },
      deleteMany: async () => {
        const count = this._participants.length;
        this._participants = [];
        return { count };
      }
    };
  }
}

/**
 * Pure Domain Engines & Contract References
 */

export class ReferenceYouTubeService {
  constructor() {
    this.mockDatabase = new Map();
  }

  setMockVideo(videoId, { title, viewCount, thumbnailUrl }) {
    this.mockDatabase.set(videoId, {
      videoId,
      title: title || `YouTube Video ${videoId}`,
      viewCount: viewCount ?? 0,
      thumbnailUrl: thumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    });
  }

  extractVideoId(urlOrId) {
    if (!urlOrId || typeof urlOrId !== 'string') return null;
    let trimmed = urlOrId.trim();
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    try {
      const parsedUrl = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

      if (hostname === 'youtube.com') {
        const vParam = parsedUrl.searchParams.get('v');
        if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
          return vParam;
        }
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        if (['embed', 'shorts', 'live', 'v'].includes(pathSegments[0]) && pathSegments[1]) {
          if (/^[a-zA-Z0-9_-]{11}$/.test(pathSegments[1])) {
            return pathSegments[1];
          }
        }
      } else if (hostname === 'youtu.be') {
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        if (pathSegments[0] && /^[a-zA-Z0-9_-]{11}$/.test(pathSegments[0])) {
          return pathSegments[0];
        }
      }
    } catch {}

    const patterns = [
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([a-zA-Z0-9_-]{11})(?:[?&#/]|$)/i,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&#/]|$)/i
    ];
    for (const regex of patterns) {
      const match = trimmed.match(regex);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  async getVideoDetails(videoId) {
    if (this.mockDatabase.has(videoId)) {
      return { ...this.mockDatabase.get(videoId) };
    }
    return {
      videoId,
      title: `Simulated Video ${videoId}`,
      viewCount: 150000,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    };
  }
}

export class ReferencePayoutService {
  static calculateTalentPayout(role, views, config) {
    const sanitizedViews = Math.max(0, Math.floor(views || 0));
    const normalizedRole = (role || '').toUpperCase();
    const base = normalizedRole === 'EDITOR' ? config.editorBase : config.actorBase;
    
    const threshold1Passed = sanitizedViews >= config.threshold1;
    const threshold2Passed = sanitizedViews >= config.threshold2;

    const bonus1 = threshold1Passed ? config.bonus1 : 0;
    const bonus2 = threshold2Passed ? config.bonus2 : 0;
    const totalBonus = bonus1 + bonus2;
    const total = base + totalBonus;

    return {
      role: normalizedRole,
      base,
      bonus1,
      bonus2,
      totalBonus,
      total,
      threshold1Passed,
      threshold2Passed,
      currency: config.currency || 'MXN'
    };
  }

  static calculateVideoSettlement({ editor, participants = [], views, config }) {
    const editorPayout = this.calculateTalentPayout('EDITOR', views, config);
    const actorPayouts = participants.map(actor => ({
      talent: actor,
      payout: this.calculateTalentPayout('ACTOR', views, config)
    }));

    const totalPayout = editorPayout.total + actorPayouts.reduce((acc, a) => acc + a.payout.total, 0);

    return {
      views,
      config,
      editor: {
        talent: editor,
        payout: editorPayout
      },
      actors: actorPayouts,
      totalPayout
    };
  }
}

export class ReferenceNotificationService {
  static buildHistoryEmbed({ videoRecord, editor, actors, config }) {
    return {
      title: '🎬 Nuevo Video Registrado para Seguimiento',
      fields: [
        { name: '📺 Video', value: `[${videoRecord.title || videoRecord.videoId}](${videoRecord.youtubeUrl})` },
        { name: '✂️ Editor', value: `<@${editor.discordId}>` },
        { name: '🎭 Actores', value: actors.map(a => `<@${a.discordId}>`).join(', ') || 'Ninguno' },
        { name: '📅 Fecha de Liquidación', value: new Date(videoRecord.scheduledDate).toISOString() }
      ]
    };
  }

  static buildAdminPaymentOrder(settlement) {
    const { views, config, editor, actors, totalPayout, videoRecord } = settlement;
    let paymentCodeBlock = '```\n=== MÉTODOS DE PAGO ===\n';
    paymentCodeBlock += `[EDITOR] ${editor.talent.discordId}:\n  PayPal: ${editor.talent.paypal || 'N/A'}\n  Binance: ${editor.talent.binance || 'N/A'}\n  Monto: $${editor.payout.total} ${config.currency}\n\n`;

    for (const a of actors) {
      paymentCodeBlock += `[ACTOR] ${a.talent.discordId}:\n  PayPal: ${a.talent.paypal || 'N/A'}\n  Binance: ${a.talent.binance || 'N/A'}\n  Monto: $${a.payout.total} ${config.currency}\n\n`;
    }
    paymentCodeBlock += `TOTAL GENERAL: $${totalPayout} ${config.currency}\n\`\`\``;

    return {
      title: '💰 Orden de Pago y Liquidación de Video',
      fields: [
        { name: '📺 Video', value: `https://youtu.be/${videoRecord?.videoId || 'N/A'}` },
        { name: '📊 Vistas Finales', value: `${views.toLocaleString()} vistas` },
        { name: '💵 Total Liquidado', value: `$${totalPayout} ${config.currency}` },
        { name: '📋 Desglose y Cuentas', value: paymentCodeBlock }
      ]
    };
  }

  static buildSettlementDM({ talent, payout, views, config, videoRecord }) {
    return {
      title: '🎉 Liquidación de Video Completada',
      fields: [
        { name: '📺 Video', value: videoRecord?.title || videoRecord?.videoId || 'YouTube Video' },
        { name: '📊 Vistas Registradas (5 días)', value: `${views.toLocaleString()} vistas` },
        { name: '🎭 Rol', value: payout.role },
        { name: '💵 Tarifa Base', value: `$${payout.base} ${config.currency}` },
        { name: '🌟 Bonos Obtenidos', value: `$${payout.totalBonus} ${config.currency} (500k: $${payout.bonus1} | 1M: $${payout.bonus2})` },
        { name: '💰 Total a Transferir', value: `$${payout.total} ${config.currency}` }
      ]
    };
  }
}
