import { describe, expect, it } from 'vitest';
import { markTone, plainKey, splitPinyin, stripTones, toNumbered, toneOf } from './pinyin';

describe('pinyin', () => {
  it('detecta tonos y neutro', () => {
    expect(toneOf('mā')).toBe(1);
    expect(toneOf('nǚ')).toBe(3);
    expect(toneOf('men')).toBe(5);
  });
  it('convierte a numérico', () => {
    expect(toNumbered('nǚ')).toBe('nü3');
    expect(toNumbered('ba')).toBe('ba5');
    expect(stripTones('Hànyǔ')).toBe('Hanyu');
  });
  it('parte el pinyin oficial por carácter', () => {
    expect(splitPinyin('bú kèqi', [['bu'], ['ke'], ['qi']])).toEqual(['bú', 'kè', 'qi']);
    expect(splitPinyin('nǚ’ér', [['nü'], ['er']])).toEqual(['nǚ', 'ér']);
    expect(splitPinyin('yìdiǎnr', [['yi'], ['dian'], ['er', 'r']])).toEqual(['yì', 'diǎn', 'r']);
    // ambigüedad xian / xi an: decide con las lecturas candidatas
    expect(splitPinyin('xī’ān', [['xi'], ['an']])).toEqual(['xī', 'ān']);
  });
  it('devuelve null si no alinea', () => {
    expect(splitPinyin('hǎo', [['ni']])).toBeNull();
  });
  it('pone tonos según la regla estándar', () => {
    expect(markTone('hao', 3)).toBe('hǎo');
    expect(markTone('gou', 3)).toBe('gǒu');
    expect(markTone('gui', 4)).toBe('guì');
    expect(markTone('liu', 2)).toBe('liú');
    expect(markTone('nü', 3)).toBe('nǚ');
    expect(markTone('xiè', 5)).toBe('xie');
  });
  it('normaliza para comparar', () => {
    expect(plainKey('Nǚ’ér')).toBe('nver');
  });
});
