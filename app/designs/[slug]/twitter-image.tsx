// Route segment config must be statically analyzable, so it cannot be re-exported.
export { default } from "./opengraph-image";
export const alt = "Design preview";
export const size = { width: 1200, height: 630 }; // keep equal to OG_SIZE (segment config must be a literal)
export const contentType = "image/png";
export const runtime = "nodejs";
export const revalidate = 86400;
