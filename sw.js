/* ============================================================
   SERVICE WORKER — Offline Support & Caching
   ============================================================ */

// v3: chuyển sang Bootstrap 5.3 (bootstrap-theme.css thay styles.css/v13).
// Bump version để xoá cache cũ, buộc client tải lại toàn bộ.
const CACHE_NAME = "paint-more-20260707115237";
const RUNTIME_CACHE = "paint-more-runtime";
const IMAGE_CACHE = "paint-more-images";

// Chỉ precache vài tài nguyên ổn định. ES modules dùng network-first
// (xem fetch handler) để KHÔNG bao giờ phục vụ module cũ.
const urlsToCache = [
  "/",
  "/index.html",
  "/json/manifest.json",
  "/css/bootstrap-theme.css",
  "/js/KM.js",
  "/js/toast-notifications.js",
];

// Install event — cache essential files
self.addEventListener("install", (event) => {
  // Kích hoạt SW mới NGAY, không chờ tab cũ đóng → đẩy bản vá tới mọi khách.
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Caching essential files");
        // addAll là atomic: 1 file 404 làm hỏng cả install → cache lẻ, bỏ qua lỗi.
        return Promise.allSettled(urlsToCache.map((u) => cache.add(u)));
      })
      .catch((error) => {
        console.error("[SW] Cache install error:", error);
      })
  );
});

// Activate event — clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Giữ cache versioned hiện tại + runtime + images (trước đây
          // "paint-more-images" bị xoá MỖI LẦN activate → cache ảnh vô dụng).
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE && cacheName !== IMAGE_CACHE) {
            console.log("[SW] Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event — serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Chỉ xử lý request cùng origin. Cross-origin (Google Fonts, ComfyUI proxy…)
  // để trình duyệt tự lo — tránh SW chặn/treo request bên ngoài.
  if (url.origin !== self.location.origin) {
    return;
  }

  // "accept" có thể là null với fetch() → tránh .includes() trên null (ném lỗi,
  // làm treo request và khiến tab "quay suốt").
  const accept = request.headers.get("accept") || "";

  // Skip API calls for now (they need fresh data)
  if (url.pathname.includes("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses
          if (response.ok) {
            const cache = caches.open(RUNTIME_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // Return cached version if available
          return caches.match(request);
        })
    );
    return;
  }

  // HTML files — network first with cache fallback
  if (request.mode === "navigate" || accept.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cache = caches.open(RUNTIME_CACHE);
          cache.then((c) => c.put(request, response.clone()));
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return (
              cached ||
              caches.match("/index.html").then((response) => {
                return (
                  response ||
                  new Response(
                    "<!DOCTYPE html><html><body><h1>Offline</h1><p>Không thể tải trang này khi offline</p></body></html>",
                    { headers: { "Content-Type": "text/html" } }
                  )
                );
              })
            );
          });
        })
    );
    return;
  }

  // Images — cache first with network fallback
  if (request.destination === "image") {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((response) => {
          return (
            response ||
            fetch(request)
              .then((networkResponse) => {
                cache.put(request, networkResponse.clone());
                return networkResponse;
              })
              .catch(() => {
                // Return placeholder image if offline
                return new Response(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#e0e0e0"/></svg>',
                  { headers: { "Content-Type": "image/svg+xml" } }
                );
              })
          );
        });
      })
    );
    return;
  }

  // CSS and JS (kể cả ES modules) — NETWORK FIRST, cache fallback.
  // Tránh phục vụ module cũ sau khi cập nhật; vẫn chạy offline nhờ fallback.
  if (
    request.destination === "style" ||
    request.destination === "script" ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css")
  ) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Default — cache first, luôn trả về một Response hợp lệ (không để undefined
  // lọt ra respondWith → request treo).
  event.respondWith(
    caches
      .match(request)
      .then((response) => response || fetch(request))
      .catch(() => caches.match(request).then((c) => c || Response.error()))
  );
});

// Background sync — sync classification results when back online
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-classifications") {
    event.waitUntil(
      (async () => {
        try {
          const cache = await caches.open(RUNTIME_CACHE);
          const response = await cache.match("/api/v1/classify/history");
          if (response) {
            console.log("[SW] Syncing classification history...");
            // Sync could happen here
          }
        } catch (error) {
          console.error("[SW] Sync error:", error);
        }
      })()
    );
  }
});

// Push notifications for important updates
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};

  const options = {
    body: data.body || "Paint & More update",
    icon: "/image/logo-painmore.png",
    badge: "/image/logo-painmore.png",
    tag: "paint-more-notification",
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Paint & More", options)
  );
});

console.log("[SW] Service worker registered");
