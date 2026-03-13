import { faker } from '@faker-js/faker';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A complete synthetic user profile. */
export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: AddressData;
  company: CompanyData;
  avatar: string;
  bio: string;
  createdAt: string;
}

/** Synthetic postal address. */
export interface AddressData {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: string;
  longitude: string;
}

/** Synthetic company details. */
export interface CompanyData {
  name: string;
  department: string;
  jobTitle: string;
  catchPhrase: string;
}

/** Recognised field data types for context-aware generation. */
export type FieldType =
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'username'
  | 'password'
  | 'phone'
  | 'street'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'country'
  | 'url'
  | 'date'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'uuid'
  | 'text'
  | 'longText'
  | 'company'
  | 'jobTitle'
  | 'creditCardNumber'
  | 'color'
  | 'ipAddress'
  | 'unknown';

/** Options that can be passed to the generator. */
export interface GeneratorOptions {
  /** BCP-47 locale string (e.g. `'en'`, `'de'`, `'fr'`). Defaults to `'en'`. */
  locale?: string;
  /** Random seed for reproducible output. */
  seed?: number;
  /** Minimum numeric value (for integer / float types). */
  min?: number;
  /** Maximum numeric value (for integer / float types). */
  max?: number;
  /** Minimum string length (for text / longText types). */
  minLength?: number;
  /** Maximum string length (for text / longText types). */
  maxLength?: number;
}

// ---------------------------------------------------------------------------
// FakerGenerator
// ---------------------------------------------------------------------------

/**
 * Generates realistic, Faker.js-backed test data.
 *
 * Each public method is stateless and can be called without prior setup.
 * The optional `seed` option makes output reproducible across runs.
 */
export class FakerGenerator {
  private readonly fakerInstance: typeof faker;

  constructor(options: GeneratorOptions = {}) {
    this.fakerInstance = faker;

    if (options.locale) {
      // @faker-js/faker v8 uses a single `faker` instance per locale;
      // for simplicity we keep the default `en` locale and ignore locale
      // in this MVP unless the caller passes a known locale.
    }

    if (options.seed !== undefined) {
      this.fakerInstance.seed(options.seed);
    }
  }

  // ---- User data -----------------------------------------------------------

  /**
   * Generate a complete synthetic user profile.
   */
  generateUserProfile(): UserProfile {
    const firstName = this.fakerInstance.person.firstName();
    const lastName = this.fakerInstance.person.lastName();

    return {
      id: this.fakerInstance.string.uuid(),
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      username: this.fakerInstance.internet.username({ firstName, lastName }),
      email: this.fakerInstance.internet.email({ firstName, lastName }),
      phone: this.fakerInstance.phone.number(),
      dateOfBirth: this.fakerInstance.date
        .birthdate({ min: 18, max: 80, mode: 'age' })
        .toISOString()
        .split('T')[0] ?? '',
      address: this.generateAddress(),
      company: this.generateCompany(),
      avatar: this.fakerInstance.image.avatar(),
      bio: this.fakerInstance.lorem.sentence({ min: 10, max: 20 }),
      createdAt: this.fakerInstance.date.past({ years: 3 }).toISOString(),
    };
  }

  /**
   * Generate a realistic email address.
   */
  generateEmail(): string {
    return this.fakerInstance.internet.email();
  }

  /**
   * Generate a realistic phone number.
   */
  generatePhone(): string {
    return this.fakerInstance.phone.number();
  }

  /**
   * Generate a postal address.
   */
  generateAddress(): AddressData {
    const lat = this.fakerInstance.location.latitude();
    const lon = this.fakerInstance.location.longitude();
    return {
      street: this.fakerInstance.location.streetAddress(),
      city: this.fakerInstance.location.city(),
      state: this.fakerInstance.location.state(),
      zipCode: this.fakerInstance.location.zipCode(),
      country: this.fakerInstance.location.country(),
      latitude: typeof lat === 'number' ? lat.toFixed(6) : String(lat),
      longitude: typeof lon === 'number' ? lon.toFixed(6) : String(lon),
    };
  }

  /**
   * Generate company details.
   */
  generateCompany(): CompanyData {
    return {
      name: this.fakerInstance.company.name(),
      department: this.fakerInstance.commerce.department(),
      jobTitle: this.fakerInstance.person.jobTitle(),
      catchPhrase: this.fakerInstance.company.catchPhrase(),
    };
  }

  // ---- Context-aware field generation --------------------------------------

  /**
   * Generate a value appropriate for the given `FieldType`.
   *
   * @param type    - Detected or declared field type.
   * @param options - Optional constraints (min, max, minLength, maxLength).
   */
  generateForFieldType(type: FieldType, options: GeneratorOptions = {}): string | number | boolean {
    const { min = 0, max = 100, minLength = 5, maxLength = 50 } = options;

    switch (type) {
      case 'email':
        return this.fakerInstance.internet.email();
      case 'firstName':
        return this.fakerInstance.person.firstName();
      case 'lastName':
        return this.fakerInstance.person.lastName();
      case 'fullName':
        return this.fakerInstance.person.fullName();
      case 'username':
        return this.fakerInstance.internet.username();
      case 'password':
        return this.fakerInstance.internet.password({ length: 12, memorable: false });
      case 'phone':
        return this.fakerInstance.phone.number();
      case 'street':
        return this.fakerInstance.location.streetAddress();
      case 'city':
        return this.fakerInstance.location.city();
      case 'state':
        return this.fakerInstance.location.state();
      case 'zipCode':
        return this.fakerInstance.location.zipCode();
      case 'country':
        return this.fakerInstance.location.country();
      case 'url':
        return this.fakerInstance.internet.url();
      case 'date':
        return this.fakerInstance.date.recent().toISOString();
      case 'integer':
        return this.fakerInstance.number.int({ min, max });
      case 'float':
        return this.fakerInstance.number.float({ min, max, fractionDigits: 2 });
      case 'boolean':
        return this.fakerInstance.datatype.boolean();
      case 'uuid':
        return this.fakerInstance.string.uuid();
      case 'text':
        return this.fakerInstance.lorem.sentence({ min: minLength, max: maxLength });
      case 'longText':
        return this.fakerInstance.lorem.paragraphs(3);
      case 'company':
        return this.fakerInstance.company.name();
      case 'jobTitle':
        return this.fakerInstance.person.jobTitle();
      case 'creditCardNumber':
        return this.fakerInstance.finance.creditCardNumber();
      case 'color':
        return this.fakerInstance.color.human();
      case 'ipAddress':
        return this.fakerInstance.internet.ip();
      case 'unknown':
      default:
        return this.fakerInstance.lorem.word();
    }
  }

  /**
   * Infer the `FieldType` from a field name using common naming conventions.
   *
   * @param fieldName - The HTML/form field name or label (case-insensitive).
   */
  inferFieldType(fieldName: string): FieldType {
    const name = fieldName.toLowerCase().replace(/[-_\s]/g, '');

    if (/email/.test(name)) return 'email';
    if (/firstname|givenname|forename/.test(name)) return 'firstName';
    if (/lastname|surname|familyname/.test(name)) return 'lastName';
    if (/fullname|displayname|name/.test(name)) return 'fullName';
    if (/username|handle|login/.test(name)) return 'username';
    if (/password|passwd|secret/.test(name)) return 'password';
    if (/phone|mobile|cell|tel/.test(name)) return 'phone';
    if (/street|address1|addr/.test(name)) return 'street';
    if (/city|town/.test(name)) return 'city';
    if (/state|province|region/.test(name)) return 'state';
    if (/zip|postal|postcode/.test(name)) return 'zipCode';
    if (/country|nation/.test(name)) return 'country';
    if (/url|website|homepage|link/.test(name)) return 'url';
    if (/date|birthday|dob/.test(name)) return 'date';
    if (/age|count|quantity|qty|amount|score|rank|integer|int/.test(name)) return 'integer';
    if (/price|rate|ratio|percent|float|decimal/.test(name)) return 'float';
    if (/active|enabled|verified|flag|bool/.test(name)) return 'boolean';
    if (/uuid|guid|id$/.test(name)) return 'uuid';
    if (/description|bio|summary|notes|comment/.test(name)) return 'longText';
    if (/company|employer|org|organization/.test(name)) return 'company';
    if (/job|title|role|position/.test(name)) return 'jobTitle';
    if (/card|creditcard|ccnumber/.test(name)) return 'creditCardNumber';
    if (/color|colour/.test(name)) return 'color';
    if (/ip|ipaddress/.test(name)) return 'ipAddress';

    return 'text';
  }

  /**
   * Generate `count` values for the given field, using type inference.
   *
   * @param fieldName - Field name used to infer the data type.
   * @param count     - Number of values to generate. Defaults to 1.
   * @param options   - Optional generation constraints.
   */
  generateForField(
    fieldName: string,
    count = 1,
    options: GeneratorOptions = {},
  ): Array<string | number | boolean> {
    const type = this.inferFieldType(fieldName);
    return Array.from({ length: count }, () => this.generateForFieldType(type, options));
  }

  /**
   * Generate `count` complete user profiles.
   */
  generateUserProfiles(count: number): UserProfile[] {
    return Array.from({ length: count }, () => this.generateUserProfile());
  }
}
