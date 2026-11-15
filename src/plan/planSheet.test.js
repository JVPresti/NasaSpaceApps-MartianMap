import { describe, expect, it, vi } from 'vitest';
import { SHEET, createSheet } from './planSheet.js';

describe('createSheet', () => {
  it('starts open and toggles between the panels and the map', () => {
    const sheet = createSheet();
    expect(sheet.get()).toBe(SHEET.OPEN);
    sheet.toggle();
    expect(sheet.get()).toBe(SHEET.MAP);
    sheet.toggle();
    expect(sheet.get()).toBe(SHEET.OPEN);
  });

  it('tells subscribers about a change once, and not about a set to the same state', () => {
    const sheet = createSheet(SHEET.MAP);
    const fn = vi.fn();
    const stop = sheet.subscribe(fn);
    sheet.showMap();
    expect(fn).not.toHaveBeenCalled();
    sheet.open();
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
    sheet.toggle();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('treats an unknown initial state as open', () => {
    expect(createSheet('half').get()).toBe(SHEET.OPEN);
  });
});
