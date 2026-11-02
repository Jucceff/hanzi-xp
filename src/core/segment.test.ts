import { describe, expect, it } from 'vitest';
import { segment } from './segment';

describe('segment', () => {
  const dict = new Set(['我', '我们', '是', '学生', '学', '生', '中国', '中国人', '人']);
  it('usa la coincidencia más larga', () => {
    expect(segment('我们是中国人。', dict).map((t) => t.text)).toEqual(['我们', '是', '中国人', '。']);
  });
  it('marca desconocidos', () => {
    const t = segment('汤姆是学生', dict);
    expect(t.filter((x) => !x.known).map((x) => x.text)).toEqual(['汤', '姆']);
  });
});
