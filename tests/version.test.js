import { describe, it, expect } from "vitest";
import { compareVersions, getLocalVersion } from "../server/lib/version.cjs";
import path from "path";
import fs from "fs/promises";
import os from "os";

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("0.0.0", "0.0.0")).toBe(0);
  });

  it("returns 1 when a > b", () => {
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1); // numeric, not lex
  });

  it("returns -1 when a < b", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(compareVersions("0.9.0", "1.0.0")).toBe(-1);
  });

  it("strips a leading 'v' prefix on either side", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3", "v1.2.3")).toBe(0);
    expect(compareVersions("v2.0.0", "v1.0.0")).toBe(1);
  });

  it("treats missing components as 0", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.2")).toBe(0);
  });

  it("only considers the first 3 components", () => {
    // x.y.z is the contract; extra parts are ignored
    expect(compareVersions("1.2.3.4", "1.2.3.99")).toBe(0);
  });

  it("treats non-numeric components as 0 so prerelease tags sort before stable", () => {
    // Defensive: "1.2.3-rc.1" -> patch parses as NaN -> 0, so it compares
    // as 1.2.0 vs 1.2.3, i.e. less than the stable release.
    expect(compareVersions("1.2.3-rc.1", "1.2.3")).toBe(-1);
    expect(compareVersions("1.2.3", "1.2.3-rc.1")).toBe(1);
  });
});

describe("getLocalVersion", () => {
  it("reads version + updateUrl from a package.json file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ltg-version-"));
    const pkgPath = path.join(tmp, "package.json");
    await fs.writeFile(
      pkgPath,
      JSON.stringify({ version: "9.8.7", updateUrl: "https://example.test/feed" }),
      "utf-8",
    );
    try {
      const result = await getLocalVersion(pkgPath);
      expect(result.version).toBe("9.8.7");
      expect(result.updateUrl).toBe("https://example.test/feed");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("returns empty updateUrl when package.json has no updateUrl field", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ltg-version-"));
    const pkgPath = path.join(tmp, "package.json");
    await fs.writeFile(
      pkgPath,
      JSON.stringify({ version: "0.1.0" }),
      "utf-8",
    );
    try {
      const result = await getLocalVersion(pkgPath);
      expect(result.updateUrl).toBe("");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("reads the repo's actual package.json by default", async () => {
    const result = await getLocalVersion();
    expect(typeof result.version).toBe("string");
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
