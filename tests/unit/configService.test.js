import { describe, it, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { ConfigService } from '../../src/services/configService.js';
import { DEFAULT_CONFIG } from '../../src/config/constants.js';
import { prisma } from '../../src/database/prisma.js';

describe('ConfigService (Unit Tests)', () => {
  beforeEach(async () => {
    // Reset configuration to clean state before each test
    ConfigService.invalidateCache();
    await ConfigService.resetDefaults();
  });

  afterEach(async () => {
    ConfigService.invalidateCache();
    await ConfigService.resetDefaults();
  });

  afterAll(async () => {
    ConfigService.invalidateCache();
    await ConfigService.resetDefaults();
    await prisma.$disconnect();
  });

  it('1. should auto-seed default configuration correctly', async () => {
    const config = await ConfigService.getConfig(true);
    expect(config).toBeDefined();
    expect(config.actorBase).toBe(DEFAULT_CONFIG.actorBase);
    expect(config.editorBase).toBe(DEFAULT_CONFIG.editorBase);
    expect(config.threshold1).toBe(DEFAULT_CONFIG.threshold1);
    expect(config.bonus1).toBe(DEFAULT_CONFIG.bonus1);
    expect(config.threshold2).toBe(DEFAULT_CONFIG.threshold2);
    expect(config.bonus2).toBe(DEFAULT_CONFIG.bonus2);
    expect(config.currency).toBe(DEFAULT_CONFIG.currency);
    expect(config.waitDays).toBe(DEFAULT_CONFIG.waitDays);
  });

  it('2. should cache config in memory and return cached object', async () => {
    const config1 = await ConfigService.getConfig();
    const config2 = await ConfigService.getConfig();
    expect(config1).toBe(config2);
  });

  it('3. should normalize alias keys (e.g. actor_base -> actorBase)', async () => {
    const result = await ConfigService.updateConfig('actor_base', 35);
    expect(result.key).toBe('actorBase');
    expect(result.oldValue).toBe(25);
    expect(result.newValue).toBe(35);
    expect(result.config.actorBase).toBe(35);

    const fresh = await ConfigService.getConfig();
    expect(fresh.actorBase).toBe(35);
  });

  it('4. should update editor_base with numeric values', async () => {
    const result = await ConfigService.updateConfig('editor_base', 160.75);
    expect(result.key).toBe('editorBase');
    expect(result.newValue).toBe(160.75);
    expect(result.config.editorBase).toBe(160.75);
  });

  it('5. should update bonus amounts (bono_500k, bono_1m)', async () => {
    const b1 = await ConfigService.updateConfig('bono_500k', 30);
    expect(b1.key).toBe('bonus1');
    expect(b1.newValue).toBe(30);

    const b2 = await ConfigService.updateConfig('bono_1m', 45);
    expect(b2.key).toBe('bonus2');
    expect(b2.newValue).toBe(45);

    const active = await ConfigService.getConfig();
    expect(active.bonus1).toBe(30);
    expect(active.bonus2).toBe(45);
  });

  it('6. should update threshold views (umbral_1, umbral_2)', async () => {
    const t1 = await ConfigService.updateConfig('umbral_1', 400000);
    expect(t1.key).toBe('threshold1');
    expect(t1.newValue).toBe(400000);

    const t2 = await ConfigService.updateConfig('umbral_2', 1500000);
    expect(t2.key).toBe('threshold2');
    expect(t2.newValue).toBe(1500000);
  });

  it('7. should enforce threshold order (threshold1 < threshold2)', async () => {
    // Current threshold2 is 1,000,000. Setting threshold1 to 1,200,000 should fail
    expect(ConfigService.updateConfig('umbral_1', 1200000)).rejects.toThrow();

    // Setting threshold2 to 300,000 when threshold1 is 500,000 should fail
    expect(ConfigService.updateConfig('umbral_2', 300000)).rejects.toThrow();
  });

  it('8. should reject non-numeric values for numeric fields', async () => {
    expect(ConfigService.updateConfig('actor_base', 'no_es_numero')).rejects.toThrow();
    expect(ConfigService.updateConfig('bono_500k', 'abc')).rejects.toThrow();
  });

  it('9. should reject unknown configuration parameters', async () => {
    expect(ConfigService.updateConfig('parametro_inexistente', 100)).rejects.toThrow(/Parámetro desconocido/);
  });

  it('10. should update currency string and normalize to uppercase', async () => {
    const res = await ConfigService.updateConfig('moneda', 'usd');
    expect(res.key).toBe('currency');
    expect(res.newValue).toBe('USD');
  });

  it('11. should update waitDays parameter', async () => {
    const res = await ConfigService.updateConfig('dias_espera', 7);
    expect(res.key).toBe('waitDays');
    expect(res.newValue).toBe(7);
  });

  it('12. should reset configuration back to defaults', async () => {
    await ConfigService.updateConfig('actor_base', 99);
    await ConfigService.updateConfig('editor_base', 999);

    const reset = await ConfigService.resetDefaults();
    expect(reset.actorBase).toBe(25);
    expect(reset.editorBase).toBe(125);
  });

  it('13. should strictly reject trailing alphanumeric characters on numeric inputs', async () => {
    expect(ConfigService.updateConfig('umbral_1', '500k')).rejects.toThrow();
    expect(ConfigService.updateConfig('actor_base', '25abc')).rejects.toThrow();
    expect(ConfigService.updateConfig('editor_base', '125usd')).rejects.toThrow();
    expect(ConfigService.updateConfig('bono_500k', '25k')).rejects.toThrow();
    expect(ConfigService.updateConfig('dias_espera', '5dias')).rejects.toThrow();
  });

  it('14. should strictly reject non-integer values for integer fields', async () => {
    expect(ConfigService.updateConfig('umbral_1', '500000.5')).rejects.toThrow();
    expect(ConfigService.updateConfig('dias_espera', 5.5)).rejects.toThrow();
  });
});

