# Existing Business Flow Audit

## Register:
`/register` mengumpulkan Nama Lengkap, Email, Nomor WhatsApp, password, Target Ujian, Cara Belajar, dan optional Kode Referral (`Frontend/src/app/register/page.tsx:64-95`). Password hanya dipakai pada demo form; Batch 6 tidak mengubah auth.

Submit Free menuju `/dashboard?membership=free`. Plan berbayar menuju `/checkout?level=...&plan=lms|sensei` (`Frontend/src/app/register/page.tsx:20-24`).

## Program selection:
Public `/program` memilih level dan plan dari static presentation plus Batch 3 published Program price adapter. Checkout menerima `level` dan `plan` lewat query (`Frontend/src/app/checkout/page.tsx:13-24`). Base price tetap milik Program Store; promo memakai Campaign Store.

## Invoice:
Sebelum Batch 6, `/checkout` hanya melakukan redirect URL dan `/invoice` hanya menampilkan projection hard-coded. Sekarang `createPublicInvoice()` membuat invoice demo typed ke `hiru-admin-business:v1` sebelum redirect (`Frontend/src/app/checkout/page.tsx:22-31`). Invoice berstatus `Menunggu pembayaran`, menyimpan member/contact, program, plan, amount, optional referral, dan timeline.

## WhatsApp:
Public invoice sekarang menghasilkan link WhatsApp dari `getInvoiceWhatsAppUrl()` (`Frontend/src/app/invoice/page.tsx:20-100`). Admin invoice juga memakai template configurable. Membuka WhatsApp hanya navigasi komunikasi; tidak mengubah status invoice, commission, atau membership.

## Membership state:
Student UI tetap memakai membership demo dari query `?membership=free|lms|sensei`. `getEffectiveMembership()` memberi precedence ke query eksplisit, lalu current demo user store, lalu fallback Free (`Frontend/src/lib/business-store.ts:177-197`).

## Affiliate member flow:
Student `/affiliate` saat ini masih memakai fixture/local component state: kode `HIRU-HILMI25`, statistik, dan history tetap presentation demo (`Frontend/src/components/supporting-screen.tsx:226-381`). Batch 6 menyiapkan business source untuk admin operations dan invoice referral, tanpa merombak student affiliate UI.

## Current query membership behavior:
Preserved. Explicit `?membership=free`, `?membership=lms`, dan `?membership=sensei` tetap mengontrol QA/demo visual access. Business current-user state tidak menimpa explicit query.

# Architecture

Dedicated business store dipisah dari `admin-demo-store` generic:

- `Frontend/src/lib/admin-business-store.ts`
- `Frontend/src/lib/business-store.ts`
- localStorage key `hiru-admin-business:v1`
- same-tab event `hiru:business-change`
- robust normalizer untuk corrupt/incomplete data
- reactive `useSyncExternalStore`

Store domains:

- users
- invoices
- affiliates
- commissions
- payouts
- business settings
- demo activity

Tidak ada API, database, payment gateway, auth production, atau fake backend.

## Routes Migrated From AdminScreen

Empat route dedicated:

- `/admin/invoice` → `Frontend/src/app/admin/invoice/page.tsx`
- `/admin/pengguna-akses` → `Frontend/src/app/admin/pengguna-akses/page.tsx`
- `/admin/affiliate-komisi` → `Frontend/src/app/admin/affiliate-komisi/page.tsx`
- `/admin/pencairan-komisi` → `Frontend/src/app/admin/pencairan-komisi/page.tsx`

Keempat config dihapus dari generic `screens`; menu tetap ada pada `adminMenu`. Payout route menggunakan implementation Affiliate Operations yang sama, bukan payout system kedua.

# Business Store

Models typed mencakup Invoice, BusinessUser, AffiliateAccount, Commission, Payout, BusinessSettings, dan BusinessActivity. Initial demo data memiliki 4 invoice, 5 user, 2 affiliate, 2 payout, settings WhatsApp/commission, dan activity.

Atomic action helpers menjaga transition dan relasi:

- `updateInvoiceStatus`
- `generateCommissionForInvoice`
- `activateUserMembershipForInvoice`
- `markPayoutPaid`
- `createPublicInvoice`

Idempotency demo:

- Commission tidak dibuat dua kali untuk invoice sama.
- Invoice status transition tidak mengulang efek final secara bebas.
- Payout yang sudah `Sudah Dicairkan` tidak mengurangi saldo lagi.

## Invoice

### Fields:

- Invoice ID
- created date
- member name/email/WhatsApp
- program code
- plan
- amount
- target JLPT
- referral code/affiliate relation
- payment note
- transfer reference
- timeline

### Statuses:

- Draft
- Menunggu pembayaran
- Sudah bayar
- Diverifikasi
- Aktif

### Transitions:

Normal path:

```text
Draft
→ Menunggu pembayaran
→ Sudah bayar
→ Diverifikasi
→ Aktif
```

UI hanya menampilkan action valid untuk status aktif. Tidak ada free status dropdown. Transition `Diverifikasi` membuat commission terkait secara idempotent. Transition `Aktif` mengaktifkan user berdasarkan invoice secara atomik pada demo store.

### WhatsApp:

Admin dapat mengatur nomor WhatsApp dan template. Placeholder yang didukung:

- `{invoice_id}`
- `{name}`
- `{program}`
- `{plan}`
- `{level}`
- `{amount}`
- `{target}`

Detail invoice menampilkan link external WhatsApp berlabel jelas. Tidak mengubah status.

### Public connection:

Checkout membuat invoice demo real ke business store. Public invoice membaca ID invoice dari query dan menampilkan amount/status/member data ketika tersedia, dengan fallback projection untuk URL lama.

## Users & Membership

### User fields:

- Name
- Email
- WhatsApp
- Country
- Target JLPT
- Membership
- Purchased level
- Status
- Active since/until
- Referral code
- Related invoice IDs

### Membership:

Canonical internal values tetap `free`, `lms`, `sensei`, dengan labels:

- Free Member
- Belajar Mandiri
- Belajar dengan Sensei

### Access hierarchy:

Admin hanya menampilkan access summary informasional:

- Free: Chapter 1 preview
- DASAR: DASAR
- N5: DASAR + N5
- N4: DASAR + N5 + N4
- N3: DASAR + N5 + N4 + N3
- N2: DASAR + N5 + N4 + N3 + N2
- SSW: SSW
- Interview: Interview
- Sensei: fitur kelas/Sensei existing

Hierarchy tidak menjadi editable control. Student access authority tetap berada pada logic existing.

### Activation connection:

Invoice `Diverifikasi` menampilkan action `Aktifkan Membership`. Action memetakan `lms` atau `sensei`, purchased level, status aktif, active dates, invoice status `Aktif`, dan timeline dalam satu update store.

### Student connection:

Student routes memakai `getEffectiveMembership()`. Explicit query parameter tetap override current demo user, sehingga QA matrix tidak rusak. Tanpa query, current demo user business store dapat menjadi fallback membership.

# Affiliate

### Code:

Demo affiliates memiliki kode unik `HIRU-HILMI25` dan `HIRU-RINA`. Create affiliate menghasilkan code unik. Status `Nonaktif` menghentikan attribution baru tanpa menghapus history.

### Tracking:

Current student referral presentation masih fixture. Batch 6 tidak mengarang cookie/tracking pipeline; invoice dapat membawa referral code ketika purchase demo dibuat.

### Registrations:

Affiliate account menyimpan counter registrations, tetapi current public register belum menulis attribution event terpusat. Ini tetap demo limitation.

### Purchases:

Invoice menyimpan referral code/affiliate relation jika cocok. Purchase count dan commission hanya diproses pada invoice verification.

### Commission:

Commission dibuat sekali ketika invoice berpindah ke `Diverifikasi`:

- `Menunggu Validasi` bila validation period > 0
- `Tersedia` bila period 0
- `Sudah Dicairkan`
- `Dibatalkan`

Amount dihitung dari settings Percentage atau Nominal. Invoice creation dan status `Sudah bayar` belum membuat commission final.

### Settings:

Affiliate Operations menyediakan:

- program affiliate Active/Nonaktif;
- mode Percentage/Nominal;
- value;
- validation period days;
- save dan reload persistence.

Commission yang sudah ada tidak dihitung ulang diam-diam saat settings berubah.

# Payout

### Queue:

Payout list berada pada tab `Pencairan` di Affiliate Operations dan deep link `/admin/pencairan-komisi` memakai implementation sama.

### Statuses:

- Menunggu
- Diproses
- Sudah Dicairkan
- Ditolak

### Mark paid:

`Tandai Sudah Dicairkan` memakai confirmation dialog. Saat confirmed:

- payout status menjadi `Sudah Dicairkan`;
- `paidAt` diisi;
- included commissions menjadi `Sudah Dicairkan`;
- affiliate unpaid balance berkurang;
- paid balance bertambah.

### Idempotency:

Payout dengan status final langsung return pada action berikutnya. Commission relation juga tidak diproses dua kali.

# Dashboard Data Migration

Dashboard (`Frontend/src/app/admin/page.tsx`) kini memakai business store untuk metric invoice dan payout:

- Invoice menunggu = invoice business berstatus menunggu pembayaran/sudah bayar.
- Pencairan menunggu = payout business berstatus Menunggu/Diproses.
- Item draf tetap berasal dari legacy generic store sampai domain content lain dimigrasikan sepenuhnya.
- Activity memakai business activity bila tersedia, fallback ke legacy demo activity.

Dashboard layout tidak diubah.

# Fixture / Demo Fallback Strategy

- Business store memiliki initial demo records.
- Public checkout invoice memakai business record baru.
- URL invoice lama tanpa ID tetap menampilkan fallback projection.
- Student/public membership query tetap prioritas.
- Existing public/student fixtures tidak dihapus.
- Existing `admin-demo-store` tetap dipakai unfinished Admin screens.

# Query Membership Compatibility

`getEffectiveMembership(queryMembership)` mempertahankan precedence:

1. explicit query `free`, `lms`, `sensei`;
2. current demo user business store;
3. `free` fallback.

Existing query-based QA paths tetap diuji untuk Dashboard dan supporting student surfaces.

# Responsive

Automated Batch 6 checks tanpa horizontal overflow:

- 360: table/detail menjadi usable dan controls wrap.
- 390: invoice, user detail, affiliate, payout confirmation usable.
- 768: compact operational layouts.
- 820: tablet layout stabil.
- 1024: desktop sidebar and operational workspace.
- 1440: table/detail layout readable.

# Regression

- Batch 1: 37/37 PASS.
- Batch 2: 11/11 PASS.
- Batch 3: 11/11 PASS.
- Batch 4: 29/29 PASS.
- Batch 5: 15/15 PASS.
- Batch 6: 33/33 PASS.
- Total: 136/136 PASS.

Covered critical student/public routes: Placement, Register, Program, Checkout, Invoice, Dashboard, Membership/query access, Journey, Practice, Try Out, Flashcards, Library, Replay, Notifications, Blog, Landing.

# Validation

- `npx next typegen`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS, 270 static pages
- Playwright full Admin regression: PASS, 136 tests

# Remaining OPEN

- Laravel/API persistence, PostgreSQL, centralized user identity, server authorization, and multi-admin concurrency.
- Payment proof, bank transfer reconciliation, and gateway integration remain outside scope.
- WhatsApp Business automation is not implemented; current action opens an encoded `wa.me` link.
- Production PII retention, consent audit, and lead ownership policy remain OPEN.
- Affiliate cookie/tracking and public registration attribution event contract remains OPEN.
- Production commission settlement/validation scheduler remains backend-owned.
- Exact membership activation duration and financial commission policy require client/backend confirmation.
- Student visuals continue using explicit query membership for demo QA; production session source remains OPEN.
No commit. No push.