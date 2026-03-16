# Setup Admin Access untuk Manajemen Siswa

## Masalah: Tidak Bisa Mengakses Data Auth

Untuk menampilkan data siswa dari Supabase Authentication (bukan table profiles), diperlukan akses admin ke Supabase Auth API.

## Solusi: Menggunakan Service Role Key

### 1. **Dapatkan Service Role Key:**

1. **Buka Supabase Dashboard**
2. **Pilih Project** → **Settings** → **API**
3. **Copy "service_role" key** (bukan anon key)

### 2. **Update supabaseClient.js:**

**PERINGATAN:** Service role key sangat powerful dan hanya boleh digunakan di server-side atau admin panel yang aman!

```javascript
// supabaseClient.js - Untuk Admin Panel
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tsgldkyuktqpsbeuevsn.supabase.co';
// Gunakan SERVICE ROLE KEY untuk admin access
const supabaseServiceKey = 'your-service-role-key-here';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export { supabase };
```

### 3. **Atau Buat Client Terpisah untuk Admin:**

```javascript
// adminSupabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tsgldkyuktqpsbeuevsn.supabase.co';
const supabaseServiceKey = 'your-service-role-key-here';

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
```

### 4. **Update admin.js:**

```javascript
// Import admin client
import { supabaseAdmin } from './adminSupabaseClient.js';

// Gunakan supabaseAdmin untuk auth access
const { data: authUsers, error } = await supabaseAdmin.auth.admin.listUsers();
```

## Keamanan Penting:

- ❌ **Jangan commit service role key** ke repository
- ❌ **Jangan gunakan di client-side production**
- ✅ **Gunakan environment variables** di server
- ✅ **Simpan di .env file** (jangan commit)
- ✅ **Gunakan hanya untuk admin operations**

## Alternatif Aman:

Jika tidak ingin menggunakan service role key, tetap gunakan table `profiles` yang sudah ada dengan RLS policies yang tepat.

## Testing:

Setelah setup service role key:
1. Login ke admin panel
2. Data siswa akan diambil dari `auth.users`
3. Status akan menunjukkan konfirmasi email
4. Nama diambil dari `user_metadata`

**Catatan:** Implementasi saat ini sudah include fallback ke table profiles jika auth access gagal.