import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa esta pasta como raiz. Sem isso, um package-lock.json solto na home faz
  // o Turbopack varrer a home inteira e estourar a RAM.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
