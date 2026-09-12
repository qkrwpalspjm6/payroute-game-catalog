# Payroute Game Catalog

페이루트가 사용하는 공개 게임 상품 가격 카탈로그입니다.

- 한국 App Store 게임 매출 차트와 고정 핵심 게임에서 100개 게임 선정
- 한국 App Store 공개 페이지의 인앱 상품명과 원화 가격 수집
- 매일 03:15 KST에 GitHub Actions로 자동 갱신
- 검증을 통과한 변경만 자동 커밋
- 수집 실패 게임은 직전 정상 데이터를 유지

공개 데이터: `public/payroute-products.json`

로컬 갱신과 검증:

```sh
npm run refresh
npm run validate
```
