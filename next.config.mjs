/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint is not configured in this project; skip it during builds.
  eslint: { ignoreDuringBuilds: true },
  // OGL publishes raw ES modules from `src/` rather than a built bundle, so Next
  // has to compile it like first-party code.
  transpilePackages: ["ogl"],
};

export default nextConfig;
