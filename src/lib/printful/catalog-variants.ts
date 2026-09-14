/**
 * Printful catalog variant ids, generated 2026-09-14 from the public
 * catalog API (GET https://api.printful.com/products/{id}). One entry
 * per garment, keyed by color name then size. Regenerate with the
 * snippet in docs/printful.md when a color is added.
 *
 * Do not edit by hand.
 */

export const PRINTFUL_VARIANTS: Record<string, { productId: number; model: string; colors: Record<string, { hex: string; sizes: Record<string, number> }> }> = {
  hoodie: {
    productId: 146,
    model: "18500",
    colors: {
      "Black": { hex: "#0b0b0b", sizes: { "S": 5530, "M": 5531, "L": 5532, "XL": 5533, "2XL": 5534 } },
      "Navy": { hex: "#131928", sizes: { "S": 5594, "M": 5595, "L": 5596, "XL": 5597, "2XL": 5598 } },
      "Sport Grey": { hex: "#9b969c", sizes: { "S": 5610, "M": 5611, "L": 5612, "XL": 5613, "2XL": 5614 } },
      "Forest Green": { hex: "#222E1F", sizes: { "S": 20570, "M": 20571, "L": 20572, "XL": 20573, "2XL": 20574 } },
    },
  },
  longSleeve: {
    productId: 356,
    model: "3501",
    colors: {
      "Black": { hex: "#131313", sizes: { "S": 10094, "M": 10095, "L": 10096, "XL": 10097, "2XL": 10098 } },
      "Navy": { hex: "#161324", sizes: { "S": 10124, "M": 10125, "L": 10126, "XL": 10127, "2XL": 10128 } },
      "Heather Forest": { hex: "#28332e", sizes: { "S": 16151, "M": 16152, "L": 16153, "XL": 16154, "2XL": 16155 } },
      "White": { hex: "#ffffff", sizes: { "S": 10142, "M": 10143, "L": 10144, "XL": 10145, "2XL": 10146 } },
    },
  },
};
