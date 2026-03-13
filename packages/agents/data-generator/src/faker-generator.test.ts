import { FakerGenerator } from './faker-generator';
import type { FieldType } from './faker-generator';

describe('FakerGenerator', () => {
  let gen: FakerGenerator;

  beforeEach(() => {
    // Use a fixed seed so tests are deterministic.
    gen = new FakerGenerator({ seed: 42 });
  });

  // ---- generateUserProfile -------------------------------------------------

  describe('generateUserProfile()', () => {
    it('returns an object with all required profile fields', () => {
      const profile = gen.generateUserProfile();

      expect(profile).toMatchObject({
        id: expect.any(String),
        firstName: expect.any(String),
        lastName: expect.any(String),
        fullName: expect.any(String),
        username: expect.any(String),
        email: expect.any(String),
        phone: expect.any(String),
        dateOfBirth: expect.any(String),
        avatar: expect.any(String),
        bio: expect.any(String),
        createdAt: expect.any(String),
      });
    });

    it('generates a valid UUID for id', () => {
      const { id } = gen.generateUserProfile();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('generates an email containing @', () => {
      const { email } = gen.generateUserProfile();
      expect(email).toContain('@');
    });

    it('generates a fullName that combines firstName and lastName', () => {
      const profile = gen.generateUserProfile();
      expect(profile.fullName).toBe(`${profile.firstName} ${profile.lastName}`);
    });

    it('generates a valid ISO date for dateOfBirth', () => {
      const { dateOfBirth } = gen.generateUserProfile();
      expect(dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('generates a nested address object', () => {
      const { address } = gen.generateUserProfile();
      expect(address).toHaveProperty('street');
      expect(address).toHaveProperty('city');
      expect(address).toHaveProperty('state');
      expect(address).toHaveProperty('zipCode');
      expect(address).toHaveProperty('country');
    });

    it('generates a nested company object', () => {
      const { company } = gen.generateUserProfile();
      expect(company).toHaveProperty('name');
      expect(company).toHaveProperty('department');
      expect(company).toHaveProperty('jobTitle');
      expect(company).toHaveProperty('catchPhrase');
    });
  });

  // ---- generateUserProfiles ------------------------------------------------

  describe('generateUserProfiles()', () => {
    it('returns the requested number of profiles', () => {
      const profiles = gen.generateUserProfiles(5);
      expect(profiles).toHaveLength(5);
    });

    it('returns unique IDs across profiles', () => {
      const profiles = gen.generateUserProfiles(10);
      const ids = profiles.map((p) => p.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(10);
    });

    it('returns an empty array when count is 0', () => {
      expect(gen.generateUserProfiles(0)).toHaveLength(0);
    });
  });

  // ---- generateEmail -------------------------------------------------------

  describe('generateEmail()', () => {
    it('returns a string containing @', () => {
      expect(gen.generateEmail()).toContain('@');
    });
  });

  // ---- generatePhone -------------------------------------------------------

  describe('generatePhone()', () => {
    it('returns a non-empty string', () => {
      const phone = gen.generatePhone();
      expect(typeof phone).toBe('string');
      expect(phone.length).toBeGreaterThan(0);
    });
  });

  // ---- generateAddress -----------------------------------------------------

  describe('generateAddress()', () => {
    it('returns an address with all required fields', () => {
      const addr = gen.generateAddress();
      expect(addr).toHaveProperty('street');
      expect(addr).toHaveProperty('city');
      expect(addr).toHaveProperty('state');
      expect(addr).toHaveProperty('zipCode');
      expect(addr).toHaveProperty('country');
      expect(addr).toHaveProperty('latitude');
      expect(addr).toHaveProperty('longitude');
    });
  });

  // ---- inferFieldType ------------------------------------------------------

  describe('inferFieldType()', () => {
    const cases: [string, FieldType][] = [
      ['email', 'email'],
      ['user_email', 'email'],
      ['firstName', 'firstName'],
      ['first_name', 'firstName'],
      ['lastName', 'lastName'],
      ['full_name', 'fullName'],
      ['displayName', 'fullName'],
      ['username', 'username'],
      ['password', 'password'],
      ['phone', 'phone'],
      ['mobile', 'phone'],
      ['street', 'street'],
      ['address1', 'street'],
      ['city', 'city'],
      ['state', 'state'],
      ['zipCode', 'zipCode'],
      ['postal', 'zipCode'],
      ['country', 'country'],
      ['url', 'url'],
      ['website', 'url'],
      ['date', 'date'],
      ['birthday', 'date'],
      ['age', 'integer'],
      ['count', 'integer'],
      ['price', 'float'],
      ['active', 'boolean'],
      ['uuid', 'uuid'],
      ['user_id', 'uuid'],
      ['description', 'longText'],
      ['bio', 'longText'],
      ['company', 'company'],
      ['jobTitle', 'jobTitle'],
      ['creditCardNumber', 'creditCardNumber'],
      ['color', 'color'],
      ['ipAddress', 'ipAddress'],
      ['foobar', 'text'],
    ];

    it.each(cases)('infers "%s" as "%s"', (fieldName, expected) => {
      expect(gen.inferFieldType(fieldName)).toBe(expected);
    });
  });

  // ---- generateForFieldType ------------------------------------------------

  describe('generateForFieldType()', () => {
    const fieldTypes: FieldType[] = [
      'email', 'firstName', 'lastName', 'fullName', 'username', 'password',
      'phone', 'street', 'city', 'state', 'zipCode', 'country', 'url', 'date',
      'text', 'longText', 'company', 'jobTitle', 'creditCardNumber', 'color',
      'ipAddress', 'uuid', 'unknown',
    ];

    it.each(fieldTypes)('generates a string value for field type "%s"', (type) => {
      const value = gen.generateForFieldType(type);
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    });

    it('generates an integer for type "integer"', () => {
      const value = gen.generateForFieldType('integer', { min: 1, max: 10 });
      expect(typeof value).toBe('number');
      expect(Number.isInteger(value)).toBe(true);
      expect(value as number).toBeGreaterThanOrEqual(1);
      expect(value as number).toBeLessThanOrEqual(10);
    });

    it('generates a float for type "float"', () => {
      const value = gen.generateForFieldType('float', { min: 0, max: 1 });
      expect(typeof value).toBe('number');
    });

    it('generates a boolean for type "boolean"', () => {
      const value = gen.generateForFieldType('boolean');
      expect(typeof value).toBe('boolean');
    });
  });

  // ---- generateForField ----------------------------------------------------

  describe('generateForField()', () => {
    it('returns the requested number of values', () => {
      const values = gen.generateForField('email', 3);
      expect(values).toHaveLength(3);
    });

    it('defaults to 1 value', () => {
      const values = gen.generateForField('firstName');
      expect(values).toHaveLength(1);
    });
  });
});
