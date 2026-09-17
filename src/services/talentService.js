import { prisma } from '../database/prisma.js';
import { validateTalentInput } from '../utils/validators.js';

/**
 * Service for managing Talent Dossier records in SQLite via Prisma ORM
 */
export class TalentService {
  /**
   * Creates or updates a talent dossier record.
   * If the profile already exists, non-provided fields are preserved without overwriting.
   *
   * @param {Object} params
   * @param {string} params.discordId - Discord user ID (Snowflake or test identifier)
   * @param {string} [params.role] - 'ACTOR' or 'EDITOR'
   * @param {string} [params.paypal] - PayPal email address
   * @param {string} [params.binance] - Binance Pay ID, email, or handle
   * @returns {Promise<import('@prisma/client').Talent>}
   */
  static async upsertTalent({ discordId, role, paypal, binance }) {
    if (!discordId || typeof discordId !== 'string' || !discordId.trim()) {
      throw new Error('El ID de Discord del talento es obligatorio.');
    }

    const cleanDiscordId = discordId.trim();
    const existing = await prisma.talent.findUnique({
      where: { discordId: cleanDiscordId }
    });

    const validated = validateTalentInput({
      discordId: cleanDiscordId,
      role,
      paypal,
      binance,
      isUpdate: !!existing
    });

    if (existing) {
      const finalRole = validated.role !== undefined ? validated.role : existing.role;
      const finalPaypal = validated.paypal !== undefined ? validated.paypal : existing.paypal;
      const finalBinance = validated.binance !== undefined ? validated.binance : existing.binance;

      if (!finalPaypal && !finalBinance) {
        throw new Error('Debes proporcionar al menos un método de pago (PayPal o Binance).');
      }

      return await prisma.talent.update({
        where: { discordId: cleanDiscordId },
        data: {
          role: finalRole,
          paypal: finalPaypal,
          binance: finalBinance
        }
      });
    }

    return await prisma.talent.create({
      data: {
        discordId: cleanDiscordId,
        role: validated.role,
        paypal: validated.paypal || null,
        binance: validated.binance || null
      }
    });
  }

  /**
   * Retrieves a single talent dossier by Discord user ID.
   * @param {string} discordId - Discord user ID
   * @returns {Promise<import('@prisma/client').Talent | null>}
   */
  static async getTalent(discordId) {
    if (!discordId || typeof discordId !== 'string') return null;
    return await prisma.talent.findUnique({
      where: { discordId: discordId.trim() }
    });
  }

  /**
   * Batch retrieves talents by a list of Discord user IDs.
   * @param {string[]} discordIds - Array of Discord user IDs
   * @returns {Promise<import('@prisma/client').Talent[]>}
   */
  static async getTalents(discordIds) {
    if (!discordIds || !Array.isArray(discordIds) || discordIds.length === 0) {
      return [];
    }

    const cleanIds = discordIds
      .filter(id => typeof id === 'string' && id.trim())
      .map(id => id.trim());

    if (cleanIds.length === 0) return [];

    return await prisma.talent.findMany({
      where: {
        discordId: {
          in: cleanIds
        }
      }
    });
  }

  /**
   * Deletes a talent dossier by Discord user ID (used for tests/cleanup).
   * @param {string} discordId - Discord user ID
   * @returns {Promise<import('@prisma/client').Talent | null>}
   */
  static async deleteTalent(discordId) {
    if (!discordId || typeof discordId !== 'string') return null;
    try {
      const existing = await prisma.talent.findUnique({
        where: { discordId: discordId.trim() }
      });
      if (!existing) return null;
      return await prisma.talent.delete({
        where: { discordId: discordId.trim() }
      });
    } catch {
      return null;
    }
  }

  /**
   * Returns all registered talents.
   * @returns {Promise<import('@prisma/client').Talent[]>}
   */
  static async getAllTalents() {
    return await prisma.talent.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }
}
