import { Position } from './position';

describe('Position', () => {
  describe('isEqual', () => {
    it.each`
      a                     | b                     | equals
      ${new Position(1, 1)} | ${new Position(1, 1)} | ${true}
      ${new Position(1, 1)} | ${new Position(1, 2)} | ${false}
      ${new Position(1, 1)} | ${new Position(2, 1)} | ${false}
      ${new Position(1, 2)} | ${new Position(1, 1)} | ${false}
      ${new Position(2, 1)} | ${new Position(1, 1)} | ${false}
    `(
      'position $positionA and position $positionB equals = $equals',
      ({ a, b, equals }: { a: Position; b: Position; equals: boolean }) => {
        expect(a.isEqual(b)).toBe(equals);
      },
    );
  });

  describe('isBefore', () => {
    it.each`
      a                     | b                     | equals
      ${new Position(1, 1)} | ${new Position(1, 2)} | ${true}
      ${new Position(1, 1)} | ${new Position(2, 1)} | ${true}
      ${new Position(1, 1)} | ${new Position(1, 1)} | ${false}
      ${new Position(1, 2)} | ${new Position(1, 1)} | ${false}
      ${new Position(2, 1)} | ${new Position(1, 1)} | ${false}
    `(
      'position $positionA and position $positionB equals = $equals',
      ({ a, b, equals }: { a: Position; b: Position; equals: boolean }) => {
        expect(a.isBefore(b)).toBe(equals);
      },
    );
  });
});
