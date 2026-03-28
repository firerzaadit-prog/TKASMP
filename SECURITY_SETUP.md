# Keamanan Sistem - Setup untuk Produksi

## ⚠️ PERINGATAN - Sebelum Deploy ke Publik

Sistem ini telah diperbaiki dari kerentanan keamanan kritis. Ikuti langkah-langkah di bawah ini dengan teliti sebelum deploying ke production.

---

## 🔒 Perubahan Keamanan yang Dilakukan

### 1. Service Role Key Tidak Lagi di Client-Side
**Sebelum:** Service role key ter-expose di browser (aman sekali sangat berbahaya!)
**Sesudah:** Menggunakan Edge Functions dengan service role key hanya di server

### 2. Admin Credentials Tidak Lagi Hardcoded
**Sebelum:** `username: 'admin', password: 'admin123'` terlihat di kode
**Sesudah:** Menggunakan Supabase Auth untuk login admin

### 3. RLS Policies Diperbaiki
**Sebelum:** Banyak policy menggunakan `USING (true)` yang mengizinkan akses terbuka
**Sesudah:** Policies yang proper berdasarkan role

---

## 📋 Langkah-Langkah Setup (WAJIB DIIKUTI)

### Langkah 1: Setup Database Schema

Buka **Supabase Dashboard → SQL Editor** dan jalankan file-file berikut:

1. **Jalankan `app/SQL/fix_admin_auth_security.sql`**
   - Membuat tabel `admin_users`
   - Menambahkan column `role` di tabel `profiles`
   - Membuat function `is_admin()` dan `is_super_admin()`

2. **Jalankan `app/SQL/fix_production_rls_policies.sql`**
   - Memperbaiki policies untuk tabel: materials, questions, exam_sessions, profiles
   - Batasi akses storage bucket

**SETELAH MENJALANKAN SQL, LAKUKAN INI:**

```sql
-- GANTI 'admin@tka.com' dengan email admin yang ingin digunakan
UPDATE public.profiles 
SET role = 'super_admin'
WHERE email = 'admin@tka.com';

-- Insert ke tabel admin_users
INSERT INTO public.admin_users (id, email, role, is_admin)
SELECT id, email, 'super_admin', true
FROM auth.users 
WHERE email = 'admin@tka.com'
ON CONFLICT (id) DO UPDATE SET
    role = 'super_admin',
    is_admin = true;
```

### Langkah 2: Deploy Edge Function

Buka terminal dan jalankan:

```bash
# Login ke Supabase
supabase login

# Deploy Edge Function untuk admin-get-users
supabase functions deploy admin-get-users
```

**PENTING:** Setelah deploy, pergi ke **Supabase Dashboard → Edge Functions → admin-get-users → Secrets** dan pastikan:
- `SUPABASE_URL` = `https://tsgldkyuktqpsbeuevsn.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = [Your Service Role Key]

### Langkah 3: Setup Environment Variables di Vercel

Buka **Vercel Dashboard → Project Settings → Environment Variables** dan tambahkan:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | `https://tsgldkyuktqpsbeuevsn.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | [Service Role Key dari Supabase] |

---

## 🔧 File yang Diubah

### Client-Side (Frontend)
| File | Perubahan |
|------|-----------|
| `app/admin.html` | Ganti service role key → anon key |
| `app/admin.js` | Ganti hardcoded credentials → Supabase Auth |
| `app/clientSupabase.js` | Tetap gunakan anon key (aman) |

### Server-Side (Edge Functions)
| File | Deskripsi |
|------|-----------|
| `supabase/functions/admin-get-users/index.ts` | Edge Function untuk mengambil data users |
| `app/supabase/functions/admin-get-users/index.ts` | Copy untuk backup |

### Database (SQL)
| File | Deskripsi |
|------|-----------|
| `app/SQL/fix_admin_auth_security.sql` | Setup admin authentication |
| `app/SQL/fix_production_rls_policies.sql` | Perbaiki RLS policies |

---

## ✅ Checklist Sebelum Launch

- [ ] SQL scripts sudah dijalankan di Supabase
- [ ] Email admin sudah di-set di database
- [ ] Edge Function sudah di-deploy
- [ ] Environment variables sudah diset di Vercel
- [ ] Service role key sudah dihapus dari client-side code
- [ ] Admin login sudah diuji dengan email/password baru
- [ ] RLS policies sudah diverifikasi

---

## 🔐 Cara Login sebagai Admin

1. Buka halaman `indexadmin.html`
2. Masukkan **email** admin (bukan username)
3. Masukkan **password** yang sama saat buat akun di Supabase Auth
4. Jika email tersebut memiliki role `admin` atau `super_admin`, akan berhasil login

---

## ⚠️ Troubleshooting

### Error: "Admin access only"
Pastikan user telah memiliki role admin di database:
```sql
SELECT * FROM public.admin_users WHERE email = 'admin@email.com';
```

### Error: "Edge Function tidak ditemukan"
Pastikan Edge Function sudah di-deploy:
```bash
supabase functions list
```

### Data tidak muncul
Pastikan RLS policies sudah benar. Cek dengan:
```sql
-- Cek policies yang aktif
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

---

## 📞 Support

Jika ada masalah, periksa:
1. Console browser untuk error messages
2. Network tab untuk request yang gagal
3. Supabase Dashboard → Logs untuk Edge Function errors