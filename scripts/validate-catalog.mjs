import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile(new URL("../public/payroute-products.json", import.meta.url), "utf8"));
if (catalog.version !== 1) throw new Error("지원하지 않는 카탈로그 버전입니다.");
if (catalog.currency !== "KRW") throw new Error("카탈로그 통화가 KRW가 아닙니다.");
if (!Array.isArray(catalog.games) || catalog.games.length !== 100) throw new Error(`게임 수 오류: ${catalog.games?.length ?? 0}`);
if (!Array.isArray(catalog.products) || catalog.products.length < 500) throw new Error(`상품 수 오류: ${catalog.products?.length ?? 0}`);
if (catalog.products.some(product => !product.sourceId || !product.gameSlug || !product.name || !Number.isFinite(product.price) || product.price <= 0)) {
  throw new Error("필수 값이 없거나 가격이 잘못된 상품이 있습니다.");
}
console.log(`${catalog.games.length}개 게임, ${catalog.products.length}개 상품 검증 완료`);
