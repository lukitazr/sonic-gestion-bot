/**
 * Tier 2: Boundary Value Analysis & Edge Cases E2E Test Suite
 * Evaluates exact numerical thresholds, sanitized inputs, special characters, and Discord API errors (11 test cases).
 */

import assert from 'node:assert/strict';
import {
  VirtualClock,
  MockDiscordClient,
  MockDatabase,
  ReferenceYouTubeService,
  ReferencePayoutService
} from './test_context.js';

export async function runTier2Tests() {
  const results = [];
  const clock = new VirtualClock();
  const db = new MockDatabase();
  const youtube = new ReferenceYouTubeService();
  const client = new MockDiscordClient();

  const standardConfig = {
    actorBase: 25,
    editorBase: 125,
    threshold1: 500000,
    bonus1: 25,
    threshold2: 1000000,
    bonus2: 25,
    currency: 'MXN',
    waitDays: 5
  };

  async function test(name, fn) {
    db.reset();
    clock.reset(1700000000000);
    try {
      await fn();
      results.push({ name, tier: 'Tier 2: Boundary & Edge Cases', passed: true });
    } catch (err) {
      results.push({ name, tier: 'Tier 2: Boundary & Edge Cases', passed: false, error: err });
    }
  }

  await test('T2-01: Exact Zero Views (0 views) awards base rates and zero bonus', async () => {
    const actor = ReferencePayoutService.calculateTalentPayout('ACTOR', 0, standardConfig);
    assert.equal(actor.base, 25);
    assert.equal(actor.bonus1, 0);
    assert.equal(actor.bonus2, 0);
    assert.equal(actor.total, 25);

    const editor = ReferencePayoutService.calculateTalentPayout('EDITOR', 0, standardConfig);
    assert.equal(editor.base, 125);
    assert.equal(editor.bonus1, 0);
    assert.equal(editor.bonus2, 0);
    assert.equal(editor.total, 125);
  });

  await test('T2-02: Views at 499,999 (1 below Threshold 1) awards base rates and zero bonus', async () => {
    const actor = ReferencePayoutService.calculateTalentPayout('ACTOR', 499999, standardConfig);
    assert.equal(actor.bonus1, 0);
    assert.equal(actor.bonus2, 0);
    assert.equal(actor.total, 25);
    assert.equal(actor.threshold1Passed, false);

    const editor = ReferencePayoutService.calculateTalentPayout('EDITOR', 499999, standardConfig);
    assert.equal(editor.bonus1, 0);
    assert.equal(editor.total, 125);
  });

  await test('T2-03: Views at exact 500,000 (Threshold 1 boundary) triggers Bonus 1 only', async () => {
    const actor = ReferencePayoutService.calculateTalentPayout('ACTOR', 500000, standardConfig);
    assert.equal(actor.bonus1, 25);
    assert.equal(actor.bonus2, 0);
    assert.equal(actor.total, 50);
    assert.equal(actor.threshold1Passed, true);
    assert.equal(actor.threshold2Passed, false);

    const editor = ReferencePayoutService.calculateTalentPayout('EDITOR', 500000, standardConfig);
    assert.equal(editor.bonus1, 25);
    assert.equal(editor.bonus2, 0);
    assert.equal(editor.total, 150);
  });

  await test('T2-04: Views at 999,999 (1 below Threshold 2) triggers Bonus 1 and excludes Bonus 2', async () => {
    const actor = ReferencePayoutService.calculateTalentPayout('ACTOR', 999999, standardConfig);
    assert.equal(actor.bonus1, 25);
    assert.equal(actor.bonus2, 0);
    assert.equal(actor.total, 50);
    assert.equal(actor.threshold1Passed, true);
    assert.equal(actor.threshold2Passed, false);

    const editor = ReferencePayoutService.calculateTalentPayout('EDITOR', 999999, standardConfig);
    assert.equal(editor.bonus1, 25);
    assert.equal(editor.bonus2, 0);
    assert.equal(editor.total, 150);
  });

  await test('T2-05: Views at exact 1,000,000 (Threshold 2 boundary) triggers both Bonus 1 and Bonus 2', async () => {
    const actor = ReferencePayoutService.calculateTalentPayout('ACTOR', 1000000, standardConfig);
    assert.equal(actor.bonus1, 25);
    assert.equal(actor.bonus2, 25);
    assert.equal(actor.totalBonus, 50);
    assert.equal(actor.total, 75);
    assert.equal(actor.threshold1Passed, true);
    assert.equal(actor.threshold2Passed, true);

    const editor = ReferencePayoutService.calculateTalentPayout('EDITOR', 1000000, standardConfig);
    assert.equal(editor.totalBonus, 50);
    assert.equal(editor.total, 175);
  });

  await test('T2-06: Extreme views (2,000,000+ views) caps bonuses to Bonus 1 + Bonus 2', async () => {
    const actor = ReferencePayoutService.calculateTalentPayout('ACTOR', 25000000, standardConfig);
    assert.equal(actor.bonus1, 25);
    assert.equal(actor.bonus2, 25);
    assert.equal(actor.totalBonus, 50);
    assert.equal(actor.total, 75);

    const editor = ReferencePayoutService.calculateTalentPayout('EDITOR', 50000000, standardConfig);
    assert.equal(editor.total, 175);
  });

  await test('T2-07: Negative views sanitized to zero and float views floored properly', async () => {
    const negativeActor = ReferencePayoutService.calculateTalentPayout('ACTOR', -500, standardConfig);
    assert.equal(negativeActor.base, 25);
    assert.equal(negativeActor.totalBonus, 0);
    assert.equal(negativeActor.total, 25);

    const floatActor = ReferencePayoutService.calculateTalentPayout('ACTOR', 500000.8, standardConfig);
    assert.equal(floatActor.bonus1, 25);
    assert.equal(floatActor.total, 50);
  });

  await test('T2-08: Zero base rates ($0 actorBase, $0 editorBase) configuration handles pure bonus math', async () => {
    const zeroBaseConfig = {
      ...standardConfig,
      actorBase: 0,
      editorBase: 0
    };

    const belowThreshold = ReferencePayoutService.calculateTalentPayout('ACTOR', 100000, zeroBaseConfig);
    assert.equal(belowThreshold.base, 0);
    assert.equal(belowThreshold.total, 0);

    const aboveThreshold2 = ReferencePayoutService.calculateTalentPayout('ACTOR', 1200000, zeroBaseConfig);
    assert.equal(aboveThreshold2.base, 0);
    assert.equal(aboveThreshold2.bonus1, 25);
    assert.equal(aboveThreshold2.bonus2, 25);
    assert.equal(aboveThreshold2.total, 50);
  });

  await test('T2-09: Malformed and boundary YouTube URLs / IDs parsing resilience', async () => {
    // Valid complex URLs
    assert.equal(youtube.extractVideoId('https://www.youtube.com/watch?v=AbCdEfGhIjK&feature=share'), 'AbCdEfGhIjK');
    assert.equal(youtube.extractVideoId('  https://youtu.be/AbCdEfGhIjK?t=120  '), 'AbCdEfGhIjK');
    assert.equal(youtube.extractVideoId('https://www.youtube.com/shorts/AbCdEfGhIjK'), 'AbCdEfGhIjK');
    assert.equal(youtube.extractVideoId('AbCdEfGhIjK'), 'AbCdEfGhIjK');

    // Invalid URLs
    assert.equal(youtube.extractVideoId('https://vimeo.com/123456789'), null);
    assert.equal(youtube.extractVideoId('https://youtube.com/watch?v=tooshort'), null); // 8 chars
    assert.equal(youtube.extractVideoId('https://youtube.com/watch?v=toolongcharacterstring'), null);
    assert.equal(youtube.extractVideoId(''), null);
    assert.equal(youtube.extractVideoId(null), null);
  });

  await test('T2-10: Special characters in payment info (emails with plus/dots, crypto hashes)', async () => {
    const talent1 = await db.talent.upsert({
      where: { discordId: 'user_special_1' },
      update: {},
      create: {
        role: 'ACTOR',
        paypal: 'john.doe+sonic_bot-test@sub.domain-corp.com',
        binance: '0x71C67Ed375545523093040C7bf300E34464499B4'
      }
    });

    assert.equal(talent1.paypal, 'john.doe+sonic_bot-test@sub.domain-corp.com');
    assert.equal(talent1.binance, '0x71C67Ed375545523093040C7bf300E34464499B4');
  });

  await test('T2-11: Closed DMs error resilience prevents failure of settlement pipeline', async () => {
    const closedUser = client.getUser('user_closed_dms', 'PrivateUser');
    closedUser.dmsOpen = false; // Simulates DiscordAPIError 50007

    const openUser = client.getUser('user_open_dms', 'OpenUser');
    openUser.dmsOpen = true;

    const settlementNotifications = [
      { user: closedUser, msg: 'Tu liquidación está lista' },
      { user: openUser, msg: 'Tu liquidación está lista' }
    ];

    const dispatchResults = [];

    for (const item of settlementNotifications) {
      try {
        await item.user.send(item.msg);
        dispatchResults.push({ userId: item.user.id, success: true });
      } catch (err) {
        if (err.code === 50007) {
          // Gracefully caught
          dispatchResults.push({ userId: item.user.id, success: false, reason: 'DMS_CLOSED' });
        } else {
          throw err;
        }
      }
    }

    assert.equal(dispatchResults.length, 2);
    assert.equal(dispatchResults[0].success, false);
    assert.equal(dispatchResults[0].reason, 'DMS_CLOSED');
    assert.equal(dispatchResults[1].success, true);
    assert.equal(openUser.dms.length, 1);
  });

  return results;
}
