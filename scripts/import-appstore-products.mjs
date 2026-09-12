import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const curatedGames = [
  ["ef", "명일방주: 엔드필드", "6752642477"],
  ["ak", "명일방주", "1473903308"],
  ["nk", "승리의 여신: 니케", "1585915174"],
  ["gi", "원신", "1517783697"],
  ["hs", "붕괴: 스타레일", "1599719154"],
  ["zzz", "젠레스 존 제로", "1606356401"],
  ["wuwa", "명조: 워더링 웨이브", "6475033368"],
  ["browndust2", "브라운더스트2", "6450099588"],
  ["sololeveling", "나 혼자만 레벨업: ARISE", "1662742277"],
  ["umamusume", "우마무스메 프리티 더비", "1616108452"],
  ["brawlstars", "브롤스타즈", "1229016807"],
  ["trickcal", "트릭컬", "6443824730"],
  ["nte", "이환", "6754593077"],
];

const CHART_URL = "https://itunes.apple.com/kr/rss/topgrossingapplications/limit=100/genre=6014/json";
const TARGET_GAME_COUNT = 100;

const chartResponse = await fetch(CHART_URL, { headers: { "user-agent": "JMHub/1.0 product catalog updater" } });
if (!chartResponse.ok) throw new Error(`App Store KR game chart ${chartResponse.status}`);
const chart = await chartResponse.json();
const chartEntries = Array.isArray(chart?.feed?.entry) ? chart.feed.entry : [];
const chartGames = chartEntries.map(entry => {
  const appId = String(entry?.id?.attributes?.["im:id"] || "").trim();
  const name = String(entry?.["im:name"]?.label || "").trim();
  return [`app-${appId}`, name, appId];
}).filter(([, name, appId]) => name && /^\d+$/.test(appId));
const chartRankByAppId = new Map(chartGames.map((game, index) => [game[2], index + 1]));

const games = [];
const knownAppIds = new Set();
for (const game of [...curatedGames, ...chartGames]) {
  if (knownAppIds.has(game[2]) || games.length >= TARGET_GAME_COUNT) continue;
  knownAppIds.add(game[2]);
  games.push(game);
}
console.log(`한국 게임 매출 차트와 고정 목록에서 ${games.length}개 게임을 선정했습니다.`);

const webStores = {
  ef: { url: "https://topup.gryphline.com/endfield", status: "login-required" },
  gi: { url: "https://sdk.hoyoverse.com/payment/genshin/ko/index.html", status: "login-required" },
  hs: { url: "https://sdk.hoyoverse.com/payment/hsr/index.html#/m", status: "login-required" },
  zzz: { url: "https://sdk.hoyoverse.com/payment/nap/index.html#/m", status: "login-required" },
  wuwa: { url: "https://payment.kurogame-service.com/pay/wutheringwaves", status: "login-required" },
  sololeveling: { url: "https://slvshop.netmarble.com/ko/item", status: "login-required" },
  brawlstars: { url: "https://store.supercell.com/brawlstars", status: "login-required" },
  nte: { url: "https://nte.perfectworld.com/payment/web/index.html", status: "login-required" },
};

const decode = (value) => value.replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16))).replace(/\\n/g, " ").replace(/\\\"/g, '"').trim();
const currencyAmount = (name) => {
  const match = name.match(/(?:x|×|\*)\s*([\d,]+)/i) || name.match(/([\d,]+)\s*개/);
  return match ? Number(match[1].replaceAll(",", "")) : 0;
};

async function collectIosProducts([gameSlug, gameName, appId]) {
  const sourceUrl = `https://apps.apple.com/kr/app/id${appId}`;
  try {
    const response = await fetch(sourceUrl, { headers: { "user-agent": "JMHub/1.0 product catalog updater" } });
    if (!response.ok) throw new Error(`App Store ${response.status}`);
    const html = await response.text();
    const matches = [...html.matchAll(/"leadingText":"((?:\\.|[^"\\])*)","trailingText":"￦([\d,]+)/g)];
    const seen = new Set();
    const products = [];
    for (const match of matches) {
      const name = decode(match[1]);
      const price = Number(match[2].replaceAll(",", ""));
      const key = `${name}\u0000${price}`;
      if (!name || !price || seen.has(key)) continue;
      seen.add(key);
      const digest = createHash("sha1").update(key).digest("hex").slice(0, 12);
      products.push({
        sourceId: `appstore-kr:${appId}:${digest}`,
        gameSlug,
        gameName,
        name,
        price,
        currencyAmount: currencyAmount(name),
        maxQuantity: null,
        platform: "ios",
        platformPriceDifferent: true,
        priceComparisonStatus: "apple-only",
        marketNames: ["애플 앱스토어"],
        sourceUrl,
        confidence: "structured",
      });
    }
    console.log(`${gameName}: ${seen.size}개`);
    return products;
  } catch (error) {
    console.warn(`${gameName}: 수집 실패 (${error instanceof Error ? error.message : error})`);
    return null;
  }
}

let previousCatalog = { products: [] };
try { previousCatalog = JSON.parse(await readFile(resolve("public/payroute-products.json"), "utf8")); } catch {}

const iosProducts = [];
const failedGameSlugs = new Set();
for (let index = 0; index < games.length; index += 8) {
  const batch = games.slice(index, index + 8);
  const results = await Promise.all(batch.map(collectIosProducts));
  results.forEach((products, offset) => {
    if (products) iosProducts.push(...products);
    else failedGameSlugs.add(batch[offset][0]);
  });
}
for (const product of Array.isArray(previousCatalog.products) ? previousCatalog.products : []) {
  if (product?.platform === "ios" && failedGameSlugs.has(product.gameSlug)) iosProducts.push(product);
}

let verifiedWebProducts = [];
try {
  const input = JSON.parse(await readFile(resolve("data/web-store-products.json"), "utf8"));
  verifiedWebProducts = (Array.isArray(input.products) ? input.products : []).filter(product => product?.gameSlug && product?.name && Number(product.price) > 0).map(product => {
    const store = webStores[product.gameSlug];
    const key = `${product.gameSlug}\u0000${product.name}\u0000${Number(product.price)}`;
    return { sourceId:`webstore-kr:${product.gameSlug}:${createHash("sha1").update(key).digest("hex").slice(0,12)}`, gameSlug:product.gameSlug, gameName:games.find(([slug])=>slug===product.gameSlug)?.[1] || product.gameName, name:product.name, price:Number(product.price), currencyAmount:Math.max(0,Number(product.currencyAmount)||0), maxQuantity:product.maxQuantity ?? null, platform:"web", platformPriceDifferent:false, priceComparisonStatus:"web-only", marketNames:["웹 상점"], sourceUrl:product.sourceUrl || store?.url || "", confidence:"structured" };
  });
} catch {}

const normalizeName = (value) => String(value || "").normalize("NFKC").replace(/\s+/g, "").replace(/\(iOS\)$/i, "").toLocaleLowerCase();
const webKeys = new Set(verifiedWebProducts.map(product => `${product.gameSlug}:${normalizeName(product.name)}:${product.price}`));
const products = [
  ...verifiedWebProducts,
  ...iosProducts.filter(product => !webKeys.has(`${product.gameSlug}:${normalizeName(product.name)}:${product.price}`)),
];

const catalog = {
  version: 1,
  updatedAt: new Date().toISOString(),
  source: "Official web stores + Apple App Store KR",
  currency: "KRW",
  selectionPolicy: {
    market: "KR",
    chart: "Apple App Store 게임 매출",
    targetGameCount: TARGET_GAME_COUNT,
    chartUrl: CHART_URL,
    pinnedGameCount: curatedGames.length,
  },
  pricingPolicy: {
    primarySource: "한국 Apple App Store 앱 내 구입",
    differentPriceLabel: "iOS",
    samePriceLabel: "",
    unknownPriceLabel: "iOS",
    note: "공식 웹 상점과 이름·가격이 같은 iOS 상품은 숨기고 웹 상점 상품만 표시하며, 가격이 다르거나 비교할 수 없는 iOS 상품만 iOS 전용으로 표시",
  },
  games: games.map(([slug, name, appId]) => ({ slug, name, appId, krGrossingRank:chartRankByAppId.get(appId) || null, webStoreUrl:webStores[slug]?.url || "", webStoreStatus:webStores[slug]?.status || "none" })),
  products,
};

const comparable = value => {
  const copy = structuredClone(value);
  delete copy.updatedAt;
  return JSON.stringify(copy);
};

if (comparable(previousCatalog) === comparable(catalog)) {
  console.log(`가격과 순위 변경 없음: 기존 ${products.length}개 상품을 유지합니다.`);
} else {
  await writeFile(resolve("public/payroute-products.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`총 ${products.length}개 상품을 public/payroute-products.json에 저장했습니다.`);
}
