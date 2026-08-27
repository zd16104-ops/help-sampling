package online.gpsgps.bscsampling;
import android.content.Context;import androidx.annotation.NonNull;import androidx.work.Worker;import androidx.work.WorkerParameters;
public final class SyncWorker extends Worker{public SyncWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}@NonNull public Result doWork(){return new SyncEngine(getApplicationContext()).run().errors>0?Result.retry():Result.success();}}
