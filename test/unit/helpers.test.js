import { describe, it, expect } from 'vitest';
import { cleanedFilename, humanizeName } from '../../src/content/dom-utils.js';
import { iconName } from '../../src/content/icon-map.js';
import { parseColor } from '../../src/content/contrast-math.js';

describe('cleanedFilename', () => {
  it('turns /img/hero-mountain_02.jpg into "Hero Mountain"', () => {
    expect(cleanedFilename('/img/hero-mountain_02.jpg')).toBe('Hero Mountain');
  });

  it('strips query strings and hashes', () => {
    expect(cleanedFilename('https://cdn.example.com/a/b/red-balloon.png?v=123')).toBe('Red Balloon');
  });

  it('keeps a real word even when paired with hex junk', () => {
    expect(cleanedFilename('/assets/photo-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.jpg')).toBe('Photo');
  });

  it('rejects data URIs and empty sources', () => {
    expect(cleanedFilename('data:image/png;base64,iVBOR...')).toBeNull();
    expect(cleanedFilename('')).toBeNull();
    expect(cleanedFilename(null)).toBeNull();
  });

  it('handles dots, underscores and mixed case', () => {
    expect(cleanedFilename('hero.photo_final.PNG')).toBe('Hero Photo Final');
  });
});

describe('humanizeName', () => {
  it('humanizes snake_case field names', () => {
    expect(humanizeName('first_name')).toBe('First name');
    expect(humanizeName('email_address')).toBe('Email address');
  });

  it('humanizes camelCase field names', () => {
    expect(humanizeName('firstName')).toBe('First Name');
    expect(humanizeName('billingPostalCode')).toBe('Billing Postal Code');
  });

  it('humanizes kebab-case and spaces', () => {
    expect(humanizeName('country-code')).toBe('Country code');
    expect(humanizeName('  phone   number  ')).toBe('Phone number');
  });

  it('preserves acronyms', () => {
    expect(humanizeName('postalCodeID')).toBe('Postal Code ID');
  });

  it('returns null for empty input', () => {
    expect(humanizeName('')).toBeNull();
    expect(humanizeName(null)).toBeNull();
  });
});

describe('iconName', () => {
  it('resolves FontAwesome, Bootstrap and icon- classes', () => {
    expect(iconName(['fa', 'fa-twitter'])).toBe('Twitter');
    expect(iconName(['bi', 'bi-envelope'])).toBe('Email');
    expect(iconName(['farvard', 'icon-search'])).toBe('Search');
  });

  it('resolves glyphicon and material icons', () => {
    expect(iconName(['glyphicon', 'glyphicon-shopping-cart'])).toBe('Shopping cart');
    expect(iconName(['material-icons', 'search'])).toBe('Search');
  });

  it('matches longest class first', () => {
    // bi-cart vs bi-cart-fill: longest wins regardless of input order
    expect(iconName(['bi-cart-fill', 'bi-cart', 'bi'])).toBe('Shopping cart');
  });

  it('returns null when nothing matches', () => {
    expect(iconName(['foo', 'bar-baz'])).toBeNull();
    expect(iconName([])).toBeNull();
  });
});

describe('parseColor integrity', () => {
  it('#777 is the 4.48 boundary color used throughout the spec', () => {
    expect(parseColor('#777')?.r).toBe(0x77);
  });
});