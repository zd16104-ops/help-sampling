package online.gpsgps.bscsampling;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.MotionEvent;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.android.material.button.MaterialButton;
import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONArray;

import java.io.File;
import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class PhotoActivity extends AppCompatActivity {
    static final String PATH = "path", AT = "at", WEATHER = "weather";
    private PreviewView camera;
    private MaterialButton shutter;
    private ImageCapture capture;
    private Camera cam;
    private volatile boolean busy;
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final ActivityResultLauncher<String> permission = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(), ok -> {
                if (ok) camera(); else finish();
            });

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_photo);
        camera = findViewById(R.id.camera);
        shutter = findViewById(R.id.shutter);
        shutter.setOnClickListener(v -> shoot());
        camera.setOnTouchListener((v, ev) -> {
            if (ev.getAction() == MotionEvent.ACTION_DOWN && cam != null) {
                try {
                    MeteringPoint point = camera.getMeteringPointFactory()
                            .createPoint(ev.getX(), ev.getY());
                    cam.getCameraControl().startFocusAndMetering(
                            new FocusMeteringAction.Builder(point).build());
                } catch (Exception ignored) {
                    // Autofocus failure does not prevent taking the evidence photo.
                }
            }
            return true;
        });
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) camera();
        else permission.launch(Manifest.permission.CAMERA);
    }

    private void camera() {
        ListenableFuture<ProcessCameraProvider> future =
                ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                ProcessCameraProvider provider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(camera.getSurfaceProvider());
                // Keep the existing evidence quality settings unchanged.
                capture = new ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                        .setJpegQuality(95)
                        .build();
                provider.unbindAll();
                cam = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA,
                        preview, capture);
            } catch (Exception e) {
                Toast.makeText(this, "相机启动失败", Toast.LENGTH_LONG).show();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void shoot() {
        if (capture == null || busy) return;
        busy = true;
        shutter.setEnabled(false);
        shutter.setText("已拍摄，处理中…");
        File raw = new File(getCacheDir(), "raw-" + System.currentTimeMillis() + ".jpg");
        capture.takePicture(
                new ImageCapture.OutputFileOptions.Builder(raw).build(),
                work,
                new ImageCapture.OnImageSavedCallback() {
                    @Override
                    public void onImageSaved(ImageCapture.OutputFileResults result) {
                        try {
                            String capturedAt = Util.now();
                            double lat = getIntent().getDoubleExtra("lat", 0);
                            double lon = getIntent().getDoubleExtra("lon", 0);
                            File dir = new File(getFilesDir(), "watermarked");
                            if (!dir.exists() && !dir.mkdirs()) {
                                throw new IOException("无法建立照片目录");
                            }
                            File out = new File(dir, "sample-" + System.currentTimeMillis() + ".jpg");
                            JSONArray lines = new JSONArray()
                                    .put(getIntent().getStringExtra("project") + "　"
                                            + getIntent().getStringExtra("code") + "　"
                                            + getIntent().getStringExtra("type"))
                                    .put(getIntent().getStringExtra("site") + "（历史 "
                                            + getIntent().getStringExtra("siteCode") + "）　采样员："
                                            + new Prefs(PhotoActivity.this).name())
                                    .put(String.format(Locale.CHINA,
                                            "WGS84 %.6f, %.6f　距点 %.0fm　精度 ±%.0fm",
                                            lat, lon,
                                            getIntent().getDoubleExtra("distance", 0),
                                            getIntent().getDoubleExtra("accuracy", 0)))
                                    .put(capturedAt.replace('T', ' '));
                            Watermark.render(raw, out, lines);
                            raw.delete();
                            runOnUiThread(() -> {
                                busy = false;
                                shutter.setEnabled(true);
                                shutter.setText("拍照");
                                setResult(RESULT_OK, new Intent()
                                        .putExtra(PATH, out.getPath())
                                        .putExtra(AT, capturedAt)
                                        .putExtra(WEATHER, "待服务器补充"));
                                finish();
                            });
                        } catch (Exception e) {
                            new Store(PhotoActivity.this).log("error", "PHOTO " + e.getMessage());
                            runOnUiThread(() -> {
                                busy = false;
                                shutter.setEnabled(true);
                                shutter.setText("重新拍照");
                                Toast.makeText(PhotoActivity.this, e.getMessage(),
                                        Toast.LENGTH_LONG).show();
                            });
                        }
                    }

                    @Override
                    public void onError(ImageCaptureException error) {
                        runOnUiThread(() -> {
                            busy = false;
                            shutter.setEnabled(true);
                            shutter.setText("重新拍照");
                            Toast.makeText(PhotoActivity.this, "照片拍摄失败，请重试",
                                    Toast.LENGTH_SHORT).show();
                        });
                    }
                });
    }

    @Override
    protected void onDestroy() {
        work.shutdown();
        super.onDestroy();
    }
}
