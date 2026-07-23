/** @type {import('next').NextConfig} */
const nextConfig = {
  // Leaflet.draw's EditControl reacts poorly to React Strict Mode's double
  // mount in development (it renders the draw toolbar twice). Disabling strict
  // mode keeps a single toolbar. This has no effect on production behavior.
  reactStrictMode: false,
};

export default nextConfig;
