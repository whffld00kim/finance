// Finance — 저장된 사본으로 먼저 열고, 뒤에서 새 앱 파일을 받아 캐시를 바꿔 둔다 (2026-09-29, 투자 트래커와 같은 방식).
// 그전엔 네트워크 우선이라 열 때마다 앱 파일·라이브러리 응답을 기다렸다.
// 라이브러리(CDN)는 설치 때 받은 사본을 그대로 쓴다 (2026-10-12 — 아래 fetch 핸들러 주석).
// ⚠ index.html을 고치면 CACHE 버전을 올린다. 새 버전이 설치되면 페이지가 스스로 새로고침해 바로 새 화면이 뜬다.
// ⚠ index.html이 부르는 파일을 바꾸면 OWN·CDN 목록도 같이 고친다 (한 글자라도 다르면 미리 받아 둔 의미가 없다).
const CACHE = 'finance-v20261012b';

// 이 앱의 파일
const OWN = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg"
];

// 외부 라이브러리 (버전이 주소에 박혀 있어 내용이 안 바뀐다)
const CDN = [
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js"
];

// 캐시해도 되는 곳. 여기 없는 호스트는 손대지 않는다.
// ⚠ 이 목록을 넓히지 말 것 — 로그인(identitytoolkit)·DB(firebaseio)·Storage 응답까지 캐시되면
//    지난 응답이 되살아나 로그인이 이상하게 풀리거나 옛 데이터가 보인다.
const CDN_HOSTS = ["cdn.jsdelivr.net", "www.gstatic.com"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache => Promise.all([
    // 브라우저 HTTP 캐시(GitHub Pages max-age=600)를 거치지 않고 새로 받는다
    ...OWN.map(u => cache.add(new Request(u, { cache: 'reload' }))),
    ...CDN.map(u => cache.add(u)
      .catch(() => fetch(u, { mode: 'no-cors' }).then(r => cache.put(u, r)))
      .catch(() => {})),
  ])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // 이 앱의 옛 캐시만 지운다. 웹앱들이 같은 주소(github.io)를 나눠 써서 캐시 저장소도 하나다 —
      // 접두사를 안 가리면 다른 앱의 캐시까지 지운다
      .then(keys => Promise.all(keys.filter(k => k.startsWith('finance-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  const own = url.origin === self.location.origin && req.url.startsWith(self.registration.scope);
  if (!own && !CDN_HOSTS.includes(url.hostname)) return;

  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req);
    // 라이브러리(CDN)는 주소에 버전이 박혀 내용이 안 바뀐다 — 설치 때 받아 둔 사본을 그대로 쓴다.
    // 페이지의 라이브러리 요청은 no-cors라 응답이 불투명(opaque)해서 404·5xx도 status 0으로 보인다.
    // 종전처럼 백그라운드로 다시 받아 덮어쓰면 장애 응답이 좋은 사본을 밀어내 다음 실행이 먹통이 됐다 (2026-10-12)
    if (!own) return cached || fetch(req);
    const fresh = fetch(req.url, { cache: 'no-cache' }).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });
    if (cached) { e.waitUntil(fresh.catch(() => {})); return cached; }
    return fresh.catch(() => req.destination === 'document' ? cache.match('./index.html') : Response.error());
  }));
});
