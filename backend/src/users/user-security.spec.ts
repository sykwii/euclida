import { getMetadataArgsStorage } from 'typeorm';
import { User } from './user.entity';

describe('User credential serialization', () => {
  it('does not select password hashes by default', () => {
    const column = getMetadataArgsStorage().columns.find(
      (item) => item.target === User && item.propertyName === 'passwordHash',
    );

    expect(column?.options.select).toBe(false);
  });
});
