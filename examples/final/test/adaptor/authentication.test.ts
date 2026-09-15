import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import { scryptPasswordHasher } from "../../src/adaptor/secondary/authentication/scryptPasswordHasher.js";
import { sessionTokenGenerator } from "../../src/adaptor/secondary/authentication/sessionToken.js";
import { PasswordHash } from "../../src/domain/user/passwordHash.js";
import { PlaintextPassword } from "../../src/domain/user/plaintextPassword.js";

describe("scrypt password hasher", () => {
  test("同じパスワードでも salt が違い、検証は本人だけ通る", async () => {
    const password = PlaintextPassword.schema.parse("correct horse battery staple");
    const first = await scryptPasswordHasher.hash(password);
    const second = await scryptPasswordHasher.hash(password);

    expect(first.unwrap()).not.toBe(second.unwrap());
    expect(await scryptPasswordHasher.verify(password, first)).toBe(true);
    expect(await scryptPasswordHasher.verify(PlaintextPassword.schema.parse("wrong password value"), first)).toBe(false);
    expect(JSON.stringify({ password, first })).toBe('{"password":"[REDACTED]","first":"[REDACTED]"}');
  });

  test("壊れたハッシュは例外ではなく false", async () => {
    const password = PlaintextPassword.schema.parse("correct horse battery staple");
    const broken = PasswordHash.schema.parse(`scrypt$${"A".repeat(22)}==$${"B".repeat(86)}==`);
    expect(await scryptPasswordHasher.verify(password, broken)).toBe(false);
  });
});

describe("session token generator", () => {
  test("平文は cookie 用、DB には SHA-256 のハッシュだけを置く", () => {
    const token = sessionTokenGenerator.generate();
    expect(token.plaintext.unwrap()).toMatch(/^[a-f0-9]{64}$/);
    expect(token.hash.unwrap()).toBe(createHash("sha256").update(token.plaintext.unwrap()).digest("hex"));
    expect(sessionTokenGenerator.generate().plaintext.unwrap()).not.toBe(token.plaintext.unwrap());
  });
});
