export function guestQrFilename(name: string): string {
  const asciiName = name
    .replace(/[Đđ]/g, (character) => character === "Đ" ? "D" : "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const slug = asciiName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "khach"}-thienlong.png`;
}
