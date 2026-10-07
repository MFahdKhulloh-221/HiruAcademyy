# Quick deploy

1. Create Supabase project.
2. Import local `hiru_academy` PostgreSQL DB into empty Supabase app tables; retain migration history. Keep dumps private.
3. Create public bucket `hiru-media`; copy existing `Backend/storage/app/public` media with unchanged object paths.
4. Get Supabase S3 credentials, endpoint and region. Never put keys in frontend.
5. Create Render Web Service from branch `netlify-ui-baseline`, root `Backend`, Docker runtime, health path `/up`.
6. Fill Render env from `Backend/.env.production.example`. Generate stable APP_KEY privately. DB_URL uses Supabase **Session Pooler** with `sslmode=require`; DB_SSLMODE=require. APP_URL uses Render HTTPS URL; FRONTEND_URL uses actual Netlify HTTPS origin. SANCTUM_STATEFUL_DOMAINS is frontend host without scheme. Leave SESSION_DOMAIN=null. TRUSTED_PROXIES=* trusts forwarded protocol only behind Render ingress. Startup runs only `migrate --force`, never seeders. MEDIA_DISK=s3; AWS_ENDPOINT is supplied Supabase S3 endpoint. AWS_URL may stay empty: existing resolved media uses signed S3 URLs.
7. Copy Render URL.
8. Replace `RENDER_URL` in `Frontend/netlify-proxy.toml.example` with real HTTPS Render URL, then append rules to root `netlify.toml`. Example is inactive until copied. Preserve Origin, cookies, X-XSRF-TOKEN and Set-Cookie; do not cache authenticated responses.
9. Deploy Frontend on Netlify using root `netlify.toml`. Set build-time NEXT_PUBLIC_API_URL to actual frontend HTTPS origin, without `/api` suffix. Set matching Render FRONTEND_URL and SANCTUM_STATEFUL_DOMAINS. Local env stays localhost:3000/localhost:8000, MEDIA_DISK=public.
10. Test login + media upload through Netlify; check CSRF, logout and resolved media. Netlify proxy body limits may restrict large uploads despite backend limits.

Required Render env names: `APP_ENV`, `APP_DEBUG`, `APP_KEY`, `APP_URL`, `DB_CONNECTION`, `DB_URL`, `DB_SSLMODE`, `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS`, `SESSION_DRIVER`, `SESSION_DOMAIN`, `SESSION_SECURE_COOKIE`, `SESSION_HTTP_ONLY`, `SESSION_SAME_SITE`, `TRUSTED_PROXIES`, `CACHE_STORE`, `LOG_CHANNEL`, `LOG_LEVEL`, `MEDIA_DISK`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_BUCKET`, `AWS_ENDPOINT`, `AWS_URL`, `AWS_USE_PATH_STYLE_ENDPOINT`. Render supplies `PORT`. Optional explicit origin override: `CORS_ALLOWED_ORIGINS` (exact origins only).

Required Netlify env name: `NEXT_PUBLIC_API_URL` (public origin only; no secrets).
