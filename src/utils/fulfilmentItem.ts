/**
 * shipment_brand_owner_fulfilment.items[] field rename:
 * legacy `deliverystatus` -> `itemdeliverystatus`.
 * Returns the item with the legacy key removed (value carried over if the new key is missing).
 */
export const migrateFulfilmentItem = <T extends Record<string, any>>(item: T): T => {
  if (!item || typeof item !== 'object' || !Object.prototype.hasOwnProperty.call(item, 'deliverystatus')) {
    return item;
  }
  const { deliverystatus, ...rest } = item as any;
  return { ...rest, itemdeliverystatus: rest.itemdeliverystatus ?? deliverystatus ?? '' } as T;
};

/** Reads the item-level delivery status, falling back to the legacy field name. */
export const getItemDeliveryStatus = (item: any): string =>
  String(item?.itemdeliverystatus ?? item?.deliverystatus ?? '');
