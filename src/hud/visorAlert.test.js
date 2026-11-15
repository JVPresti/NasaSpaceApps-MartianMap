import { describe, expect, it } from 'vitest';
import { VISOR_ALERT, visorAlertLevel } from './visorAlert.js';

const alert = (level, active = true) => ({ id: level, eventId: level, level, text: level, active });

describe('visor alert ring level', () => {
  it('shows no ring without active alerts', () => {
    expect(visorAlertLevel({})).toBe(VISOR_ALERT.NONE);
    expect(visorAlertLevel(null)).toBe(VISOR_ALERT.NONE);
    expect(visorAlertLevel(undefined)).toBe(VISOR_ALERT.NONE);
    expect(visorAlertLevel({ a: null, b: alert('warning', false) })).toBe(VISOR_ALERT.NONE);
  });

  it('maps the four event levels to three ring states', () => {
    expect(visorAlertLevel({ a: alert('info') })).toBe(VISOR_ALERT.NONE);
    expect(visorAlertLevel({ a: alert('caution') })).toBe(VISOR_ALERT.CAUTION);
    expect(visorAlertLevel({ a: alert('warning') })).toBe(VISOR_ALERT.WARNING);
    expect(visorAlertLevel({ a: alert('danger') })).toBe(VISOR_ALERT.WARNING);
  });

  it('uses the most severe active alert', () => {
    expect(visorAlertLevel({ a: alert('caution'), b: alert('danger'), c: alert('info') })).toBe(VISOR_ALERT.WARNING);
    expect(visorAlertLevel({ a: alert('caution'), b: alert('danger', false) })).toBe(VISOR_ALERT.CAUTION);
  });

  it('ignores unknown levels', () => {
    expect(visorAlertLevel({ a: alert('panic') })).toBe(VISOR_ALERT.NONE);
  });
});
