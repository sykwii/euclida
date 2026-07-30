import { escapeCsvCell } from './documents.service';

describe('document export security', () => {
  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1)', '\tformula', '\rformula'])(
    'neutralizes spreadsheet formula input %s',
    (value) => {
      expect(escapeCsvCell(value)).toBe(`"'${value}"`);
    },
  );

  it('escapes quotes without altering ordinary text', () => {
    expect(escapeCsvCell('safe "value"')).toBe('"safe ""value"""');
  });
});
