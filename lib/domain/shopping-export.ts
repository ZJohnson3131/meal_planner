export type ShoppingExportItem = {
  itemName: string;
  deltaQuantity: number | null;
  unit: string | null;
  reviewRequired: boolean;
};

/**
 * Creates a stable, line-oriented plaintext representation of shopping items.
 * A missing quantity intentionally omits the quantity rather than guessing it.
 */
export function exportShoppingListText(items: ShoppingExportItem[]): string {
  return items
    .map((item) => {
      const quantity =
        item.deltaQuantity === null
          ? ""
          : `: ${item.deltaQuantity}${item.unit ? ` ${item.unit}` : ""}`;
      const review = item.reviewRequired ? " [review]" : "";

      return `- ${item.itemName}${quantity}${review}`;
    })
    .join("\n");
}
