import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // 業務フローのテストは scrypt のハッシュ計算を役割ごとに繰り返すため、既定の 5 秒では足りない
    testTimeout: 30_000,
  },
});
