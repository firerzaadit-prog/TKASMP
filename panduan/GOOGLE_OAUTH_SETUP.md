# Setup Google OAuth untuk EduLearn

## Error: redirect_uri_mismatch

Error ini terjadi karena redirect URI yang dikonfigurasi di Google OAuth tidak cocok dengan aplikasi.

## Langkah Setup:

### 1. Setup di Google Cloud Console:

1. **Buka [Google Cloud Console](https://console.cloud.google.com/)**
2. **Pilih project** atau buat project baru
3. **Buat OAuth 2.0 Client ID**:
   - APIs & Services → Credentials
   - Create Credentials → OAuth 2.0 Client IDs
   - Application type: **Web application**
   - **Authorized redirect URIs**: Tambahkan:
     ```
     https://your-project.supabase.co/auth/v1/callback
     ```
     (ganti `your-project` dengan nama project Supabase Anda)

### 2. Setup di Supabase Dashboard:

1. **Buka [Supabase Dashboard](https://supabase.com/dashboard)**
2. **Pilih project Anda**
3. **Authentication → Providers**
4. **Google → Enable**
5. **Masukkan credentials**:
   - Client ID: dari Google Cloud Console
   - Client Secret: dari Google Cloud Console
6. **Save changes**

### 3. Untuk Development (Localhost):

Jika menjalankan di localhost, tambahkan juga:
```
http://localhost:3000/auth/v1/callback
http://localhost:8000/auth/v1/callback
```

### 4. Test Login:

1. **Jalankan aplikasi** di localhost atau production
2. **Klik tombol "Google"** di halaman login
3. **Login dengan Google account**
4. **Harus redirect** ke dashboard tanpa error

## Troubleshooting:

- **Pastikan redirect URI** di Google Cloud Console cocok dengan Supabase callback URL
- **Check Supabase logs** jika masih error
- **Verify domain** di OAuth consent screen
- **Pastikan OAuth consent screen** sudah dikonfigurasi

## URL Callback Supabase:

Format: `https://{project-ref}.supabase.co/auth/v1/callback`

Contoh: `https://tsgldkyuktqpsbeuevsn.supabase.co/auth/v1/callback`