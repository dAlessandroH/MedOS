import type { NextConfig } from "next";

/**
 * MedOS se compila como sitio 100 % estático (sin servidor).
 * NEXT_PUBLIC_BASE_PATH = "/NombreDelRepo" cuando se publica en
 * https://usuario.github.io/NombreDelRepo/. Vacío en desarrollo local.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
