import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, normalizeWhatsapp, formatPhone, whatsappLink, detectImageType, parseCount, safeNextPath,
} from './format.ts';

test('slugify produces DB-valid slugs', () => {
  assert.equal(slugify('Vasanth Kumar'), 'vasanth-kumar');
  assert.equal(slugify('  K. S. Ravi  '), 'k-s-ravi');
  assert.equal(slugify('Árjun   D’Souza'), 'arjun-d-souza');
  assert.match(slugify('x'.repeat(100)), /^[a-z0-9]{1,60}$/);
});

test('normalizeWhatsapp accepts common Indian formats', () => {
  for (const input of ['9606025056', '+91 96060 25056', '919606025056', '091-9606025056', '(+91) 96060-25056']) {
    assert.equal(normalizeWhatsapp(input), '919606025056', input);
  }
});

test('normalizeWhatsapp rejects junk and landline-looking numbers', () => {
  for (const input of ['', '12345', '1234567890', 'abc9606025056', '96060 2505', '9'.repeat(16)]) {
    assert.equal(normalizeWhatsapp(input), null, input);
  }
  assert.equal(normalizeWhatsapp('+44 7700 900123'), '447700900123');
});

test('formatPhone and whatsappLink', () => {
  assert.equal(formatPhone('919606025056'), '+91 96060 25056');
  assert.equal(whatsappLink('919606025056', 'Hi & hello'), 'https://wa.me/919606025056?text=Hi%20%26%20hello');
});

test('detectImageType uses magic bytes', () => {
  assert.equal(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
  assert.equal(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'webp');
  assert.equal(detectImageType(new TextEncoder().encode('<svg onload=alert(1)>')), null);
  assert.equal(detectImageType(new Uint8Array([])), null);
});

test('parseCount bounds input', () => {
  assert.equal(parseCount('12'), 12);
  assert.equal(parseCount(' 0 '), 0);
  for (const bad of ['-1', '1.5', '1e3', '', 'abc', '99999999', null]) assert.equal(parseCount(bad), null, String(bad));
});

test('safeNextPath blocks open redirects', () => {
  assert.equal(safeNextPath('/admin/team'), '/admin/team');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', null, '']) assert.equal(safeNextPath(bad), '/admin', String(bad));
});
