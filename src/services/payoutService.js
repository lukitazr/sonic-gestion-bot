/**
 * Payout Service
 * Pure deterministic calculation engine for talent fees and view-based performance bonuses.
 */

export class PayoutService {
  /**
   * Pure mathematical function to compute individual talent payout.
   *
   * @param {'ACTOR' | 'EDITOR' | string} role - Talent role ('ACTOR' or 'EDITOR')
   * @param {number|string} views - Total YouTube video views
   * @param {Object} config - Active configuration object
   * @param {number} config.actorBase - Actor base rate
   * @param {number} config.editorBase - Editor base rate
   * @param {number} config.threshold1 - First view threshold (e.g. 500,000)
   * @param {number} config.bonus1 - Bonus for achieving threshold 1
   * @param {number} config.threshold2 - Second view threshold (e.g. 1,000,000)
   * @param {number} config.bonus2 - Bonus for achieving threshold 2
   * @param {string} [config.currency='MXN'] - Currency code
   *
   * @returns {{
   *   role: string,
   *   base: number,
   *   bonus1: number,
   *   bonus2: number,
   *   totalBonus: number,
   *   total: number,
   *   threshold1Passed: boolean,
   *   threshold2Passed: boolean,
   *   currency: string
   * }}
   */
  static calculateTalentPayout(role, views, config) {
    if (!config) {
      throw new Error('La configuración del sistema es requerida para el cálculo de liquidación.');
    }

    const sanitizedViews = Math.max(0, Math.floor(Number(views) || 0));
    const normalizedRole = role ? String(role).trim().toUpperCase() : 'ACTOR';
    const isEditor = normalizedRole === 'EDITOR';

    const base = isEditor ? Number(config.editorBase || 0) : Number(config.actorBase || 0);

    const threshold1 = Number(config.threshold1 || 0);
    const threshold2 = Number(config.threshold2 || 0);
    const bonus1Amount = Number(config.bonus1 || 0);
    const bonus2Amount = Number(config.bonus2 || 0);

    const threshold1Passed = sanitizedViews >= threshold1;
    const threshold2Passed = sanitizedViews >= threshold2;

    const bonus1 = threshold1Passed ? bonus1Amount : 0;
    const bonus2 = threshold2Passed ? bonus2Amount : 0;
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

  /**
   * Computes the complete video settlement including editor payout and all actor payouts.
   *
   * @param {Object} params
   * @param {Object} params.editor - Editor talent object or { discordId }
   * @param {Array<Object>} [params.participants] - List of actor talent objects
   * @param {Array<Object>} [params.actors] - Alias for participants
   * @param {number|string} params.views - Total YouTube views
   * @param {Object} params.config - Active system configuration
   *
   * @returns {{
   *   views: number,
   *   config: Object,
   *   editor: { talent: Object, payout: Object },
   *   actors: Array<{ talent: Object, payout: Object }>,
   *   totalPayout: number
   * }}
   */
  static calculateVideoSettlement({ editor, participants = [], actors = [], views = 0, config }) {
    if (!config) {
      throw new Error('La configuración del sistema es requerida para calcular la liquidación del video.');
    }

    const sanitizedViews = Math.max(0, Math.floor(Number(views) || 0));

    // Calculate editor payout if present
    const hasEditor = Boolean(editor && (editor.discordId || editor.id || typeof editor === 'string'));
    const editorPayout = hasEditor
      ? this.calculateTalentPayout('EDITOR', sanitizedViews, config)
      : null;

    // Combine participants / actors list
    const actorList = Array.isArray(participants) && participants.length > 0
      ? participants
      : (Array.isArray(actors) ? actors : []);

    // Calculate individual actor payouts
    const actorPayouts = actorList.map(actor => ({
      talent: actor,
      payout: this.calculateTalentPayout(actor?.role || 'ACTOR', sanitizedViews, config)
    }));

    // Sum total payout
    const actorsTotal = actorPayouts.reduce((acc, a) => acc + (a.payout.total || 0), 0);
    const totalPayout = (editorPayout ? editorPayout.total : 0) + actorsTotal;

    return {
      views: sanitizedViews,
      config,
      editor: hasEditor
        ? {
            talent: editor,
            payout: editorPayout
          }
        : null,
      actors: actorPayouts,
      totalPayout
    };
  }
}

export default PayoutService;

