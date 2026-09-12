package online.gpsgps.bscsampling;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.File;

/** Copies a local watermarked photo to MediaStore without requiring network access. */
public final class GalleryExportWorker extends Worker {
    private static final String TAG = "GalleryExportWorker";
    private static final String TASK_ID = "taskId";
    private static final String RECORD_ID = "recordId";
    private static final String PHOTO_PATH = "photoPath";

    public GalleryExportWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void enqueue(Context context, long taskId, String recordId, String photoPath) {
        Data input = new Data.Builder()
                .putLong(TASK_ID, taskId)
                .putString(RECORD_ID, recordId)
                .putString(PHOTO_PATH, photoPath)
                .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(GalleryExportWorker.class)
                .setInputData(input)
                .build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(
                "gallery-" + recordId, ExistingWorkPolicy.KEEP, request);
    }

    @NonNull
    @Override
    public Result doWork() {
        String path = getInputData().getString(PHOTO_PATH);
        String recordId = getInputData().getString(RECORD_ID);
        long taskId = getInputData().getLong(TASK_ID, 0);
        if (path == null || recordId == null || taskId == 0) return Result.failure();
        try {
            File source = new File(path);
            Task task = new Store(getApplicationContext()).task(taskId);
            String code = task == null ? "" : task.code();
            GalleryStore.save(getApplicationContext(), source,
                    GalleryStore.displayName(code, recordId));
            return Result.success();
        } catch (Exception e) {
            Log.w(TAG, "gallery export failed, attempt=" + getRunAttemptCount(), e);
            try {
                new Store(getApplicationContext()).log("warning",
                        "GALLERY_EXPORT " + e.getClass().getSimpleName() + ":" + e.getMessage());
            } catch (Exception ignored) {
                // Logging must never turn a recoverable gallery failure into a crash.
            }
            return getRunAttemptCount() < 2 ? Result.retry() : Result.failure();
        }
    }
}
