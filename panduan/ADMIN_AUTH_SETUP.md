# Panduan Setup Admin Authentication

## Overview

Sistem admin sekarang menggunakan **Supabase Auth** dengan **Role-Based Access Control (RBAC)** untuk keamanan yang lebih baik.

---

## 🔐 Fitur Hybrid Login

Admin dapat login dengan **Email** atau **Username**:
- Email: `admin@example.com` + password
- Username: `admin` + password

---

## 📋 Langkah-Langkah Setup

### 1. Jalankan SQL Schema

Buka Supabase SQL Editor dan jalankan file:

```sql
-- File: app/SQL/admin_auth_schema.sql
```

Atau copy-paste isi file tersebut ke SQL Editor.

---

### 2. Buat Akun Admin Pertama

#### Opsi A: Via Supabase Dashboard

1. Buka **Authentication > Users** di Supabase Dashboard
2. Klik **Add User** > **Create new user**
3. Isi email dan password admin
4. Setelah user dibuat, jalankan SQL:

```sql
-- Ganti dengan email admin yang baru dibuat
UPDATE profiles 
SET 
    role = 'super_admin'::user_role,
    username = 'admin'  -- Tambahkan username untuk hybrid login
WHERE email = 'admin@example.com';
```

#### Opsi B: Via Registration Page

1. Buka halaman pendaftaran (`daftarsekarang.html`)
2. Daftar dengan email admin
3. Jalankan SQL di Supabase:

```sql
UPDATE profiles 
SET 
    role = 'super_admin'::user_role,
    username = 'admin'  -- Username untuk login alternatif
WHERE email = 'admin@example.com';
```

---

### 3. Set Username untuk Admin (Opsional tapi Direkomendasikan)

```sql
-- Set username untuk admin yang sudah ada
UPDATE profiles 
SET username = 'admin' 
WHERE email = 'admin@example.com';

-- Atau untuk semua admin
UPDATE profiles 
SET username = LOWER(SPLIT_PART(email, '@', 1))
WHERE role IN ('admin', 'super_admin') AND username IS NULL;
```

---

### 4. Verifikasi Setup

Jalankan query berikut untuk memverifikasi:

```sql
-- Cek admin users dengan username
SELECT id, email, username, role FROM profiles 
WHERE role IN ('admin', 'super_admin');

-- Test fungsi resolve_login_identifier
SELECT resolve_login_identifier('admin');      -- Return email
SELECT resolve_login_identifier('admin@test.com'); -- Return email langsung

-- Cek apakah fungsi is_admin bekerja
SELECT is_admin('user-uuid-here');
```

---

## 🔐 Fitur Keamanan

| Fitur | Status |
|-------|--------|
| Password hashed | ✅ Otomatis oleh Supabase |
| JWT Token | ✅ Otomatis |
| Session timeout | ✅ Otomatis |
| Rate limiting | ✅ Otomatis |
| Audit logging | ✅ Tercatat di admin_audit_log |
| Multi-admin | ✅ Unlimited admin |
| Hybrid login | ✅ Email atau Username |

---

## 👥 Manajemen Admin

### Promote User ke Admin

```sql
-- Via SQL
SELECT promote_to_admin('user-uuid-here');

-- Atau langsung dengan username
UPDATE profiles 
SET 
    role = 'admin'::user_role,
    username = 'username_baru'
WHERE id = 'user-uuid-here';
```

### Demote Admin ke Student

```sql
-- Via SQL (hanya super_admin)
SELECT demote_from_admin('user-uuid-here');
```

### Lihat Semua Admin

```sql
SELECT id, nama_lengkap, email, username, role FROM profiles 
WHERE role IN ('admin', 'super_admin');
```

### Update Username Admin

```sql
-- Ganti username admin
UPDATE profiles 
SET username = 'admin_baru' 
WHERE email = 'admin@example.com';
```

---

## 📊 Audit Trail

Semua aktivitas admin tercatat di tabel `admin_audit_log`:

```sql
-- Lihat log aktivitas
SELECT 
    aal.*,
    p.nama_lengkap as admin_name
FROM admin_audit_log aal
JOIN profiles p ON aal.admin_id = p.id
ORDER BY aal.created_at DESC
LIMIT 50;
```

---

## 🔄 Migrasi dari Sistem Lama

Jika sebelumnya menggunakan hardcoded credentials:

1. **Hapus** kode lama di `admin.js`:
   ```javascript
   // HAPUS INI:
   const ADMIN_CREDENTIALS = {
       username: 'admin',
       password: 'admin123'
   };
   ```

2. **Update** login form untuk menggunakan email/username (sudah dilakukan)

3. **Buat** akun admin baru dengan Supabase Auth

---

## ⚠️ Troubleshooting

### Error: "Username tidak ditemukan"

Pastikan username sudah diset di tabel profiles:

```sql
-- Cek apakah username ada
SELECT email, username FROM profiles WHERE email = 'admin@example.com';

-- Set username jika belum ada
UPDATE profiles SET username = 'admin' WHERE email = 'admin@example.com';
```

### Error: "Profile not found"

Pastikan trigger untuk membuat profile sudah berjalan:

```sql
-- Cek trigger
SELECT * FROM pg_trigger WHERE tgname LIKE '%profile%';

-- Buat profile manual jika tidak ada
INSERT INTO profiles (id, email, nama_lengkap, role, username)
VALUES (
    'user-uuid', 
    'admin@example.com', 
    'Admin Name', 
    'super_admin'::user_role,
    'admin'
);
```

### Error: "Access denied. Admin privileges required"

Pastikan user memiliki role admin:

```sql
SELECT role, username FROM profiles WHERE email = 'admin@example.com';
```

### Error: "Function is_admin does not exist"

Jalankan ulang schema SQL:

```sql
-- File: app/SQL/admin_auth_schema.sql
```

---

## 📁 File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `app/SQL/admin_auth_schema.sql` | Schema database baru + hybrid login functions |
| `app/admin.js` | Autentikasi dengan Supabase Auth + hybrid login |
| `app/indexadmin.html` | Form login dengan email/username |

---

## 🎯 Keuntungan Sistem Baru

1. **Keamanan Tinggi** - Password tidak terlihat di source code
2. **Multi-Admin** - Bisa menambah admin tanpa ubah kode
3. **Audit Trail** - Semua aktivitas tercatat
4. **Session Management** - Token-based authentication
5. **Password Reset** - Fitur lupa password otomatis
6. **2FA Ready** - Bisa ditambahkan multi-factor auth
7. **Hybrid Login** - Bisa login dengan email atau username

---

## 📞 Support

Jika ada masalah, cek:
1. Supabase logs di Dashboard
2. Browser console untuk error JavaScript
3. Network tab untuk API errors
