import { describe, expect, test } from 'vitest';
import { computeAssignmentManifestSha256, type ManifestInput } from './manifest';

const baseInput: ManifestInput = {
  doc: {
    title: '1 月班費—茶會餐點',
    amount: '3200.00',
    currency: 'TWD',
    purpose: '迎新茶會點心採購',
    applicant: '活動長',
    owner_dept_id: 'activity',
    attachment_shas: ['a'.repeat(64), 'b'.repeat(64)],
  },
  assignments: [
    {
      signer_account_id: '11111111-1111-1111-1111-111111111111',
      role_label: '審核',
      sequence_order: null,
      slot_page: 1,
      slot_x: 100,
      slot_y: 200,
      slot_w: 160,
      slot_h: 60,
    },
    {
      signer_account_id: '22222222-2222-2222-2222-222222222222',
      role_label: '核准',
      sequence_order: null,
      slot_page: 1,
      slot_x: 300,
      slot_y: 200,
      slot_w: 160,
      slot_h: 60,
    },
  ],
};

describe('computeAssignmentManifestSha256', () => {
  test('returns a 64-char lowercase hex sha256', () => {
    const h = computeAssignmentManifestSha256(baseInput);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  test('is deterministic regardless of assignment array order', () => {
    const reordered: ManifestInput = {
      ...baseInput,
      assignments: [...baseInput.assignments].reverse(),
    };
    expect(computeAssignmentManifestSha256(reordered)).toBe(
      computeAssignmentManifestSha256(baseInput),
    );
  });

  test('changing a signer account id changes the hash', () => {
    const tampered: ManifestInput = {
      ...baseInput,
      assignments: [
        { ...baseInput.assignments[0], signer_account_id: '33333333-3333-3333-3333-333333333333' },
        baseInput.assignments[1],
      ],
    };
    expect(computeAssignmentManifestSha256(tampered)).not.toBe(
      computeAssignmentManifestSha256(baseInput),
    );
  });

  test('changing a slot coordinate changes the hash', () => {
    const tampered: ManifestInput = {
      ...baseInput,
      assignments: [
        { ...baseInput.assignments[0], slot_x: 999 },
        baseInput.assignments[1],
      ],
    };
    expect(computeAssignmentManifestSha256(tampered)).not.toBe(
      computeAssignmentManifestSha256(baseInput),
    );
  });

  test('changing an attachment hash changes the hash', () => {
    const tampered: ManifestInput = {
      ...baseInput,
      doc: { ...baseInput.doc, attachment_shas: ['a'.repeat(64), 'c'.repeat(64)] },
    };
    expect(computeAssignmentManifestSha256(tampered)).not.toBe(
      computeAssignmentManifestSha256(baseInput),
    );
  });

  test('attachment order does not change the hash', () => {
    const reordered: ManifestInput = {
      ...baseInput,
      doc: { ...baseInput.doc, attachment_shas: ['b'.repeat(64), 'a'.repeat(64)] },
    };
    expect(computeAssignmentManifestSha256(reordered)).toBe(
      computeAssignmentManifestSha256(baseInput),
    );
  });

  test('changing the amount changes the hash', () => {
    const tampered: ManifestInput = {
      ...baseInput,
      doc: { ...baseInput.doc, amount: '9999.00' },
    };
    expect(computeAssignmentManifestSha256(tampered)).not.toBe(
      computeAssignmentManifestSha256(baseInput),
    );
  });
});
