# Fix: Material Objectives and Attachments Not Saving

## Problem
The "Tujuan Pembelajaran" (Learning Objectives) and "Upload Lampiran" (Attachments) fields in the material creation form are not being saved to the database.

## Root Cause
1. **Objectives Field**: The `materials` table did not have an `objectives` column in the database schema.
2. **Attachments**: The storage bucket setup may not be complete, or there may be permission issues.

## Solution

### ⚠️ **IMPORTANT: Run SQL Script First**
Before testing, you MUST run the SQL script to add the objectives column:

1. **Open Supabase Dashboard** → **SQL Editor**
2. **Copy and paste** the following script:
   ```sql
   -- Add objectives column to materials table
   ALTER TABLE public.materials
   ADD COLUMN IF NOT EXISTS objectives TEXT;

   -- Add comment for documentation
   COMMENT ON COLUMN public.materials.objectives IS 'Learning objectives for the material';
   ```
3. **Click "Run"** to execute the script
4. **Verify** the column was added successfully

### Step 2: Verify Storage Setup (if needed)
If attachment uploads fail, also run:
```sql
-- Run this in Supabase SQL Editor
\i SQL/setup_storage_buckets.sql
```

### Step 2: Verify Storage Buckets
Ensure the storage buckets are properly set up by running the existing script:

```sql
-- Run this in Supabase SQL Editor
\i SQL/setup_storage_buckets.sql
```

This creates the 'materials' bucket for file attachments.

### Step 3: Code Changes Applied
The following code changes have been made:

1. **Added objectives column to materials table schema**
2. **Updated `saveMaterial()` function** in `admin.js` to include objectives field
3. **Updated `editMaterial()` function** to populate objectives when editing
4. **Updated material display** in `materi.js` to show objectives in detail view
5. **Updated database queries** to include the objectives field

### Step 4: Test the Fix

1. **Login to Admin Panel**
   - Go to `admin.html`
   - Login with admin credentials

2. **Create/Edit Material**
   - Go to Materials tab
   - Click "Tambah Materi" or edit existing material
   - Fill in "Tujuan Pembelajaran" field
   - Upload attachment (PDF/Video)
   - Save the material

3. **Verify Data is Saved**
   - Check that objectives appear in material detail view
   - Check that attachments are downloadable

### Step 5: Troubleshooting

If attachments still don't work:

1. **Check Browser Console** for upload errors
2. **Verify Bucket Exists** in Supabase Dashboard > Storage
3. **Check Permissions** - ensure authenticated users can upload to 'materials' bucket
4. **File Size/Type** - ensure files are under 5MB and correct format

If objectives still don't save:

1. **Run the SQL script** to add the objectives column
2. **Check Database** - verify column exists in materials table
3. **Check Console** for any JavaScript errors

## Files Modified
- `SQL/add_objectives_column.sql` (new)
- `admin.js` - saveMaterial, editMaterial, loadMaterials functions
- `materi.js` - material display and queries

## Files Referenced
- `SQL/setup_storage_buckets.sql` - for attachment storage setup
- `SQL/create_materials_table.sql` - original materials table schema