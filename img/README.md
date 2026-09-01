# 착장 예시 이미지

사이트가 여기 있는 파일을 먼저 찾고, 없을 때만 AI로 생성합니다.
파일이 있으면 생성 한도를 쓰지 않고 즉시 표시됩니다.

## 이름 규칙 (위에서부터 우선)

    {계절}-{체형}-{번호}.jpg     예: spring-pear-1.jpg
    {계절}-{번호}.jpg            예: spring-1.jpg
    outfit-{번호}.jpg            예: outfit-1.jpg   (모든 경우의 기본값)

- 계절: spring / summer / autumn / winter
- 체형: hourglass / rectangle / pear / inverted / apple
- 번호: 1~4 (뉴트럴 베이스 / 톤온톤 / 대비 조합 / 포인트 하나)

## 만드는 법

의류 페이지의 프롬프트를 Gemini 앱(gemini.google.com)이나 다른 이미지
생성기에 넣어 뽑은 뒤, 위 이름으로 저장하면 됩니다.
정사각형에 가까운 비율이 카드에 가장 잘 맞습니다.
