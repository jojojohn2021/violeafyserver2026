/**
 * shipment_brand_owner_fulfilment.items[] field rename:
 * - legacy `deliverystatus` -> `itemdeliverystatus`
 * - legacy `status` -> `itemstatus`
 * Returns the item with the legacy keys removed (value carried over if the new key is missing).
 */
export const migrateFulfilmentItem = <T extends Record<string, any>>(item: T): T => {
  if (!item || typeof item !== 'object') {
    return item;
  }
  const hasDelivery = Object.prototype.hasOwnProperty.call(item, 'deliverystatus');
  const hasStatus = Object.prototype.hasOwnProperty.call(item, 'status');
  if (!hasDelivery && !hasStatus) {
    return item;
  }
  const { deliverystatus, status, ...rest } = item as any;
  const next: any = { ...rest };
  if (hasDelivery) {
    next.itemdeliverystatus = rest.itemdeliverystatus ?? deliverystatus ?? '';
  }
  if (hasStatus) {
    next.itemstatus = rest.itemstatus ?? status ?? '';
  }
  return next as T;
};

/** Reads the item-level delivery status, falling back to the legacy field name. */
export const getItemDeliveryStatus = (item: any): string =>
  String(item?.itemdeliverystatus ?? item?.deliverystatus ?? '');

/** Reads the item-level status, falling back to the legacy field name. */
export const getItemStatus = (item: any): string =>
  String(item?.itemstatus ?? item?.status ?? '');
