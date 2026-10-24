/**
 * The platform exists exclusively for the WebRadio desktop program.
 *
 * The database enforces this structurally: `Plugin`, `Theme` and `Release`
 * each carry a `Product` enum whose only member is `WEBRADIO`, and every
 * public query filters on it. A future contract migration would be required
 * to introduce another product — a request body cannot do it.
 *
 * This module is the server-side constant used by validation schemas and
 * public queries. Client components may use the label, but never decide
 * product eligibility.
 */
export const WEBRADIO_PRODUCT = 'WEBRADIO' as const;
export type WebRadioProduct = typeof WEBRADIO_PRODUCT;

export const WEBRADIO_PRODUCT_LABEL = 'WebRadio Desktop';
export const WEBRADIO_PRODUCT_DESCRIPTION =
  'Ausschließlich für das WebRadio-Desktop-Programm von Your Elite Systems.';

export function isWebRadioProduct(value: unknown): value is WebRadioProduct {
  return value === WEBRADIO_PRODUCT;
}

export function assertWebRadioProduct(value: unknown): asserts value is WebRadioProduct {
  if (!isWebRadioProduct(value)) {
    throw new Error('This resource is not part of the WebRadio product scope.');
  }
}
