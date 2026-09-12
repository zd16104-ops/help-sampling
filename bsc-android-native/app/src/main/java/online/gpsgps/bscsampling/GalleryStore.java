package online.gpsgps.bscsampling;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;

/** Writes an already-watermarked JPEG to the Android system gallery. */
final class GalleryStore {
    private static final String RELATIVE_PATH = "Pictures/巴松措采样/";

    private GalleryStore() {}

    static String displayName(String sampleCode, String clientRecordId) {
        String code = sampleCode == null ? "" : sampleCode.replaceAll("[^A-Za-z0-9._-]", "_");
        if (code.isEmpty()) code = "sample";
        String id = clientRecordId == null ? "record" : clientRecordId.replace("-", "");
        if (id.length() > 8) id = id.substring(0, 8);
        return "BSC-" + code + "-" + id + ".jpg";
    }

    static Uri save(Context context, File source, String name) throws IOException {
        if (!source.isFile()) throw new IOException("水印照片不存在");
        ContentResolver resolver = context.getContentResolver();
        Uri existing = find(resolver, name);
        if (existing != null) return existing;

        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, RELATIVE_PATH);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("无法创建相册文件");
        try {
            try (FileInputStream input = new FileInputStream(source);
                 OutputStream output = resolver.openOutputStream(uri)) {
                if (output == null) throw new IOException("无法打开相册文件");
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                output.flush();
            }
            ContentValues ready = new ContentValues();
            ready.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, ready, null, null);
            return uri;
        } catch (Exception e) {
            resolver.delete(uri, null, null);
            if (e instanceof IOException) throw (IOException) e;
            throw new IOException("写入相册失败", e);
        }
    }

    private static Uri find(ContentResolver resolver, String name) {
        String[] projection = {MediaStore.Images.Media._ID};
        String selection = MediaStore.Images.Media.DISPLAY_NAME + "=? AND "
                + MediaStore.Images.Media.RELATIVE_PATH + "=? AND "
                + MediaStore.Images.Media.IS_PENDING + "=0";
        try (Cursor cursor = resolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection, selection, new String[]{name, RELATIVE_PATH}, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                return Uri.withAppendedPath(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                        cursor.getString(0));
            }
        } catch (Exception ignored) {
            // A query failure is non-fatal; the insert below can still succeed.
        }
        return null;
    }
}
