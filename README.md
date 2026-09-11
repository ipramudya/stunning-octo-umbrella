# Technical Assignments

Result perancangan sistem absensi kerja dari rumah untuk karyawan, serta monitoring untuk HRD.

## Run The App

Prasyarat: Docker dengan Compose

```bash
# Turning On

## Mac Os, Linux
./scripts/demo.sh

## Windows PowerShell or Cmd:
scripts\demo.cmd

# Turning off

## Mac Os, Linux
./scripts/demo.sh down

## Windows PowerShell or Cmd:
scripts\demo.cmd down
```

## Access The App

Akun demo:

| Peran    | Nomor telepon    | Kata sandi     |
| -------- | ---------------- | -------------- |
| HRD      | `+6280000000001` | `Password1234` |
| Karyawan | `+6280000000002` | `Password1234` |

Akses Endpoint

- Aplikasi web: <http://localhost:3000>
- Dokumentasi API: <http://localhost:3001/api/docs>
- Status kesiapan Gateway: <http://localhost:3001/health/ready>

## Expanded Use Cases

1. Dua mekanisme absensi
   - Absensi reguler dengan clock in dan clock out.
   - Pengajuan absensi manual untuk tanggal atau waktu lampau.

2. Validasi lokasi dan geofencing
   - Mengambil koordinat serta akurasi GPS.
   - Memastikan karyawan berada dalam radius zona absensi.
   - HRD dapat mengubah lokasi dan radius zona melalui halaman coverage.

3. Workflow persetujuan absensi manual
   - Karyawan mengirim tanggal, waktu, lokasi, alasan, dan foto.
   - Status pengajuan: PENDING_REVIEW, RECORDED, atau REJECTED.
   - HRD dapat menerima atau menolak dengan alasan.
   - Sistem mencegah HRD menyetujui pengajuannya sendiri.

4. Riwayat absensi
   - Kalender dan detail riwayat untuk karyawan.
   - Monitoring HRD berdasarkan rentang tanggal.
   - Filter berdasarkan karyawan, sumber, status, dan jenis clock.
   - Pengelolaan bukti foto

5. Pengelolaan karyawan yang lebih lengkap
   - Pencarian, daftar, dan detail karyawan.
   - Tambah dan ubah profil.
   - Ubah nomor telepon.
   - Reset kata sandi sekaligus mencabut sesi lama.

## Expanded Technical Features

1. Autentikasi dan otorisasi
   - Role EMPLOYEE dan HRD.
   - Access token JWT.
   - Refresh token rotation, logout, dan deteksi penggunaan ulang token.
   - Rate limit untuk login, refresh token, dan API terautentikasi.

2. Arsitektur microservices
   - gateway, identity, dan attendance sebagai service terpisah.
   - REST API publik melalui Gateway.
   - Komunikasi internal menggunakan gRPC dan kontrak Protobuf.
   - mTLS antarservice dan token dengan audience khusus per service.
   - Identity dan Attendance memiliki skema Oracle DB terpisah.

3. API dan keamanan
   - OpenAPI/Scalar documentation.
   - Correlation ID diteruskan dari HTTP ke gRPC.
   - Pemeriksaan origin, batas body 64 KiB, JSON-only request, dan security headers.

4. Development dan delivery
   - Monorepo npm workspaces dengan Turborepo.
   - Migrasi dan seed database otomatis.
   - Docker image multi-stage, non-root, read-only filesystem.
   - Docker Compose menyiapkan seluruh environment demo.
   - Unit, integration, E2E, contract drift, lint, format, dan type checking.

## Struktur proyek

```text
apps/
  web/          Antarmuka Next.js
  gateway/      REST API publik dan adaptor gRPC
  identity/     Autentikasi, sesi, peran, dan data karyawan
  attendance/   Absensi, zona, persetujuan, dan bukti foto
packages/
  contracts/    Definisi Protobuf dan tipe TypeScript hasil generasi
  tsconfigs/    Konfigurasi TypeScript bersama
infra/          Inisialisasi Oracle dan PKI lokal
tests/          Pengujian integrasi dan E2E
```

Browser mengakses API melalui Gateway; komunikasi internal ke layanan Identity dan Attendance menggunakan gRPC dengan mTLS. Identity dan Attendance memakai skema Oracle terpisah, Redis menyimpan sesi dan data pembatasan permintaan, sedangkan bukti foto diunggah langsung ke MinIO melalui URL bertanda tangan.
