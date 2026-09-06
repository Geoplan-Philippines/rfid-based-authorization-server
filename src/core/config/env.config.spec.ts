import { booleanFromEnvironment } from './env.config';

describe('booleanFromEnvironment', () => {
  it('parses explicit true and false strings instead of using JavaScript truthiness', () => {
    const value = booleanFromEnvironment(true);

    expect(value.parse('true')).toBe(true);
    expect(value.parse('false')).toBe(false);
  });

  it('uses the configured default and rejects non-boolean strings', () => {
    expect(booleanFromEnvironment(false).parse(undefined)).toBe(false);
    expect(() => booleanFromEnvironment(false).parse('yes')).toThrow();
  });
});
