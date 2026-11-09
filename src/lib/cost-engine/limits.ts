/**
 * Upper bounds for percentage inputs (assumption F-23). They exist to catch typing slips such as
 * 100 instead of 10, not to set policy: a value above a bound is rejected with a clear message.
 */
export const MAX_SCRAP_PERCENT = 50;
export const MAX_OVERHEAD_PERCENT = 100;
export const MAX_MARKUP_PERCENT = 200;
export const MAX_GST_PERCENT = 40;
