# MANGHO Detector

Helldivers 시리즈 갤러리의 `헬망호` 모집 글을 감지해서 브라우저 오버레이와 대시보드로 보여주는 Chrome 확장 프로그램입니다.

이 프로젝트는 [amature0000/mangho-detector](https://github.com/amature0000/mangho-detector)를 바탕으로 UI, 알림 모델, 상태 관리, 테스트 구조를 크게 정리한 파생 버전입니다.

## 주요 기능

- 30초 고정 주기의 MV3 백그라운드 감지
- 갤러리 목록의 헬망호 글에 인라인 `참가` 버튼 추가
- Windows 알림 대신 현재 활성 웹탭 오버레이 표시
- 주입할 수 없는 탭에서는 배지와 팝업 대시보드로 fallback
- 읽지 않은 모집 큐와 최근 감지 기록 제공
- `모두 읽음`, `오버레이 테스트`, 빠른 `열기` / `참가` 액션 제공

## 설치

1. 이 저장소를 내려받습니다.
2. Chrome 또는 Edge에서 `chrome://extensions/` 또는 `edge://extensions/`를 엽니다.
3. `개발자 모드`를 켭니다.
4. `압축해제된 확장 프로그램을 로드합니다`를 눌러 이 폴더를 선택합니다.

## 권한

- `storage`
- `alarms`
- `tabs`
- `scripting`
- `http://*/*`
- `https://*/*`

현재 활성 일반 웹탭 위에 오버레이를 띄우기 위해 넓은 호스트 권한을 사용합니다.

## 구조

- `manifest.json`: MV3 설정
- `scripts/background.js`: 서비스 워커 진입점
- `scripts/shared/seaf-background-core.js`: 감지, unread, 배지, 알림 코어
- `scripts/content.js`: 갤러리 인라인 버튼과 목록 페이지 런타임
- `scripts/shared/seaf-overlay.js`: 공용 오버레이 렌더러
- `popup/popup.html`, `popup/popup.js`, `popup/popup.css`: 팝업 대시보드

## 개발

- 의존성 설치: `npm install`
- 기본 테스트: `npm test`

참고:
이 머신에서는 `node --test`가 환경 문제로 출력 없이 비정상 종료하는 경우가 있어, 브라우저 실기 QA를 함께 사용해 검증했습니다.
