import { describe, expect, it } from 'vitest';
import { withEuroFromDate, type FormState } from '../src/popup/form';

const form = (patch: Partial<FormState>) => ({ euroClass: null, euroFromDate: false, firstRegistration: '2019-12-31', ...patch }) as unknown as FormState;

describe('Euro class filled from the first registration', () => {
  it('fills Euro 6 for a car first registered from 9/2015 when the listing has none', () => {
    expect(withEuroFromDate(form({}))).toMatchObject({ euroClass: '6', euroFromDate: true });
  });

  it('keeps a class from the listing or chosen by the client', () => {
    expect(withEuroFromDate(form({ euroClass: '6d-temp' }))).toMatchObject({ euroClass: '6d-temp', euroFromDate: false });
  });

  it('follows the date: cleared when the date no longer decides it', () => {
    const filled = withEuroFromDate(form({}));
    expect(withEuroFromDate({ ...filled, firstRegistration: '2012-05-10' })).toMatchObject({ euroClass: null, euroFromDate: false });
    expect(withEuroFromDate(form({ firstRegistration: '2014-11-30' }))).toMatchObject({ euroClass: null, euroFromDate: false });
  });
});
