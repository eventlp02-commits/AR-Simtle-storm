import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("produces a GitHub Pages-compatible static AR bundle", async () => {
  const [html, assets] = await Promise.all([
    readFile(new URL("../dist-static/index.html", import.meta.url), "utf8"),
    readdir(new URL("../dist-static/assets/", import.meta.url)),
  ]);

  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /\.\/assets\/[^"']+\.js/);
  assert.ok(assets.some((name) => /^vision\.worker-.*\.js$/.test(name)));

  const javascript = (
    await Promise.all(
      assets
        .filter((name) => name.endsWith(".js"))
        .map((name) => readFile(new URL(`../dist-static/assets/${name}`, import.meta.url), "utf8")),
    )
  ).join("\n");

  assert.match(javascript, /getUserMedia/);
  assert.match(javascript, /face_landmarker\.task/);
});

test("transpiles the public bundle for Safari 14 and older Chromium syntax", async () => {
  const assets = await readdir(new URL("../dist-static/assets/", import.meta.url));
  const javascript = (
    await Promise.all(
      assets
        .filter((name) => name.endsWith(".js"))
        .map((name) => readFile(new URL(`../dist-static/assets/${name}`, import.meta.url), "utf8")),
    )
  ).join("\n");

  assert.doesNotMatch(javascript, /\?\?=/, "bundle must not retain logical nullish assignment");
  assert.doesNotMatch(javascript, /\?\.(?:[A-Za-z_$]|\[|\()/, "bundle must not retain optional chaining");
});

test("includes the official GitHub Pages deployment workflow", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /pnpm build:static/);
  assert.match(workflow, /path: dist-static/);
});
