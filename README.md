# 퍼스널컬러 측정실

의존성 없는 단일 HTML 파일입니다. `index.html` 하나가 사이트 전부이고,
빌드·서버·API 키가 필요 없습니다. 사진은 브라우저 안에서만 처리되어
어디로도 전송되지 않습니다.

## 공개 사이트로 올리는 법

어느 쪽이든 이 폴더를 통째로 올리면 끝입니다.

- **Netlify Drop** — https://app.netlify.com/drop 에 이 폴더를 끌어다 놓기.
  로그인도 필요 없고 즉시 URL이 나옵니다. 가장 빠릅니다.
- **Cloudflare Pages** — Workers & Pages > Create > Pages > Upload assets.
- **GitHub Pages** — 저장소에 올린 뒤 Settings > Pages > Branch: main / root.
- **Vercel** — `vercel` CLI 또는 대시보드에서 폴더 업로드.

## 로컬에서 열기

`index.html`을 더블클릭하면 바로 열립니다. 단, 카메라 기능은 브라우저 정책상
`file://`에서 막히므로 카메라까지 쓰려면 로컬 서버로 여세요:

    python -m http.server 8000

그 뒤 http://localhost:8000 접속.

## 커스터마이즈 지점

- `TYPES` — 12타입의 명도/채도 시그니처와 설명문
- `HUES` — 계절별 색상환 기준 색상각
- `classify()` — 3축 가중치(웜쿨 0.45 / 명도 0.30 / 선명도 0.25)와 세부 타입 임계값
- `:root` — 색 토큰. UI는 색 판정을 방해하지 않도록 무채색으로 고정돼 있습니다.
