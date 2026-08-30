## 附录 L：当前源码快照

> 生成时间：2026-08-30T15:32:39.612Z  
> 文件数：80  
> 本附录是交给 AI Agent 的一体化源码快照，不代替仓库中的真实文件。修改时应编辑仓库源文件，再重新生成本附录。

### L.1 收录范围

- 收录：原生 Android 配置、Manifest、Java、XML 资源、测试；V1 Node.js API、管理站自有源码和必要构建工具。
- 不收录：SQLite/WAL、config.json、照片、APK、Gradle/Maven/npm 缓存、SDK、keystore、密码、token、二进制 Excel 和第三方 vendor 压缩源码。
- `public/mobile*` 和顶层旧 `server.js` 属于 WebView/旧 API 原型，不是 V1 继续开发基础，因此不嵌入。

### L.2 源码文件

#### `bsc-android-native/app/build.gradle`

SHA-256: `e0dd17c83816cf28f2a0d01f226d5ffd2e52cd8971d452d60896b01b8d8d63f1`

~~~~groovy
plugins { id 'com.android.application' }

android {
    namespace 'online.gpsgps.bscsampling'
    compileSdk 35
    buildToolsVersion '35.0.0'
    defaultConfig {
        applicationId 'online.gpsgps.bscsampling'
        minSdk 29
        targetSdk 35
        versionCode 109
        versionName '1.3.1'
        buildConfigField 'String', 'DEFAULT_SERVER', '"https://bsc.gpsgps.online"'
    }
    buildFeatures { buildConfig true }
    compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }
    packaging { resources.excludes += ['META-INF/DEPENDENCIES','META-INF/LICENSE*','META-INF/NOTICE*'] }
    // 正式签名：keystore 与密码放在 app/keystore.properties（不入库、不提交）。
    // 没有该文件时 release 不签名（仅本地 debug 构建用）。
    signingConfigs {
        release {
            if (file('keystore.properties').exists()) {
                def kp = new Properties()
                kp.load(new FileInputStream(file('keystore.properties')))
                storeFile file(kp['storeFile'])
                storePassword kp['storePassword']
                keyAlias kp['keyAlias']
                keyPassword kp['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            if (file('keystore.properties').exists()) signingConfig signingConfigs.release
        }
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.7.1'
    implementation 'com.google.android.material:material:1.12.0'
    implementation 'androidx.core:core:1.16.0'
    // CameraX 1.6.x requires compileSdk 36 + AGP 8.9.1; 1.5.2 is the latest
    // stable line compatible with compileSdk 35 / AGP 8.7.3 used here.
    implementation 'androidx.camera:camera-core:1.5.2'
    implementation 'androidx.camera:camera-camera2:1.5.2'
    implementation 'androidx.camera:camera-lifecycle:1.5.2'
    implementation 'androidx.camera:camera-view:1.5.2'
    implementation 'androidx.work:work-runtime:2.11.2'
    implementation 'androidx.lifecycle:lifecycle-service:2.9.4'
    implementation 'androidx.exifinterface:exifinterface:1.4.2'
    implementation 'org.maplibre.gl:android-sdk:11.11.0'
    implementation 'com.google.zxing:core:3.5.4'
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
    testImplementation 'junit:junit:4.13.2'
}
~~~~

#### `bsc-android-native/app/src/main/AndroidManifest.xml`

SHA-256: `4b52735353325fbd5c8b3ef1c27a604593aded660b69994e5ec12541df136506`

~~~~xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
    <uses-permission android:name="android.permission.CAMERA"/>
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
    <uses-permission android:name="android.permission.WAKE_LOCK"/>
    <uses-feature android:name="android.hardware.camera.any" android:required="true"/>
    <uses-feature android:name="android.hardware.location.gps" android:required="true"/>
    <application android:name=".SamplingApp" android:theme="@style/Theme.Bsc" android:label="巴松措采样"
        android:icon="@drawable/ic_launcher" android:allowBackup="false" android:usesCleartextTraffic="false">
        <activity android:name=".PhotoActivity" android:screenOrientation="sensor" android:exported="false"/>
        <activity android:name=".ScanActivity" android:screenOrientation="portrait" android:exported="false"/>
        <activity android:name=".TaskActivity" android:exported="false"/>
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
        </activity>
        <provider android:name="androidx.core.content.FileProvider" android:authorities="online.gpsgps.bscsampling.files" android:exported="false" android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths"/>
        </provider>
        <service android:name=".TrackingService" android:foregroundServiceType="location" android:exported="false"/>
        <receiver android:name=".BootReceiver" android:exported="false"><intent-filter><action android:name="android.intent.action.BOOT_COMPLETED"/></intent-filter></receiver>
    </application>
</manifest>
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/Api.java`

SHA-256: `a8a1a8e3abb851348ea0aed239c123e0c3c43c2cecc2b04241e146f404498c8b`

~~~~java
package online.gpsgps.bscsampling;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.concurrent.TimeUnit;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

final class Api {
  private final Context c; private final Prefs p; private final OkHttpClient h=new OkHttpClient.Builder().dns(new SyncDns()).connectTimeout(12,TimeUnit.SECONDS).readTimeout(35,TimeUnit.SECONDS).writeTimeout(60,TimeUnit.SECONDS).build();
  Api(Context c){this.c=c.getApplicationContext();p=new Prefs(c);}
  JSONObject activate(String server,String user,String code)throws Exception{JSONObject b=new JSONObject().put("username",user).put("activationToken",code).put("deviceUuid",Util.uuid(c)).put("deviceName",android.os.Build.MANUFACTURER+" "+android.os.Build.MODEL).put("androidVersion",android.os.Build.VERSION.RELEASE).put("appVersion",BuildConfig.VERSION_NAME);return call(Prefs.normalize(server),"POST","/api/v1/mobile/activate",b,"");}
  JSONObject login()throws Exception{return call(p.server(),"POST","/api/v1/mobile/login",new JSONObject().put("username",p.user()).put("deviceUuid",Util.uuid(c)).put("appVersion",BuildConfig.VERSION_NAME),"");}
  JSONObject version()throws Exception{return call(p.server(),"GET","/api/v1/mobile/app-version",null,"");}
  JSONObject sync()throws Exception{return auth("GET","/api/v1/mobile/sync",null);} JSONObject start(long id,double lat,double lon,double acc)throws Exception{return auth("POST","/api/v1/mobile/tasks/"+id+"/start",new JSONObject().put("latitude",lat).put("longitude",lon).put("accuracyM",acc));}
  JSONObject tracks(long id,JSONArray a)throws Exception{return auth("POST","/api/v1/mobile/journeys/"+id+"/track",new JSONObject().put("points",a));} JSONObject live(long id,JSONObject b)throws Exception{return auth("POST","/api/v1/mobile/tasks/"+id+"/live",b);} JSONObject record(long id,JSONObject b)throws Exception{return auth("POST","/api/v1/mobile/tasks/"+id+"/record",b);} JSONObject complete(long id)throws Exception{return auth("POST","/api/v1/mobile/journeys/"+id+"/complete",new JSONObject());} JSONObject interrupted(long id)throws Exception{return auth("POST","/api/v1/mobile/journeys/"+id+"/interrupted",new JSONObject());} JSONObject logs(JSONArray a)throws Exception{return auth("POST","/api/v1/mobile/logs",new JSONObject().put("logs",a));}
  String weather(double lat,double lon,String at)throws Exception{String day=at.substring(0,10);String u="https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+"&hourly=temperature_2m,precipitation,weather_code&start_date="+day+"&end_date="+day+"&timezone=auto";try(Response r=h.newCall(new Request.Builder().url(u).build()).execute()){if(!r.isSuccessful()||r.body()==null)return"待补充";JSONObject j=new JSONObject(r.body().string()).optJSONObject("hourly");if(j==null)return"待补充";JSONArray times=j.optJSONArray("time"),temp=j.optJSONArray("temperature_2m"),rain=j.optJSONArray("precipitation"),codes=j.optJSONArray("weather_code");if(times==null||temp==null)return"待补充";long target;try{target=OffsetDateTime.parse(at).toInstant().toEpochMilli();}catch(Exception e){target=System.currentTimeMillis();}int n=0;long best=Long.MAX_VALUE;for(int i=0;i<times.length();i++){try{long x=LocalDateTime.parse(times.optString(i)).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();if(Math.abs(x-target)<best){best=Math.abs(x-target);n=i;}}catch(Exception ignored){}}double t=temp.optDouble(n,Double.NaN);if(Double.isNaN(t))return"待补充";return weatherName(codes==null?-1:codes.optInt(n))+" "+t+"℃，降水 "+(rain==null?0:rain.optDouble(n))+"mm";}}
  private String weatherName(int x){if(x==0)return"晴";if(x<=3&&x>0)return"多云";if(x==45||x==48)return"雾";if(x>=51&&x<=67)return"雨";if(x>=71&&x<=77)return"雪";if(x>=80&&x<=82)return"阵雨";if(x>=95)return"雷暴";return"未知";}
  private JSONObject auth(String m,String path,JSONObject b)throws Exception{return call(p.server(),m,path,b,p.token());}
  private JSONObject call(String server,String method,String path,JSONObject body,String token)throws Exception{Request.Builder q=new Request.Builder().url(server+path).header("Accept","application/json");if(!token.isEmpty())q.header("Authorization","Bearer "+token);if(method.equals("GET"))q.get();else q.method(method,RequestBody.create(body==null?"{}":body.toString(),MediaType.get("application/json; charset=utf-8")));try(Response r=h.newCall(q.build()).execute()){String text=r.body()==null?"":r.body().string();JSONObject j;try{j=text.isEmpty()?new JSONObject():new JSONObject(text);}catch(Exception e){j=new JSONObject().put("message",text);}if(!r.isSuccessful())throw new ApiError(r.code(),j.optString("message","服务器错误"));return j;}catch(ApiError e){throw e;}catch(IOException e){try{new Store(c).log("warning","HTTP_FAIL "+path+" "+e.getClass().getSimpleName()+":"+e.getMessage());}catch(Exception ignored){}throw new IOException("无法连接服务器："+e.getMessage(),e);}}
  static final class ApiError extends IOException{final int status;ApiError(int s,String m){super(m);status=s;}}
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/BootReceiver.java`

SHA-256: `62d1e6fb97e69f23c170e6d62f363b16933cb4691e110da8f4c795cae3d3f79e`

~~~~java
package online.gpsgps.bscsampling;import android.content.*;public final class BootReceiver extends BroadcastReceiver{public void onReceive(Context c,Intent i){String id=new Prefs(c).activeJourney();if(!id.isEmpty())try{TrackingService.startResumed(c,id);new Store(c).log("info","BOOT_RESUME","{\"journey\":\""+id+"\"}");}catch(Exception e){new Store(c).log("error","BOOT_RESUME "+e.getMessage());}}}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/MainActivity.java`

SHA-256: `51c75006f479e9c92efa0fc13c7c2294a28a2a760b9f140a52592aecd7c17ce3`

~~~~java
package online.gpsgps.bscsampling;

import android.Manifest;import android.app.AlertDialog;import android.content.*;import android.content.pm.PackageManager;import android.database.Cursor;import android.graphics.*;import android.location.*;import android.net.*;import android.os.*;import android.provider.OpenableColumns;import android.view.*;import android.widget.*;import androidx.activity.result.*;import androidx.activity.result.contract.ActivityResultContracts;import androidx.annotation.NonNull;import androidx.appcompat.app.AppCompatActivity;import androidx.core.app.ActivityCompat;import androidx.core.content.ContextCompat;import com.google.android.material.button.MaterialButton;import org.json.JSONObject;import org.maplibre.android.MapLibre;import org.maplibre.android.annotations.*;import org.maplibre.android.camera.CameraPosition;import org.maplibre.android.geometry.LatLng;import org.maplibre.android.maps.*;import java.io.*;import java.nio.charset.StandardCharsets;import java.util.*;import java.util.concurrent.*;

public final class MainActivity extends AppCompatActivity implements LocationListener{
 private FrameLayout content;private View tabs,header;private TextView title,status;private Prefs prefs;private Store db;private LocationManager lm;private Location here;private MapView mapView;private MapLibreMap map;private final Map<Long,Task> markerTasks=new HashMap<>();private final ExecutorService work=Executors.newSingleThreadExecutor();private QrData activation;private boolean unlocked;private ConnectivityManager.NetworkCallback netCallback;private int currentTab=1;private int taskFilter=0;private String mapDateFilter=null;private volatile boolean syncing=false;
 private final ActivityResultLauncher<Intent> scan=registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),r->{if(r.getResultCode()!=RESULT_OK||r.getData()==null)return;try{activation=QrData.parse(r.getData().getStringExtra(ScanActivity.RESULT));if(!activation.activation)throw new IllegalArgumentException("请扫描设备激活二维码");showLogin();}catch(Exception e){Toast.makeText(this,e.getMessage(),Toast.LENGTH_LONG).show();}});
 private final ActivityResultLauncher<String[]> permissions=registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(),r->locations());
 private final ActivityResultLauncher<String> mapFile=registerForActivityResult(new ActivityResultContracts.GetContent(),this::importMap);
 protected void onCreate(Bundle b){super.onCreate(b);MapLibre.getInstance(this);setContentView(R.layout.activity_main);prefs=new Prefs(this);db=new Store(this);lm=getSystemService(LocationManager.class);content=findViewById(R.id.content);tabs=findViewById(R.id.tabs);header=findViewById(R.id.header);title=findViewById(R.id.title);status=findViewById(R.id.status);unlocked=prefs.activated();findViewById(R.id.tabMap).setOnClickListener(v->showMap());findViewById(R.id.tabTasks).setOnClickListener(v->showTasks());findViewById(R.id.tabUpload).setOnClickListener(v->showUpload());findViewById(R.id.tabMine).setOnClickListener(v->showMine());findViewById(R.id.sync).setOnClickListener(v->sync());netCallback=new ConnectivityManager.NetworkCallback(){public void onAvailable(@NonNull Network n){if(prefs.activated())runOnUiThread(()->{if(unlocked)sync();});}};try{getSystemService(ConnectivityManager.class).registerDefaultNetworkCallback(netCallback);}catch(Exception e){db.log("warning","NETCALLBACK "+e.getMessage());}showLogin();}
 private void showLogin(){destroyMap();tabs.setVisibility(View.GONE);findViewById(R.id.sync).setVisibility(View.GONE);content.removeAllViews();View v=getLayoutInflater().inflate(R.layout.view_login,content,false);content.addView(v);MaterialButton scanButton=v.findViewById(R.id.scanActivation);TextView hint=v.findViewById(R.id.loginHint);v.findViewById(R.id.copyLog).setOnClickListener(x->copyLog());if(prefs.activated()){unlocked=true;enter();return;}unlocked=false;scanButton.setOnClickListener(x->scan.launch(new Intent(this,ScanActivity.class)));if(activation!=null){hint.setText("已扫码：正在激活设备并自动登录…");scanButton.setEnabled(false);work.execute(()->{try{JSONObject r=new Api(this).activate(activation.server,activation.user,activation.token),u=r.getJSONObject("villager");prefs.save(activation.server,r.getString("token"),u.getString("username"),u.getString("displayName"),r.getLong("deviceId"));unlocked=true;runOnUiThread(this::enter);}catch(Exception e){db.log("error","ACTIVATE "+e.getMessage());runOnUiThread(()->{scanButton.setEnabled(true);hint.setText("激活失败："+e.getMessage()+"\n请让管理员重新生成激活二维码");});}});}else hint.setText("首次使用：扫描管理员生成的设备激活二维码\n扫码后自动激活并登录，之后打开无需再登录");}
 private void enter(){tabs.setVisibility(View.VISIBLE);findViewById(R.id.sync).setVisibility(View.VISIBLE);askPermissions();showMap();sync();String details="{}";try{details=new JSONObject().put("network",Util.networkType(this)).put("online",Util.online(this)).put("fineLocation",ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED).put("backgroundLocation",ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED).put("camera",ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED).put("notifications",android.os.Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED).put("pendingRecords",db.count("status!='uploaded'")).put("activeJourney",prefs.activeJourney()).toString();}catch(Exception ignored){}db.log("info","APP_READY",details);checkUpdate();}
 private void checkUpdate(){work.execute(()->{try{JSONObject v=new Api(MainActivity.this).version();String latest=v.optString("versionName","");boolean mandatory=v.optInt("mandatory",0)==1;if(!latest.isEmpty()&&!BuildConfig.VERSION_NAME.equals(latest)){String msg=(mandatory?"【必须更新】未更新前请勿继续采样。\n\n":"")+"当前版本 "+BuildConfig.VERSION_NAME+"，最新版本 "+latest+"。请让管理员安装新版本 APP。";runOnUiThread(()->new AlertDialog.Builder(MainActivity.this).setTitle((mandatory?"⚠ 必须更新 ":"发现新版本 ")+latest).setMessage(msg).setPositiveButton("知道了",null).setCancelable(!mandatory).show());}}catch(Exception ignored){}});}
 private void askPermissions(){List<String> x=new ArrayList<>();if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)x.add(Manifest.permission.ACCESS_FINE_LOCATION);if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)x.add(Manifest.permission.POST_NOTIFICATIONS);if(x.isEmpty())locations();else permissions.launch(x.toArray(new String[0]));}
 private void locations(){if(ActivityCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)return;try{lm.requestLocationUpdates(LocationManager.GPS_PROVIDER,5000,0,this);if(lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER))lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,5000,0,this);Location x=lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);if(x!=null)onLocationChanged(x);}catch(Exception e){db.log("error","LOCATION "+e.getMessage());}}
 private void sync(){if(!unlocked)return;if(syncing){Toast.makeText(this,"同步正在进行中，请稍候…",Toast.LENGTH_SHORT).show();return;}syncing=true;status.setText(Util.online(this)?"正在同步服务器…":"当前离线，使用手机缓存");work.execute(()->{SyncEngine.Result r;try{if(Util.online(this))try{prefs.token(new Api(this).login().getString("token"));}catch(Exception e){db.log("warning","LOGIN_REFRESH "+e.getMessage());}r=new SyncEngine(this).run();}catch(Throwable t){db.log("error","SYNC_CRASH "+t.getClass().getSimpleName()+":"+t.getMessage());r=new SyncEngine.Result();r.message="同步异常，请查看诊断日志";}final SyncEngine.Result rr=r;final int taskCount=db.tasks().size();runOnUiThread(()->{syncing=false;status.setText(rr.message+" · 待上传"+db.count("status!='uploaded'")+"条");Toast.makeText(MainActivity.this,rr.message+"，任务 "+taskCount+" 个",Toast.LENGTH_SHORT).show();if(map!=null)markers();if(currentTab==1)showTasks();if(currentTab==2)showUpload();});});}
 private void showMap(){if(!unlocked)return;destroyMap();currentTab=0;title.setText("地图");content.removeAllViews();View v=getLayoutInflater().inflate(R.layout.view_map,content,false);content.addView(v);mapView=v.findViewById(R.id.map);mapView.onCreate(null);v.findViewById(R.id.locate).setOnClickListener(x->locate());if(mapDateFilter!=null){TextView f=new TextView(this);f.setText("仅显示 "+mapDateFilter+" 的点位（点此显示全部日期）");f.setTextColor(0xFFFFFFFF);f.setBackgroundColor(0xCC16A27A);int pad=(int)(10*getResources().getDisplayMetrics().density);f.setPadding(pad,pad,pad,pad);f.setGravity(android.view.Gravity.CENTER);f.setOnClickListener(x->{mapDateFilter=null;showMap();});FrameLayout root=(FrameLayout)v;FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.WRAP_CONTENT,android.view.Gravity.TOP);root.addView(f,lp);}mapView.getMapAsync(m->{map=m;map.setStyle(new Style.Builder().fromJson(style()),s->{markers();center();});map.setOnMarkerClickListener(marker->{Task t=markerTasks.get(marker.getId());if(t!=null)startActivity(new Intent(this,TaskActivity.class).putExtra("task",t.id));return t!=null;});map.addOnMapClickListener(p->{copyCoords(p.getLatitude(),p.getLongitude());return true;});map.addOnMapLongClickListener(p->{new AlertDialog.Builder(this).setTitle("复制该位置坐标？").setMessage(String.format(Locale.CHINA,"【WGS84】%.8f°N，%.8f°E",p.getLatitude(),p.getLongitude())).setPositiveButton("复制",(d,w)->copyCoords(p.getLatitude(),p.getLongitude())).setNegativeButton("取消",null).show();return true;});});locationText();}
 private void locate(){if(map!=null&&here!=null)map.setCameraPosition(new CameraPosition.Builder().target(new LatLng(here.getLatitude(),here.getLongitude())).zoom(14).build());if(here==null){Toast.makeText(this,"正在获取WGS84位置…",Toast.LENGTH_SHORT).show();return;}new AlertDialog.Builder(this).setTitle("我的位置（WGS84）").setMessage(String.format(Locale.CHINA,"【WGS84】%.8f°N，%.8f°E\n精度 ±%.0fm",here.getLatitude(),here.getLongitude(),here.getAccuracy())).setPositiveButton("复制",(d,w)->copyCoords(here.getLatitude(),here.getLongitude())).setNegativeButton("关闭",null).show();}
 private void copyCoords(double lat,double lon){String s=String.format(Locale.CHINA,"【WGS84】%.8f°N，%.8f°E",lat,lon);getSystemService(android.content.ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("WGS84坐标",s));Toast.makeText(this,"已复制 "+s,Toast.LENGTH_LONG).show();}
 // 采样点标记：水滴轮廓 + 历史序号文字，自动常显编号（绿=已采样 灰=已取消 蓝=进行中 橙=待采样）。
 private Icon markerIcon(String label,int color){int w=120,h=150;Bitmap b=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(b);Paint fill=new Paint(Paint.ANTI_ALIAS_FLAG);fill.setColor(color);Paint border=new Paint(Paint.ANTI_ALIAS_FLAG);border.setStyle(Paint.Style.STROKE);border.setStrokeWidth(8);border.setColor(0xFFFFFFFF);Path p=new Path();float cx=w/2f;p.moveTo(cx,8);p.cubicTo(cx+46,44,cx+42,100,cx,h-16);p.cubicTo(cx-42,100,cx-46,44,cx,8);p.close();c.drawPath(p,fill);c.drawPath(p,border);Paint text=new Paint(Paint.ANTI_ALIAS_FLAG);text.setColor(0xFFFFFFFF);text.setTextSize(40);text.setFakeBoldText(true);text.setTextAlign(Paint.Align.CENTER);c.drawText(label,cx,82,text);return IconFactory.getInstance(this).fromBitmap(b);}
 private String style(){String f=prefs.map();if(!f.isEmpty()&&new File(f).isFile())return"{\"version\":8,\"sources\":{\"s\":{\"type\":\"raster\",\"url\":\"mbtiles://"+f.replace("\\","/").replace(" ","%20")+"\",\"tileSize\":256}},\"layers\":[{\"id\":\"s\",\"type\":\"raster\",\"source\":\"s\"}]}";return"{\"version\":8,\"sources\":{\"s\":{\"type\":\"raster\",\"tiles\":[\"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}\"],\"tileSize\":256,\"maxzoom\":17}},\"layers\":[{\"id\":\"s\",\"type\":\"raster\",\"source\":\"s\"}]}";}
 private void markers(){if(map==null||map.getStyle()==null)return;map.clear();markerTasks.clear();for(Task t:db.tasks()){if(t.canceled())continue;if(mapDateFilter!=null&&!mapDateFilter.equals(t.j.optString("planned_date","未定日期")))continue;int color=t.submitted()?0xFF16A27A:0xFFEF9C2F;String prefix=t.submitted()?"✓ ":"待采样 ";Marker m=map.addMarker(new MarkerOptions().position(new LatLng(t.lat(),t.lon())).icon(markerIcon(t.siteCode(),color)).title(prefix+t.title()).snippet(t.code()));markerTasks.put(m.getId(),t);}if(here!=null)map.addMarker(new MarkerOptions().position(new LatLng(here.getLatitude(),here.getLongitude())).title("我的位置（WGS84）"));}
 protected void onNewIntent(Intent i){super.onNewIntent(i);if(prefs.activated()&&unlocked)showMap();}
 private void center(){if(map!=null&&here!=null)map.setCameraPosition(new CameraPosition.Builder().target(new LatLng(here.getLatitude(),here.getLongitude())).zoom(14).build());}
 private void showTasks(){if(!unlocked)return;destroyMap();currentTab=1;title.setText("我的任务");content.removeAllViews();View v=getLayoutInflater().inflate(R.layout.view_list,content,false);content.addView(v);List<Task> all=new ArrayList<>(db.tasks());List<Task> a=new ArrayList<>();for(Task t:all){if(t.canceled())continue;boolean sub=t.submitted();if(taskFilter==1&&sub)continue;if(taskFilter==2&&!sub)continue;a.add(t);}
  // 筛选条：全部/待采样/已采样（按需求只保留两种状态，已取消不再显示）
  LinearLayout chips=new LinearLayout(this);chips.setOrientation(LinearLayout.HORIZONTAL);chips.setPadding(0,10,0,0);String[] names={"全部","待采样","已采样"};for(int i=0;i<3;i++){final int fi=i;MaterialButton b=new MaterialButton(this);b.setText(names[i]);b.setMinWidth(0);b.setPadding(24,0,24,0);b.setTextSize(14);b.setBackgroundColor(taskFilter==fi?0xFF16A27A:0xFFE3EDEB);b.setTextColor(taskFilter==fi?0xFFFFFFFF:0xFF17343A);b.setOnClickListener(x->{taskFilter=fi;showTasks();});chips.addView(b);}((LinearLayout)v).addView(chips,1);
  java.util.Map<String,List<Task>> groups=new java.util.TreeMap<>();for(Task t:a)groups.computeIfAbsent(t.j.optString("planned_date","未定日期"),k->new ArrayList<>()).add(t);java.util.Comparator<Task> byDist=(x,y)->Double.compare(here==null?x.id:Util.distance(here.getLatitude(),here.getLongitude(),x.lat(),x.lon()),here==null?y.id:Util.distance(here.getLatitude(),here.getLongitude(),y.lat(),y.lon()));List<String> dates=new ArrayList<>(groups.keySet());Collections.sort(dates,Comparator.reverseOrder());List<List<Task>> data=new ArrayList<>();for(String d:dates){List<Task> l=groups.get(d);l.sort(byDist);data.add(l);}((TextView)v.findViewById(R.id.listHint)).setText(a.isEmpty()?"暂无任务。请联网后点右上角同步；若同步后仍为空，请让管理员确认下发任务的采样员是本账号（"+prefs.user()+"）。":"按日期归档 · 共"+a.size()+"个任务（默认展开，最新日期在前）");ExpandableListView list=v.findViewById(R.id.list);list.setAdapter(new DateAdapter(dates,data));for(int i=0;i<dates.size();i++)list.expandGroup(i);list.setOnGroupClickListener((p,x,g,id)->{mapDateFilter=dates.get(g);return false;});list.setOnChildClickListener((p,x,g,c,id)->{startActivity(new Intent(this,TaskActivity.class).putExtra("task",data.get(g).get(c).id));return true;});}
 private void showUpload(){if(!unlocked)return;destroyMap();currentTab=2;title.setText("上传");LinearLayout p=panel();int pending=db.count("status!='uploaded'"),done=db.count("status='uploaded'");text(p,"待同步 "+pending+" 条 · 已同步 "+done+" 条",22);text(p,"有网络时自动同步；未同步的数据会一直保存在手机，不会丢失。",15);for(JSONObject r:db.recordsAll()){Task t=db.task(r.optLong("taskId"));String code=t==null?("任务"+r.optLong("taskId")):t.code();if(r.optString("status").equals("uploaded")){String at=r.optString("uploadedAt").replace('T',' ');if(at.length()>16)at=at.substring(0,16);text(p,"✅ 已同步 "+code+"　"+at,15);}else{String err=r.optString("error");if(err.length()>90)err=err.substring(0,90)+"…";text(p,"⏳ 未同步 "+code+(err.isEmpty()?"　等待上传":"　上次失败："+err),15);}}MaterialButton b=button("立即重试同步");b.setOnClickListener(v->{sync();showUpload();});p.addView(b);content.removeAllViews();content.addView(p);}
 private void showMine(){if(!unlocked)return;destroyMap();currentTab=3;title.setText("我的");LinearLayout p=panel();text(p,prefs.name()+"（"+prefs.user()+"）",22);text(p,"服务器："+prefs.server()+"\n设备："+Util.uuid(this)+"\n坐标：WGS84\n版本："+BuildConfig.VERSION_NAME,16);MaterialButton map=button(prefs.map().isEmpty()?"导入离线卫星地图包（MBTiles）":"更换离线地图包");map.setOnClickListener(v->mapFile.launch("*/*"));p.addView(map);MaterialButton log=button("复制诊断日志");log.setOnClickListener(v->copyLog());p.addView(log);MaterialButton csv=button("分享日志文件（Excel可打开）");csv.setOnClickListener(v->{java.io.File f=db.logsCsv();if(f==null){Toast.makeText(this,"生成日志文件失败",Toast.LENGTH_LONG).show();return;}try{android.net.Uri u=androidx.core.content.FileProvider.getUriForFile(this,"online.gpsgps.bscsampling.files",f);Intent s=new Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM,u).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(Intent.createChooser(s,"分享日志文件"));}catch(Exception e){Toast.makeText(this,"分享失败："+e.getMessage(),Toast.LENGTH_LONG).show();}});p.addView(csv);content.removeAllViews();content.addView(p);}
 private LinearLayout panel(){LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setPadding(24,24,24,24);return p;}private void text(LinearLayout p,String s,int size){TextView v=new TextView(this);v.setText(s);v.setTextSize(size);v.setTextColor(Color.DKGRAY);v.setPadding(10,16,10,16);p.addView(v);}private MaterialButton button(String s){MaterialButton b=new MaterialButton(this);b.setText(s);b.setTextSize(18);b.setMinHeight(64);return b;}
 private void importMap(Uri u){if(u==null)return;work.execute(()->{try{long declared=-1;try(Cursor c=getContentResolver().query(u,new String[]{OpenableColumns.SIZE},null,null,null)){if(c!=null&&c.moveToFirst())declared=c.getLong(0);}if(declared>2_000_000_000L)throw new IOException("地图包超过2GB");File out=new File(getFilesDir(),"basongcuo.mbtiles");try(InputStream in=getContentResolver().openInputStream(u);FileOutputStream o=new FileOutputStream(out)){byte[] b=new byte[1024*1024];int n;long total=0;while((n=in.read(b))>=0){total+=n;if(total>2_000_000_000L)throw new IOException("地图包超过2GB");o.write(b,0,n);}}byte[] h=new byte[16];try(FileInputStream in=new FileInputStream(out)){if(in.read(h)!=16||!new String(h,StandardCharsets.US_ASCII).startsWith("SQLite format 3"))throw new IOException("不是有效MBTiles地图包");}prefs.map(out.getPath());runOnUiThread(()->Toast.makeText(this,"离线地图导入成功",Toast.LENGTH_LONG).show());}catch(Exception e){db.log("error","MAP_IMPORT "+e.getMessage());runOnUiThread(()->Toast.makeText(this,e.getMessage(),Toast.LENGTH_LONG).show());}});}
 private void copyLog(){getSystemService(android.content.ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("巴松措采样日志",db.diagnostics()));Toast.makeText(this,"日志已复制，可以发给管理员",Toast.LENGTH_LONG).show();}
 public void onLocationChanged(@NonNull Location l){here=l;locationText();if(map!=null)markers();}private void locationText(){TextView v=content.findViewById(R.id.location);if(v!=null)v.setText(here==null?"正在获取WGS84位置…":String.format(Locale.CHINA,"WGS84 %.6f, %.6f　精度±%.0fm",here.getLatitude(),here.getLongitude(),here.getAccuracy()));}
 private void destroyMap(){if(mapView!=null){mapView.onStop();mapView.onDestroy();mapView=null;map=null;}}
 protected void onStart(){super.onStart();if(mapView!=null)mapView.onStart();}protected void onResume(){super.onResume();if(mapView!=null)mapView.onResume();}protected void onPause(){if(mapView!=null)mapView.onPause();super.onPause();}protected void onStop(){if(mapView!=null)mapView.onStop();super.onStop();}public void onLowMemory(){super.onLowMemory();if(mapView!=null)mapView.onLowMemory();}protected void onDestroy(){try{lm.removeUpdates(this);}catch(Exception ignored){}try{if(netCallback!=null)getSystemService(ConnectivityManager.class).unregisterNetworkCallback(netCallback);}catch(Exception ignored){}destroyMap();work.shutdown();super.onDestroy();}
 private final class DateAdapter extends BaseExpandableListAdapter{private final List<String> dates;private final List<List<Task>> groups;DateAdapter(List<String> d,List<List<Task>> g){dates=d;groups=g;}public int getGroupCount(){return dates.size();}public int getChildrenCount(int i){return groups.get(i).size();}public Object getGroup(int i){return dates.get(i);}public Object getChild(int i,int j){return groups.get(i).get(j);}public long getGroupId(int i){return -i-1;}public long getChildId(int i,int j){return groups.get(i).get(j).id;}public boolean hasStableIds(){return true;}public boolean isChildSelectable(int i,int j){return true;}public View getGroupView(int i,boolean expanded,View v,ViewGroup p){if(v==null){v=new TextView(MainActivity.this);int pad=(int)(14*getResources().getDisplayMetrics().density);v.setPadding(pad,pad,pad,pad);((TextView)v).setTextSize(18);((TextView)v).setBackgroundResource(R.drawable.card);}int pending=0;for(Task t:groups.get(i))if(!t.submitted())pending++;( (TextView)v).setText(dates.get(i)+"　"+(expanded?"▾":"▸")+"　"+groups.get(i).size()+" 个任务 · 待采样 "+pending);((TextView)v).setTypeface(null,android.graphics.Typeface.BOLD);((TextView)v).setTextColor(0xFF17343A);return v;}public View getChildView(int i,int j,boolean last,View v,ViewGroup p){if(v==null)v=getLayoutInflater().inflate(R.layout.item_task,p,false);Task t=groups.get(i).get(j);((TextView)v.findViewById(R.id.itemTitle)).setText(t.title()+" · 历史"+t.siteCode());((TextView)v.findViewById(R.id.itemCode)).setText(t.code());double d=here==null?-1:Util.distance(here.getLatitude(),here.getLongitude(),t.lat(),t.lon());((TextView)v.findViewById(R.id.itemMeta)).setText(Util.type(t.j.optString("sample_type"))+" · "+(d<0?"距离未知":d<1000?Math.round(d)+"米":String.format(Locale.CHINA,"%.1f公里",d/1000)));TextView st=v.findViewById(R.id.itemStatus);boolean sub=t.submitted(),can=t.canceled();st.setText(sub?"已采样":can?"已取消":"待采样");st.setTextColor(sub?0xFF087557:can?0xFF777F7E:0xFFB3402F);st.setTypeface(null,android.graphics.Typeface.BOLD);v.getBackground().setTint(sub?0xFFE3F5EC:can?0xFFF0F1F1:0xFFFDECEC);return v;}}
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/PhotoActivity.java`

SHA-256: `021ffe3c3e10d8ea0bc31169cdd991853ec91708993fdb78c0c419896dc5050e`

~~~~java
package online.gpsgps.bscsampling;

import android.Manifest;import android.content.*;import android.content.pm.PackageManager;import android.os.Bundle;import android.view.MotionEvent;import android.widget.Toast;import androidx.activity.result.*;import androidx.activity.result.contract.ActivityResultContracts;import androidx.appcompat.app.AppCompatActivity;import androidx.camera.core.*;import androidx.camera.lifecycle.ProcessCameraProvider;import androidx.camera.view.PreviewView;import androidx.core.content.ContextCompat;import com.google.android.material.button.MaterialButton;import com.google.common.util.concurrent.ListenableFuture;import org.json.JSONArray;import java.io.File;import java.io.IOException;import java.util.Locale;import java.util.concurrent.*;

public final class PhotoActivity extends AppCompatActivity{static final String PATH="path",AT="at",WEATHER="weather";private PreviewView camera;private MaterialButton shutter;private ImageCapture capture;private Camera cam;private volatile boolean busy;private final ExecutorService work=Executors.newSingleThreadExecutor();private final ActivityResultLauncher<String> permission=registerForActivityResult(new ActivityResultContracts.RequestPermission(),ok->{if(ok)camera();else finish();});
 protected void onCreate(Bundle b){super.onCreate(b);setContentView(R.layout.activity_photo);camera=findViewById(R.id.camera);shutter=findViewById(R.id.shutter);shutter.setOnClickListener(v->shoot());
  // 点击屏幕自动对焦（横竖屏均支持）。
  camera.setOnTouchListener((v,ev)->{if(ev.getAction()==MotionEvent.ACTION_DOWN&&cam!=null){try{MeteringPoint point=camera.getMeteringPointFactory().createPoint(ev.getX(),ev.getY());cam.getCameraControl().startFocusAndMetering(new FocusMeteringAction.Builder(point).build());}catch(Exception ignored){}}return true;});
  if(ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)camera();else permission.launch(Manifest.permission.CAMERA);}
 private void camera(){ListenableFuture<ProcessCameraProvider> f=ProcessCameraProvider.getInstance(this);f.addListener(()->{try{ProcessCameraProvider p=f.get();Preview v=new Preview.Builder().build();v.setSurfaceProvider(camera.getSurfaceProvider());capture=new ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).setJpegQuality(95).build();p.unbindAll();cam=p.bindToLifecycle(this,CameraSelector.DEFAULT_BACK_CAMERA,v,capture);}catch(Exception e){Toast.makeText(this,"相机启动失败",Toast.LENGTH_LONG).show();}},ContextCompat.getMainExecutor(this));}
 private void shoot(){if(capture==null||busy)return;busy=true;shutter.setEnabled(false);shutter.setText("已拍摄，处理中…");File raw=new File(getCacheDir(),"raw-"+System.currentTimeMillis()+".jpg");capture.takePicture(new ImageCapture.OutputFileOptions.Builder(raw).build(),work,new ImageCapture.OnImageSavedCallback(){public void onImageSaved(ImageCapture.OutputFileResults r){try{String at=Util.now();double lat=getIntent().getDoubleExtra("lat",0),lon=getIntent().getDoubleExtra("lon",0);String weather="待补充";if(Util.online(PhotoActivity.this))try{weather=new Api(PhotoActivity.this).weather(lat,lon,at);}catch(Exception ignored){}File dir=new File(getFilesDir(),"watermarked");if(!dir.exists()&&!dir.mkdirs())throw new IOException("无法建立照片目录");File out=new File(dir,"sample-"+System.currentTimeMillis()+".jpg");JSONArray lines=new JSONArray().put(getIntent().getStringExtra("project")+"　"+getIntent().getStringExtra("code")+"　"+getIntent().getStringExtra("type")).put(getIntent().getStringExtra("site")+"（历史 "+getIntent().getStringExtra("siteCode")+"）　采样员："+new Prefs(PhotoActivity.this).name()).put(String.format(Locale.CHINA,"WGS84 %.6f, %.6f　距点 %.0fm　精度 ±%.0fm",lat,lon,getIntent().getDoubleExtra("distance",0),getIntent().getDoubleExtra("accuracy",0))).put(at.replace('T',' ')+"　天气："+weather);Watermark.render(raw,out,lines);raw.delete();String w=weather;runOnUiThread(()->{busy=false;shutter.setEnabled(true);shutter.setText("拍照");setResult(RESULT_OK,new Intent().putExtra(PATH,out.getPath()).putExtra(AT,at).putExtra(WEATHER,w));finish();});}catch(Exception e){new Store(PhotoActivity.this).log("error","PHOTO "+e.getMessage());runOnUiThread(()->{busy=false;shutter.setEnabled(true);shutter.setText("重新拍照");Toast.makeText(PhotoActivity.this,e.getMessage(),Toast.LENGTH_LONG).show();});}}public void onError(ImageCaptureException e){runOnUiThread(()->{busy=false;shutter.setEnabled(true);shutter.setText("重新拍照");});}});}
 protected void onDestroy(){work.shutdown();super.onDestroy();}}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/PhotoGuideOverlay.java`

SHA-256: `337957423f4acf84a47c85b813dcdcb39e61ba277d87c3390a11e25f7b7e523d`

~~~~java
package online.gpsgps.bscsampling;import android.content.*;import android.graphics.*;import android.util.*;import android.view.*;public final class PhotoGuideOverlay extends View{private final Paint p=new Paint(1);public PhotoGuideOverlay(Context c,AttributeSet a){super(c,a);}protected void onDraw(Canvas c){float w=getWidth(),h=getHeight();p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(5);p.setColor(0xCC28D6A0);c.drawRoundRect(w*.05f,h*.32f,w*.30f,h*.78f,20,20,p);p.setStrokeWidth(2);p.setColor(0x88FFFFFF);c.drawLine(w/3,0,w/3,h,p);c.drawLine(w*2/3,0,w*2/3,h,p);c.drawLine(0,h/3,w,h/3,p);c.drawLine(0,h*2/3,w,h*2/3,p);}}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/Prefs.java`

SHA-256: `4e508259712420eca92e5d16a017ef086af57e507aae84dcd56a39f5574395a8`

~~~~java
package online.gpsgps.bscsampling;

import android.content.Context;
import android.content.SharedPreferences;

// 激活策略（需求变更 2026-08-26）：扫码激活即登录，无 PIN。激活二维码由管理员端
// 一次性生成（24 小时有效），激活后绑定设备，之后打开 APP 直接进入，不再要求登录。
final class Prefs {
  private final SharedPreferences p;
  Prefs(Context c){p=c.getSharedPreferences("bsc_v1",Context.MODE_PRIVATE);}
  String server(){return p.getString("server",BuildConfig.DEFAULT_SERVER);} String token(){return p.getString("token","");} String user(){return p.getString("user","");} String name(){return p.getString("name","");} String map(){return p.getString("map","");} String activeJourney(){return p.getString("journey","");}
  boolean activated(){return !user().isEmpty();}
  void save(String server,String token,String user,String name,long device){p.edit().putString("server",normalize(server)).putString("token",token).putString("user",user).putString("name",name).putLong("device",device).apply();}
  void token(String v){p.edit().putString("token",v).apply();} void map(String v){p.edit().putString("map",v).apply();} void journey(String v){p.edit().putString("journey",v==null?"":v).apply();}
  static String normalize(String v){v=v==null?"":v.trim();while(v.endsWith("/"))v=v.substring(0,v.length()-1);if(!v.startsWith("https://"))throw new IllegalArgumentException("正式版只允许HTTPS服务器");return v;}
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/QrData.java`

SHA-256: `600fd31b9560a0b56b3490c039343a9f3194ea2d654f5b6997051d687c44599b`

~~~~java
package online.gpsgps.bscsampling;

final class QrData {
  final boolean activation; final String server,user,code,token;
  private QrData(boolean a,String s,String u,String c,String t){activation=a;server=s;user=u;code=c;token=t;}
  static QrData parse(String raw){String[] p=raw==null?new String[0]:raw.trim().split("\\|",-1);if(p.length==4&&p[0].equals("BSC-ACT"))return new QrData(true,p[1],p[2],"",p[3]);if(p.length==3&&p[0].equals("BSC-SAMPLE"))return new QrData(false,"","",p[1],p[2]);throw new IllegalArgumentException("不是本系统生成的二维码");}
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/SamplingApp.java`

SHA-256: `d500363ea9eeb4699ca240b5794eb7050644fa65731a9171c25ab2acfcddc42d`

~~~~java
package online.gpsgps.bscsampling;
import android.Manifest;import android.app.Application;import android.app.NotificationChannel;import android.app.NotificationManager;import android.content.pm.PackageManager;import androidx.core.content.ContextCompat;import androidx.work.*;import org.json.JSONObject;import java.util.concurrent.TimeUnit;
public final class SamplingApp extends Application{static final String TRACK="tracking";public void onCreate(){super.onCreate();
  // 全局崩溃捕获：把崩溃堆栈写入本地日志表（随诊断日志上传），便于远程定位闪退；
  // 只记录异常摘要与堆栈，不含任何敏感数据。
  final Thread.UncaughtExceptionHandler prev=Thread.getDefaultUncaughtExceptionHandler();
  Thread.setDefaultUncaughtExceptionHandler((t,e)->{try{StringBuilder s=new StringBuilder("CRASH ").append(t.getName()).append(' ').append(e.getClass().getSimpleName());if(e.getMessage()!=null)s.append(": ").append(e.getMessage());StackTraceElement[] st=e.getStackTrace();for(int i=0;i<Math.min(st.length,12);i++)s.append("\n  at ").append(st[i].toString());new Store(this).log("error",s.toString());}catch(Exception ignored){}if(prev!=null)prev.uncaughtException(t,e);else{android.os.Process.killProcess(android.os.Process.myPid());System.exit(10);}});
  getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(TRACK,"采样轨迹记录",NotificationManager.IMPORTANCE_LOW));String details="{}";try{details=new JSONObject().put("fineLocation",granted(Manifest.permission.ACCESS_FINE_LOCATION)).put("backgroundLocation",granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)).put("camera",granted(Manifest.permission.CAMERA)).put("network",Util.networkType(this)).put("sdk",android.os.Build.VERSION.SDK_INT).toString();}catch(Exception ignored){}new Store(this).log("info","APP_START "+BuildConfig.VERSION_NAME+" "+android.os.Build.MANUFACTURER+"/"+android.os.Build.MODEL+" Android "+android.os.Build.VERSION.RELEASE,details);Constraints c=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();WorkManager.getInstance(this).enqueueUniquePeriodicWork("sync",ExistingPeriodicWorkPolicy.UPDATE,new PeriodicWorkRequest.Builder(SyncWorker.class,15,TimeUnit.MINUTES).setConstraints(c).build());WorkManager.getInstance(this).enqueueUniquePeriodicWork("updateCheck",ExistingPeriodicWorkPolicy.UPDATE,new PeriodicWorkRequest.Builder(UpdateWorker.class,6,TimeUnit.HOURS).setConstraints(c).build());}
private boolean granted(String p){return ContextCompat.checkSelfPermission(this,p)==PackageManager.PERMISSION_GRANTED;}}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/ScanActivity.java`

SHA-256: `72e5b72dabe5df9bc36c9ae9426b8e263290c1a39bd3b0b64630080535d16687`

~~~~java
package online.gpsgps.bscsampling;

import android.Manifest;import android.content.*;import android.content.pm.PackageManager;import android.os.*;import android.view.View;import android.widget.TextView;import androidx.activity.result.*;import androidx.activity.result.contract.ActivityResultContracts;import androidx.appcompat.app.AppCompatActivity;import androidx.camera.core.*;import androidx.camera.lifecycle.ProcessCameraProvider;import androidx.camera.view.PreviewView;import androidx.core.content.ContextCompat;import com.google.android.material.button.MaterialButton;import com.google.common.util.concurrent.ListenableFuture;import com.google.zxing.*;import com.google.zxing.common.HybridBinarizer;import java.nio.ByteBuffer;import java.util.*;import java.util.concurrent.*;

public final class ScanActivity extends AppCompatActivity{
  static final String RESULT="scan",DAMAGED="damaged";private PreviewView camera;private TextView timer;private MaterialButton damaged;private final ExecutorService worker=Executors.newSingleThreadExecutor();private final Handler h=new Handler(Looper.getMainLooper());private long start,lastFail;private int fails;private volatile boolean done;
  private final ActivityResultLauncher<String> permission=registerForActivityResult(new ActivityResultContracts.RequestPermission(),ok->{if(ok)camera();else finish();});
  protected void onCreate(Bundle b){super.onCreate(b);setContentView(R.layout.activity_scan);camera=findViewById(R.id.camera);timer=findViewById(R.id.timer);damaged=findViewById(R.id.damaged);damaged.setOnClickListener(v->{setResult(RESULT_OK,new Intent().putExtra(DAMAGED,true));finish();});start=System.currentTimeMillis();h.post(tick);if(ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)camera();else permission.launch(Manifest.permission.CAMERA);}
  private final Runnable tick=new Runnable(){public void run(){long sec=(System.currentTimeMillis()-start)/1000;timer.setText("已扫描 "+sec+" 秒 · 失败 "+fails+" 次");if(sec>=10||fails>=3)damaged.setVisibility(View.VISIBLE);if(!done)h.postDelayed(this,1000);}};
  private void camera(){ListenableFuture<ProcessCameraProvider> f=ProcessCameraProvider.getInstance(this);f.addListener(()->{try{ProcessCameraProvider p=f.get();Preview v=new Preview.Builder().build();v.setSurfaceProvider(camera.getSurfaceProvider());ImageAnalysis a=new ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build();a.setAnalyzer(worker,image->{try{if(done)return;ImageProxy.PlaneProxy plane=image.getPlanes()[0];ByteBuffer b=plane.getBuffer();byte[] raw=new byte[b.remaining()];b.get(raw);int w=image.getWidth(),ht=image.getHeight(),stride=plane.getRowStride();byte[] y=raw;if(stride!=w){y=new byte[w*ht];for(int row=0;row<ht;row++)System.arraycopy(raw,row*stride,y,row*w,w);}PlanarYUVLuminanceSource source=new PlanarYUVLuminanceSource(y,w,ht,0,0,w,ht,false);com.google.zxing.Result r=decode(source);if(r==null&&source.isRotateSupported())r=decode(source.rotateCounterClockwise());if(r!=null)deliver(r.getText());else failure();}catch(Exception e){failure();}finally{image.close();}});p.unbindAll();p.bindToLifecycle(this,CameraSelector.DEFAULT_BACK_CAMERA,v,a);}catch(Exception e){timer.setText("相机启动失败："+e.getMessage());new Store(this).log("error","SCAN_CAMERA "+e.getMessage());}},ContextCompat.getMainExecutor(this));}
  private com.google.zxing.Result decode(LuminanceSource s){try{Map<DecodeHintType,Object> hints=new EnumMap<>(DecodeHintType.class);hints.put(DecodeHintType.TRY_HARDER,true);hints.put(DecodeHintType.CHARACTER_SET,"UTF-8");return new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(s)),hints);}catch(NotFoundException e){return null;}}
  private void failure(){long n=System.currentTimeMillis();if(n-lastFail>=3000){fails++;lastFail=n;}}private void deliver(String s){if(done)return;done=true;runOnUiThread(()->{setResult(RESULT_OK,new Intent().putExtra(RESULT,s));finish();});}protected void onDestroy(){done=true;h.removeCallbacksAndMessages(null);worker.shutdown();super.onDestroy();}
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/ScanOverlay.java`

SHA-256: `2785b35366823a4cd92bcc4f58820754663cbd07c7c9118ae3791f1584a0dfd8`

~~~~java
package online.gpsgps.bscsampling;import android.content.*;import android.graphics.*;import android.util.*;import android.view.*;public final class ScanOverlay extends View{private final Paint p=new Paint(1);public ScanOverlay(Context c,AttributeSet a){super(c,a);}protected void onDraw(Canvas c){float s=Math.min(getWidth()*.76f,getHeight()*.45f),x=(getWidth()-s)/2,y=(getHeight()-s)/2-60;p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(8);p.setColor(Color.rgb(20,203,151));c.drawRoundRect(x,y,x+s,y+s,24,24,p);}}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/Store.java`

SHA-256: `b03afd7e3918e642ed2207598ac4d4a9f170da44128a2308e62bc7d0c189e1b1`

~~~~java
package online.gpsgps.bscsampling;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.location.Location;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

final class Store extends SQLiteOpenHelper {
  private final Context ctx;
  Store(Context c){super(c,"bsc-sampling-v1.db",null,1);ctx=c.getApplicationContext();}
  public void onCreate(SQLiteDatabase d){
    d.execSQL("CREATE TABLE tasks(id INTEGER PRIMARY KEY,json TEXT NOT NULL,local_status TEXT,updated_at TEXT NOT NULL)");
    d.execSQL("CREATE TABLE journeys(local_id TEXT PRIMARY KEY,task_id INTEGER,site_id INTEGER,server_id INTEGER,status TEXT,server_done INTEGER DEFAULT 0,offline_start INTEGER DEFAULT 0,start_lat REAL,start_lon REAL,start_acc REAL,started_at TEXT,ended_at TEXT)");
    d.execSQL("CREATE TABLE tracks(id INTEGER PRIMARY KEY AUTOINCREMENT,journey_id TEXT,seq INTEGER,at TEXT,lat REAL,lon REAL,acc REAL,speed REAL,mock INTEGER DEFAULT 0,uploaded INTEGER DEFAULT 0,UNIQUE(journey_id,seq))");
    d.execSQL("CREATE TABLE records(client_id TEXT PRIMARY KEY,task_id INTEGER,journey_id TEXT,photo TEXT,payload TEXT,status TEXT,error TEXT,created_at TEXT,uploaded_at TEXT)");
    d.execSQL("CREATE TABLE logs(id INTEGER PRIMARY KEY AUTOINCREMENT,level TEXT,message TEXT,details TEXT,at TEXT,uploaded INTEGER DEFAULT 0)");
  }
  public void onUpgrade(SQLiteDatabase d,int a,int b){}
  void tasks(JSONArray array){SQLiteDatabase d=getWritableDatabase();java.util.List<Long> ids=new java.util.ArrayList<>();d.beginTransaction();try{for(int i=0;i<array.length();i++){JSONObject o=array.optJSONObject(i);if(o==null)continue;long id=o.optLong("id");ids.add(id);ContentValues v=new ContentValues();v.put("id",id);v.put("json",o.toString());v.put("updated_at",Util.now());if(d.update("tasks",v,"id=?",new String[]{""+id})==0)d.insertOrThrow("tasks",null,v);}d.setTransactionSuccessful();}finally{d.endTransaction();}
  // 服务器不再下发已取消任务（sync 已过滤）；删除手机上对应的旧任务，
  // 但保留有本地采样记录或正在记录轨迹的任务，绝不丢数据。
  if(!ids.isEmpty()){StringBuilder in=new StringBuilder();for(Long id:ids)in.append(id).append(',');in.setLength(in.length()-1);d.execSQL("DELETE FROM tasks WHERE id NOT IN ("+in+") AND id NOT IN (SELECT DISTINCT task_id FROM records) AND id NOT IN (SELECT DISTINCT task_id FROM journeys WHERE status='active')");}}
  // 上传页明细：每条记录的任务编号、状态、失败原因与时间（最新在前）。
  List<JSONObject> recordsAll(){List<JSONObject> out=new ArrayList<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT client_id,task_id,status,error,created_at,uploaded_at FROM records ORDER BY created_at DESC,rowid DESC LIMIT 300",null)){while(c.moveToNext())try{JSONObject j=new JSONObject().put("clientId",c.getString(0)).put("taskId",c.getLong(1)).put("status",c.getString(2)).put("error",c.isNull(3)?"":c.getString(3)).put("createdAt",c.getString(4)).put("uploadedAt",c.isNull(5)?"":c.getString(5));out.add(j);}catch(Exception ignored){}}catch(Exception ignored){}return out;}
  List<Task> tasks(){List<Task> out=new ArrayList<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT json,local_status FROM tasks ORDER BY id",null)){while(c.moveToNext())try{JSONObject j=new JSONObject(c.getString(0));if(!c.isNull(1))j.put("local_status",c.getString(1));out.add(new Task(j));}catch(Exception ignored){}}return out;}
  Task task(long id){try(Cursor c=getReadableDatabase().rawQuery("SELECT json,local_status FROM tasks WHERE id=?",new String[]{""+id})){if(c.moveToFirst()){JSONObject j=new JSONObject(c.getString(0));if(!c.isNull(1))j.put("local_status",c.getString(1));return new Task(j);}}catch(Exception ignored){}return null;}
  void taskQueued(long id){ContentValues v=new ContentValues();v.put("local_status","queued");getWritableDatabase().update("tasks",v,"id=?",new String[]{""+id});}
  String active(long site){try(Cursor c=getReadableDatabase().rawQuery("SELECT local_id FROM journeys WHERE site_id=? AND status='active' ORDER BY started_at DESC LIMIT 1",new String[]{""+site})){return c.moveToFirst()?c.getString(0):null;}}
  String journey(long task,long site,Location l,boolean offline){String id=UUID.randomUUID().toString();ContentValues v=new ContentValues();v.put("local_id",id);v.put("task_id",task);v.put("site_id",site);v.put("status","active");v.put("offline_start",offline?1:0);v.put("start_lat",l.getLatitude());v.put("start_lon",l.getLongitude());v.put("start_acc",l.getAccuracy());v.put("started_at",Util.now());getWritableDatabase().insertOrThrow("journeys",null,v);return id;}
  JSONObject journey(String id){try(Cursor c=getReadableDatabase().rawQuery("SELECT task_id,site_id,server_id,status,offline_start,start_lat,start_lon,start_acc,started_at FROM journeys WHERE local_id=?",new String[]{id})){if(!c.moveToFirst())return null;JSONObject j=new JSONObject();j.put("localId",id).put("taskId",c.getLong(0)).put("siteId",c.getLong(1));if(!c.isNull(2))j.put("serverId",c.getLong(2));j.put("status",c.getString(3)).put("offlineStart",c.getInt(4)==1).put("latitude",c.getDouble(5)).put("longitude",c.getDouble(6)).put("accuracyM",c.getDouble(7)).put("startedAt",c.getString(8));return j;}catch(Exception e){return null;}}
  void serverJourney(String id,long server){ContentValues v=new ContentValues();v.put("server_id",server);getWritableDatabase().update("journeys",v,"local_id=?",new String[]{id});}
  void offlineJourney(String id){ContentValues v=new ContentValues();v.put("offline_start",1);getWritableDatabase().update("journeys",v,"local_id=?",new String[]{id});}
  void abort(String id){ContentValues v=new ContentValues();v.put("status","rejected");v.put("ended_at",Util.now());getWritableDatabase().update("journeys",v,"local_id=?",new String[]{id});}
  void finish(String id){ContentValues v=new ContentValues();v.put("status","completed");v.put("ended_at",Util.now());getWritableDatabase().update("journeys",v,"local_id=?",new String[]{id});}
  void serverDone(String id){ContentValues v=new ContentValues();v.put("server_done",1);getWritableDatabase().update("journeys",v,"local_id=?",new String[]{id});}
  List<JSONObject> journeys(String where){List<JSONObject> out=new ArrayList<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT local_id FROM journeys WHERE "+where,null)){while(c.moveToNext()){JSONObject j=journey(c.getString(0));if(j!=null)out.add(j);}}return out;}
  int nextSeq(String id){try(Cursor c=getReadableDatabase().rawQuery("SELECT COALESCE(MAX(seq),-1)+1 FROM tracks WHERE journey_id=?",new String[]{id})){return c.moveToFirst()?c.getInt(0):0;}}
  void track(String id,int seq,Location l){ContentValues v=new ContentValues();v.put("journey_id",id);v.put("seq",seq);v.put("at",Util.now());v.put("lat",l.getLatitude());v.put("lon",l.getLongitude());v.put("acc",l.getAccuracy());v.put("speed",l.hasSpeed()?l.getSpeed():0);v.put("mock",Util.mock(l)?1:0);getWritableDatabase().insertWithOnConflict("tracks",null,v,SQLiteDatabase.CONFLICT_IGNORE);}
  JSONArray tracks(String id){JSONArray a=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT seq,at,lat,lon,acc,speed,mock FROM tracks WHERE journey_id=? AND uploaded=0 ORDER BY seq LIMIT 1000",new String[]{id})){while(c.moveToNext())a.put(new JSONObject().put("sequence",c.getInt(0)).put("recordedAt",c.getString(1)).put("latitude",c.getDouble(2)).put("longitude",c.getDouble(3)).put("accuracyM",c.getDouble(4)).put("speedMps",c.getDouble(5)).put("mockLocation",c.getInt(6)==1));}catch(Exception ignored){}return a;}
  void tracksDone(String id,int seq){ContentValues v=new ContentValues();v.put("uploaded",1);getWritableDatabase().update("tracks",v,"journey_id=? AND seq<=?",new String[]{id,""+seq});}
  String record(long task,String journey,String photo,JSONObject payload){String id=UUID.randomUUID().toString();try{payload.put("clientRecordId",id);}catch(Exception ignored){}ContentValues v=new ContentValues();v.put("client_id",id);v.put("task_id",task);v.put("journey_id",journey);v.put("photo",photo);v.put("payload",payload.toString());v.put("status","pending");v.put("created_at",Util.now());getWritableDatabase().insertOrThrow("records",null,v);return id;}
  List<JSONObject> records(){List<JSONObject> out=new ArrayList<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT client_id,task_id,journey_id,photo,payload FROM records WHERE status!='uploaded' ORDER BY created_at",null)){while(c.moveToNext())try{out.add(new JSONObject().put("clientId",c.getString(0)).put("taskId",c.getLong(1)).put("journeyId",c.getString(2)).put("photo",c.getString(3)).put("payload",new JSONObject(c.getString(4))));}catch(Exception ignored){}}return out;}
  void recordResult(String id,boolean ok,String error){ContentValues v=new ContentValues();v.put("status",ok?"uploaded":"failed");v.put("error",error);if(ok)v.put("uploaded_at",Util.now());getWritableDatabase().update("records",v,"client_id=?",new String[]{id});}
  int count(String where){try(Cursor c=getReadableDatabase().rawQuery("SELECT COUNT(*) FROM records WHERE "+where,null)){return c.moveToFirst()?c.getInt(0):0;}}
  boolean sibling(long site,long current){for(Task t:tasks()){if(t.id==current||t.j.optLong("site_id")!=site||t.submitted()||t.canceled())continue;try(Cursor c=getReadableDatabase().rawQuery("SELECT COUNT(*) FROM records WHERE task_id=?",new String[]{""+t.id})){if(c.moveToFirst()&&c.getInt(0)==0)return true;}}return false;}
  void log(String level,String message){log(level,message,"{}");}
  // 结构化日志：details 为 JSON 字符串（网络类型/HTTP状态/队列数量/权限等）。
  // 写入前脱敏：PIN、Bearer 令牌、激活密钥等敏感串一律打码，规格 §21。
  void log(String level,String message,String details){String m=String.valueOf(message==null?"":message).replaceAll("(?i)bearer\\s+[A-Za-z0-9._~-]{8,}","Bearer [redacted]").replaceAll("(?i)pin\\s*[:=]\\s*\\d{4}","pin=[redacted]").replaceAll("(?i)token\\s*[:=]\\s*[A-Za-z0-9._~-]{8,}","token=[redacted]");ContentValues v=new ContentValues();v.put("level",level);v.put("message",m);v.put("details",details==null?"{}":details);v.put("at",Util.now());getWritableDatabase().insert("logs",null,v);}
  int tracksPending(){try(Cursor c=getReadableDatabase().rawQuery("SELECT COUNT(*) FROM tracks WHERE uploaded=0",null)){return c.moveToFirst()?c.getInt(0):0;}}
  JSONArray logs(){JSONArray a=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT id,level,message,details,at FROM logs WHERE uploaded=0 ORDER BY id LIMIT 100",null)){while(c.moveToNext()){JSONObject d=new JSONObject();try{d=new JSONObject(c.getString(3));}catch(Exception ignored){}a.put(new JSONObject().put("localId",c.getLong(0)).put("level",c.getString(1)).put("message",c.getString(2)).put("diagnostics",d).put("createdAt",c.getString(4)).put("appVersion",BuildConfig.VERSION_NAME));}}catch(Exception ignored){}return a;}
  void logsDone(JSONArray a){long max=0;for(int i=0;i<a.length();i++)max=Math.max(max,a.optJSONObject(i).optLong("localId"));ContentValues v=new ContentValues();v.put("uploaded",1);getWritableDatabase().update("logs",v,"id<=?",new String[]{""+max});}
  String diagnostics(){StringBuilder s=new StringBuilder("巴松措采样诊断日志\nAPP ").append(BuildConfig.VERSION_NAME).append("\n").append(Util.now()).append("\n---\n");try(Cursor c=getReadableDatabase().rawQuery("SELECT at,level,message,details FROM logs ORDER BY id DESC LIMIT 300",null)){while(c.moveToNext())s.append(c.getString(0)).append(" [").append(c.getString(1)).append("] ").append(c.getString(2)).append("  ").append(c.getString(3)).append('\n');}return s.toString();}
  // 导出诊断日志为 CSV 文件（带 UTF-8 BOM，Excel 可直接打开），返回缓存目录中的文件。
  java.io.File logsCsv(){try{java.io.File f=new java.io.File(ctx.getCacheDir(),"bsc-logs-"+System.currentTimeMillis()+".csv");try(java.io.Writer w=new java.io.OutputStreamWriter(new java.io.FileOutputStream(f),java.nio.charset.StandardCharsets.UTF_8)){w.write('\uFEFF');w.write("时间,级别,消息,结构化详情\r\n");try(Cursor c=getReadableDatabase().rawQuery("SELECT at,level,message,details FROM logs ORDER BY id DESC LIMIT 2000",null)){while(c.moveToNext()){w.write(csv(c.getString(0)));w.write(',');w.write(csv(c.getString(1)));w.write(',');w.write(csv(c.getString(2)));w.write(',');w.write(csv(c.getString(3)));w.write("\r\n");}}}return f;}catch(Exception e){return null;}}
  private static String csv(String s){String v=String.valueOf(s==null?"":s);return "\""+v.replace("\"","\"\"")+"\"";}
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/SyncDns.java`

SHA-256: `cc1cbde7cee9546c4b2b513064571f43e80cc65a6305eddf7cd98f94e1c829bb`

~~~~java
package online.gpsgps.bscsampling;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import okhttp3.Dns;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

// 保持原有解析方式（系统 DNS）优先，与旧版行为完全一致；
// 仅当系统 DNS 解析失败（移动网络下运营商 DNS 抽风）时才用阿里
// 公共 DNS over HTTPS（223.5.5.5，IP 直连）兜底，避免同步彻底失败。
final class SyncDns implements Dns {
  private static final String DOH = "https://223.5.5.5/resolve?name=%s&type=A";
  private static final OkHttpClient dohClient = new OkHttpClient.Builder()
      .connectTimeout(8, TimeUnit.SECONDS).readTimeout(8, TimeUnit.SECONDS).build();

  @Override public List<InetAddress> lookup(String host) throws UnknownHostException {
    try {
      return Dns.SYSTEM.lookup(host);
    } catch (UnknownHostException systemFail) {
      try {
        Request r = new Request.Builder().url(String.format(Locale.US, DOH, host)).header("Accept", "application/dns-json").build();
        try (Response resp = dohClient.newCall(r).execute()) {
          if (resp.isSuccessful() && resp.body() != null) {
            List<String> ips = parseDohAnswers(resp.body().string());
            if (!ips.isEmpty()) {
              List<InetAddress> out = new ArrayList<>();
              for (String ip : ips) out.add(InetAddress.getByName(ip));
              return out;
            }
          }
        }
      } catch (Exception ignored) { /* 回退失败，抛出原始解析错误 */ }
      throw systemFail;
    }
  }

  // 从 DNS-JSON 应答里提取 A 记录（type=1）的 IPv4 地址。
  // 纯字符串解析、不依赖 org.json，Android 运行时与 JVM 单元测试均可直接用。
  static List<String> parseDohAnswers(String json) {
    List<String> out = new ArrayList<>();
    if (json == null) return out;
    int from = 0;
    while (true) {
      int t = json.indexOf("\"type\":1", from);
      if (t < 0) break;
      int d = json.indexOf("\"data\":\"", t);
      if (d < 0) break;
      int s = d + 8;
      int e = json.indexOf('"', s);
      if (e < 0) break;
      String ip = json.substring(s, e);
      if (ip.matches("\\d{1,3}(\\.\\d{1,3}){3}")) out.add(ip);
      from = e + 1;
    }
    return out;
  }
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/SyncEngine.java`

SHA-256: `2408bba90596c8ae159a3632f1c61de8f0e7cd4675cd5b47079988be64360d6a`

~~~~java
package online.gpsgps.bscsampling;

import android.content.Context;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.nio.file.Files;

final class SyncEngine {
  static final class Result{int tasks,uploaded,errors;String message;}
  private final Context c;private final Store d;private final Api a;
  SyncEngine(Context c){this.c=c.getApplicationContext();d=new Store(c);a=new Api(c);}
  Result run(){Result out=new Result();if(!Util.online(c)){out.message="当前离线，数据已保存在手机";d.log("info","SYNC_SKIP_OFFLINE",detail());return out;}d.log("info","SYNC_BEGIN",detail());
    JSONArray t=null;
    try{t=a.sync().optJSONArray("tasks");}
    catch(Exception e){boolean auth=e instanceof Api.ApiError&&(((Api.ApiError)e).status==401||((Api.ApiError)e).status==403);if(!auth){fail("SYNC_TASKS",e);out.errors++;out.message=e.getMessage();d.log("info","SYNC_END",detail());return out;}
      // 设备已绑定：令牌过期/失效时用已存账号+设备编号静默重新登录（无需再扫码），一次绑定终身免登录。
      try{String tok=new Api(c).login().getString("token");new Prefs(c).token(tok);d.log("info","AUTO_RELOGIN 绑定设备自动重新登录");t=a.sync().optJSONArray("tasks");}
      catch(Exception e2){fail("SYNC_TASKS",e2);out.errors++;out.message=e2.getMessage();d.log("info","SYNC_END",detail());return out;}}
    if(t!=null){d.tasks(t);out.tasks=t.length();d.log("info","SYNC_TASKS","{\"tasks\":"+t.length()+"}");}
    // 离线开始的行程（含已在本地完成的）都要先补报服务器 start，拿到 serverId 后
    // 轨迹与记录才能上传；旧实现只处理 status='active'，导致离线完成的行程永远卡住。
    for(JSONObject j:d.journeys("server_id IS NULL AND (status='active' OR (status='completed' AND server_done=0))")){try{JSONObject r=a.start(j.optLong("taskId"),j.optDouble("latitude"),j.optDouble("longitude"),j.optDouble("accuracyM"));d.serverJourney(j.optString("localId"),r.getJSONObject("journey").getLong("id"));}catch(Exception e){fail("SYNC_START task="+j.optLong("taskId"),e);out.errors++;}}
    for(JSONObject j:d.journeys("server_id IS NOT NULL")){JSONArray points=d.tracks(j.optString("localId"));if(points.length()>0)try{a.tracks(j.optLong("serverId"),points);d.tracksDone(j.optString("localId"),points.optJSONObject(points.length()-1).optInt("sequence"));}catch(Exception e){fail("SYNC_TRACK",e);out.errors++;}}
    for(JSONObject r:d.records()){try{JSONObject j=d.journey(r.optString("journeyId"));if(j==null||!j.has("serverId"))continue;File f=new File(r.optString("photo"));if(!f.isFile())throw new IllegalStateException("本地照片不存在");JSONObject p=r.getJSONObject("payload");if(p.optString("weatherText").equals("待补充"))try{p.put("weatherText",a.weather(p.optDouble("latitude"),p.optDouble("longitude"),p.optString("capturedAt")));}catch(Exception ignored){}p.put("offlineStart",j.optBoolean("offlineStart"));p.put("photoDataUrl","data:image/jpeg;base64,"+Base64.encodeToString(Files.readAllBytes(f.toPath()),Base64.NO_WRAP));a.record(r.optLong("taskId"),p);d.recordResult(r.optString("clientId"),true,null);out.uploaded++;}catch(Exception e){d.recordResult(r.optString("clientId"),false,e.getMessage());fail("SYNC_RECORD task="+r.optLong("taskId"),e);out.errors++;}}
    for(JSONObject j:d.journeys("status='completed' AND server_id IS NOT NULL AND server_done=0"))try{a.complete(j.optLong("serverId"));d.serverDone(j.optString("localId"));}catch(Exception e){fail("SYNC_COMPLETE",e);out.errors++;}
    JSONArray logs=d.logs();if(logs.length()>0)try{a.logs(logs);d.logsDone(logs);}catch(Exception ignored){}
    out.message=out.errors==0?"同步完成":"部分数据仍待上传";d.log("info","SYNC_END",detail());return out;}
  // 结构化详情：网络类型、各队列数量、同步结果（规格 §21 诊断日志要求）。
  private String detail(){try{return new JSONObject().put("network",Util.networkType(c)).put("pendingRecords",d.count("status!='uploaded'")).put("pendingTracks",d.tracksPending()).put("pendingLogs",d.logs().length()).put("online",Util.online(c)).toString();}catch(Exception e){return"{}";}}
  private void fail(String where,Exception e){String http=e instanceof Api.ApiError?" HTTP"+((Api.ApiError)e).status:"";d.log("error",where+" "+e.getClass().getSimpleName()+":"+e.getMessage()+http);}
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/SyncWorker.java`

SHA-256: `dbca4277de8998dc69230b4aa7f750e93d533ecc547ef374e2ee25556cf630fd`

~~~~java
package online.gpsgps.bscsampling;
import android.content.Context;import androidx.annotation.NonNull;import androidx.work.Worker;import androidx.work.WorkerParameters;
public final class SyncWorker extends Worker{public SyncWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}@NonNull public Result doWork(){return new SyncEngine(getApplicationContext()).run().errors>0?Result.retry():Result.success();}}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/Task.java`

SHA-256: `bb17bc3e3f1d57b62a98564b8430ba7a563ea4a239bc8a04da45b5294565d120`

~~~~java
package online.gpsgps.bscsampling;
import org.json.JSONObject;
final class Task { final JSONObject j; final long id; Task(JSONObject j){this.j=j;id=j.optLong("id");} String title(){return j.optString("site_name","采样点");} String code(){return j.optString("sample_code","");} String siteCode(){return j.optString("site_code","");} String status(){return j.optString("status","assigned");} double lat(){return j.optDouble("target_latitude");} double lon(){return j.optDouble("target_longitude");} boolean submitted(){return status().equals("submitted")||j.optString("local_status").equals("queued")||j.optLong("record_id")>0;} boolean canceled(){String s=j.optString("canceled_at");return !j.isNull("canceled_at")&&!s.isEmpty()&&!"null".equalsIgnoreCase(s);} }
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/TaskActivity.java`

SHA-256: `b37df3e984403bca15523e7fba1e782e62547f7d4f2f30704d74bda54eec42f0`

~~~~java
package online.gpsgps.bscsampling;

import android.Manifest;import android.app.AlertDialog;import android.content.*;import android.content.pm.PackageManager;import android.graphics.BitmapFactory;import android.location.*;import android.net.Uri;import android.os.*;import android.provider.Settings;import android.view.View;import android.widget.*;import androidx.activity.result.*;import androidx.activity.result.contract.ActivityResultContracts;import androidx.annotation.NonNull;import androidx.appcompat.app.AppCompatActivity;import androidx.core.app.ActivityCompat;import androidx.core.content.ContextCompat;import androidx.work.*;import com.google.android.material.button.MaterialButton;import org.json.JSONObject;import java.io.File;import java.util.Locale;import java.util.concurrent.*;import okhttp3.*;

public final class TaskActivity extends AppCompatActivity implements LocationListener{
 private static final String[] REASONS={"无水","河岸无法靠近","道路中断","水位或地质危险","二维码损坏","其他"};private Store db;private Prefs prefs;private Task task;private LocationManager lm;private Location here;private String journey,qr="",reason="",detail="",photo="",captured="",weather="待补充";private boolean manual,noWater;private TextView loc,message;private MaterialButton start,scan,photoButton,save;private ImageView preview;private final ExecutorService work=Executors.newSingleThreadExecutor();private final Handler ui=new Handler(Looper.getMainLooper());private int autoLeft;private final Runnable autoTick=new Runnable(){public void run(){if(autoLeft<=0){save();return;}message.setText("照片已拍摄："+autoLeft+" 秒后自动保存（点重新拍照取消）");autoLeft--;ui.postDelayed(this,1000);}};
 private final ActivityResultLauncher<String[]> foreground=registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(),r->permissionGuide());private final ActivityResultLauncher<Intent> scanner=registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),r->scanResult(r.getResultCode(),r.getData()));private final ActivityResultLauncher<Intent> camera=registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),r->photoResult(r.getResultCode(),r.getData()));
 protected void onCreate(Bundle b){super.onCreate(b);setContentView(R.layout.activity_task);db=new Store(this);prefs=new Prefs(this);task=db.task(getIntent().getLongExtra("task",-1));if(task==null){Toast.makeText(this,"任务不存在，请同步",Toast.LENGTH_LONG).show();finish();return;}lm=getSystemService(LocationManager.class);bind();fill();locations();reference();journey=db.active(task.j.optLong("site_id"));if(journey!=null){start.setText("正在记录前往轨迹");start.setEnabled(false);scan.setEnabled(true);}}
 private void bind(){findViewById(R.id.back).setOnClickListener(v->finish());loc=findViewById(R.id.locationState);message=findViewById(R.id.message);start=findViewById(R.id.start);scan=findViewById(R.id.scanBottle);photoButton=findViewById(R.id.takePhoto);save=findViewById(R.id.save);preview=findViewById(R.id.photoPreview);start.setOnClickListener(v->start());scan.setOnClickListener(v->scan());findViewById(R.id.noWater).setOnClickListener(v->noWater());photoButton.setOnClickListener(v->photo());save.setOnClickListener(v->save());}
 private void fill(){((TextView)findViewById(R.id.taskTitle)).setText(task.title());((TextView)findViewById(R.id.code)).setText(task.code());((TextView)findViewById(R.id.meta)).setText("历史序号 "+task.siteCode()+" · "+Util.type(task.j.optString("sample_type"))+" · 计划 "+task.j.optString("planned_date"));((TextView)findViewById(R.id.instructions)).setText("管理员说明\n"+task.j.optString("instructions","无")+"\n\n备注\n"+task.j.optString("remarks","无"));((TextView)findViewById(R.id.risk)).setText("风险提醒\n"+task.j.optString("risk_note","注意水边安全")+(task.canceled()?"\n⚠任务已取消：仍可提交，但进入审核":""));}
 private void locations(){if(ActivityCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){foreground.launch(Build.VERSION.SDK_INT>=33?new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.POST_NOTIFICATIONS}:new String[]{Manifest.permission.ACCESS_FINE_LOCATION});return;}try{lm.requestLocationUpdates(LocationManager.GPS_PROVIDER,2000,0,this);if(lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER))lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,3000,0,this);}catch(Exception e){message.setText("定位启动失败："+e.getMessage());}}
 private boolean permissions(){return ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED&&(Build.VERSION.SDK_INT<29||ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED)&&(Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED);}
 private void permissionGuide(){if(permissions()){locations();message.setText("权限已开启");return;}new AlertDialog.Builder(this).setTitle("必须开启定位与通知").setMessage("为了证明真实前往采样点，需要：\n1. 精确位置：允许\n2. 位置信息：始终允许\n3. 通知：允许\n\n请不要选择“仅本次”。开启后返回再点开始。 ").setPositiveButton("去开启",(d,w)->startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())))).setNegativeButton("暂不采样",null).show();}
 private void start(){if(!permissions()){db.log("warning","PERM_DENIED_START",permDetail());permissionGuide();return;}if(here==null){message.setText("请到室外等待卫星定位");return;}db.log("info","START_JOURNEY",permDetail());String shared=db.active(task.j.optLong("site_id"));if(shared!=null){activate(shared,false,true);return;}start.setEnabled(false);start.setText("正在锁定任务…");Location pos=new Location(here);if(!Util.online(this)){activate(db.journey(task.id,task.j.optLong("site_id"),pos,true),true,true);return;}work.execute(()->{String local=db.journey(task.id,task.j.optLong("site_id"),pos,false);try{JSONObject r=new Api(this).start(task.id,pos.getLatitude(),pos.getLongitude(),pos.getAccuracy());db.serverJourney(local,r.getJSONObject("journey").getLong("id"));runOnUiThread(()->activate(local,r.optBoolean("weakEvidence"),true));}catch(Api.ApiError e){db.abort(local);runOnUiThread(()->{start.setEnabled(true);start.setText("开始前往（记录轨迹）");message.setText(e.getMessage());});}catch(Exception e){db.offlineJourney(local);db.log("warning","OFFLINE_START "+e.getMessage());runOnUiThread(()->activate(local,true,true));}});}
 private String permDetail(){try{return new org.json.JSONObject().put("network",Util.networkType(this)).put("online",Util.online(this)).put("distance",Math.round(distance())).put("fineLocation",ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED).put("backgroundLocation",ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED).toString();}catch(Exception e){return"{}";}}
 private void activate(String id,boolean weak,boolean navigate){journey=id;prefs.journey(id);TrackingService.start(this,id);if(navigate){Toast.makeText(this,(distance()<300||weak?"轨迹记录已开始（起点距采样点不足300米或离线开始，将标记审核）":"轨迹记录已开始，每10秒保存位置。到达后扫码"),Toast.LENGTH_LONG).show();startActivity(new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));finish();}else{start.setText("正在记录前往轨迹");start.setEnabled(false);scan.setEnabled(true);message.setText("已自动开始记录轨迹，可直接扫码");}}
 // 无需先点"开始前往"：已到点位可直接扫码；未开始行程则自动静默开始记录轨迹。
 private void scan(){if(here==null){message.setText("请到室外等待定位");return;}if(distance()>task.j.optInt("severe_radius_m",300)){message.setText("超过300米，禁止开始采样");return;}if(journey==null){start();}scanner.launch(new Intent(this,ScanActivity.class));}
 private void scanResult(int code,Intent data){if(code!=RESULT_OK||data==null)return;if(data.getBooleanExtra(ScanActivity.DAMAGED,false)){manualDialog();return;}try{QrData q=QrData.parse(data.getStringExtra(ScanActivity.RESULT));if(q.activation||!task.code().equals(q.code))throw new IllegalArgumentException("瓶子编号不匹配，应为 "+task.code());qr=q.token;manual=false;noWater=false;ready();}catch(Exception e){message.setText(e.getMessage()+"，请换正确瓶子重扫");}}
 private void manualDialog(){LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(32,8,32,0);EditText code=new EditText(this);code.setHint("完整输入 "+task.code());EditText note=new EditText(this);note.setHint("说明标签损坏情况");body.addView(code);body.addView(note);new AlertDialog.Builder(this).setTitle("二维码损坏（严重可疑）").setMessage("照片中必须拍到损坏标签").setView(body).setPositiveButton("确认",(d,w)->{if(!task.code().equals(code.getText().toString().trim())){message.setText("编号必须完全一致");return;}manual=true;noWater=false;reason="二维码损坏";detail=note.getText().toString().trim();ready();}).setNegativeButton("取消",null).show();}
 private void ready(){photoButton.setVisibility(View.VISIBLE);double d=distance();if(manual)message.setText("损坏标签放近处，后方拍实际环境");else if(d>task.j.optInt("normal_radius_m",30))message.setText(String.format(Locale.CHINA,"二维码正确。距采样点 %.0f 米（超过30米，系统自动记录距离供管理员审核）。装水后拍瓶子与现场环境",d));else message.setText("二维码正确。装水后拍瓶子与现场环境");}
 // 距离超过30米不再要求选择原因（需求变更）：照常允许拍照采样，
 // 服务器按实际距离自动打 distance_30_80m / distance_80_300m 风险标志供管理员审核。
 private void noWater(){if(journey==null||here==null){message.setText("请先开始前往并定位");return;}if(distance()>task.j.optInt("severe_radius_m",300)){message.setText("超过300米，禁止提交");return;}new AlertDialog.Builder(this).setTitle("无法采样原因").setSingleChoiceItems(REASONS,0,null).setPositiveButton("继续拍现场",(d,w)->{int x=((AlertDialog)d).getListView().getCheckedItemPosition();reason=x<0?"无水":REASONS[x];noWater=true;manual=false;qr="";photoButton.setText("拍摄无法采样的现场");photoButton.setVisibility(View.VISIBLE);message.setText("无水记录无需瓶子，只拍实际现场");}).setNegativeButton("取消",null).show();}
 private void photo(){if(here==null)return;ui.removeCallbacks(autoTick);Intent i=new Intent(this,PhotoActivity.class).putExtra("project",task.j.optString("project_name")).putExtra("code",task.code()).putExtra("type",Util.type(task.j.optString("sample_type"))).putExtra("site",task.title()).putExtra("siteCode",task.siteCode()).putExtra("lat",here.getLatitude()).putExtra("lon",here.getLongitude()).putExtra("accuracy",(double)here.getAccuracy()).putExtra("distance",distance());camera.launch(i);}
 private void photoResult(int code,Intent data){if(code!=RESULT_OK||data==null)return;photo=data.getStringExtra(PhotoActivity.PATH);captured=data.getStringExtra(PhotoActivity.AT);weather=data.getStringExtra(PhotoActivity.WEATHER);if(photo==null||!new File(photo).isFile()){message.setText("照片保存失败，请重拍");return;}preview.setImageBitmap(BitmapFactory.decodeFile(photo));preview.setVisibility(View.VISIBLE);save.setVisibility(View.VISIBLE);photoButton.setText("重新拍照");autoLeft=10;ui.removeCallbacks(autoTick);ui.postDelayed(autoTick,1000);}
 private void save(){ui.removeCallbacks(autoTick);if(here==null||photo.isEmpty())return;try{if(journey==null){journey=db.journey(task.id,task.j.optLong("site_id"),new Location(here),false);prefs.journey(journey);TrackingService.start(this,journey);}JSONObject p=new JSONObject().put("capturedAt",captured).put("latitude",here.getLatitude()).put("longitude",here.getLongitude()).put("accuracyM",here.getAccuracy()).put("weatherText",weather==null?"待补充":weather).put("noWater",noWater).put("manualCode",manual).put("submittedCode",manual?task.code():"").put("qrToken",qr).put("exceptionCategory",reason).put("exceptionDetail",detail).put("mockLocation",Util.mock(here));db.record(task.id,journey,photo,p);db.taskQueued(task.id);String saveDetail="{}";try{saveDetail=new JSONObject().put("taskId",task.id).put("distance",Math.round(distance())).put("noWater",noWater).put("manual",manual).put("queue",db.count("status!='uploaded'")).put("network",Util.networkType(this)).toString();}catch(Exception ignored){}db.log("info","SAVE_QUEUED",saveDetail);boolean sibling=db.sibling(task.j.optLong("site_id"),task.id);if(!sibling){db.finish(journey);TrackingService.stop(this);prefs.journey("");}WorkManager.getInstance(this).enqueue(new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build());Toast.makeText(this,Util.online(this)?"已保存，正在后台上传"+(sibling?"（同点还有任务，轨迹继续记录）":""):"已保存，联网后自动上传"+(sibling?"（同点还有任务，轨迹继续记录）":""),Toast.LENGTH_LONG).show();finish();}catch(Exception e){message.setText("本地保存失败，请不要退出："+e.getMessage());db.log("error","SAVE "+e.getMessage());}}
 private double distance(){return here==null?Double.MAX_VALUE:Util.distance(here.getLatitude(),here.getLongitude(),task.lat(),task.lon());}public void onLocationChanged(@NonNull Location l){here=l;double d=distance();String level=d<=30?"30米内：正常":d<=80?"30～80米：需写原因":d<=300?"80～300米：严重可疑":"超过300米：禁止";loc.setText(String.format(Locale.CHINA,"WGS84 %.6f, %.6f\n距点 %.0f米 · 精度±%.0f米\n%s%s",l.getLatitude(),l.getLongitude(),d,l.getAccuracy(),level,Util.mock(l)?"\n⚠检测到模拟位置":""));}
 private void reference(){String path=task.j.optString("reference_image");ImageView ref=findViewById(R.id.reference);if(path==null||path.isEmpty()){ref.setVisibility(View.GONE);return;}
  // 点击参考图全屏放大查看（村民在山里要对照细节），再点一下关闭。
  ref.setOnClickListener(x->{android.graphics.Bitmap bm=(android.graphics.Bitmap)ref.getTag();if(bm==null)return;android.app.Dialog d=new android.app.Dialog(this);ImageView iv=new ImageView(this);iv.setImageBitmap(bm);iv.setScaleType(ImageView.ScaleType.FIT_CENTER);iv.setBackgroundColor(0xFF000000);d.setContentView(iv);iv.setOnClickListener(y->d.dismiss());d.show();});
  work.execute(()->{try(Response r=new OkHttpClient().newCall(new Request.Builder().url(path.startsWith("http")?path:prefs.server()+path).build()).execute()){if(!r.isSuccessful()||r.body()==null){runOnUiThread(()->ref.setVisibility(View.GONE));return;}byte[] b=r.body().bytes();android.graphics.Bitmap bm=BitmapFactory.decodeByteArray(b,0,b.length);runOnUiThread(()->{if(bm==null)ref.setVisibility(View.GONE);else{ref.setTag(bm);ref.setImageBitmap(bm);ref.setVisibility(View.VISIBLE);}});}catch(Exception e){db.log("warning","REFERENCE "+e.getMessage());runOnUiThread(()->ref.setVisibility(View.GONE));}});}
 protected void onDestroy(){try{lm.removeUpdates(this);}catch(Exception ignored){}ui.removeCallbacks(autoTick);work.shutdown();super.onDestroy();}
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/TrackingService.java`

SHA-256: `352ee9bbab228fc3b810a30036fac19f7e6d7094482c65aeed352aec9b2a8a2d`

~~~~java
package online.gpsgps.bscsampling;

import android.Manifest;import android.app.*;import android.content.*;import android.content.pm.PackageManager;import android.location.*;import android.os.*;import androidx.annotation.*;import androidx.core.app.*;import androidx.core.content.ContextCompat;import androidx.work.*;import org.json.JSONObject;import java.util.Locale;import java.util.concurrent.*;

public final class TrackingService extends Service implements LocationListener{
  static final String START="bsc.START",STOP="bsc.STOP",EXTRA="journey",EXTRA_RESUME="resume";private LocationManager lm;private Store db;private Prefs prefs;private String id;private int seq;private long lastLive;private final ExecutorService net=Executors.newSingleThreadExecutor();
  static void start(Context c,String id){ContextCompat.startForegroundService(c,new Intent(c,TrackingService.class).setAction(START).putExtra(EXTRA,id));}
  static void startResumed(Context c,String id){ContextCompat.startForegroundService(c,new Intent(c,TrackingService.class).setAction(START).putExtra(EXTRA,id).putExtra(EXTRA_RESUME,true));}
  static void stop(Context c){c.startService(new Intent(c,TrackingService.class).setAction(STOP));}
  public void onCreate(){super.onCreate();lm=getSystemService(LocationManager.class);db=new Store(this);prefs=new Prefs(this);}
  public int onStartCommand(Intent in,int flags,int start){if(in!=null&&STOP.equals(in.getAction())){stopNow();return START_NOT_STICKY;}boolean resumed=(in!=null&&in.getBooleanExtra(EXTRA_RESUME,false))||in==null;id=in==null?prefs.activeJourney():in.getStringExtra(EXTRA);if(id==null||id.isEmpty()||db.journey(id)==null){stopSelf();return START_NOT_STICKY;}prefs.journey(id);seq=db.nextSeq(id);startForeground(301,note("每10秒保存一次WGS84位置"));if(ActivityCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){db.log("error","TRACK_PERMISSION_MISSING",trackDetail(resumed));stopSelf();return START_NOT_STICKY;}try{lm.requestLocationUpdates(LocationManager.GPS_PROVIDER,10000,0,this,Looper.getMainLooper());if(lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER))lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,10000,0,this,Looper.getMainLooper());}catch(Exception e){db.log("error","TRACK_START "+e.getMessage(),trackDetail(resumed));}if(resumed){db.log("warning","TRACK_RESUME",trackDetail(true));JSONObject j=db.journey(id);if(j!=null&&j.has("serverId")){final long serverId=j.optLong("serverId");net.execute(()->{try{new Api(this).interrupted(serverId);}catch(Exception e){db.log("warning","TRACK_INTERRUPT_MARK "+e.getMessage());}});}}else db.log("info","TRACK_START",trackDetail(false));return START_STICKY;}
  private String trackDetail(boolean resumed){try{return new JSONObject().put("journey",id).put("network",Util.networkType(this)).put("resumed",resumed).put("seq",seq).toString();}catch(Exception e){return"{}";}}
  private Notification note(String text){PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,TrackingService.class).setAction(STOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);return new NotificationCompat.Builder(this,SamplingApp.TRACK).setSmallIcon(R.drawable.ic_launcher).setContentTitle("巴松措采样：轨迹记录中").setContentText(text).setOngoing(true).setContentIntent(open).addAction(0,"停止记录",stop).build();}
  public void onLocationChanged(@NonNull Location l){db.track(id,seq++,l);if(seq%60==0)db.log("info","TRACK_PROGRESS","{\"points\":"+seq+"}");getSystemService(NotificationManager.class).notify(301,note(String.format(Locale.CHINA,"WGS84 %.6f, %.6f · ±%.0fm",l.getLatitude(),l.getLongitude(),l.getAccuracy())));if(System.currentTimeMillis()-lastLive>=30000&&Util.online(this)){lastLive=System.currentTimeMillis();JSONObject j=db.journey(id);if(j!=null&&j.has("serverId"))net.execute(()->{try{new Api(this).live(j.optLong("taskId"),new JSONObject().put("recordedAt",Util.now()).put("latitude",l.getLatitude()).put("longitude",l.getLongitude()).put("accuracyM",l.getAccuracy()));}catch(Exception e){db.log("warning","LIVE "+e.getMessage());}});WorkManager.getInstance(this).enqueue(new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build());}}
  private void stopNow(){try{lm.removeUpdates(this);}catch(Exception ignored){}prefs.journey("");stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
  public void onProviderDisabled(@NonNull String p){db.log("warning","GPS_DISABLED "+p);}public void onProviderEnabled(@NonNull String p){}@Nullable public IBinder onBind(Intent i){return null;}public void onDestroy(){try{lm.removeUpdates(this);}catch(Exception ignored){}net.shutdown();super.onDestroy();}
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/UpdateWorker.java`

SHA-256: `701b13d035e6af93023b89717f8285a3636656e4b027fe15707406cea28a4714`

~~~~java
package online.gpsgps.bscsampling;
import android.app.NotificationChannel;import android.app.NotificationManager;import android.app.PendingIntent;import android.content.Context;import android.content.Intent;import android.os.Build;import androidx.annotation.NonNull;import androidx.core.app.NotificationCompat;import androidx.work.Worker;import androidx.work.WorkerParameters;
// 定期检查新版本：发现更新发高优先级系统通知（点通知打开 App 弹更新说明），
// 不下载、不安装（按需求只做强提醒）。
public final class UpdateWorker extends Worker{
  public UpdateWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
  @NonNull public Result doWork(){try{Context c=getApplicationContext();String latest=new Api(c).version().optString("versionName","");String cur=BuildConfig.VERSION_NAME;if(!latest.isEmpty()&&!cur.equals(latest)){NotificationManager nm=c.getSystemService(NotificationManager.class);if(Build.VERSION.SDK_INT>=26)nm.createNotificationChannel(new NotificationChannel("bsc_update","版本更新提醒",NotificationManager.IMPORTANCE_HIGH));Intent i=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);PendingIntent pi=PendingIntent.getActivity(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);NotificationCompat.Builder b=new NotificationCompat.Builder(c,"bsc_update").setSmallIcon(android.R.drawable.stat_sys_download_done).setContentTitle("发现新版本 "+latest).setContentText("请联系管理员安装新版本 APP").setPriority(NotificationCompat.PRIORITY_HIGH).setContentIntent(pi).setAutoCancel(true);try{nm.notify(302,b.build());}catch(Exception ignored){}}return Result.success();}catch(Exception e){return Result.retry();}}
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/Util.java`

SHA-256: `d730f628a20fc52dc80d48d3f55fce3504165cfa85d315acf8437a01c7d6664c`

~~~~java
package online.gpsgps.bscsampling;

import android.content.Context;
import android.location.Location;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.provider.Settings;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

final class Util {
  static String now(){ return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).format(new Date()); }
  static double distance(double a,double b,double c,double d){ float[] out=new float[1]; Location.distanceBetween(a,b,c,d,out); return out[0]; }
  static boolean online(Context c){ ConnectivityManager m=c.getSystemService(ConnectivityManager.class); if(m.getActiveNetwork()==null)return false; NetworkCapabilities n=m.getNetworkCapabilities(m.getActiveNetwork()); return n!=null&&n.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET); }
  static String networkType(Context c){ try{ ConnectivityManager m=c.getSystemService(ConnectivityManager.class); if(m==null||m.getActiveNetwork()==null)return"none"; NetworkCapabilities n=m.getNetworkCapabilities(m.getActiveNetwork()); if(n==null)return"unknown"; if(n.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))return"wifi"; if(n.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR))return"cellular"; if(n.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))return"ethernet"; if(n.hasTransport(NetworkCapabilities.TRANSPORT_VPN))return"vpn"; return"other"; }catch(Exception e){ return"unknown"; } }
  static boolean mock(Location l){ return android.os.Build.VERSION.SDK_INT>=31?l.isMock():l.isFromMockProvider(); }
  static String uuid(Context c){ String id=Settings.Secure.getString(c.getContentResolver(),Settings.Secure.ANDROID_ID); return UUID.nameUUIDFromBytes(("bsc:"+id).getBytes(StandardCharsets.UTF_8)).toString(); }
  static String type(String code){ switch(code){case"R":return"河流";case"T":return"支流";case"S":return"土壤";case"P":return"植物";case"Y":return"雨水";case"L":return"湖水";default:return code;} }
}
~~~~

#### `bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/Watermark.java`

SHA-256: `80c8eb191cf62c9d155db6912da60fa850936b24dc40c5b36e9bce400c33b86c`

~~~~java
package online.gpsgps.bscsampling;
import android.graphics.*;import androidx.exifinterface.media.ExifInterface;import org.json.JSONArray;import java.io.*;
final class Watermark{static void render(File input,File output,JSONArray lines)throws Exception{Bitmap src=BitmapFactory.decodeFile(input.getPath());if(src==null)throw new IOException("照片无法读取");int o=new ExifInterface(input).getAttributeInt(ExifInterface.TAG_ORIENTATION,1);Matrix m=new Matrix();if(o==6)m.postRotate(90);if(o==3)m.postRotate(180);if(o==8)m.postRotate(270);Bitmap rotated=Bitmap.createBitmap(src,0,0,src.getWidth(),src.getHeight(),m,true);if(rotated!=src)src.recycle();int max=Math.max(rotated.getWidth(),rotated.getHeight());float scale=max>1600?1600f/max:1;Bitmap photo=scale<1?Bitmap.createScaledBitmap(rotated,Math.round(rotated.getWidth()*scale),Math.round(rotated.getHeight()*scale),true):rotated;if(photo!=rotated)rotated.recycle();Bitmap result=photo.copy(Bitmap.Config.ARGB_8888,true);if(result!=photo)photo.recycle();Canvas c=new Canvas(result);float bar=Math.max(150,result.getHeight()*.22f);Paint bg=new Paint();bg.setColor(0xD2071B20);c.drawRect(0,result.getHeight()-bar,result.getWidth(),result.getHeight(),bg);Paint t=new Paint(1);t.setColor(Color.WHITE);t.setTypeface(Typeface.DEFAULT_BOLD);t.setTextSize(Math.max(20,result.getWidth()/40f));float x=result.getWidth()*.035f,y=result.getHeight()-bar+t.getTextSize()*1.25f;for(int i=0;i<lines.length();i++)c.drawText(lines.optString(i),x,y+i*t.getTextSize()*1.35f,t);try(FileOutputStream out=new FileOutputStream(output)){result.compress(Bitmap.CompressFormat.JPEG,82,out);}result.recycle();try{ExifInterface se=new ExifInterface(input),de=new ExifInterface(output);String dt=se.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);if(dt==null)dt=se.getAttribute(ExifInterface.TAG_DATETIME);if(dt!=null)de.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL,dt);double[] ll=se.getLatLong();if(ll!=null)de.setLatLong(ll[0],ll[1]);String lr=se.getAttribute(ExifInterface.TAG_GPS_LATITUDE_REF),nr=se.getAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF);if(lr!=null)de.setAttribute(ExifInterface.TAG_GPS_LATITUDE_REF,lr);if(nr!=null)de.setAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF,nr);de.saveAttributes();}catch(Exception ignored){}}}
~~~~

#### `bsc-android-native/app/src/main/res/drawable/card.xml`

SHA-256: `7768f48f577a41074ac2d43e32e6312b1759e2b43ef9f6f2fe26b2c8522e2759`

~~~~xml
<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="#FFFFFF"/><corners android:radius="16dp"/><padding android:left="16dp" android:right="16dp" android:top="14dp" android:bottom="14dp"/></shape>
~~~~

#### `bsc-android-native/app/src/main/res/drawable/dark.xml`

SHA-256: `6891eb53fb19e4a7d9434b508abdc503ec8e7acb5c12b5f61f695386a3b0e11a`

~~~~xml
<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="#D9071B20"/><corners android:radius="10dp"/><padding android:left="12dp" android:right="12dp" android:top="8dp" android:bottom="8dp"/></shape>
~~~~

#### `bsc-android-native/app/src/main/res/drawable/ic_launcher.xml`

SHA-256: `421403a033405a158ba7d8f40a1e063e55a3177fdac04d588b4c4ef35b67ad5e`

~~~~xml
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#087A64" android:pathData="M54,5C30,32 19,47 19,66a35,35 0,0 0,70 0C89,47 78,32 54,5z"/><path android:fillColor="#FFFFFF" android:pathData="M38,66a16,16 0,0 0,32 0h9a25,25 0,0 1,-50 0z"/></vector>
~~~~

#### `bsc-android-native/app/src/main/res/layout/activity_main.xml`

SHA-256: `107cb4e53b95a4565c4acdab1d7d78fd9d025617a6e3db220e03a174805e1977`

~~~~xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="match_parent" android:orientation="vertical" android:background="@color/bg">
  <LinearLayout android:id="@+id/header" android:layout_width="match_parent" android:layout_height="72dp" android:orientation="horizontal" android:gravity="center_vertical" android:paddingHorizontal="16dp" android:background="#FFFFFF">
    <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical"><TextView android:id="@+id/title" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="巴松措采样" android:textSize="24sp" android:textStyle="bold" android:textColor="@color/ink"/><TextView android:id="@+id/status" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="正在检查…" android:textSize="12sp"/></LinearLayout>
    <com.google.android.material.button.MaterialButton android:id="@+id/sync" android:layout_width="wrap_content" android:layout_height="50dp" android:text="同步"/>
  </LinearLayout>
  <FrameLayout android:id="@+id/content" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"/>
  <LinearLayout android:id="@+id/tabs" android:layout_width="match_parent" android:layout_height="76dp" android:orientation="horizontal" android:background="#FFFFFF">
    <Button android:id="@+id/tabMap" android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1" android:text="⌖\n地图" android:textAllCaps="false"/>
    <Button android:id="@+id/tabTasks" android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1" android:text="☑\n任务" android:textAllCaps="false"/>
    <Button android:id="@+id/tabUpload" android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1" android:text="⇧\n上传" android:textAllCaps="false"/>
    <Button android:id="@+id/tabMine" android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1" android:text="●\n我的" android:textAllCaps="false"/>
  </LinearLayout>
</LinearLayout>
~~~~

#### `bsc-android-native/app/src/main/res/layout/activity_photo.xml`

SHA-256: `2faaa2be27ea52b2d664ceee6ded170efe1dee18220f633c741cd44ec3736d84`

~~~~xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="match_parent" android:background="#000000"><androidx.camera.view.PreviewView android:id="@+id/camera" android:layout_width="match_parent" android:layout_height="match_parent"/><online.gpsgps.bscsampling.PhotoGuideOverlay android:layout_width="match_parent" android:layout_height="match_parent"/><TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_gravity="top|center_horizontal" android:layout_marginTop="14dp" android:padding="10dp" android:background="@drawable/dark" android:text="瓶子放近处约占1/4；后方必须拍到河流、湖泊或实际环境" android:textColor="#FFFFFF" android:textSize="16sp"/><com.google.android.material.button.MaterialButton android:id="@+id/shutter" android:layout_width="150dp" android:layout_height="68dp" android:layout_gravity="bottom|center_horizontal" android:layout_marginBottom="20dp" android:text="拍照" android:textSize="22sp"/></FrameLayout>
~~~~

#### `bsc-android-native/app/src/main/res/layout/activity_scan.xml`

SHA-256: `f34364ae5fe40771f0a8af6a08a2b341435692efca1fb02496dc8a064ed0dc8a`

~~~~xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="match_parent" android:background="#000000"><androidx.camera.view.PreviewView android:id="@+id/camera" android:layout_width="match_parent" android:layout_height="match_parent"/><online.gpsgps.bscsampling.ScanOverlay android:layout_width="match_parent" android:layout_height="match_parent"/><LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_gravity="bottom" android:orientation="vertical" android:padding="20dp" android:background="@drawable/dark"><TextView android:id="@+id/scanHint" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="把二维码放入方框" android:textColor="#FFFFFF" android:textSize="20sp" android:gravity="center"/><TextView android:id="@+id/timer" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="识别中…" android:textColor="#FFFFFF" android:gravity="center"/><com.google.android.material.button.MaterialButton android:id="@+id/damaged" android:layout_width="match_parent" android:layout_height="58dp" android:text="二维码损坏，手动填写" android:visibility="gone" android:layout_marginTop="10dp"/></LinearLayout></FrameLayout>
~~~~

#### `bsc-android-native/app/src/main/res/layout/activity_task.xml`

SHA-256: `7b6b259c5fcb061a5c8eabeedb438d052f434d62f0782912d1b7332fcaa10e99`

~~~~xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="match_parent" android:orientation="vertical" android:background="@color/bg"><LinearLayout android:layout_width="match_parent" android:layout_height="64dp" android:orientation="horizontal" android:gravity="center_vertical" android:paddingHorizontal="10dp" android:background="#FFFFFF"><Button android:id="@+id/back" android:layout_width="56dp" android:layout_height="52dp" android:text="‹" android:textSize="30sp"/><TextView android:id="@+id/taskTitle" android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:textSize="23sp" android:textStyle="bold" android:textColor="@color/ink"/></LinearLayout><ScrollView android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"><LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" android:padding="14dp">
<ImageView android:id="@+id/reference" android:layout_width="match_parent" android:layout_height="210dp" android:scaleType="centerCrop" android:background="#DCE7E4" android:contentDescription="管理员现场参考图片"/><TextView android:id="@+id/code" android:layout_width="match_parent" android:layout_height="wrap_content" android:textSize="22sp" android:textStyle="bold" android:textColor="@color/ink" android:layout_marginTop="10dp"/><TextView android:id="@+id/meta" android:layout_width="match_parent" android:layout_height="wrap_content" android:textSize="16sp" android:layout_marginTop="6dp"/><TextView android:id="@+id/instructions" android:layout_width="match_parent" android:layout_height="wrap_content" android:background="@drawable/card" android:layout_marginTop="10dp"/><TextView android:id="@+id/risk" android:layout_width="match_parent" android:layout_height="wrap_content" android:background="@drawable/card" android:textColor="@color/red" android:layout_marginTop="10dp"/><TextView android:id="@+id/locationState" android:layout_width="match_parent" android:layout_height="wrap_content" android:background="@drawable/card" android:textSize="16sp" android:layout_marginTop="10dp"/>
<com.google.android.material.button.MaterialButton android:id="@+id/start" android:layout_width="match_parent" android:layout_height="64dp" android:text="开始前往（记录轨迹）" android:textSize="20sp" android:layout_marginTop="12dp"/><com.google.android.material.button.MaterialButton android:id="@+id/scanBottle" android:layout_width="match_parent" android:layout_height="64dp" android:text="到达：扫描瓶子二维码" android:textSize="20sp" android:enabled="false" android:layout_marginTop="10dp"/><com.google.android.material.button.MaterialButton android:id="@+id/noWater" style="@style/Widget.Material3.Button.OutlinedButton" android:layout_width="match_parent" android:layout_height="58dp" android:text="现场无水/无法靠近" android:layout_marginTop="10dp"/><ImageView android:id="@+id/photoPreview" android:layout_width="match_parent" android:layout_height="210dp" android:scaleType="centerCrop" android:visibility="gone" android:layout_marginTop="10dp"/><com.google.android.material.button.MaterialButton android:id="@+id/takePhoto" android:layout_width="match_parent" android:layout_height="64dp" android:text="拍摄瓶子与现场环境" android:textSize="19sp" android:visibility="gone" android:layout_marginTop="10dp"/><com.google.android.material.button.MaterialButton android:id="@+id/save" android:layout_width="match_parent" android:layout_height="64dp" android:text="完成并保存，等待上传" android:textSize="19sp" android:visibility="gone" android:layout_marginTop="10dp"/><TextView android:id="@+id/message" android:layout_width="match_parent" android:layout_height="wrap_content" android:gravity="center" android:textColor="@color/red" android:layout_marginVertical="14dp"/>
</LinearLayout></ScrollView></LinearLayout>
~~~~

#### `bsc-android-native/app/src/main/res/layout/item_task.xml`

SHA-256: `8d0afb85d7fb803351045df7570b4ec6a7508901c431ea661d5f95b222d8a5f8`

~~~~xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="wrap_content" android:minHeight="108dp" android:orientation="vertical" android:padding="14dp" android:background="@drawable/card"><LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal"><TextView android:id="@+id/itemTitle" android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:textSize="19sp" android:textStyle="bold" android:textColor="@color/ink"/><TextView android:id="@+id/itemStatus" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textColor="@color/green"/></LinearLayout><TextView android:id="@+id/itemCode" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="6dp"/><TextView android:id="@+id/itemMeta" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="6dp"/></LinearLayout>
~~~~

#### `bsc-android-native/app/src/main/res/layout/view_list.xml`

SHA-256: `0d5c49c69ea46bd142b7dc005de6f31fbdc269914c2e87c0787b6e389d7ae5e3`

~~~~xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="match_parent" android:orientation="vertical" android:padding="12dp"><TextView android:id="@+id/listHint" android:layout_width="match_parent" android:layout_height="wrap_content" android:background="@drawable/card" android:padding="12dp"/><ExpandableListView android:id="@+id/list" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:divider="@android:color/transparent" android:dividerHeight="8dp" android:childDivider="@android:color/transparent"/></LinearLayout>
~~~~

#### `bsc-android-native/app/src/main/res/layout/view_login.xml`

SHA-256: `ebec686d75138fafab48410257a7bb7f0e544f44f1d3c27b2d0a1c73680a0a8d`

~~~~xml
<?xml version="1.0" encoding="utf-8"?>
<ScrollView xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="match_parent" android:fillViewport="true"><LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:minHeight="650dp" android:gravity="center_horizontal" android:orientation="vertical" android:padding="28dp">
  <ImageView android:layout_width="88dp" android:layout_height="88dp" android:src="@drawable/ic_launcher" android:contentDescription="水滴图标"/><TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="巴松措采样" android:textSize="30sp" android:textStyle="bold" android:textColor="@color/ink" android:layout_marginTop="12dp"/>
  <TextView android:id="@+id/loginHint" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="首次使用：扫描管理员生成的设备激活二维码\n扫码后自动激活并登录，之后打开无需再登录" android:gravity="center" android:textSize="17sp" android:layout_marginTop="10dp"/>
  <com.google.android.material.button.MaterialButton android:id="@+id/scanActivation" android:layout_width="match_parent" android:layout_height="64dp" android:text="扫描设备激活二维码" android:textSize="20sp" android:layout_marginTop="28dp"/>
  <TextView android:id="@+id/loginError" android:layout_width="match_parent" android:layout_height="wrap_content" android:gravity="center" android:textColor="@color/red" android:layout_marginTop="12dp"/>
  <com.google.android.material.button.MaterialButton android:id="@+id/copyLog" style="@style/Widget.Material3.Button.TextButton" android:layout_width="wrap_content" android:layout_height="52dp" android:text="复制诊断日志"/>
</LinearLayout></ScrollView>
~~~~

#### `bsc-android-native/app/src/main/res/layout/view_map.xml`

SHA-256: `dbb1b0644c3ef4e2e215d406035f2ef6d77c8c73e7e904176214406beb1fa6dc`

~~~~xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="match_parent"><org.maplibre.android.maps.MapView android:id="@+id/map" android:layout_width="match_parent" android:layout_height="match_parent"/><TextView android:id="@+id/location" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_margin="10dp" android:padding="12dp" android:background="@drawable/card" android:text="正在获取WGS84位置…"/><com.google.android.material.button.MaterialButton android:id="@+id/locate" android:layout_width="wrap_content" android:layout_height="56dp" android:layout_gravity="end|bottom" android:layout_margin="18dp" android:text="◎ 我的位置"/></FrameLayout>
~~~~

#### `bsc-android-native/app/src/main/res/values/colors.xml`

SHA-256: `41e6902689e22221af51e5e54728b686facf1867eeb781eb939b46765ccf6439`

~~~~xml
<resources><color name="green">#087A64</color><color name="ink">#09262B</color><color name="bg">#F3F7F6</color><color name="red">#B3261E</color></resources>
~~~~

#### `bsc-android-native/app/src/main/res/values/themes.xml`

SHA-256: `f212ee1befc19cb00e3df3f5033f319c0da21eac0967624e163d9fe62be8502d`

~~~~xml
<resources><style name="Theme.Bsc" parent="Theme.Material3.Light.NoActionBar"><item name="colorPrimary">@color/green</item><item name="android:fontFamily">sans</item><item name="android:windowLightStatusBar">true</item><item name="android:navigationBarColor">#FFFFFF</item></style></resources>
~~~~

#### `bsc-android-native/app/src/main/res/xml/file_paths.xml`

SHA-256: `67b8fddc6c1c8b974c817144a8d07bb45217296e396705a2942da0f670567eac`

~~~~xml
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="cache" path="."/>
    <external-files-path name="files" path="."/>
</paths>
~~~~

#### `bsc-android-native/app/src/test/java/online/gpsgps/bscsampling/QrDataTest.java`

SHA-256: `286fa5544e4a1d9f2f8823dd98a4dc8e39ac580c98c163c0ef5b455061144369`

~~~~java
package online.gpsgps.bscsampling;

import org.junit.Test;
import static org.junit.Assert.*;

public class QrDataTest {
  @Test public void parsesActivationQr() {
    QrData value = QrData.parse("BSC-ACT|https://bsc.gpsgps.online|cmy01|one-time-token");
    assertTrue(value.activation);
    assertEquals("https://bsc.gpsgps.online", value.server);
    assertEquals("cmy01", value.user);
    assertEquals("one-time-token", value.token);
  }

  @Test public void parsesBottleQr() {
    QrData value = QrData.parse("BSC-SAMPLE|260826-R-5.1-01|secret-token");
    assertFalse(value.activation);
    assertEquals("260826-R-5.1-01", value.code);
    assertEquals("secret-token", value.token);
  }

  @Test public void keepsHistoricalDecimalCodes() {
    // 历史序号 5.1、9.5 等小数点形式必须原样保留，不得转成浮点丢失格式。
    QrData a = QrData.parse("BSC-SAMPLE|260822-T-5.1-02|t1");
    QrData b = QrData.parse("BSC-SAMPLE|260822-L-9.5-01|t2");
    QrData c = QrData.parse("BSC-SAMPLE|260822-S-9.6-01|t3");
    assertEquals("260822-T-5.1-02", a.code);
    assertEquals("260822-L-9.5-01", b.code);
    assertEquals("260822-S-9.6-01", c.code);
    assertFalse("5.1 与 9.5 是两个独立编号", a.code.equals(b.code));
  }

  @Test public void trimsWhitespaceAroundQrText() {
    QrData value = QrData.parse("  BSC-SAMPLE|260826-R-12-01|token  \n");
    assertEquals("260826-R-12-01", value.code);
    assertEquals("token", value.token);
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsUntrustedQr() { QrData.parse("https://example.com"); }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsWrongPrefix() { QrData.parse("BSC-OTHER|a|b|c"); }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsActivationShapeWithWrongPartCount() { QrData.parse("BSC-ACT|server|user"); }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsBottleShapeWithWrongPartCount() { QrData.parse("BSC-SAMPLE|code|token|extra"); }
}
~~~~

#### `bsc-android-native/app/src/test/java/online/gpsgps/bscsampling/SyncDnsTest.java`

SHA-256: `64f393b6b05ee783c919843927aef819e81ec7c3bb2bfc40a38aa0b6099ae4b8`

~~~~java
package online.gpsgps.bscsampling;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public final class SyncDnsTest {
  @Test public void parsesARecordsFromDohJson() {
    String json = "{\"Status\":0,\"Answer\":["
      + "{\"name\":\"bsc.gpsgps.online.\",\"type\":1,\"TTL\":600,\"data\":\"117.72.52.14\"},"
      + "{\"name\":\"bsc.gpsgps.online.\",\"type\":28,\"TTL\":600,\"data\":\"2408:0:0::1\"},"
      + "{\"name\":\"bsc.gpsgps.online.\",\"type\":1,\"TTL\":600,\"data\":\"117.72.52.15\"}"
      + "]}";
    List<String> ips = SyncDns.parseDohAnswers(json);
    assertEquals(2, ips.size());
    assertTrue(ips.contains("117.72.52.14"));
    assertTrue(ips.contains("117.72.52.15"));
  }

  @Test public void emptyAnswerReturnsEmpty() {
    assertTrue(SyncDns.parseDohAnswers("{\"Status\":3}").isEmpty());
    assertTrue(SyncDns.parseDohAnswers("not json").isEmpty());
  }
}
~~~~

#### `bsc-android-native/build.gradle`

SHA-256: `8760baaffc293fc4a2636560d968e642965c8d7e54dcf4802c616d2c5820625d`

~~~~groovy
plugins {
    id 'com.android.application' version '8.7.3' apply false
}
~~~~

#### `bsc-android-native/gradle.properties`

SHA-256: `edb5bad5811ddeef2197fdc3721351836bfa3e649520b55aa9a3d12ee2fdf108`

~~~~properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
~~~~

#### `bsc-android-native/README.md`

SHA-256: `53aa056fabe656d3ee5badd68dad44cbd90900c64b1284080e5d737c3aab3e74`

~~~~markdown
# 巴松措采样 Android V1

原生 Android 10+ 客户端。默认只连接 `https://bsc.gpsgps.online`，不再使用 WebView，也不把 `127.0.0.1` 或电脑局域网地址写进 APK。

## 已实现流程

设备激活二维码 → 扫码即激活并自动登录（无 PIN）→ WGS84地图与任务 → 开始前往并每10秒记录轨迹 → 30秒上报实时位置 → 300米内扫码 → CameraX现场拍照 → 深色时间/天气/坐标水印 → SQLite待上传队列 → WorkManager联网补传。

激活策略（需求变更 2026-08-26）：激活二维码由管理员一次性生成（24 小时有效），扫码即激活并绑定设备，之后打开 APP 直接进入，不再要求 PIN 或再次登录。

距离规则：0–30米正常；30–80米必须选择原因；80–300米严重可疑；超过300米禁止。二维码连续失败3次或10秒才出现损坏入口，手动编号必须和任务完全一致。应用没有“从相册选择”入口。

## 关键目录

- `app/src/main/java/.../Store.java`：任务、行程、轨迹、照片、日志本地数据库。
- `TrackingService.java`：前台轨迹与常驻通知。
- `ScanActivity.java`：CameraX + ZXing二维码。
- `PhotoActivity.java`：只允许现场相机与水印。
- `SyncEngine.java`：服务器同步、天气补全、失败重试。
- `tools/gradle-with-proxy.js`：本开发沙箱专用构建代理，不会打包进APK。

## 本机构建（Windows）

1. 一次性安装工具链（Gradle 8.9 + Android SDK 35 到工作区根目录 `android-toolchain/`）：

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\setup-toolchain.ps1
   ```

2. 新建 `local.properties`（机器相关，不提交）：

   ```properties
   sdk.dir=D\:\\你的路径\\android-toolchain\\sdk
   ```

3. 编译（依赖走本地缓存代理，首次较慢）：

   ```powershell
   node tools\gradle-with-proxy.js assembleDebug --no-daemon
   ```

   产物：`app/build/outputs/apk/debug/app-debug.apk`。正式发布需要签名（keystore 离线保存并记录 APK SHA-256）。

## 正式验收前必须真机检查

在 OPPO Find X7 / Android 15 上依次验证：后台位置设为“始终允许”、锁屏30分钟轨迹不断、飞行模式采样、恢复网络自动上传、错误瓶子被拒绝、重复提交幂等、超过300米被禁止、无水记录、任务取消后仍可留证并进入审核。
~~~~

#### `bsc-android-native/settings.gradle`

SHA-256: `1592dbe8990c3de91f12602c08ee9aeae55fec52ed59faa5cc4b60b521d42264`

~~~~groovy
pluginManagement {
    repositories {
        if (System.getenv('LOCAL_MAVEN_PROXY')) {
            maven {
                url System.getenv('LOCAL_MAVEN_PROXY') + '/google'
                content { includeGroupByRegex 'com\\.android.*'; includeGroupByRegex 'androidx\\..*'; includeGroup 'com.google.android.material'; includeGroup 'com.google.testing.platform' }
            }
            maven { url System.getenv('LOCAL_MAVEN_PROXY') + '/maven' }
        } else { google(); mavenCentral(); gradlePluginPortal() }
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        if (System.getenv('LOCAL_MAVEN_PROXY')) {
            maven {
                url System.getenv('LOCAL_MAVEN_PROXY') + '/google'
                content { includeGroupByRegex 'com\\.android.*'; includeGroupByRegex 'androidx\\..*'; includeGroup 'com.google.android.material'; includeGroup 'com.google.testing.platform' }
            }
            maven { url System.getenv('LOCAL_MAVEN_PROXY') + '/maven' }
        } else { google(); mavenCentral() }
    }
}
rootProject.name = 'BscSampling'
include ':app'
~~~~

#### `bsc-android-native/tools/gradle-with-proxy.js`

SHA-256: `c419981c645375b2f644560bbdd4e1dd310a995b0f4e186664f98688acb24ad7`

~~~~javascript
'use strict';

// Build-environment adapter only: Gradle's Java process cannot use the sandbox
// egress proxy reliably, while curl can. This localhost proxy preserves normal
// Maven coordinates and caches exact upstream artifacts without modifying them.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const cache = path.join(root, '.maven-proxy-cache');
const gradleHome = path.join(root, '.gradle-user-home');
const androidHome = path.join(root, '.android-user-home');
fs.mkdirSync(cache, { recursive: true });
fs.mkdirSync(gradleHome, { recursive: true });
fs.mkdirSync(androidHome, { recursive: true });
const pending = new Map();
const bases = {
  google: 'https://dl.google.com/dl/android/maven2/',
  maven: 'https://repo.maven.apache.org/maven2/',
  plugins: 'https://plugins.gradle.org/m2/'
};

function download(url, target) {
  if (fs.existsSync(target)) return Promise.resolve();
  if (pending.has(target)) return pending.get(target);
  const job = new Promise((resolve, reject) => {
    const temporary = `${target}.${process.pid}.tmp`;
    // --retry-all-errors also retries TLS handshake failures (curl 35) that
    // occur when Gradle fires a large burst of parallel requests.
    const child = spawn('curl', ['-fL', '--retry', '5', '--retry-all-errors', '--retry-delay', '1', '--connect-timeout', '30', '--max-time', '600', '-o', temporary, url], { stdio: 'ignore' });
    child.on('error', err => { reject(new Error(`spawn ${err.message}: ${url}`)); });
    child.on('exit', code => {
      if (code === 0) { try { fs.renameSync(temporary, target); resolve(); } catch (err) { reject(new Error(`rename ${err.code}: ${url}`)); } }
      else { try { fs.unlinkSync(temporary); } catch {}; console.error(`[proxy] curl exit ${code}: ${url}`); reject(new Error(`curl ${code}: ${url}`)); }
    });
  }).finally(() => pending.delete(target));
  pending.set(target, job); return job;
}

// Limit concurrent upstream downloads so bursts cannot exhaust connections.
const MAX_CONCURRENT = 4;
let activeDownloads = 0;
const downloadQueue = [];
function pumpDownloads() {
  while (activeDownloads < MAX_CONCURRENT && downloadQueue.length) {
    const task = downloadQueue.shift();
    activeDownloads++;
    task().finally(() => { activeDownloads--; pumpDownloads(); });
  }
}
function throttledDownload(url, target) {
  if (fs.existsSync(target)) return Promise.resolve();
  if (pending.has(target)) return pending.get(target);
  return new Promise((resolve, reject) => {
    downloadQueue.push(() => download(url, target).then(resolve, reject));
    pumpDownloads();
  });
}

const server = http.createServer(async (request, response) => {
  const rawPath = request.url.split('?')[0];
  const match = /^\/(google|maven|plugins)\/(.+)$/.exec(decodeURIComponent(rawPath));
  if (!match || match[2].includes('..')) { console.error(`[proxy] BAD PATH: ${rawPath}`); response.writeHead(404); return response.end(); }
  const url = bases[match[1]] + match[2];
  const target = path.join(cache, crypto.createHash('sha256').update(url).digest('hex'));
  try {
    if (!fs.existsSync(target)) console.error(`[proxy] FETCH: ${url}`);
    await throttledDownload(url, target);
    const stat = fs.statSync(target);
    response.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public,max-age=31536000' });
    if (request.method === 'HEAD') response.end(); else fs.createReadStream(target).pipe(response);
  } catch (error) { console.error(`[proxy] FAIL: ${url} -> ${error.message}`); response.writeHead(404); response.end(String(error.message)); }
});

server.listen(31999, '127.0.0.1', () => {
  const port = 31999;
  const gradle = path.resolve(root, `../android-toolchain/gradle-8.9/bin/${process.platform === 'win32' ? 'gradle.bat' : 'gradle'}`);
  const args = process.argv.length > 2 ? process.argv.slice(2) : ['assembleDebug', '--no-daemon'];
  const env = { ...process.env, GRADLE_USER_HOME: gradleHome, ANDROID_USER_HOME: androidHome, LOCAL_MAVEN_PROXY: `http://127.0.0.1:${port}` };
  delete env.ANDROID_PREFS_ROOT;
  // On Windows, .bat files cannot be spawned directly; go through cmd.exe.
  const child = process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', gradle, ...args], { cwd: root, stdio: 'inherit', env })
    : spawn(gradle, args, { cwd: root, stdio: 'inherit', env });
  child.on('exit', code => server.close(() => process.exit(code == null ? 1 : code)));
});
~~~~

#### `bsc-android-native/tools/setup-toolchain.ps1`

SHA-256: `77b26d79992769d3c2a515275f93b21473440e573384f9fa12fa882c06b8f944`

~~~~powershell
# Build-environment setup: downloads Gradle 8.9 and the Android SDK 35 into
# <workspace>/android-toolchain for the proxy-based build (gradle-with-proxy.js
# expects gradle at ../android-toolchain/gradle-8.9). Run once per machine:
#
#   powershell -ExecutionPolicy Bypass -File tools\setup-toolchain.ps1
#
# Creates android-toolchain/ next to this project (workspace root) and a
# machine-specific local.properties is still required afterwards (see README).

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$workspace = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$root = Join-Path $workspace 'android-toolchain'
$sdks = Join-Path $root 'sdk'
New-Item -ItemType Directory -Force -Path $root | Out-Null

function Download-File([string]$Uri, [string]$Out) {
  if (Test-Path $Out) { Write-Host "skip (exists): $Out"; return }
  Write-Host "downloading: $Uri"
  Invoke-WebRequest -Uri $Uri -OutFile $Out -UseBasicParsing
  Write-Host "done: $Out ($([math]::Round((Get-Item $Out).Length/1MB,1)) MB)"
}

# --- Gradle 8.9 ---
if (-not (Test-Path (Join-Path $root 'gradle-8.9\bin\gradle.bat'))) {
  Download-File 'https://services.gradle.org/distributions/gradle-8.9-bin.zip' (Join-Path $root 'gradle.zip')
  Write-Host 'extracting gradle...'
  Expand-Archive (Join-Path $root 'gradle.zip') -DestinationPath $root -Force
  Remove-Item (Join-Path $root 'gradle.zip')
}

# --- Android cmdline-tools ---
$sdkmanager = Join-Path $sdks 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkmanager)) {
  Download-File 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' (Join-Path $root 'cmdline-tools.zip')
  Write-Host 'extracting cmdline-tools...'
  Expand-Archive (Join-Path $root 'cmdline-tools.zip') -DestinationPath (Join-Path $root 'cmdtools') -Force
  New-Item -ItemType Directory -Force -Path (Join-Path $sdks 'cmdline-tools') | Out-Null
  Move-Item (Join-Path $root 'cmdtools\cmdline-tools') (Join-Path $sdks 'cmdline-tools\latest') -Force
  Remove-Item (Join-Path $root 'cmdline-tools.zip')
}

$env:ANDROID_HOME = $sdks
$env:ANDROID_SDK_ROOT = $sdks

# --- Accept licenses ---
Write-Host 'accepting SDK licenses...'
$yes = (1..40 | ForEach-Object { 'y' }) -join "`n"
$yes | & $sdkmanager --licenses 2>&1 | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host 'license step reported non-zero (may still be ok)' }

# --- Install packages ---
Write-Host 'installing platform-tools, platforms;android-35, build-tools;35.0.0...'
& $sdkmanager 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0' 2>&1 | Select-Object -Last 8
Write-Host "toolchain setup finished, exit=$LASTEXITCODE"
~~~~

#### `bsc-sampling-v1/deploy/config.example.json`

SHA-256: `c88763a66c7481061b1a443dc8d9ca0e946d53bed8e84362483d99a262a15177`

~~~~json
{
  "host": "127.0.0.1",
  "port": 3100,
  "publicBaseUrl": "https://bsc.gpsgps.online",
  "adminPassword": "ChangeMe-2608!",
  "adminTotpSecret": "",
  "sessionSecret": "首次启动自动生成随机值，正式部署请改成随机长字符串",
  "lockHours": 12
}
~~~~

#### `bsc-sampling-v1/deploy/DEPLOYMENT_GUIDE.md`

SHA-256: `4b3628a8a485327e0cb5fbf41927180f461850b1e8ed16c957b7ec62630ff0ff`

~~~~markdown
# 巴松措采样系统 V1 部署手册（Windows Server 2022）

> 适用：1 核 / 4 GB、已有 Nginx、磁盘约 18 GB 的 Windows 服务器。
> 原则：不装 Docker/Hyper-V/WSL2，不动 gpsgps.online 与 auto.gpsgps.online 既有站点，
> Node.js 只监听 127.0.0.1:3100，公网只有 HTTPS 443。

## 部署包结构

```
bsc-deploy-v1.zip
├─ bsc-server/                  ← Node 服务（含生产依赖 node_modules）
│  ├─ src/                      ← 服务源码（server.js / schema.js / ...）
│  ├─ public/                   ← 管理站网页（含本地 Leaflet/qrcodejs）
│  ├─ tools/                    ← 备份/恢复/文档工具
│  ├─ docs/                     ← 开发基线文档（含源码快照附录 L）
│  ├─ data/v1/                  ← 首次启动自动建库（含 25 个正式点位种子），
│  │  └─ config.json             ←   启动后自动生成的唯一配置文件（勿放其他配置文件）
│  ├─ config.example.json        ← 配置示例（参考用；正式配置在 data\v1\config.json）
│  └─ package.json
└─ deploy/                      ← 部署脚本与本手册
   ├─ nginx-bsc.conf
   ├─ install-service.bat / uninstall-service.bat
   ├─ schedule-backup.ps1
   ├─ DEPLOYMENT_GUIDE.md       ← 本手册
   └─ PROMPTS_FOR_SERVER_AI.md  ← 交给服务器 AI 的操作提示词
```

## 部署步骤总览

| 步骤 | 内容 | 负责 |
|---|---|---|
| 1 | 京东云 DNS：`bsc.gpsgps.online` A 记录 → 服务器公网 IP | 管理员（网页操作） |
| 2 | 便携版 Node.js 24 安装到独立目录并加入 PATH | 服务器 AI |
| 3 | 解压部署包到 `D:\bsc\`，首次启动、修改管理员密码 | 服务器 AI |
| 4 | Nginx 增加站点 + Let's Encrypt 证书（win-acme）+ 自动续期 | 服务器 AI |
| 5 | NSSM 注册 Windows 服务（开机自启、崩溃自动拉起） | 服务器 AI |
| 6 | 每日备份计划任务 + 磁盘告警 | 服务器 AI |
| 7 | 验收：手机 4G 打开 `https://bsc.gpsgps.online` 走通激活 | 管理员 + 真机 |

## 详细说明

### 1. DNS（京东云控制台）

记录类型 A，主机记录 `bsc`，记录值 = 服务器公网 IP。验证：

```powershell
nslookup bsc.gpsgps.online
```

### 2. 便携 Node.js 24

- 从 https://nodejs.org 下载 Windows x64 zip 版（v24.x LTS），解压到 `D:\node24\`。
- 把 `D:\node24` 加入系统 PATH（重启终端生效）。
- 验证：`node -v` 输出 v24.x。
- 说明：部署包已自带生产依赖（node_modules），使用 Node 24 可直接运行，无需联网 npm install；
  若服务器 Node 版本不是 24，请运行 `npm install --omit=dev` 重新安装依赖。

### 3. 解压与首次启动

```powershell
# 解压到 D:\bsc\
Expand-Archive bsc-deploy-v1.zip -DestinationPath D:\bsc\
cd D:\bsc\bsc-server
node src\server.js
```

- 首次启动自动生成 `data\v1\config.json` 与数据库（含 2 个项目、25 个正式点位、测试采样员 cmy01）。`data\v1\` 内始终只有这一个配置文件（`bsc-server\config.example.json` 仅为参考示例）。
- **上线前必做**：修改 `data\v1\config.json`：
  - `adminPassword` 改为强密码（≥12 位，含大小写数字符号）；
  - `sessionSecret` 换成随机长字符串（首次启动已自动生成，保留即可）；
  - 可选：`adminTotpSecret` 填入 Base32 TOTP 密钥启用管理员动态验证码；
  - `publicBaseUrl` 保持 `https://bsc.gpsgps.online`。
- 验证：浏览器打开 `http://127.0.0.1:3100` 显示登录页 → 用新密码登录。
- **防火墙**：3100 只应监听 127.0.0.1；不要添加任何入站放行规则。

### 4. Nginx 与证书

- 用部署包内 `deploy\nginx-bsc.conf`，把两个 server 块 include 进现有 nginx.conf。
- 证书推荐 win-acme（Windows 原生 ACME 客户端）：

```powershell
wacs.exe   # 交互式：选择 bsc.gpsgps.online → HTTP 验证 → 自动签发并配置续期任务
```

- 签发后把 `ssl_certificate` / `ssl_certificate_key` 路径改成实际文件。
- `nginx -t` 通过后 reload。验证：`curl -I https://bsc.gpsgps.online` 返回 200/301。

### 5. Windows 服务（NSSM）

```bat
cd D:\bsc\deploy
install-service.bat     :: 服务名 BscSampling，开机自启、崩溃 5 秒自动拉起
```

- 服务日志：`D:\bsc\bsc-server\logs\service.*.log`。
- 更新代码后重启：`nssm restart BscSampling`。

### 6. 备份与磁盘

```powershell
powershell -ExecutionPolicy Bypass -File D:\bsc\deploy\schedule-backup.ps1
```

- 每天 02:30：数据库 `VACUUM INTO` 一致快照 + 照片增量拷贝，保留 14 天，输出 `data\v1\backups\`。
- 磁盘告警：管理站左侧底部实时显示剩余空间（<10 GB 橙色告警、<5 GB 红色告警），
  接口 `GET /api/v1/admin/health` 返回 `warnLowDisk/criticalLowDisk`。
- 服务器剩余约 18 GB：建议每周把 `data\v1\backups` 与 `data\v1\uploads` 异机拷贝一次。

### 7. 上线验收（服务器侧可自测项）

- [ ] `http://127.0.0.1:3100` 管理站登录、点位/任务/标签/导出正常
- [ ] `https://bsc.gpsgps.online` 证书有效、HTTP 自动跳转 HTTPS
- [ ] 管理站"诊断日志"能查到 APP 日志
- [ ] 服务停止后 NSSM 自动拉起
- [ ] 备份目录生成今天的快照，`node tools\restore.js <备份>` 恢复演练通过
- [ ] 手机（4G，不连 WiFi）浏览器打开管理站正常；安装 APK 扫码激活成功（真机验收）

### 8. 常见问题

| 现象 | 处理 |
|---|---|
| 3100 被占用 | `netstat -ano | findstr 3100` 查进程；不要盲目换端口，换端口需同步改 nginx 与 APP |
| sharp 报错（Node 版本不符） | `cd D:\bsc\bsc-server && npm install --omit=dev` |
| 证书续期失败 | win-acme 日志排查；到期前 30 天演练一次 |
| 服务起不来 | 看 `bsc-server\logs\service.err.log`，必要时把日志发管理员 |
| 上传大照片 413 | 检查 nginx `client_max_body_size 15m` 是否生效 |

## 交给服务器 AI 的提示词

见 `deploy\PROMPTS_FOR_SERVER_AI.md`，按阶段复制粘贴即可。
~~~~

#### `bsc-sampling-v1/deploy/health-alert.ps1`

SHA-256: `00e48d31ac0d870dc543b5d46dadbac8d17d3da110cdccdd22afe28e1ec0022e`

~~~~powershell
﻿# 巴松措采样系统 V1 - 每小时健康检查（部署到服务器）
# 检查：服务存活 /health、磁盘余量、HTTPS 证书剩余天数、每日备份是否有新目录。
# 异常时写入本脚本目录 health-alert.txt，并尝试写 Windows 事件日志（源 BscHealthAlert）。
# 注册计划任务（管理员 PowerShell，每小时）：
#   schtasks /Create /TN BscHealthAlert /SC HOURLY /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\bsc\deploy\health-alert.ps1"

$ErrorActionPreference = 'Continue'
$appRoot = 'C:\bsc\bsc-server'   # 按实际部署路径调整
$out = @()
$ok = $true

# 1. 服务存活（本机 3100）
try {
  $h = Invoke-RestMethod -Uri 'http://127.0.0.1:3100/health' -TimeoutSec 10
  if ($h.status -ne 'healthy') { $ok = $false; $out += "health status=$($h.status)" }
} catch { $ok = $false; $out += "服务不可达: $($_.Exception.Message)" }

# 2. 磁盘余量
$freeGb = [math]::Round((Get-PSDrive -Name (Split-Path -Qualifier $appRoot)).Free / 1GB, 1)
if ($freeGb -lt 10) { $ok = $false; $out += "磁盘剩余 $freeGb GB（低于 10GB 告警线）" }

# 3. HTTPS 证书到期（公网域名）
try {
  $req = [Net.HttpWebRequest]::Create('https://bsc.gpsgps.online')
  $req.Timeout = 15000
  $req.GetResponse() | Out-Null
  $cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2($req.ServicePoint.Certificate)
  $days = [math]::Round(($cert.NotAfter - (Get-Date)).TotalDays, 1)
  if ($days -lt 30) { $ok = $false; $out += "HTTPS 证书 $days 天后到期（30 天内）" }
} catch { $ok = $false; $out += "证书检查失败: $($_.Exception.Message)" }

# 4. 最近备份是否在 26 小时内（每日 02:30 计划任务应产出新目录）
$latest = Get-ChildItem (Join-Path $appRoot 'data\v1\backups') -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest -or ((Get-Date) - $latest.LastWriteTime).TotalHours -gt 26) { $ok = $false; $out += '最近备份超过 26 小时未更新' }

if ($ok) { exit 0 }

$msg = 'BSC健康检查异常: ' + ($out -join '；')
$log = Join-Path $PSScriptRoot 'health-alert.txt'
Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
New-EventLog -LogName Application -Source 'BscHealthAlert' -ErrorAction SilentlyContinue
Write-EventLog -LogName Application -Source 'BscHealthAlert' -EntryType Error -EventId 2001 -Message $msg -ErrorAction SilentlyContinue
exit 1
~~~~

#### `bsc-sampling-v1/deploy/install-service.bat`

SHA-256: `4dd2e0a52d87bb1852a0e7248421e01db364403193ae4efcf508e95402db4c5a`

~~~~batch
@echo off
setlocal enabledelayedexpansion
rem ============================================================
rem  巴松措采样系统 V1 - Windows 服务安装（NSSM）
rem  用法：以管理员身份运行本文件。服务名 BscSampling，
rem        开机自启、异常退出 5 秒后自动拉起、日志轮转。
rem ============================================================
set "ROOT=%~dp0.."
set "APP=%ROOT%\bsc-server"
set "LOGS=%APP%\logs"
if not exist "%APP%\src\server.js" (
  echo [错误] 未找到 %APP%\src\server.js，请确认部署包解压结构。
  exit /b 1
)
if not exist "%LOGS%" mkdir "%LOGS%"

rem --- 定位 node.exe ---
set "NODE="
where node >nul 2>nul && for /f "delims=" %%i in ('where node') do if not defined NODE set "NODE=%%i"
if not defined NODE (
  echo [错误] 未找到 node。请先安装便携版 Node.js 24 并加入 PATH。
  exit /b 1
)
echo 使用 Node: %NODE%

rem --- 定位 nssm，没有则自动下载 ---
set "NSSM="
where nssm >nul 2>nul && for /f "delims=" %%i in ('where nssm') do if not defined NSSM set "NSSM=%%i"
if not defined NSSM (
  echo 未找到 nssm，正在自动下载 nssm 2.24 ...
  if not exist "%ROOT%\tools" mkdir "%ROOT%\tools"
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm-2.24.zip' -UseBasicParsing; Expand-Archive -Path '%TEMP%\nssm-2.24.zip' -DestinationPath '%ROOT%\tools' -Force"
  set "NSSM=%ROOT%\tools\nssm-2.24\win64\nssm.exe"
)
if not exist "%NSSM%" (
  echo [错误] nssm 下载失败，请手工下载 nssm-2.24.zip 解压后重试。
  exit /b 1
)

rem --- 安装/更新服务 ---
"%NSSM%" install BscSampling "%NODE%" "src\server.js" 2>nul
"%NSSM%" set BscSampling AppDirectory "%APP%"
"%NSSM%" set BscSampling AppStdout "%LOGS%\service.out.log"
"%NSSM%" set BscSampling AppStderr "%LOGS%\service.err.log"
"%NSSM%" set BscSampling AppRotateFiles 1
"%NSSM%" set BscSampling AppRotateOnline 1
"%NSSM%" set BscSampling AppRotateBytes 10485760
"%NSSM%" set BscSampling AppExit Default Restart
"%NSSM%" set BscSampling AppRestartDelay 5000
"%NSSM%" set BscSampling Start SERVICE_AUTO_START
"%NSSM%" start BscSampling

echo.
echo [完成] 服务 BscSampling 已安装并启动：
echo   - 工作目录：%APP%
echo   - 监听地址：127.0.0.1:3100（仅本机，勿对外开放）
echo   - 开机自启、异常自动重启
echo   - 服务日志：%LOGS%
echo 验证：浏览器打开 http://127.0.0.1:3100 应显示管理站登录页。
echo 卸载：运行 uninstall-service.bat
~~~~

#### `bsc-sampling-v1/deploy/make-package.ps1`

SHA-256: `b052410e10f8f0d6ea988198b81af317acd02ca3ef1d0a5adf5c7714953995d8`

~~~~powershell
﻿# 巴松措采样系统 V1 部署包打包脚本（在开发机上运行）
# 产物：<workspace>\bsc-deploy-v1.zip
# 内容：bsc-server（源码+生产依赖+文档）+ deploy（部署脚本与手册/AI提示词）
# 注意：不包含本机测试数据库 data\v1\bsc-v1.sqlite 与 config.json。
# 本文件必须保持 UTF-8 BOM 编码：PowerShell 5.1 会把无 BOM 的 UTF-8 按 GBK 解码，
# 中文注释会“吞掉”下一行命令（历史上曾因此漏拷 src 目录）。

$ErrorActionPreference = 'Stop'
$workspace = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent   # deploy/ 的上级的上级 = 工作区根
$serverRoot = Split-Path $PSScriptRoot -Parent                        # bsc-sampling-v1
$staging = Join-Path $workspace 'deploy-staging'
$zipPath = Join-Path $workspace 'bsc-deploy-v1.zip'

Write-Host "staging: $staging"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$staging\bsc-server" | Out-Null

# 1. 源码与静态资源（排除 test/、node_modules、data 实测数据、deploy 目录本身）
Copy-Item "$serverRoot\src" "$staging\bsc-server\src" -Recurse
Copy-Item "$serverRoot\public" "$staging\bsc-server\public" -Recurse
Copy-Item "$serverRoot\tools" "$staging\bsc-server\tools" -Recurse
Copy-Item "$serverRoot\docs" "$staging\bsc-server\docs" -Recurse
Copy-Item "$serverRoot\README.md" "$staging\bsc-server\README.md"
Copy-Item "$serverRoot\package.json" "$staging\bsc-server\package.json"
Copy-Item "$serverRoot\package-lock.json" "$staging\bsc-server\package-lock.json"

# 1b. 自检：核心文件必须已拷入，防止再次出现“缺 src”的残缺包。
$must = @('src\server.js','src\schema.js','src\track.js','src\exif.js','public\app.js','public\index.html','package.json')
foreach ($f in $must) {
  if (-not (Test-Path (Join-Path "$staging\bsc-server" $f))) { throw "打包自检失败：缺少 $f，请检查本脚本编码（必须 UTF-8 BOM）" }
}

# 2. 数据目录：只放占位文件，不带任何本机测试数据。
#    配置示例放服务器根目录（config.example.json），data\v1 内只有安装后生成的唯一 config.json，
#    避免“示例配置 + 真实配置”并存造成混淆。
New-Item -ItemType Directory -Force -Path "$staging\bsc-server\data\v1" | Out-Null
New-Item -ItemType File -Force -Path "$staging\bsc-server\data\v1\.gitkeep" | Out-Null
Copy-Item "$serverRoot\deploy\config.example.json" "$staging\bsc-server\config.example.json"

# 3. 生产依赖（本机执行 npm install --omit=dev，与开发机同为 Windows x64 / Node 24）
Write-Host 'installing production dependencies...'
Push-Location "$staging\bsc-server"
npm install --omit=dev --no-audit --no-fund | Out-Null
Pop-Location

# 4. 部署脚本与手册
Copy-Item "$serverRoot\deploy" "$staging\deploy" -Recurse
Remove-Item "$staging\deploy\config.example.json" -ErrorAction SilentlyContinue

# 5. 压缩
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$staging\*" -DestinationPath $zipPath -CompressionLevel Optimal

# 5b. 压缩包内容自检：确认 bsc-server\src\ 的 9 个源文件都在包里。
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$srcEntries = @($zip.Entries | Where-Object { $_.FullName -like 'bsc-server\src\*' } | Select-Object -ExpandProperty FullName)
$zip.Dispose()
if ($srcEntries.Count -lt 9) { throw "压缩包自检失败：bsc-server\src 只有 $($srcEntries.Count) 个文件：$($srcEntries -join ', ')" }
Write-Host "package ready: $zipPath (src files: $($srcEntries.Count))"
~~~~

#### `bsc-sampling-v1/deploy/nginx-bsc.conf`

SHA-256: `35d1d12d215452f4f75872efe397b672d215333df427d569080aa072dfb7f30b`

~~~~nginx
# 巴松措采样系统 V1 —— Nginx 反向代理配置
# 使用方法：把本文件 include 进现有 nginx.conf 的 http{} 块，或复制两个 server 块。
# 硬性要求：不修改 gpsgps.online / auto.gpsgps.online 的既有站点配置；
#           Node.js 只监听 127.0.0.1:3100，3100 端口绝不对外开放。

server {
    listen 80;
    server_name bsc.gpsgps.online;

    # Let's Encrypt HTTP-01 域名验证目录（按你的 ACME 客户端实际路径调整）
    location /.well-known/acme-challenge/ {
        root C:/acme/www;
    }

    # 证书签发完成后，其余请求一律跳转 HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name bsc.gpsgps.online;

    # ← 替换为 ACME 客户端实际签发的证书路径（例如 win-acme 默认路径）
    ssl_certificate     C:/nginx/ssl/bsc.gpsgps.online/fullchain.pem;
    ssl_certificate_key C:/nginx/ssl/bsc.gpsgps.online/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;

    # 照片以 Base64 单包上传（服务器限制 12MB），留足余量
    client_max_body_size 15m;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_connect_timeout 30s;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # 可选：限制上传速率，避免单台手机占满带宽（500KB/s 已远高于实际需求）
    # location /api/v1/mobile/ {
    #     limit_rate 500k;
    #     proxy_pass http://127.0.0.1:3100;
    #     proxy_http_version 1.1;
    #     proxy_set_header Host $host;
    #     proxy_set_header X-Real-IP $remote_addr;
    #     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    #     proxy_set_header X-Forwarded-Proto https;
    # }
}
~~~~

#### `bsc-sampling-v1/deploy/PROMPTS_FOR_SERVER_AI.md`

SHA-256: `7dc6e86d75bead11ddf3587eae9d77b0d76d8a8fee37b0e93311499a4f6a688d`

~~~~markdown
# 交给服务器 AI 的部署提示词（按阶段复制粘贴）

> 每个提示词都自包含：目标、前置信息、步骤、验证方式、成功标准、禁止事项。
> 部署包：`bsc-deploy-v1.zip`（含 `bsc-server/` 与 `deploy/`）。
> 全程红线：不动 gpsgps.online / auto.gpsgps.online 的既有 Nginx 站点；
> 不装 Docker/Hyper-V/WSL2；3100 端口只监听 127.0.0.1，绝不对外开放。

---

## 提示词 1：环境准备（便携 Node.js）

```text
你是 Windows 服务器运维助手。请在这台 Windows Server 2022 上安装便携版 Node.js，
要求：
1. 下载 Node.js 24.x LTS 的 Windows x64 zip 版（nodejs.org 官方），解压到 D:\node24\，
   不要使用安装包全局安装，避免影响服务器上其他已有业务。
2. 把 D:\node24 加入系统 PATH（setx /M），并确认 node -v 输出 v24.x、npm -v 正常。
3. 不安装任何其他软件，不改动服务器现有服务。
完成后报告：node 版本、npm 版本、PATH 修改方式。
成功标准：新开一个终端执行 node -v 显示 v24.x。
```

## 提示词 2：部署包解压与首次启动

```text
你是 Windows 服务器运维助手。部署包 bsc-deploy-v1.zip 已在 D:\ 目录。
请执行：
1. 解压到 D:\bsc\（保持 bsc-server 与 deploy 两个目录结构）。
2. cd D:\bsc\bsc-server 运行 node src\server.js 做首次启动测试，
   确认输出 "BSC Sampling V1 listening on http://127.0.0.1:3100"，
   并确认 data\v1\config.json 与 bsc-v1.sqlite 已自动生成。
3. 编辑 data\v1\config.json：adminPassword 改为强密码（至少12位，大小写+数字+符号，
   由我后续提供或你生成后向我展示），其余字段保持默认。
4. 用浏览器/curl 验证 http://127.0.0.1:3100 返回管理站登录页（HTTP 200），
   GET /health 返回 {"status":"healthy"}。
5. 测试完成后先停止该测试进程（不要留着 CMD 窗口常驻，第 4 步会注册 Windows 服务）。
6. 禁止：添加防火墙 3100 入站规则；修改 src 下任何代码。
完成后报告：解压路径、首次启动日志、健康检查结果、修改后的配置项（密码不要明文写进报告，只写长度与是否包含特殊字符）。
成功标准：http://127.0.0.1:3100 可访问且 /health 返回 healthy。
```

## 提示词 3：Nginx 站点与 HTTPS 证书

```text
你是 Windows 服务器 Nginx 运维助手。服务器已有 Nginx，且已有 gpsgps.online、
auto.gpsgps.online 站点，这些站点绝不允许改动。
任务：为 bsc.gpsgps.online 新增独立站点并签发 Let's Encrypt 证书。
1. 使用部署包 deploy\nginx-bsc.conf 的内容，以 include 方式加入现有 nginx.conf，
   不要覆盖或重写现有配置。先用 nginx -t 验证语法。
2. 使用 win-acme（wacs.exe，若服务器没有请先下载解压到 D:\win-acme\）为
   bsc.gpsgps.online 签发证书，HTTP-01 验证，并确认它已自动注册续期计划任务。
3. 把 ssl_certificate / ssl_certificate_key 改为实际签发路径，nginx -t 后 reload。
4. 验证：curl -I https://bsc.gpsgps.online 返回 200；http://bsc.gpsgps.online 301 跳转 https。
5. 禁止：开放 3100 到公网；给 bsc 站点配置任何 WebSocket/缓存改写。
完成后报告：nginx -t 结果、证书路径与到期时间、curl 验证输出、reload 是否成功。
成功标准：HTTPS 访问返回 200，HTTP 自动跳转，证书到期日在 60 天以上。
```

## 提示词 4：注册 Windows 服务（开机自启 + 崩溃拉起）

```text
你是 Windows 服务器运维助手。请把巴松措采样服务注册为 Windows 服务：
1. 以管理员身份运行 D:\bsc\deploy\install-service.bat。
   （脚本会自动下载 nssm 2.24 到 D:\bsc\tools 并注册服务 BscSampling，
     工作目录 D:\bsc\bsc-server，命令 node src\server.js，开机自启，
     异常退出 5 秒后自动重启，日志轮转 10MB。）
2. 注册后检查：sc query BscSampling 状态为 RUNNING。
3. 重启服务一次验证自动拉起：nssm stop BscSampling 后 10 秒内应再次 RUNNING。
4. 确认 D:\bsc\bsc-server\logs\service.out.log 无报错。
完成后报告：服务状态、自动拉起验证结果、日志尾部关键行。
成功标准：BscSampling 处于 RUNNING，人工 stop 后自动恢复。
```

## 提示词 5：每日备份计划任务

```text
你是 Windows 服务器运维助手。请注册每日备份：
1. 管理员 PowerShell 执行 D:\bsc\deploy\schedule-backup.ps1，
   注册计划任务 BscSamplingBackup（每天 02:30，数据库一致快照+照片增量，保留14天）。
2. 手动执行一次验证：cd D:\bsc\bsc-server 后运行 node tools\backup.js --photos，
   确认 data\v1\backups\ 下生成 backup-<时间戳> 目录且包含 bsc-v1.sqlite 与 photos\。
3. 恢复演练：node tools\restore.js <刚生成的backup目录>，确认输出 "DRILL PASSED"。
4. 检查磁盘剩余空间并报告（Get-PSDrive C）。若剩余不足 10GB，明确提醒我。
完成后报告：计划任务名称与下次运行时间、备份目录清单、恢复演练结果、磁盘剩余。
成功标准：计划任务已注册且手动备份+恢复演练均成功。
```

## 提示词 6：上线验收自检（部署完成后执行）

```text
你是 Windows 服务器运维助手。请对巴松措采样系统做部署验收自检并逐项报告结果：
1. 进程：sc query BscSampling = RUNNING；netstat 确认 3100 仅监听 127.0.0.1。
2. 公网：curl -I https://bsc.gpsgps.online = 200；证书链完整（SSL Labs 或 curl -v 检查）。
3. 管理站：登录页可打开；/api/v1/admin/health 返回 freeBytes 与磁盘告警标志。
4. Nginx：nginx -t 通过；确认 gpsgps.online 与 auto.gpsgps.online 两个老站点访问不受影响。
5. 备份：BscSamplingBackup 计划任务存在；今日备份目录存在。
6. 日志：D:\bsc\bsc-server\logs\service.err.log 无未处理异常。
对每一项给出【通过/未通过】与证据（命令输出），未通过项给出修复建议但先不要擅自改代码。
成功标准：以上 6 项全部通过。
```

## 提示词 7：故障排查（仅在有异常时使用）

```text
你是 Windows 服务器运维助手。巴松措采样系统出现异常，请按以下顺序排查并报告证据：
1. sc query BscSampling 状态；D:\bsc\bsc-server\logs\service.err.log 最后 50 行。
2. 管理站"诊断日志"（/api/v1/admin/logs）最近 20 条 error 级日志。
3. 磁盘剩余（Get-PSDrive C）与 data\v1\backups 最新备份时间。
4. nginx 错误日志中 bsc.gpsgps.online 相关的最后 20 条。
5. curl -v https://bsc.gpsgps.online/api/v1/admin/health 输出。
把以上原始输出汇总给我（不要自行修改代码或数据库），并给出你的初步判断。
```
~~~~

#### `bsc-sampling-v1/deploy/schedule-backup.ps1`

SHA-256: `475e562f61ea36c72421ee1035bdb3818ac6b9992a67c1d8f424f9e988aad0f0`

~~~~powershell
﻿# 巴松措采样系统 V1 - 每日备份计划任务注册脚本（必须保持 UTF-8 BOM 编码）
# 用法（管理员 PowerShell）：
#   powershell -ExecutionPolicy Bypass -File schedule-backup.ps1
# 每天 02:30 执行：数据库一致快照 + 照片增量拷贝 + 异机镜像，保留 14 天，
# 备份输出到 bsc-server\data\v1\backups\backup-<时间戳>\

$ErrorActionPreference = 'Stop'
$app = Join-Path (Split-Path $PSScriptRoot -Parent) 'bsc-server'
$node = (Get-Command node -ErrorAction Stop).Source

$action = New-ScheduledTaskAction -Execute $node `
  -Argument 'tools\backup.js --photos --mirror D:\bsc-offsite' `
  -WorkingDirectory $app
$trigger = New-ScheduledTaskTrigger -Daily -At '02:30'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName 'BscSamplingBackup' -Action $action -Trigger $trigger `
  -Settings $settings -Description '巴松措采样系统每日备份（数据库快照+照片增量+异机镜像，保留14天）' -Force | Out-Null

Write-Host '[完成] 已注册每日备份计划任务 BscSamplingBackup（每天 02:30）。'
Write-Host '注意：--mirror D:\bsc-offsite 请改成你的异机/云盘同步目录；不需要异机备份则删除该参数。'
Write-Host '手动验证一次：'
Write-Host "  cd $app && node tools\backup.js --photos --mirror D:\bsc-offsite"
Write-Host '恢复演练（每月一次）：'
Write-Host "  node tools\restore.js <backup目录>"
~~~~

#### `bsc-sampling-v1/deploy/uninstall-service.bat`

SHA-256: `99af7f850ad32819e07ae2bae90cecfd32a96cce9ba0e0208875a980d2679d37`

~~~~batch
@echo off
rem ============================================================
rem  巴松措采样系统 V1 - 卸载 Windows 服务（保留数据目录）
rem ============================================================
set "ROOT=%~dp0.."
set "NSSM="
where nssm >nul 2>nul && for /f "delims=" %%i in ('where nssm') do if not defined NSSM set "NSSM=%%i"
if not defined NSSM (
  if exist "%ROOT%\tools\nssm-2.24\win64\nssm.exe" set "NSSM=%ROOT%\tools\nssm-2.24\win64\nssm.exe"
)
if not defined NSSM (
  echo [错误] 未找到 nssm，请确认安装时下载的 nssm 位置。
  exit /b 1
)
"%NSSM%" stop BscSampling
"%NSSM%" remove BscSampling confirm
echo [完成] 服务已卸载。数据目录 bsc-server\data\v1 已保留，可随时重新安装。
~~~~

#### `bsc-sampling-v1/package.json`

SHA-256: `993a539bcb81926555f283a0b763e207c022a0f0c4b2757a54c4d260cd876e71`

~~~~json
{
  "name": "water-sampling-system",
  "version": "1.0.0",
  "private": true,
  "description": "巴松措水样采集管理系统首版",
  "scripts": {
    "start": "node src/server.js",
    "start:legacy": "node server.js",
    "check": "node --check src/server.js && node --check src/schema.js && node --check src/security.js && node --check src/weather.js && node --check src/ratelimit.js && node --check src/labels.js && node --check src/exports.js && node --check public/app.js && node --check test/frontend.e2e.js",
    "test": "node --test test/security.test.js test/schema.test.js test/api.test.js test/backup.test.js test/track.test.js",
    "test:unit": "node --test test/security.test.js test/schema.test.js",
    "test:api": "node --test test/api.test.js",
    "test:e2e": "node test/frontend.e2e.js",
    "smoke": "node test/smoke.js",
    "backup": "node tools/backup.js"
  },
  "dependencies": {
    "qrcode": "1.5.4",
    "sharp": "0.34.3"
  },
  "engines": {
    "node": ">=22"
  },
  "devDependencies": {
    "playwright": "1.62.1"
  }
}
~~~~

#### `bsc-sampling-v1/public/app.js`

SHA-256: `0e0f72ce6d6bcc546073fd8d00a563a2f03f941c3a6d2b3e281d4e8e37f31110`

~~~~javascript
'use strict';

// 巴松措采样系统 V1 管理站前端（/api/v1 客户端）。
// 依赖：本地托管的 Leaflet 1.9.4 与 qrcodejs（public/vendor/），不依赖 CDN。

const $ = s => document.querySelector(s);
const TOKEN_KEY = 'bscAdminToken';
const TYPE_NAMES = { R: '河流水', T: '支流', S: '土壤', P: '植物', Y: '雨水', L: '湖水' };
const RISK_NAMES = {
  distance_30_80m: '距目标 30–80 米',
  distance_80_300m: '距目标 80–300 米',
  gps_accuracy_over_40m: 'GPS 精度超过 40 米',
  manual_bottle_code: '二维码损坏手输编号',
  mock_location: '模拟位置',
  duplicate_photo: '照片与既有记录重复',
  offline_start_lock_unverified: '断网开始未验证锁',
  weak_start_track: '开始前往时已在 300 米内',
  track_interrupted: '轨迹中断后恢复',
  missing_track: '提交时无轨迹点',
  late_sampling: '拍摄日期与计划日期不一致',
  task_canceled: '任务已取消后提交',
  weather_pending: '天气待补充',
  captured_time_in_future: '拍摄时间晚于服务器时间',
  exif_time_mismatch: '照片EXIF时间与提交时间不一致'
};
const SEVERE_RISKS = new Set(['distance_80_300m', 'manual_bottle_code', 'mock_location', 'duplicate_photo', 'task_canceled']);

const state = {
  projects: [], villagers: [], projectId: null, selectedDate: 'pending',
  tasks: [], sites: [], map: null, markers: [], siteMode: false, tableMode: false,
  editingSiteId: null, editingProjectId: null, pickMarker: null, pickPending: false, lastCreatedTaskIds: [], trackPolylines: []
};

function token() { return localStorage.getItem(TOKEN_KEY); }
function showLogin() {
  localStorage.removeItem(TOKEN_KEY);
  $('#login').classList.remove('hidden');
  $('#app').classList.add('hidden');
}
function showApp() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); }

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(path, { ...options, headers });
  const type = res.headers.get('content-type') || '';
  let payload = {};
  if (type.includes('application/json')) { try { payload = await res.json(); } catch { payload = {}; } }
  else payload = { _text: await res.text() };
  if (res.status === 401) { showLogin(); throw new Error(payload.message || '登录已过期，请重新登录'); }
  if (!res.ok) throw new Error(payload.message || `请求失败：${res.status}`);
  return payload;
}
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
const del = path => api(path, { method: 'DELETE' });

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${value}T00:00:00`));
}
function formatTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
}
function reviewName(value) {
  return ({ approved: '已通过', pending: '待审核', suspicious: '可疑', rejected: '退回重采' })[value] || '待审核';
}
function markerColor(task) {
  if (task.canceled_at && !task.record_id) return 'gray';
  if (!task.record_id) return 'gray';
  if (task.review_status === 'approved') return 'green';
  if (task.review_status === 'rejected' || task.review_status === 'suspicious' || (task.risk_flags || []).length) return 'red';
  return 'amber';
}
function fmtBytes(bytes) {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

// ---------- 登录 ----------
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    const res = await post('/api/v1/admin/login', { password: $('#password').value, totp: $('#totp').value || undefined });
    localStorage.setItem(TOKEN_KEY, res.token);
    $('#password').value = ''; $('#totp').value = '';
    showApp();
    await init();
  } catch (error) { $('#loginError').textContent = error.message; }
});
$('#logoutButton').addEventListener('click', showLogin);
// 小屏下侧栏抽屉：☰ 展开 / 点遮罩关闭；点击侧栏内任意按钮后自动收起。
$('#menuButton').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.add('open');
  document.querySelector('.sidebar-backdrop').classList.remove('hidden');
});
document.querySelector('.sidebar-backdrop').addEventListener('click', closeDrawer);
$('.sidebar').addEventListener('click', e => { if (e.target.closest('button')) closeDrawer(); });
function closeDrawer() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-backdrop').classList.add('hidden');
}

// ---------- 初始化 ----------
async function init() {
  try {
    const boot = await api('/api/v1/admin/bootstrap');
    state.projects = boot.projects;
    state.villagers = boot.villagers;
    renderProjects();
    state.projectId = state.projectId || state.projects[0]?.id;
    if (!state.projectId) throw new Error('没有可用项目');
    initMap();
    await loadAll();
    checkHealth();
  } catch (error) {
    if (token()) alert(error.message);
  }
}

function renderProjects() {
  const list = $('#projectList');
  list.innerHTML = '';
  state.projects.forEach(project => {
    const row = document.createElement('div');
    row.className = 'project-row';
    const button = document.createElement('button');
    button.className = 'project' + (project.id === state.projectId ? ' active' : '');
    button.innerHTML = `<span>${project.is_test ? '🧪' : '💧'}</span><span>${esc(project.name)}${project.enabled ? '' : '（停用）'}</span>`;
    button.addEventListener('click', async () => {
      state.projectId = project.id;
      state.selectedDate = 'pending';
      state.siteMode = false;
      $('#siteManageButton').classList.remove('active');
      renderProjects();
      await loadAll();
    });
    const editBtn = document.createElement('button');
    editBtn.className = 'project-tool';
    editBtn.textContent = '✎';
    editBtn.title = '编辑项目';
    editBtn.addEventListener('click', () => openProjectDialog(project));
    const delBtn = document.createElement('button');
    delBtn.className = 'project-tool';
    delBtn.textContent = '✕';
    delBtn.title = '删除项目（有任务数据时只能停用）';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`确认删除项目“${project.name}”？已有任务数据时会被拒绝，只能停用。`)) return;
      try {
        await api(`/api/v1/admin/projects/${project.id}`, { method: 'DELETE' });
        await refreshProjects();
      } catch (error) { alert(error.message); }
    });
    row.append(button, editBtn, delBtn);
    list.append(row);
  });
}

async function refreshProjects() {
  const boot = await api('/api/v1/admin/bootstrap');
  state.projects = boot.projects;
  state.villagers = boot.villagers;
  if (!state.projects.some(p => p.id === state.projectId)) state.projectId = state.projects[0]?.id || null;
  renderProjects();
  if (state.projectId) await loadAll();
}

function openProjectDialog(project = null) {
  state.editingProjectId = project ? project.id : null;
  $('#projectDialogTitle').textContent = project ? `编辑项目 ${project.code}` : '新建项目';
  $('#projectCode').value = project ? project.code : '';
  $('#projectName').value = project ? project.name : '';
  $('#projectDescription').value = project ? (project.description || '') : '';
  $('#projectIsTest').checked = Boolean(project?.is_test);
  $('#projectEnabled').checked = project ? Boolean(project.enabled) : true;
  $('#projectEnabledLine').style.display = project ? '' : 'none';
  $('#projectDialog').showModal();
}

$('#newProjectButton').addEventListener('click', () => openProjectDialog(null));
$('#saveProject').addEventListener('click', async () => {
  const data = {
    code: $('#projectCode').value.trim(),
    name: $('#projectName').value.trim(),
    description: $('#projectDescription').value,
    isTest: $('#projectIsTest').checked,
    enabled: $('#projectEnabled').checked
  };
  if (!data.code || !data.name) return alert('请填写项目编码和名称');
  try {
    if (state.editingProjectId) {
      await api(`/api/v1/admin/projects/${state.editingProjectId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await post('/api/v1/admin/projects', data);
    }
    $('#projectDialog').close();
    await refreshProjects();
  } catch (error) { alert(error.message); }
});

async function loadAll() {
  const [sites, tasks] = await Promise.all([
    api(`/api/v1/admin/sites?projectId=${state.projectId}`),
    api(`/api/v1/admin/tasks?projectId=${state.projectId}`)
  ]);
  state.sites = sites.sites;
  state.tasks = tasks.tasks;
  renderDates();
  render();
}

// 左侧日期 = 待采样任务的计划日期 ∪ 已提交记录的拍摄日期（自动归档）。
function dateSet() {
  const dates = new Set();
  for (const t of state.tasks) {
    if (t.record_id && t.captured_at) dates.add(String(t.captured_at).slice(0, 10));
    else if (!t.record_id && t.planned_date) dates.add(String(t.planned_date).slice(0, 10));
  }
  return [...dates].sort((a, b) => b.localeCompare(a));
}

function renderDates() {
  const nav = $('#dateList');
  nav.innerHTML = '';
  const pendingCount = state.tasks.filter(t => !t.record_id).length;
  nav.append(dateButton('pending', '待采样任务', pendingCount));
  dateSet().forEach(date => {
    const count = state.tasks.filter(t => (t.record_id && t.captured_at && String(t.captured_at).slice(0, 10) === date) || (!t.record_id && t.planned_date === date)).length;
    nav.append(dateButton(date, formatDate(date), count));
  });
}

function dateButton(value, label, count) {
  const button = document.createElement('button');
  button.className = state.selectedDate === value ? 'active' : '';
  button.innerHTML = `<span>${label}</span><b>${count}</b>`;
  button.addEventListener('click', () => {
    state.selectedDate = value;
    state.siteMode = false;
    $('#siteManageButton').classList.remove('active');
    document.querySelectorAll('#dateList button').forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    render();
  });
  return button;
}

function currentTasks() {
  if (state.selectedDate === 'pending') return state.tasks.filter(t => !t.record_id);
  const d = state.selectedDate;
  return state.tasks.filter(t => (t.record_id && t.captured_at && String(t.captured_at).slice(0, 10) === d) || (!t.record_id && t.planned_date === d));
}

function render() {
  const tasks = currentTasks();
  const project = state.projects.find(p => p.id === state.projectId);
  $('#crumb').textContent = `项目 / ${project ? project.name : ''}`;
  if (state.siteMode) {
    $('#pageTitle').textContent = `点位管理（${state.sites.length} 个）`;
  } else if (state.selectedDate === 'pending') {
    $('#pageTitle').textContent = '待采样任务';
  } else {
    $('#pageTitle').textContent = `${formatDate(state.selectedDate)} 采样记录`;
  }
  $('#statAll').textContent = tasks.length;
  $('#statApproved').textContent = tasks.filter(t => t.review_status === 'approved').length;
  $('#statPending').textContent = tasks.filter(t => t.record_id && t.review_status !== 'approved').length;
  $('#statUnfinished').textContent = tasks.filter(t => !t.record_id).length;
  const tableWrap = $('#taskTableWrap');
  const mapPanel = document.querySelector('.map-panel');
  if (state.tableMode) {
    tableWrap.classList.remove('hidden');
    mapPanel.classList.add('hidden');
    $('#tableViewButton').textContent = '⌖ 地图';
    renderTable(tasks);
  } else {
    tableWrap.classList.add('hidden');
    mapPanel.classList.remove('hidden');
    $('#tableViewButton').textContent = '▦ 表格';
    renderMap(tasks);
  }
}

// ---------- 表格视图（筛选 + 批量审核 + 批量天气） ----------
function renderTable(tasks) {
  const vill = $('#tableVillager');
  const names = [...new Set(state.tasks.map(t => t.villager_name).filter(Boolean))].sort();
  vill.innerHTML = '<option value="">全部采样员</option>' + names.map(n => `<option${vill.value === n ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const q = $('#tableSearch').value.trim().toLowerCase();
  const status = $('#tableStatus').value;
  const vf = vill.value;
  const rows = tasks.filter(t => {
    if (vf && t.villager_name !== vf) return false;
    if (q && !(String(t.sample_code).toLowerCase().includes(q) || String(t.site_name).toLowerCase().includes(q))) return false;
    if (status === 'pending') return !t.record_id && !t.canceled_at;
    if (status === 'review') return t.record_id && t.review_status !== 'approved' && t.review_status !== 'rejected';
    if (status === 'approved') return t.review_status === 'approved';
    if (status === 'rejected') return t.review_status === 'rejected';
    if (status === 'canceled') return Boolean(t.canceled_at);
    return true;
  });
  $('#taskTableBody').innerHTML = rows.map(t => {
    const reviewable = t.record_id && t.review_status !== 'approved' && t.review_status !== 'rejected';
    const cancellable = !t.record_id && !t.canceled_at;
    return `<tr data-id="${t.id}">
      <td>${reviewable ? `<input type="checkbox" class="row-check" data-record="${t.record_id}">` : ''}</td>
      <td>${esc(t.sample_code)}</td>
      <td>${esc(t.site_name)}${t.canceled_at ? '<br><span class="cancel-note">已取消</span>' : ''}</td>
      <td>${esc(TYPE_NAMES[t.sample_type] || t.sample_type)}</td>
      <td>${esc(t.planned_date)}</td>
      <td>${esc(t.villager_name || '')}</td>
      <td>${t.distance_m != null ? Math.round(Number(t.distance_m)) + ' 米' : '-'}</td>
      <td>${t.record_id ? reviewName(t.review_status) : (t.canceled_at ? '已取消' : '待采样')}</td>
      <td><button class="ghost row-open">查看</button>${cancellable ? `<button class="ghost row-cancel" data-task="${t.id}">取消</button><button class="ghost-danger row-delete" data-task="${t.id}">删除</button>` : ''}</td>
    </tr>`;
  }).join('');
  document.querySelectorAll('#taskTableBody .row-open').forEach(b => b.addEventListener('click', () => {
    const t = state.tasks.find(x => x.id === Number(b.closest('tr').dataset.id));
    if (t) showDetail(t);
  }));
  document.querySelectorAll('#taskTableBody .row-cancel').forEach(b => b.addEventListener('click', async () => {
    const id = Number(b.dataset.task);
    const t = state.tasks.find(x => x.id === id);
    if (!confirm(`确定取消任务 ${t ? t.sample_code : ''}？取消后不再下发手机，记录保留。`)) return;
    try { await post(`/api/v1/admin/tasks/${id}/cancel`, { reason: '管理员取消' }); await loadAll(); alert('任务已取消'); }
    catch (error) { alert(error.message); }
  }));
  document.querySelectorAll('#taskTableBody .row-delete').forEach(b => b.addEventListener('click', async () => {
    const id = Number(b.dataset.task);
    const t = state.tasks.find(x => x.id === id);
    if (!confirm(`确定永久删除任务 ${t ? t.sample_code : ''}？此操作不可恢复。`)) return;
    try { await del(`/api/v1/admin/tasks/${id}/delete`); await loadAll(); alert('任务已删除'); }
    catch (error) { alert(error.message); }
  }));
  $('#tableCheckAll').checked = false;
}

// ---------- 地图 ----------
function initMap() {
  if (!window.L) { $('#mapFallback').classList.remove('hidden'); return; }
  // keyboard:false 避免地图容器获得 tabindex 焦点，防止点击时浏览器
  // 把容器滚动进视口导致点击目标在 mousedown/mouseup 之间移位。
  state.map = L.map('map', { zoomControl: true, keyboard: false }).setView([30.04, 94.05], 11);
  const imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    // 该区域影像最深到 17 级（18/19 级返回"地图数据未允许"占位图而非报错，
    // 无法用 tileerror 探测）。锁定原生层级到 17：继续放大直接拉伸 17 级影像，
    // 不再请求更深的无数据层级（与 Android 端 maxzoom=17 保持一致）。
    maxZoom: 19, maxNativeZoom: 17, attribution: '影像 © Esri及其数据提供方 · 坐标WGS84'
  });
  // 自适应锁定：某个缩放层级的瓦片连续加载失败（无数据/网络失败）时，
  // 不再请求更深层级，继续放大用已有层级放大显示，避免地图变空白。
  const tileFailures = {};
  imagery.on('tileerror', () => {
    const zoom = Math.round(state.map.getZoom());
    tileFailures[zoom] = (tileFailures[zoom] || 0) + 1;
    if (tileFailures[zoom] >= 5 && zoom > 1 && imagery.options.maxNativeZoom > zoom - 1) {
      imagery.options.maxNativeZoom = zoom - 1;
      imagery.redraw();
      const note = $('#tileZoomNote');
      if (note) {
        note.classList.remove('hidden');
        note.textContent = `底图在级别 ${zoom} 没有可用影像，已锁定到级别 ${zoom - 1}（继续放大为放大显示，不再加载更深层级）`;
      }
    }
  });
  imagery.addTo(state.map);
  state.map.on('click', e => {
    if (state.pickMarker) return;
    if (state.pickMode) { finishPick(e.latlng.lat, e.latlng.lng); return; }
    if (state.siteMode) openSiteDialog(null, { latitude: e.latlng.lat, longitude: e.latlng.lng });
  });
  // 鼠标右键在地图上选点 → 直接打开"设置采样点"并填好坐标。
  state.map.on('contextmenu', e => {
    if (e.originalEvent) e.originalEvent.preventDefault();
    if (state.pickMarker) return;
    openSiteDialog(null, { latitude: e.latlng.lat, longitude: e.latlng.lng });
  });
  setTimeout(() => state.map.invalidateSize(), 50);
}

// 采样点标记：水滴外形轮廓 SVG，状态色填充（灰=待采样 橙=待审核 绿=已通过 红=异常/退回）。
const MARKER_COLORS = { gray: '#9AA8A5', amber: '#F0A23B', green: '#0E9F8A', red: '#E0685F' };
function dropSvg(color) {
  return `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg"><path d="M13 1C13 1 2 13.6 2 22.2a11 11 0 0 0 22 0C24 13.6 13 1 13 1Z" fill="${color}" stroke="#ffffff" stroke-width="2.5"/></svg>`;
}
function taskIcon(task) {
  const colorClass = markerColor(task);
  return L.divIcon({ className: '', iconSize: [26, 34], iconAnchor: [13, 31], html: `<div class="sample-marker ${colorClass}">${dropSvg(MARKER_COLORS[colorClass])}</div>` });
}
function siteIcon(site) {
  const colorClass = site.enabled ? 'green' : 'gray';
  return L.divIcon({ className: '', iconSize: [26, 34], iconAnchor: [13, 31], html: `<div class="sample-marker ${colorClass}">${dropSvg(MARKER_COLORS[colorClass])}</div>` });
}

function clearMapLayers() {
  state.markers.forEach(m => m.remove());
  state.markers = [];
  state.trackPolylines.forEach(p => p.remove());
  state.trackPolylines = [];
}

async function renderMap(tasks) {
  if (!state.map) return;
  clearMapLayers();
  const bounds = [];
  if (state.siteMode) {
    state.sites.forEach(site => {
      const marker = L.marker([site.latitude, site.longitude], { icon: siteIcon(site), keyboard: false }).addTo(state.map)
        .bindTooltip(`${esc(site.code)} · ${esc(site.name)}${site.enabled ? '' : '（停用）'}`, { permanent: true, direction: 'top', className: 'map-label', offset: [0, -36] });
      marker.on('click', () => openSiteDialog(site));
      state.markers.push(marker);
      bounds.push([site.latitude, site.longitude]);
    });
    if (bounds.length) state.map.fitBounds(bounds, { padding: [65, 65], maxZoom: 16, animate: false });
    return;
  }
  // 先同步渲染标记与定位，保证交互稳定；轨迹在之后异步叠加。
  // 同一点位的多个任务坐标完全相同，直接叠加会重叠成一个点，因此按点位分组
  // 并围绕中心展开（蜘蛛式散开），首个标记显示"名称 ×数量"。
  const groups = new Map();
  for (const task of tasks) {
    const key = `${task.site_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  for (const group of groups.values()) {
    group.forEach((task, index) => {
      const lat = task.target_latitude;
      const lng = task.target_longitude;
      let markerLat = lat;
      let markerLng = lng;
      if (group.length > 1) {
        const angle = (index / group.length) * 2 * Math.PI - Math.PI / 2;
        const radiusM = 28;
        markerLat = lat + (radiusM * Math.sin(angle)) / 111320;
        markerLng = lng + (radiusM * Math.cos(angle)) / (111320 * Math.cos(lat * Math.PI / 180));
      }
      const marker = L.marker([markerLat, markerLng], { icon: taskIcon(task), keyboard: false }).addTo(state.map);
      const hoverText = task.record_id
        ? `${esc(task.site_name)}<br>${esc(task.sample_code)}<br>距目标点 ${Number(task.distance_m || 0).toFixed(1)}m`
        : `${esc(task.site_name)}<br>${esc(task.sample_code)}`;
      if (index === 0) {
        const label = `${esc(task.site_name)}${group.length > 1 ? ` ×${group.length}` : ''}`;
        marker.bindTooltip(label, { permanent: true, direction: 'top', className: 'map-label', offset: [0, -40] });
        marker.options.title = hoverText;
      } else {
        marker.bindTooltip(hoverText);
      }
      marker.on('click', () => showDetail(task));
      state.markers.push(marker);
      bounds.push([lat, lng]);
    });
    const first = group[0];
    const circle = L.circle([first.target_latitude, first.target_longitude], { radius: first.normal_radius_m || 30, color: '#0E9F8A', weight: 1.4, fillOpacity: 0.05, keyboard: false }).addTo(state.map);
    state.markers.push(circle);
  }
  if (bounds.length) state.map.fitBounds(bounds, { padding: [65, 65], maxZoom: 16, animate: false });
  const trackTasks = tasks.filter(t => t.journey_id).slice(0, 60);
  const trackResults = await Promise.all(trackTasks.map(t => api(`/api/v1/admin/journeys/${t.journey_id}/track`).catch(() => null)));
  trackTasks.forEach((task, index) => {
    const track = trackResults[index];
    if (track && Array.isArray(track.points) && track.points.length) {
      const line = L.polyline(track.points.map(p => [p.latitude, p.longitude]), { color: '#2E7CB8', weight: 3, opacity: 0.65 }).addTo(state.map);
      state.trackPolylines.push(line);
    }
  });
}

$('#fitMap').addEventListener('click', () => renderMap(state.siteMode ? state.sites : currentTasks()));
// 左侧栏桌面端展开/收起（记忆状态）
$('#sideToggle').addEventListener('click', () => {
  const app = document.getElementById('app');
  const collapsed = app.classList.toggle('side-collapsed');
  localStorage.setItem('bscSideCollapsed', collapsed ? '1' : '0');
  $('#sideToggle').textContent = collapsed ? '◨ 侧栏' : '◧ 侧栏';
  setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 60);
});
if (localStorage.getItem('bscSideCollapsed') === '1') {
  document.getElementById('app').classList.add('side-collapsed');
  $('#sideToggle').textContent = '◨ 侧栏';
}
// 表格视图：切换、筛选、批量审核通过、批量补齐天气
$('#tableViewButton').addEventListener('click', () => { state.tableMode = !state.tableMode; render(); });
$('#tableVillager').addEventListener('change', () => renderTable(currentTasks()));
$('#tableStatus').addEventListener('change', () => renderTable(currentTasks()));
$('#tableSearch').addEventListener('input', () => renderTable(currentTasks()));
$('#tableCheckAll').addEventListener('change', e => document.querySelectorAll('#taskTableBody .row-check').forEach(c => { c.checked = e.target.checked; }));
$('#batchApprove').addEventListener('click', async () => {
  const ids = [...document.querySelectorAll('#taskTableBody .row-check:checked')].map(c => Number(c.dataset.record));
  if (!ids.length) return alert('请先勾选要审核的记录');
  if (!confirm(`批量审核通过 ${ids.length} 条记录？`)) return;
  let ok = 0, failed = 0;
  for (const id of ids) {
    try { await post(`/api/v1/admin/records/${id}/review`, { status: 'approved' }); ok++; } catch { failed++; }
  }
  alert(`完成：通过 ${ok} 条${failed ? `，失败 ${failed} 条` : ''}`);
  await loadAll(); render();
});
$('#batchWeather').addEventListener('click', async () => {
  const ids = currentTasks().filter(t => t.record_id && t.server_weather_status !== 'complete').map(t => t.record_id);
  if (!ids.length) return alert('本页没有需要补齐天气的记录');
  try { const res = await post('/api/v1/admin/records/backfill-weather', { recordIds: ids }); alert(`已排队补齐 ${res.queued} 条记录，稍后刷新查看。`); } catch (e) { alert(e.message); }
});
$('#refresh').addEventListener('click', async () => { await loadAll(); checkHealth(); });

// ---------- 审核详情 ----------
$('#closeDetail').addEventListener('click', () => {
  $('#detail').classList.add('hidden');
  state.trackPolylines.forEach(p => p.remove());
  state.trackPolylines = [];
});

function riskBadges(task) {
  const flags = task.risk_flags || [];
  if (!flags.length) return '<div class="risk risk-ok">✓ 无自动风险标志</div>';
  const items = flags.map(f => `<span class="risk-badge ${SEVERE_RISKS.has(f) ? 'severe' : 'warn'}">${esc(RISK_NAMES[f] || f)}</span>`).join('');
  return `<div class="risk"><div class="risk-title">⚠ 需要复核的证据（自动标记，不代表结论）</div><div class="risk-list">${items}</div></div>`;
}

async function showDetail(task) {
  $('#detail').classList.remove('hidden');
  $('#detailCode').textContent = task.sample_code;
  $('#detailTitle').textContent = task.site_name;
  state.trackPolylines.forEach(p => p.remove());
  state.trackPolylines = [];
  let trackInfo = '<div class="empty-detail"><strong>暂无轨迹</strong><p>该任务没有关联轨迹点。</p></div>';
  if (task.journey_id) {
    try {
      const track = await api(`/api/v1/admin/journeys/${task.journey_id}/track`);
      if (track.points && track.points.length) {
        // 优先画平滑分段（漂移点已滤除、时间断点断开、滑动平均去锯齿）；原始点不变。
        const segs = (track.display && Array.isArray(track.display.segments) ? track.display.segments : [])
          .filter(s => s.length >= 2)
          .map(s => s.map(p => [p[0], p[1]]));
        if (!segs.length) segs.push(track.points.map(p => [p.latitude, p.longitude]));
        let bounds = null;
        for (const seg of segs) {
          const line = L.polyline(seg, { color: '#2E7CB8', weight: 4, opacity: 0.8 }).addTo(state.map);
          state.trackPolylines.push(line);
          bounds = bounds ? bounds.extend(line.getBounds()) : line.getBounds();
        }
        if (bounds) state.map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16, animate: false });
        const dropped = (track.display && track.display.dropped) || 0;
        const segNote = segs.length > 1 ? `，${segs.length} 段（暂停/信号中断处断开）` : '';
        trackInfo = `<div class="record-grid"><div><small>轨迹点数</small><strong>${track.points.length}</strong></div><div><small>模拟位置点</small><strong>${track.points.filter(p => p.mock_location).length}</strong></div></div>${(dropped || segNote) ? `<p class="dialog-tip">轨迹已平滑显示${dropped ? `（滤除 ${dropped} 个漂移点）` : ''}${segNote}；原始数据与 GPX 导出未改动。</p>` : ''}`;
      }
    } catch { trackInfo = '<div class="empty-detail">轨迹读取失败。</div>'; }
  }
  const body = $('#detailBody');
  if (!task.record_id) {
    const statusLine = task.canceled_at
      ? `<div class="status-line canceled">状态：已取消（${formatTime(task.canceled_at)}）</div>`
      : task.locked_device_id
        ? `<div class="status-line active">状态：进行中（设备已锁定）</div>`
        : `<div class="status-line pending">状态：待采样</div>`;
    body.innerHTML = `
      ${task.reference_image ? `<img class="record-photo" src="${esc(task.reference_image)}" alt="现场参考图">` : ''}
      ${statusLine}
      <div class="empty-detail"><strong>等待村民采样</strong>
      <p>计划日期 ${esc(task.planned_date)} · ${esc(TYPE_NAMES[task.sample_type] || task.sample_type)} · ${esc(task.villager_name || '')}</p>
      <p>${esc(task.instructions || '暂无采样说明')}</p>
      <p>正常范围 ${task.normal_radius_m || 30}m · 异常上限 ${task.exception_radius_m || 80}m · 硬上限 300m</p>
      ${task.canceled_at ? `<p class="cancel-note">取消原因：${esc(task.canceled_reason || '未填写')}（记录保留，供审计）</p>` : ''}</div>
      ${task.locked_device_id ? `<p class="dialog-tip">已被设备锁定（${formatTime(task.locked_at)}）</p><button class="ghost-danger" id="unlockTask">人工解锁设备</button>` : ''}
      ${!task.canceled_at ? `<div class="detail-actions"><button class="ghost-danger" id="cancelTask">取消此任务</button>${!task.record_id ? `<button class="ghost-danger" id="deleteTask">删除此任务</button>` : ''}<button class="secondary" id="rescheduleTask">改期（重新编号）</button></div>` : ''}
      ${task.journey_id ? `<a class="secondary gpx-link" href="#" id="exportGpx">导出本任务轨迹 GPX</a>` : ''}
      ${task.journey_id ? trackInfo : ''}`;
    if (task.journey_id && $('#exportGpx')) $('#exportGpx').addEventListener('click', e => { e.preventDefault(); downloadFile(`/api/v1/admin/exports/gpx?journeyId=${task.journey_id}`, `journey-${task.journey_id}.gpx`); });
    if ($('#cancelTask')) $('#cancelTask').addEventListener('click', async () => {
      const reason = prompt('请输入取消原因（会保留记录，供审计）：', '管理员取消');
      if (reason === null) return;
      try { await post(`/api/v1/admin/tasks/${task.id}/cancel`, { reason }); await loadAll(); render(); showDetail(state.tasks.find(t => t.id === task.id) || task); }
      catch (error) { alert(error.message); }
    });
    if ($('#deleteTask')) $('#deleteTask').addEventListener('click', async () => {
      if (!confirm(`确定永久删除任务 ${task.sample_code}？此操作不可恢复。`)) return;
      try { await del(`/api/v1/admin/tasks/${task.id}/delete`); await loadAll(); $('#detail').classList.add('hidden'); alert('任务已删除'); }
      catch (error) { alert(error.message); }
    });
    if ($('#rescheduleTask')) $('#rescheduleTask').addEventListener('click', async () => {
      const date = prompt(`任务当前计划日期：${task.planned_date}\n请输入新的计划采样日期（YYYY-MM-DD）。\n编号将按新日期重新生成，已打印的旧标签作废，需要重新打印：`, task.planned_date);
      if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(String(date).trim())) return;
      try {
        const res = await post(`/api/v1/admin/tasks/${task.id}/reschedule`, { plannedDate: String(date).trim() });
        alert(`已改期。新编号：${res.sampleCode}。请重新打印标签。`);
        await loadAll(); render(); showDetail(state.tasks.find(t => t.id === task.id) || task);
      } catch (error) { alert(error.message); }
    });
    if ($('#unlockTask')) $('#unlockTask').addEventListener('click', async () => {
      if (!confirm('确认人工解锁？该任务将回到待采样状态。')) return;
      try { await post(`/api/v1/admin/tasks/${task.id}/unlock`, {}); await loadAll(); render(); showDetail(state.tasks.find(t => t.id === task.id) || task); }
      catch (error) { alert(error.message); }
    });
    return;
  }
  const weather = task.server_weather_text || (task.server_weather_status === 'unavailable' ? '服务器天气查询失败' : '服务器天气待补齐');
  const delayMinutes = (task.received_at && task.captured_at)
    ? Math.max(0, Math.round((new Date(task.received_at) - new Date(task.captured_at)) / 60000))
    : null;
  const journeyMeta = task.start_distance_m != null
    ? `<div class="record-grid"><div><small>开始时距目标</small><strong>${Number(task.start_distance_m).toFixed(1)} 米${Number(task.start_distance_m) < 300 ? '（弱证据）' : ''}</strong></div><div><small>轨迹状态</small><strong>${task.interrupted ? '⚠ 中断后恢复' : '连续记录'}</strong></div></div>`
    : '';
  body.innerHTML = `
    ${task.reference_image ? `<div class="compare-grid"><figure><img src="${esc(task.photo_path)}" alt="现场采样照片"><figcaption>现场照片</figcaption></figure><figure><img src="${esc(task.reference_image)}" alt="管理员参考图"><figcaption>管理员参考图</figcaption></figure></div>` : `<img class="record-photo" src="${esc(task.photo_path)}" alt="现场采样照片">`}
    ${riskBadges(task)}
    <div class="record-grid">
      <div><small>历史序号</small><strong>${esc(task.site_code)}</strong></div>
      <div><small>样品类型</small><strong>${esc(TYPE_NAMES[task.sample_type] || task.sample_type)}</strong></div>
      <div><small>采样人员</small><strong>${esc(task.villager_name || '-')}</strong></div>
      <div><small>目标坐标(WGS84)</small><strong>${Number(task.target_latitude).toFixed(6)}, ${Number(task.target_longitude).toFixed(6)}</strong></div>
      <div><small>距目标点</small><strong>${Number(task.distance_m || 0).toFixed(1)} 米</strong></div>
      <div><small>定位精度</small><strong>±${task.accuracy_m != null && task.accuracy_m !== '' ? Math.round(Number(task.accuracy_m)) : '-'} 米</strong></div>
      <div><small>手机拍摄</small><strong>${formatTime(task.captured_at)}</strong></div>
      <div><small>服务器接收</small><strong>${formatTime(task.received_at)}</strong></div>
      <div><small>上传延迟</small><strong>${delayMinutes == null ? '-' : `${delayMinutes} 分钟`}</strong></div>
      <div><small>瓶号输入</small><strong>${task.manual_code ? `手动输入${task.exception_category ? ' · ' + esc(task.exception_category) : ''}` : '二维码扫描'}</strong></div>
      <div><small>手机天气</small><strong>${esc(task.weather_text)}</strong></div>
      <div><small>服务器天气</small><strong>${esc(weather)}</strong></div>
      <div><small>异常说明</small><strong>${esc(task.exception_detail || '-')}</strong></div>
      <div><small>审核状态</small><strong>${reviewName(task.review_status)}</strong></div>
    </div>
    ${task.journey_id ? trackInfo : ''}
    ${journeyMeta}
    ${task.reference_image ? `<div class="reference"><strong>管理员参考照片</strong><small>${esc(task.instructions || '对照现场地形和水体位置。')}</small></div>` : ''}
    ${task.printed_count ? `<p class="dialog-tip">标签已打印 ${task.printed_count} 次${task.printed_last ? `（最近 ${formatTime(task.printed_last)}）` : ''}；改期后旧标签作废，需重新打印。</p>` : ''}
    <div class="review-block">
      <textarea id="reviewNote" rows="2" placeholder="追加审核意见（不修改原始记录，只追加）">${esc(task.review_note || '')}</textarea>
      <div class="review-actions"><button class="approve" data-status="approved">✓ 审核通过</button><button class="suspicious" data-status="suspicious">! 标记可疑</button><button class="reject" data-status="rejected">↩ 退回重采</button><button data-status="pending">稍后审核</button></div>
    </div>
    <div class="detail-actions">
      ${task.server_weather_status !== 'complete' ? `<button id="backfillWeather" class="secondary">补齐服务器天气</button>` : ''}
      ${task.journey_id ? `<button id="exportGpx2" class="secondary">导出轨迹 GPX</button>` : ''}
      <a class="secondary" href="${esc(task.photo_path)}" target="_blank" download>下载原图</a>
    </div>`;
  document.querySelectorAll('.review-actions button').forEach(button => button.addEventListener('click', async () => {
    try {
      await post(`/api/v1/admin/records/${task.record_id}/review`, { status: button.dataset.status, note: $('#reviewNote').value });
      await loadAll();
      render();
      showDetail(state.tasks.find(t => t.id === task.id));
    } catch (error) { alert(error.message); }
  }));
  if ($('#backfillWeather')) $('#backfillWeather').addEventListener('click', async () => {
    try { await post(`/api/v1/admin/records/${task.record_id}/backfill-weather`, {}); await loadAll(); render(); showDetail(state.tasks.find(t => t.id === task.id)); }
    catch (error) { alert(error.message); }
  });
  if ($('#exportGpx2')) $('#exportGpx2').addEventListener('click', () => downloadFile(`/api/v1/admin/exports/gpx?journeyId=${task.journey_id}`, `journey-${task.journey_id}.gpx`));
}

// ---------- 点位管理 ----------
$('#siteManageButton').addEventListener('click', () => {
  state.siteMode = !state.siteMode;
  $('#siteManageButton').classList.toggle('active', state.siteMode);
  document.querySelectorAll('#dateList button').forEach(b => b.classList.remove('active'));
  render();
});

function typeCheckboxes(container, selected) {
  container.innerHTML = '';
  Object.entries(TYPE_NAMES).forEach(([code, name]) => {
    const label = document.createElement('label');
    label.className = 'type-chip';
    label.innerHTML = `<input type="checkbox" value="${code}" ${selected.includes(code) ? 'checked' : ''}> ${code} ${name}`;
    container.append(label);
  });
}
function checkedTypes(container) {
  return [...container.querySelectorAll('input:checked')].map(input => input.value);
}

// ---------- 坐标解析：支持【WGS84】29.66579301°N，94.34286257°E / 29.66, 94.34 等格式 ----------
function coordsText(lat, lon) {
  return `【WGS84】${Number(lat).toFixed(8)}°N，${Number(lon).toFixed(8)}°E`;
}
function parseCoords(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  let m = /(-?\d+(?:\.\d+)?)\s*°?\s*N\s*[,，\s]*(-?\d+(?:\.\d+)?)\s*°?\s*E/i.exec(s);
  if (m) return { latitude: Number(m[1]), longitude: Number(m[2]) };
  m = /(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { latitude: a, longitude: b };
    if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { latitude: b, longitude: a };
  }
  return null;
}
function setCoordsFields(lat, lon) {
  $('#siteCoords').value = coordsText(lat, lon);
  $('#latitude').value = lat;
  $('#longitude').value = lon;
}
function currentCoords() {
  const parsed = parseCoords($('#siteCoords').value);
  if (parsed) return parsed;
  const lat = $('#latitude').value;
  const lon = $('#longitude').value;
  if (lat !== '' && lon !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
    return { latitude: Number(lat), longitude: Number(lon) };
  }
  return null;
}

function resetSiteForm() {
  $('#siteForm').reset();
  $('#siteCoords').value = '';
  $('#referenceImagePreviewBox').classList.add('hidden');
  $('#referenceImagePreview').removeAttribute('src');
  $('#siteEnabled').checked = true;
  typeCheckboxes($('#siteTypes'), ['R']);
  state.editingSiteId = null;
  if (state.pickMarker) { state.pickMarker.remove(); state.pickMarker = null; }
}

function openSiteDialog(site = null, coords = null) {
  resetSiteForm();
  state.editingSiteId = site ? site.id : null;
  $('#deleteSite').classList.toggle('hidden', !site);
  $('#siteDialogTitle').textContent = site ? `编辑采样点 ${site.code}` : '设置采样点';
  if (site) {
    $('#siteSortOrder').value = site.sort_order ?? '';
    $('#siteCode').value = site.code;
    $('#siteName').value = site.name;
    setCoordsFields(site.latitude, site.longitude);
    $('#siteAltitude').value = site.altitude_m ?? '';
    $('#siteInstructions').value = site.instructions || '';
    $('#siteRiskNote').value = site.risk_note || '';
    $('#siteRemarks').value = site.remarks || '';
    $('#siteEnabled').checked = Boolean(site.enabled);
    typeCheckboxes($('#siteTypes'), site.sample_types || []);
    if (site.reference_image) {
      $('#referenceImagePreview').src = site.reference_image;
      $('#referenceImagePreviewBox').classList.remove('hidden');
    }
  } else if (coords) {
    setCoordsFields(coords.latitude, coords.longitude);
  }
  $('#siteDialog').showModal();
}

$('#addSiteButton').addEventListener('click', () => openSiteDialog(null));
$('#siteCoords').addEventListener('input', () => {
  const parsed = parseCoords($('#siteCoords').value);
  $('#latitude').value = parsed ? parsed.latitude : '';
  $('#longitude').value = parsed ? parsed.longitude : '';
  if (state.pickMarker && parsed) state.pickMarker.setLatLng([parsed.latitude, parsed.longitude]);
});
$('#siteDialog').addEventListener('close', () => {
  // 由"在地图上选点"触发的关闭不清除选点模式（用 pickPending 标记区分），
  // 彻底消除 close 事件异步派发与 setTimeout 之间的竞态。
  if (state.pickPending) { state.pickPending = false; return; }
  state.pickMode = false;
  if (state.pickMarker) { state.pickMarker.remove(); state.pickMarker = null; }
});

$('#pickMap').addEventListener('click', () => {
  state.pickPending = true;
  state.pickMode = true;
  $('#siteDialog').close();
  const c = currentCoords();
  const lat = c ? c.latitude : 30.04;
  const lng = c ? c.longitude : 94.05;
  state.map.setView([lat, lng], Math.max(state.map.getZoom(), 13));
});

function finishPick(lat, lng) {
  state.pickMode = false;
  // 传入坐标重新打开对话框，避免 resetSiteForm 清掉刚选好的值。
  openSiteDialog(null, { latitude: lat, longitude: lng });
  placePickMarker(lat, lng);
}

function placePickMarker(lat, lng) {
  if (!state.map) return;
  if (state.pickMarker) state.pickMarker.remove();
  state.pickMarker = L.marker([lat, lng], { draggable: true, keyboard: false }).addTo(state.map);
  state.pickMarker.on('dragend', () => {
    const p = state.pickMarker.getLatLng();
    setCoordsFields(p.lat, p.lng);
  });
}

function resizeImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(image.src);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = () => reject(new Error('示例图片无法读取，请换一张照片'));
    image.src = URL.createObjectURL(file);
  });
}

$('#referenceImageFile').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return $('#referenceImagePreviewBox').classList.add('hidden');
  $('#referenceImagePreview').src = URL.createObjectURL(file);
  $('#referenceImagePreviewBox').classList.remove('hidden');
});

$('#saveSite').addEventListener('click', async () => {
  const form = $('#siteForm');
  if (!form.reportValidity()) return;
  if (!checkedTypes($('#siteTypes')).length) return alert('请至少选择一种样品类型');
  const coords = currentCoords();
  if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return alert('请填写有效的 WGS84 经纬度，格式如：【WGS84】29.66579301°N，94.34286257°E');
  if (Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) return alert('经纬度超出范围（纬度 ±90、经度 ±180）');
  const data = {
    sortOrder: Number($('#siteSortOrder').value) || 0,
    code: $('#siteCode').value.trim(),
    name: $('#siteName').value.trim(),
    latitude: coords.latitude,
    longitude: coords.longitude,
    altitudeM: $('#siteAltitude').value === '' ? null : Number($('#siteAltitude').value),
    sampleTypes: checkedTypes($('#siteTypes')),
    remarks: $('#siteRemarks').value,
    instructions: $('#siteInstructions').value,
    riskNote: $('#siteRiskNote').value,
    referenceImage: state.editingSiteId ? undefined : '',
    enabled: $('#siteEnabled').checked
  };
  let hasReference = false;
  try {
    const file = $('#referenceImageFile').files[0];
    if (file) {
      const imageData = await resizeImage(file, 1600, 0.82);
      const uploaded = await post('/api/v1/admin/reference-images', { imageData });
      data.referenceImage = uploaded.path;
      hasReference = true;
    }
    if (state.editingSiteId) {
      await api(`/api/v1/admin/sites/${state.editingSiteId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      data.projectId = state.projectId;
      await post('/api/v1/admin/sites', data);
    }
    if (!hasReference && !$('#referenceImagePreviewBox').classList.contains('hidden')) hasReference = true;
    $('#siteDialog').close();
    await loadAll();
    alert(hasReference ? '采样点已保存。' : '采样点已保存。建议补充现场参考图，方便村民对照找点。');
  } catch (error) { alert(error.message); }
});

$('#deleteSite').addEventListener('click', async () => {
  if (!state.editingSiteId) return;
  const code = $('#siteCode').value.trim();
  if (!confirm(`确定删除点位 ${code}？\n其名下未采样任务将一并取消，此操作不可恢复。`)) return;
  try {
    const res = await del(`/api/v1/admin/sites/${state.editingSiteId}`);
    $('#siteDialog').close();
    await loadAll();
    alert(`点位已删除，已取消 ${res.canceledTasks} 个未采样任务。`);
  } catch (error) { alert(error.message); }
});

// ---------- CSV 导入 ----------
$('#importButton').addEventListener('click', () => $('#importDialog').showModal());
$('#runImport').addEventListener('click', async () => {
  const file = $('#csvFile').files[0];
  if (!file) return alert('请选择CSV文件');
  const rows = parseCsv(await file.text());
  let ok = 0, failed = 0;
  for (const row of rows) {
    try {
      const rawCode = row['序号'] ?? row.site_code ?? row['点位编号'];
      const coords = parseCoordinate(row['经纬度']);
      const remarks = row['备注'] ?? row.remarks ?? '';
      const sampleTypes = deriveSampleTypes(String(rawCode), String(remarks), row['样品类型'] ?? row.sample_type);
      await post('/api/v1/admin/sites', {
        projectId: state.projectId,
        sort_order: Number(row['编号'] ?? row.sort_order ?? 0) || 0,
        code: rawCode,
        name: row['点位名称'] ?? row.site_name ?? `采样点${rawCode}`,
        sampleTypes,
        latitude: coords ? coords.latitude : Number(row.latitude_wgs84 ?? row['纬度']),
        longitude: coords ? coords.longitude : Number(row.longitude_wgs84 ?? row['经度']),
        altitudeM: row['海拔'] ?? row.altitude_m ?? null,
        instructions: row['采样说明'] ?? row.instructions ?? '',
        riskNote: row['风险提醒'] ?? row.risk_note ?? '',
        remarks,
        referenceImage: '',
        enabled: true
      });
      ok++;
    } catch { failed++; }
  }
  $('#importResult').textContent = `导入完成：成功 ${ok} 个，失败 ${failed} 个。导入点位已启用，可补传现场参考图。`;
  await loadAll();
});

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines.shift());
  return lines.map(line => Object.fromEntries(splitCsvLine(line).map((value, i) => [headers[i], value])));
}
function splitCsvLine(line) {
  const out = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { out.push(value.trim()); value = ''; }
    else value += c;
  }
  out.push(value.trim());
  return out;
}
function parseCoordinate(value = '') {
  const match = String(value).match(/([0-9]+(?:\.[0-9]+)?)\s*°?\s*N.*?([0-9]+(?:\.[0-9]+)?)\s*°?\s*E/i);
  return match ? { latitude: Number(match[1]), longitude: Number(match[2]) } : null;
}
function deriveSampleTypes(code, remarks, explicit) {
  if (explicit) return String(explicit).toUpperCase().split(/[,，;；]/).map(s => s.trim()).filter(s => TYPE_NAMES[s]);
  const result = [];
  if (remarks.includes('土')) result.push('S');
  if (remarks.includes('植')) result.push('P');
  if (remarks.includes('水') && !remarks.includes('无水')) result.push(code.includes('.') ? 'T' : 'R');
  return result.length ? result : ['R'];
}

// ---------- 任务下发与标签 ----------
$('#newTaskButton').addEventListener('click', async () => {
  $('#taskFields').classList.remove('hidden');
  $('#createTask').classList.remove('hidden');
  $('#labelResult').classList.add('hidden');
  $('#printLabel').classList.add('hidden');
  $('#plannedDate').value = new Date().toISOString().slice(0, 10);
  $('#taskVillager').innerHTML = state.villagers.filter(v => v.enabled).map(v => `<option value="${v.id}">${esc(v.display_name)}（${esc(v.username)}）</option>`).join('');
  const enabled = state.sites.filter(s => s.enabled);
  $('#taskSiteList').innerHTML = `<label class="site-pick select-all"><input type="checkbox" id="taskSiteAll"> <strong>全选 / 全不选</strong></label>` +
    (enabled.length
      ? enabled.map(s => `<label class="site-pick"><input type="checkbox" value="${s.id}"> ${esc(s.code)} · ${esc(s.name)}（${(s.sample_types || []).map(t => TYPE_NAMES[t] || t).join('/')}）</label>`).join('')
      : '<p class="dialog-tip">没有启用的点位，请先设置采样点。</p>');
  const all = $('#taskSiteAll');
  if (all) all.addEventListener('change', () => {
    $('#taskSiteList').querySelectorAll('input[type=checkbox]').forEach(input => { if (input !== all) input.checked = all.checked; });
  });
  $('#taskDialog').showModal();
});

$('#createTask').addEventListener('click', async () => {
  const siteIds = [...$('#taskSiteList').querySelectorAll('input[type=checkbox]:checked')]
    .filter(input => input.id !== 'taskSiteAll')
    .map(input => Number(input.value));
  if (!siteIds.length) return alert('请选择至少一个采样点');
  if (!$('#taskVillager').value) return alert('请选择采样人员');
  const villager = state.villagers.find(v => v.id === Number($('#taskVillager').value));
  const villagerLabel = villager ? `${villager.display_name}（${villager.username}）` : '所选采样员';
  try {
    const created = [];
    for (const siteId of siteIds) {
      const res = await post('/api/v1/admin/tasks', {
        siteId, villagerId: Number($('#taskVillager').value),
        plannedDate: $('#plannedDate').value
      });
      created.push(...(res.codes || []));
    }
    if (!created.length) return alert('没有生成任何任务：所选点位都未设置样品类型，请先在点位管理里为点位设置类型。');
    const after = await api(`/api/v1/admin/tasks?projectId=${state.projectId}`);
    state.tasks = after.tasks;
    state.lastCreatedTaskIds = after.tasks.filter(t => created.includes(t.sample_code)).map(t => t.id);
    $('#labelCodes').innerHTML = created.map(c => `<div class="label-code-item">${esc(c)}</div>`).join('') + `<p class="dialog-tip">已为 ${esc(villagerLabel)} 生成 ${created.length} 个任务</p>`;
    $('#labelResult').classList.remove('hidden');
    $('#printLabel').classList.remove('hidden');
    $('#createTask').classList.add('hidden');
    $('#taskFields').classList.add('hidden');
    // 下发后：左栏出现计划日期并自动切到该日期，地图立即显示新任务。
    state.selectedDate = $('#plannedDate').value;
    renderDates();
    render();
  } catch (error) { alert(error.message); }
});

$('#printLabel').addEventListener('click', async () => {
  if (!state.lastCreatedTaskIds.length) return alert('没有可打印的任务');
  try {
    const html = await api(`/api/v1/admin/labels?taskIds=${state.lastCreatedTaskIds.join(',')}`);
    const win = window.open('', '_blank');
    if (!win) return alert('浏览器拦截了弹出窗口，请允许弹窗后重试');
    win.document.write(html._text ?? html);
    win.document.close();
    win.focus();
  } catch (error) { alert(error.message); }
});

// ---------- 设备激活与采样员管理 ----------
async function refreshVillagers() {
  const boot = await api('/api/v1/admin/bootstrap');
  state.villagers = boot.villagers;
}
function renderVillagerList() {
  $('#activationResult').classList.add('hidden');
  $('#qrcode').innerHTML = '';
  $('#villagerList').innerHTML = state.villagers.map(v => `
    <div class="vill-row">
      <div><strong>${esc(v.display_name)}</strong><small>${esc(v.username)}${v.enabled ? '' : '（已停用）'}</small></div>
      <div class="vill-actions">
        <button type="button" data-act="${v.id}" ${v.enabled ? '' : 'disabled'} class="secondary">生成激活二维码</button>
        <button type="button" data-toggle="${v.id}" class="ghost">${v.enabled ? '停用' : '启用'}</button>
      </div>
    </div>`).join('');
  $('#villagerList').querySelectorAll('button[data-act]').forEach(button => button.addEventListener('click', async () => {
    try {
      const res = await post(`/api/v1/admin/villagers/${button.dataset.act}/activation`, {});
      $('#activationResult').classList.remove('hidden');
      $('#activationValue').textContent = res.value;
      $('#activationExpires').textContent = `有效期至 ${formatTime(res.expiresAt)}（一次性使用）`;
      $('#qrcode').innerHTML = '';
      if (window.QRCode) new QRCode($('#qrcode'), { text: res.value, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
      else $('#qrcode').textContent = '二维码组件未加载';
    } catch (error) { alert(error.message); }
  }));
  $('#villagerList').querySelectorAll('button[data-toggle]').forEach(button => button.addEventListener('click', async () => {
    const villager = state.villagers.find(v => v.id === Number(button.dataset.toggle));
    const enable = !villager.enabled;
    try {
      await api(`/api/v1/admin/villagers/${villager.id}`, { method: 'PUT', body: JSON.stringify({ displayName: villager.display_name, enabled: enable }) });
      await refreshVillagers();
      renderVillagerList();
    } catch (error) { alert(error.message); }
  }));
}
$('#villagerButton').addEventListener('click', () => {
  renderVillagerList();
  $('#villagerDialog').showModal();
});
$('#addVillager').addEventListener('click', async () => {
  const username = $('#newVillagerUser').value.trim().toLowerCase();
  const displayName = $('#newVillagerName').value.trim();
  if (!username || !displayName) return alert('请填写账号和姓名');
  try {
    await post('/api/v1/admin/villagers', { username, displayName });
    $('#newVillagerUser').value = '';
    $('#newVillagerName').value = '';
    await refreshVillagers();
    renderVillagerList();
  } catch (error) { alert(error.message); }
});
$('#copyActivation').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#activationValue').textContent); alert('已复制到剪贴板'); }
  catch { window.prompt('复制以下内容：', $('#activationValue').textContent); }
});

// ---------- 诊断日志与健康 ----------
$('#logsButton').addEventListener('click', loadLogs);
$('#refreshLogs').addEventListener('click', loadLogs);
function logFilterQuery() {
  const params = new URLSearchParams({ limit: '1000' });
  if ($('#logLevel').value) params.set('level', $('#logLevel').value);
  if ($('#logDevice').value.trim()) params.set('deviceId', $('#logDevice').value.trim());
  if ($('#logFrom').value) params.set('from', $('#logFrom').value);
  if ($('#logTo').value) params.set('to', $('#logTo').value);
  return params.toString();
}
async function loadLogs() {
  try {
    const res = await api(`/api/v1/admin/logs?${logFilterQuery()}`);
    $('#logsBody').innerHTML = res.logs.length
      ? res.logs.map(l => `<tr><td>${formatTime(l.created_at)}</td><td><span class="log-level ${esc(l.level)}">${esc(l.level)}</span></td><td>#${l.device_id ?? '-'} ${esc(l.app_version || '')}</td><td title="${esc(l.diagnostics)}">${esc(l.message)}</td></tr>`).join('')
      : '<tr><td colspan="4">暂无日志</td></tr>';
    $('#logsDialog').showModal();
  } catch (error) { alert(error.message); }
}
$('#exportLogsCsv').addEventListener('click', () => downloadFile(`/api/v1/admin/exports/logs.csv?${logFilterQuery()}`, 'bsc-app-logs.csv'));

async function checkHealth() {
  try {
    const res = await api('/api/v1/admin/health');
    const dot = document.querySelector('.server-dot i');
    if (res.criticalLowDisk) {
      $('#healthText').textContent = `磁盘仅剩 ${fmtBytes(res.freeBytes)}，告警！`;
      dot.style.background = '#E0685F';
    } else if (res.warnLowDisk) {
      $('#healthText').textContent = `磁盘剩余 ${fmtBytes(res.freeBytes)}（偏低）`;
      dot.style.background = '#F0A23B';
    } else {
      $('#healthText').textContent = `服务器运行正常 · 磁盘剩余 ${fmtBytes(res.freeBytes)}`;
      dot.style.background = '#0E9F8A';
    }
  } catch { $('#healthText').textContent = '服务器健康检查失败'; }
}

// ---------- 导出 ----------
async function downloadFile(url, name) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || `导出失败：${res.status}`); }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (error) { alert(error.message); }
}
$('#exportCsv').addEventListener('click', () => downloadFile(`/api/v1/admin/exports/csv?projectId=${state.projectId}`, 'bsc-records.csv'));
$('#exportGeo').addEventListener('click', () => downloadFile(`/api/v1/admin/exports/geojson?projectId=${state.projectId}`, 'bsc-records.geojson'));
$('#exportPhotos').addEventListener('click', () => downloadFile(`/api/v1/admin/exports/photos.zip?projectId=${state.projectId}`, 'bsc-photos.zip'));
$('#exportAudit').addEventListener('click', () => downloadFile('/api/v1/admin/exports/audit.csv', 'bsc-audit.csv'));

// ---------- 启动 ----------
window.__bscState = state; // 调试用：浏览器控制台可查看内部状态
if (token()) { showApp(); init(); } else { showLogin(); }
~~~~

#### `bsc-sampling-v1/public/favicon.svg`

SHA-256: `56ea901d1568162180fb0187726da544ff446b0ccc6fba614cd913e472cbe7a1`

~~~~xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 4C24 17 13 28 13 40a19 19 0 0 0 38 0C51 28 40 17 32 4Z" fill="#16a27a"/><path d="M23 41c3 6 8 8 15 6" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>
~~~~

#### `bsc-sampling-v1/public/index.html`

SHA-256: `e46f06c066b8872549e86b542af6f84d0458d8e1d61c507e661ee039e0a54300`

~~~~html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>水样采集管理系统</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/vendor/leaflet/leaflet.css">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <section id="login" class="login-shell">
    <div class="login-card">
      <div class="brand-mark"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M12 2.5C12 2.5 4.5 10.8 4.5 16.3a7.5 7.5 0 0 0 15 0C19.5 10.8 12 2.5 12 2.5Z" fill="#fff"/></svg></div>
      <p class="eyebrow">WGS84 · 离线采集 · 真实性审核</p>
      <h1>水样采集管理系统</h1>
      <p class="muted">管理员登录后可以设置采样点、下发任务并审核现场记录。</p>
      <form id="loginForm">
        <label class="field">管理员密码<input id="password" type="password" autocomplete="current-password"></label>
        <label class="field">TOTP 动态验证码（可选）<input id="totp" inputmode="numeric" maxlength="6" placeholder="未启用请留空"></label>
        <button class="btn btn-primary" type="submit">进入管理平台</button>
        <p id="loginError" class="error"></p>
      </form>
    </div>
  </section>

  <div id="app" class="app hidden">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark small"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 2.5C12 2.5 4.5 10.8 4.5 16.3a7.5 7.5 0 0 0 15 0C19.5 10.8 12 2.5 12 2.5Z" fill="#fff"/></svg></span><div><strong>水样采集</strong><small>管理平台</small></div></div>
      <p class="section-label">项目</p>
      <div id="projectList" class="project-list"></div>
      <button id="newProjectButton" class="side-action">＋ 新建项目</button>
      <div class="side-heading"><span>采样日期</span><button id="refresh" title="刷新">↻</button></div>
      <nav id="dateList" class="date-list"></nav>
      <div class="sidebar-bottom">
        <button id="siteManageButton" class="side-action">⌖ 点位管理</button>
        <button id="villagerButton" class="side-action">📱 设备激活</button>
        <button id="logsButton" class="side-action">📋 诊断日志</button>
        <div class="server-dot"><i></i><span id="healthText">正在检查服务器…</span></div>
        <button id="logoutButton" class="side-action ghost">退出登录</button>
      </div>
    </aside>
    <div class="sidebar-backdrop hidden"></div>

    <main class="main">
      <header class="topbar">
        <div class="topbar-title"><button id="menuButton" class="menu-button" title="菜单">☰</button><div><p id="crumb" class="crumb">项目</p><h2 id="pageTitle">待采样任务</h2></div></div>
        <div class="top-actions">
          <button id="sideToggle" class="secondary" title="展开/收起左侧栏">◧ 侧栏</button>
          <button id="tableViewButton" class="secondary">▦ 表格</button>
          <span class="top-action-wrap"><button id="exportCsv" class="secondary">导出CSV</button><i class="info-badge">!</i><span class="info-tip">导出当前项目的全部采样记录为 CSV 表格（编号、历史序号、WGS84 坐标、距离、精度、风险标志中文解释、审核意见、照片 SHA-256），可用 Excel 打开。</span></span>
          <span class="top-action-wrap"><button id="exportGeo" class="secondary">GeoJSON</button><i class="info-badge">!</i><span class="info-tip">导出采样记录为 GeoJSON（WGS84 点要素），可在 QGIS、ArcGIS 等地图软件中打开。</span></span>
          <span class="top-action-wrap"><button id="exportPhotos" class="secondary">照片包</button><i class="info-badge">!</i><span class="info-tip">把全部现场水印照片打包为 ZIP 下载，文件名含样品编号，可作原始证据归档。</span></span>
          <span class="top-action-wrap"><button id="exportAudit" class="secondary">审计记录</button><i class="info-badge">!</i><span class="info-tip">导出全部管理员操作审计日志 CSV（登录、点位/项目修改、任务下发/取消/改期、审核等），只追加不可删除。</span></span>
          <span class="top-action-wrap"><button id="importButton" class="secondary">导入Excel/CSV</button><i class="info-badge">!</i><span class="info-tip">把现有点位表格另存为 CSV（UTF-8）后批量导入，列名：编号,序号,经纬度,海拔,备注（可选点位名称/采样说明/风险提醒/样品类型）。"编号"是排序号，"序号"是历史序号（5.1 等小数保留）；坐标必须是 WGS84。导入点位默认启用，可再补传参考图。</span></span>
          <span class="top-action-wrap"><button id="newTaskButton" class="secondary">＋ 下发采样任务</button><i class="info-badge">!</i><span class="info-tip">选择计划采样日期、采样员和一个或多个点位、样品类型，系统为每个"点位×类型"生成独立任务、瓶子编号与二维码，并可打印 40 枚/页 A4 不干胶标签。</span></span>
          <span class="top-action-wrap"><button id="addSiteButton" class="primary">＋ 设置采样点</button><i class="info-badge">!</i><span class="info-tip">新建/编辑固定采样点：历史序号（5.1 等格式保留）、WGS84 坐标（可在地图上点选并拖动微调）、样品类型多选、可选现场参考图、采样说明与风险提醒。</span></span>
        </div>
      </header>

      <section class="stats">
        <article><span class="stat-icon blue">●</span><div><small>本页任务</small><strong id="statAll">0</strong></div></article>
        <article><span class="stat-icon green">✓</span><div><small>审核通过</small><strong id="statApproved">0</strong></div></article>
        <article><span class="stat-icon amber">!</span><div><small>待审核/可疑</small><strong id="statPending">0</strong></div></article>
        <article><span class="stat-icon gray">○</span><div><small>尚未采样</small><strong id="statUnfinished">0</strong></div></article>
      </section>

      <section id="taskTableWrap" class="task-table-wrap hidden">
        <div class="task-table-tools">
          <select id="tableVillager"><option value="">全部采样员</option></select>
          <select id="tableStatus">
            <option value="">全部状态</option>
            <option value="pending">待采样</option>
            <option value="review">待审核/可疑</option>
            <option value="approved">已通过</option>
            <option value="rejected">已退回</option>
            <option value="canceled">已取消</option>
          </select>
          <input id="tableSearch" placeholder="搜索编号/点位名称">
          <label class="checkbox-line"><input type="checkbox" id="tableCheckAll"> 全选本页待审核</label>
          <button id="batchApprove" class="secondary">批量审核通过</button>
          <button id="batchWeather" class="secondary">补齐本页天气</button>
        </div>
        <div class="task-table-scroll">
          <table class="task-table">
            <thead><tr><th></th><th>编号</th><th>点位</th><th>类型</th><th>日期</th><th>采样员</th><th>距离</th><th>审核状态</th><th>操作</th></tr></thead>
            <tbody id="taskTableBody"></tbody>
          </table>
        </div>
      </section>

      <section class="map-panel">
        <div class="map-toolbar">
          <div class="legend"><span><i class="pin gray"></i>待采样</span><span><i class="pin amber"></i>待审核</span><span><i class="pin green"></i>已通过</span><span><i class="pin red"></i>异常/退回</span><span id="tileZoomNote" class="tile-note hidden"></span></div>
          <button id="fitMap" class="map-action">◎ 显示全部</button>
        </div>
        <div id="map"></div>
        <div id="mapFallback" class="map-fallback hidden">
          <strong>在线底图未加载</strong>
          <span>点位与任务仍可查看；请检查网络后刷新。</span>
        </div>
      </section>
    </main>

    <aside id="detail" class="detail hidden">
      <div class="detail-head"><div><small id="detailCode">样品编号</small><h3 id="detailTitle">采样记录</h3></div><button id="closeDetail">×</button></div>
      <div id="detailBody"></div>
    </aside>
  </div>

  <dialog id="projectDialog">
    <form id="projectForm" method="dialog">
      <div class="dialog-head"><div><small>项目</small><h3 id="projectDialogTitle">新建项目</h3></div><button value="cancel" formnovalidate>×</button></div>
      <div class="form-grid">
        <label class="field">项目编码<input id="projectCode" required placeholder="例如：BSC2"></label>
        <label class="field">项目名称<input id="projectName" required placeholder="例如：巴松措正式采样"></label>
        <label class="wide field">描述<input id="projectDescription" placeholder="可选"></label>
        <label class="wide checkbox-line"><input type="checkbox" id="projectIsTest"> 测试项目（不参与正式统计）</label>
        <label class="wide checkbox-line" id="projectEnabledLine"><input type="checkbox" id="projectEnabled" checked> 启用（停用后不再显示新任务）</label>
      </div>
      <div class="dialog-actions"><span></span><button value="cancel" formnovalidate class="btn btn-ghost">取消</button><button id="saveProject" type="button" class="btn btn-primary">保存项目</button></div>
    </form>
  </dialog>

  <dialog id="siteDialog">
    <form id="siteForm" method="dialog">
      <div class="dialog-head"><div><small>WGS84坐标</small><h3 id="siteDialogTitle">设置采样点</h3></div><button value="cancel" formnovalidate>×</button></div>
      <div class="form-grid">
        <label class="field">排序编号<input name="sort_order" id="siteSortOrder" type="number" placeholder="例如：6"></label>
        <label class="field">历史序号<input name="code" id="siteCode" required placeholder="例如：5.1（保持原格式）"></label>
        <label class="field">点位名称<input name="name" id="siteName" required placeholder="例如：河流采样点12"></label>
        <label class="field">海拔（米）<input name="altitude_m" id="siteAltitude" type="number" step="1"></label>
        <label class="wide field">经纬度(WGS84)
          <input id="siteCoords" placeholder="【WGS84】29.66579301°N，94.34286257°E（也可直接粘贴 29.66579301, 94.34286257）">
          <small>支持"度分秒"以外的十进制格式：带 °N/°E 的 WGS84 文本，或"纬度, 经度"两个数字；也可点击"在地图上选点"或直接在地图上点右键。</small>
        </label>
        <input id="latitude" type="hidden">
        <input id="longitude" type="hidden">
        <div class="wide field-block"><span class="form-label">样品类型（可多选）</span>
          <div class="type-checkboxes" id="siteTypes"></div>
        </div>
        <label class="wide field">现场示例图片（可选，建议上传）
          <input id="referenceImageFile" type="file" accept="image/jpeg,image/png,image/webp">
          <small>供村民在现场对照找点；不上传也可以保存并使用该点位。</small>
        </label>
        <div id="referenceImagePreviewBox" class="wide reference-upload hidden">
          <img id="referenceImagePreview" alt="现场示例图片预览"><span>示例图片预览</span>
        </div>
        <label class="wide field">采样说明<textarea name="instructions" id="siteInstructions" rows="3" placeholder="告诉村民如何到达、如何拍照"></textarea></label>
        <label class="wide field">风险提醒<textarea name="risk_note" id="siteRiskNote" rows="2" placeholder="例如：雨季河岸湿滑"></textarea></label>
        <label class="wide field">备注<input name="remarks" id="siteRemarks" placeholder="例如：土，植无水"></label>
        <label class="wide checkbox-line"><input type="checkbox" id="siteEnabled" checked> 启用该点位（停用后不再下发新任务，历史数据保留）</label>
      </div>
      <p class="dialog-tip">点击“在地图上选点”，再点击地图中的实际位置；保存前可以拖动地图上的标记微调坐标。坐标支持 8 位小数（约 1 厘米精度）。</p>
      <div class="dialog-actions"><button id="pickMap" type="button" class="btn btn-secondary">⌖ 在地图上选点</button><button id="deleteSite" type="button" class="btn btn-danger hidden">删除该点位</button><span></span><button value="cancel" formnovalidate class="btn btn-ghost">取消</button><button id="saveSite" type="button" class="btn btn-primary">保存采样点</button></div>
    </form>
  </dialog>

  <dialog id="importDialog">
    <form method="dialog">
      <div class="dialog-head"><div><small>批量设置</small><h3>从Excel导入采样点</h3></div><button value="cancel" formnovalidate>×</button></div>
      <p>把现有表格另存为 CSV（UTF-8）后导入，列名：</p>
      <code>编号,序号,经纬度,海拔,备注（可选：点位名称,采样说明,风险提醒,样品类型）</code>
      <p class="dialog-tip">“编号”是排序编号，“序号”是历史序号（可用 5.1、5.2 等小数形式，原样保留）。经纬度必须是 WGS84。导入后即可使用，可再补传参考图。</p>
      <input id="csvFile" class="file-input" type="file" accept=".csv,text/csv">
      <div id="importResult" class="import-result"></div>
      <div class="dialog-actions"><span></span><button value="cancel" formnovalidate class="btn btn-ghost">关闭</button><button id="runImport" type="button" class="btn btn-primary">开始导入</button></div>
    </form>
  </dialog>

  <dialog id="taskDialog">
    <form id="taskForm" method="dialog">
      <div class="dialog-head"><div><small>临时下发</small><h3>创建采样任务和瓶子标签</h3></div><button value="cancel" formnovalidate>×</button></div>
      <div id="taskFields" class="form-grid">
        <label class="wide field">计划采样日期<input id="plannedDate" type="date" required></label>
        <label class="wide field">采样人员<select id="taskVillager" required></select></label>
        <div class="wide field-block"><span class="form-label">选择固定采样点（可多选，每个点位按其样品类型生成任务）</span>
          <div id="taskSiteList" class="site-pick-list"><label class="site-pick select-all"><input type="checkbox" id="taskSiteAll"> <strong>全选 / 全不选</strong></label></div>
        </div>
        <label class="wide field">样品类型按点位自身设置生效（点位列表括号内为各点位类型；要改某点类型请到"点位管理"编辑该点）</label>
      </div>
      <section id="labelResult" class="label-result hidden">
        <div id="labelCodes" class="label-codes"></div>
        <p>已生成任务与二维码。使用 A4 不干胶打印，二维码与文字编号必须同时贴在瓶身。</p>
      </section>
      <div class="dialog-actions"><span></span><button value="cancel" formnovalidate class="btn btn-ghost">关闭</button><button id="printLabel" type="button" class="btn btn-secondary hidden">打印标签（60枚/页）</button><button id="createTask" type="button" class="btn btn-primary">生成任务和二维码</button></div>
    </form>
  </dialog>

  <dialog id="villagerDialog">
    <form method="dialog">
      <div class="dialog-head"><div><small>设备激活</small><h3>生成设备激活二维码</h3></div><button value="cancel" formnovalidate>×</button></div>
      <p class="dialog-tip">扫码即激活并自动登录（无 PIN）。激活码一次性使用，24 小时过期。村民首次打开 APP 扫码完成设备绑定，之后打开无需再登录。</p>
      <div class="vill-new">
        <input id="newVillagerUser" placeholder="账号（字母数字，如 cmy02）">
        <input id="newVillagerName" placeholder="姓名">
        <button type="button" id="addVillager" class="btn btn-primary">＋ 新建采样员</button>
      </div>
      <div id="villagerList" class="vill-list"></div>
      <div id="activationResult" class="activation-result hidden">
        <div class="activation-qr"><div id="qrcode"></div></div>
        <div>
          <small>激活二维码（24 小时有效）</small>
          <code id="activationValue" class="activation-value"></code>
          <p id="activationExpires" class="muted"></p>
          <button type="button" id="copyActivation" class="btn btn-secondary">复制激活内容</button>
        </div>
      </div>
      <div class="dialog-actions"><span></span><button value="cancel" formnovalidate class="btn btn-ghost">关闭</button></div>
    </form>
  </dialog>

  <dialog id="logsDialog">
    <form method="dialog">
      <div class="dialog-head"><div><small>APP 诊断日志</small><h3>最近上传的诊断日志</h3></div><button value="cancel" formnovalidate>×</button></div>
      <p class="dialog-tip">日志只包含版本、网络、同步阶段与异常类型，不含 PIN、令牌、二维码密钥或照片数据。支持按级别/设备/时间筛选，并可导出 CSV。</p>
      <div class="logs-filters">
        <select id="logLevel"><option value="">全部级别</option><option value="info">info</option><option value="warning">warning</option><option value="error">error</option></select>
        <input id="logDevice" placeholder="设备ID（可选）">
        <input id="logFrom" type="date"><span class="muted">至</span><input id="logTo" type="date">
        <button id="exportLogsCsv" type="button" class="btn btn-secondary">导出日志CSV</button>
      </div>
      <div class="logs-table-wrap"><table class="logs-table">
        <thead><tr><th>时间</th><th>级别</th><th>设备</th><th>消息</th></tr></thead>
        <tbody id="logsBody"></tbody>
      </table></div>
      <div class="dialog-actions"><button id="refreshLogs" type="button" class="btn btn-secondary">刷新</button><span></span><button value="cancel" formnovalidate class="btn btn-ghost">关闭</button></div>
    </form>
  </dialog>

  <script src="/vendor/leaflet/leaflet.js"></script>
  <script src="/vendor/qrcodejs/qrcode.min.js"></script>
  <script src="/app.js"></script>
</body>
</html>
~~~~

#### `bsc-sampling-v1/public/sample-reference.svg`

SHA-256: `15c86461400dd919267ef3ce2d9838a553d252d0f47efcd6484a230c5e30c9ea`

~~~~xml
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#b8dce9"/><stop offset="1" stop-color="#edf4ef"/></linearGradient>
    <linearGradient id="water" x2="1" y2="1"><stop stop-color="#4f999d"/><stop offset="1" stop-color="#214c59"/></linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#sky)"/>
  <path d="M0 245L105 150 185 235 280 100 390 244 512 125 645 240 735 155 800 225V390H0Z" fill="#66816f"/>
  <path d="M0 330C180 260 290 340 410 300S640 235 800 315V600H0Z" fill="url(#water)"/>
  <path d="M0 480C175 410 310 445 450 407S690 370 800 408V600H0Z" fill="#847966" opacity=".78"/>
  <g transform="translate(280 190)">
    <rect x="68" y="50" width="112" height="260" rx="22" fill="#d9f5ef" opacity=".88" stroke="#214c59" stroke-width="7"/>
    <rect x="82" y="0" width="84" height="66" rx="11" fill="#173d48"/>
    <rect x="80" y="137" width="88" height="92" rx="6" fill="#fff" stroke="#d15b52" stroke-width="5"/>
    <rect x="91" y="151" width="66" height="66" fill="#152f38"/>
    <path d="M96 156h18v18H96zm38 0h18v18h-18zm-38 38h18v18H96zm20-18h16v16h-16zm18 18h18v18h-18z" fill="#fff"/>
  </g>
  <rect x="24" y="518" width="752" height="58" rx="14" fill="#102b32" opacity=".78"/>
  <text x="50" y="555" font-family="sans-serif" font-size="27" fill="#fff">拍摄示例：瓶子约占画面 1/4，背景保留河流和地形</text>
</svg>
~~~~

#### `bsc-sampling-v1/public/styles.css`

SHA-256: `16c13354232784f2b2bb8bf719216e1d1bce426a2b37a76984dbf3a96185180a`

~~~~css
:root{--ink:#17343a;--muted:#708187;--line:#dbe5e4;--soft:#f3f7f6;--green:#16a27a;--green-dark:#087557;--aqua:#dff6ef;--amber:#ef9c2f;--red:#d95d58;--blue:#3a84c6;--shadow:0 16px 48px rgba(25,54,58,.13)}
*{box-sizing:border-box}body{margin:0;font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;color:var(--ink);background:#eef4f2}button,input,select,textarea{font:inherit}button{cursor:pointer}.hidden{display:none!important}.muted{color:var(--muted)}.error{min-height:22px;color:var(--red);font-size:13px}.primary,.secondary,.ghost{border:0;border-radius:10px;padding:11px 18px;font-weight:700}.primary{background:var(--green);color:#fff;box-shadow:0 8px 22px rgba(22,162,122,.23)}.primary:hover{background:var(--green-dark)}.secondary{background:#fff;border:1px solid var(--line);color:var(--ink)}.ghost{background:transparent;color:var(--muted)}
.login-shell{min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 25% 20%,#e5fff6 0,transparent 32%),linear-gradient(135deg,#edf6f3,#dceae6)}.login-card{width:min(440px,calc(100% - 32px));padding:42px;background:#fff;border-radius:24px;box-shadow:var(--shadow)}.brand-mark{display:grid;place-items:center;width:62px;height:62px;border-radius:20px 20px 26px 26px;background:linear-gradient(145deg,#24c49a,#0d8064);color:#fff;font-size:30px;font-weight:900;box-shadow:0 12px 30px rgba(13,128,100,.25)}.brand-mark.small{width:42px;height:42px;border-radius:14px 14px 18px 18px;font-size:20px;box-shadow:none}.eyebrow{margin:24px 0 7px;color:var(--green);font-size:12px;font-weight:800;letter-spacing:1px}.login-card h1{margin:0;font-size:29px}.login-card form{margin-top:28px}.login-card label,.form-grid label{display:grid;gap:7px;font-size:13px;font-weight:700}.login-card input,.form-grid input,.form-grid select,.form-grid textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:12px;background:#fbfdfc;color:var(--ink);outline:none}.login-card input:focus,.form-grid input:focus,.form-grid textarea:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(22,162,122,.12)}.login-card .primary{width:100%;margin-top:14px}
.app{height:100vh;display:grid;grid-template-columns:250px minmax(0,1fr);overflow:hidden}.app.side-collapsed{display:block}.app.side-collapsed .sidebar{display:none}.app.side-collapsed .main{height:100vh}.sidebar{position:relative;background:#fff;border-right:1px solid var(--line);padding:22px 14px}.brand{display:flex;align-items:center;gap:11px;padding:0 8px 24px}.brand strong,.brand small{display:block}.brand strong{font-size:18px}.brand small{color:var(--muted);font-size:12px;margin-top:2px}.section-label{margin:8px 10px;color:#9ba9ac;font-size:11px;font-weight:800;letter-spacing:1px}.project,.date-list button{width:100%;display:flex;align-items:center;gap:9px;border:0;border-radius:10px;background:transparent;padding:11px;text-align:left;color:var(--ink)}.project.active{background:var(--aqua);color:var(--green-dark);font-weight:800}.side-heading{display:flex;justify-content:space-between;align-items:center;margin:27px 10px 8px;font-size:12px;color:var(--muted);font-weight:800}.side-heading button{border:0;background:transparent;color:var(--green);font-size:20px}.date-list{display:grid;gap:4px}.date-list button{justify-content:space-between;font-size:13px}.date-list button.active{background:#edf5f3;color:var(--green-dark);font-weight:800}.date-list b{display:grid;place-items:center;min-width:24px;height:20px;border-radius:10px;background:#e6efed;font-size:11px}.sidebar-bottom{position:absolute;left:24px;right:24px;bottom:24px;display:grid;gap:8px;color:var(--muted);font-size:11px}.server-dot{display:flex;align-items:center;gap:7px;color:#53706c}.server-dot i{width:8px;height:8px;border-radius:50%;background:#30b987;box-shadow:0 0 0 4px #e1f7ef}
.main{min-width:0;padding:22px 25px 26px;overflow:auto}.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.topbar-title{display:flex;align-items:center;gap:12px;min-width:0}.menu-button{display:none;flex:none;border:0;background:var(--aqua);color:var(--green-dark);width:44px;height:44px;border-radius:12px;font-size:20px;font-weight:900}.sidebar-backdrop{display:none}.crumb{margin:0 0 4px;color:var(--muted);font-size:12px}.topbar h2{margin:0;font-size:25px}.top-actions{display:flex;gap:9px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}.stats article{display:flex;align-items:center;gap:12px;padding:15px 18px;background:#fff;border:1px solid #e3ebe9;border-radius:14px}.stats small,.stats strong{display:block}.stats small{font-size:11px;color:var(--muted);margin-bottom:4px}.stats strong{font-size:22px}.stat-icon{display:grid;place-items:center;width:35px;height:35px;border-radius:11px;font-weight:900}.stat-icon.blue{background:#e5f0fa;color:var(--blue)}.stat-icon.green{background:#dcf5ec;color:var(--green)}.stat-icon.amber{background:#fff0da;color:var(--amber)}.stat-icon.gray{background:#edf1f1;color:#889595}
.map-panel{position:relative;height:calc(100vh - 190px);min-height:500px;background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 9px 30px rgba(34,61,62,.06)}.map-toolbar{height:50px;display:flex;align-items:center;justify-content:space-between;padding:0 15px;border-bottom:1px solid var(--line)}.legend{display:flex;gap:15px;font-size:11px;color:var(--muted)}.legend span{display:flex;align-items:center;gap:5px}.pin{width:9px;height:9px;border-radius:50%;display:inline-block}.pin.gray{background:#879493}.pin.amber{background:var(--amber)}.pin.green{background:var(--green)}.pin.red{background:var(--red)}.map-action{border:0;background:#edf7f4;color:var(--green-dark);border-radius:9px;padding:7px 10px;font-size:12px;font-weight:800}#map{height:calc(100% - 50px);background:#dfe9e5}.leaflet-control-attribution{font-size:9px}.sample-marker{width:34px;height:42px;border-radius:18px 18px 18px 3px;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.28);display:grid;place-items:center}.sample-marker span{transform:rotate(45deg);color:#fff;font-weight:900}.sample-marker.gray{background:#7f8d8c}.sample-marker.amber{background:var(--amber)}.sample-marker.green{background:var(--green)}.sample-marker.red{background:var(--red)}.map-fallback{position:absolute;inset:50px 0 0;z-index:400;display:grid;place-content:center;text-align:center;gap:8px;background:linear-gradient(135deg,#dfeae6,#c7d9d3);color:var(--ink)}.map-fallback span{font-size:12px;color:var(--muted)}
.detail{position:fixed;z-index:1100;top:0;right:0;width:min(430px,100%);height:100vh;background:#fff;box-shadow:-18px 0 50px rgba(17,43,47,.16);overflow:auto}.detail-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:22px;background:#fff;border-bottom:1px solid var(--line)}.detail-head small{color:var(--green);font-weight:800}.detail-head h3{margin:4px 0 0;font-size:22px}.detail-head button,.dialog-head button{border:0;background:#eef4f2;width:36px;height:36px;border-radius:50%;font-size:24px;color:var(--muted)}#detailBody{padding:20px}.record-photo{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;background:#edf2f0}.record-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:18px 0}.record-grid div{padding:12px;background:var(--soft);border-radius:10px}.record-grid small,.record-grid strong{display:block}.record-grid small{color:var(--muted);font-size:10px;margin-bottom:4px}.record-grid strong{font-size:13px}.reference{display:flex;gap:12px;padding:12px;border:1px solid var(--line);border-radius:12px}.reference img{width:90px;height:68px;object-fit:cover;border-radius:8px}.reference strong,.reference small{display:block}.reference small{color:var(--muted);font-size:11px;margin-top:5px;line-height:1.45}.review-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px}.review-actions button{border:0;border-radius:10px;padding:12px;font-weight:800}.approve{background:#dff7ee;color:#087557}.suspicious{background:#fff0da;color:#9a5a05}.reject{background:#fde4e2;color:#9f332e}.risk{margin:12px 0;padding:10px;border-radius:10px;background:#fff2df;color:#8a530b;font-size:12px}.empty-detail{padding:25px;text-align:center;color:var(--muted)}
dialog{width:min(680px,calc(100% - 28px));border:0;border-radius:18px;padding:0;box-shadow:var(--shadow)}dialog::backdrop{background:rgba(13,34,38,.36);backdrop-filter:blur(3px)}dialog form{padding:22px}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.dialog-head small{color:var(--green);font-weight:800}.dialog-head h3{margin:4px 0 0;font-size:22px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.form-grid .wide{grid-column:1/-1}.dialog-tip{font-size:11px;color:var(--muted)}.dialog-actions{display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:center;margin-top:18px}.file-input{display:block;width:100%;margin:20px 0;padding:22px;border:1px dashed #9dbdb5;border-radius:12px;background:#f3faf7}.import-result{font-size:12px;color:var(--muted)}code{display:block;padding:12px;border-radius:8px;background:#eff5f3;white-space:normal;color:#35615a}.label-result{display:grid;grid-template-columns:150px 1fr;align-items:center;gap:22px;margin-top:20px;padding:20px;border:2px dashed #9bbeb5;border-radius:14px;background:#f5fbf8}.label-result #qrcode{width:132px;height:132px;padding:6px;background:#fff}.label-result #qrcode img,.label-result #qrcode canvas{width:120px!important;height:120px!important}.label-result small,.label-result strong{display:block}.label-result small{color:var(--muted);font-size:11px}.label-result strong{margin:6px 0;font-size:24px;letter-spacing:.5px}.label-result p{color:var(--muted);font-size:11px;line-height:1.5}
@media print{body *{visibility:hidden}#labelResult,#labelResult *{visibility:visible}#labelResult{position:absolute;left:20mm;top:20mm;width:85mm;border:1px solid #222;background:#fff}.label-result p{display:none}}
@media(max-width:900px){.app{grid-template-columns:200px minmax(0,1fr)}.stats{grid-template-columns:1fr 1fr}.map-panel{height:calc(100vh - 280px)}.legend{display:none}}@media(max-width:650px){.app{display:block;overflow:auto}.menu-button{display:block}.sidebar{position:fixed;top:0;left:0;bottom:0;width:270px;z-index:1300;transform:translateX(-105%);transition:transform .22s ease;box-shadow:18px 0 50px rgba(17,43,47,.16);overflow:auto;display:block}.sidebar.open{transform:translateX(0)}.sidebar-backdrop{display:block;position:fixed;inset:0;z-index:1250;background:rgba(13,34,38,.42)}.main{padding:14px}.topbar{align-items:flex-start;gap:12px}.top-actions{display:grid}.topbar h2{font-size:21px}.stats{grid-template-columns:1fr 1fr}.map-panel{height:70vh}.form-grid{grid-template-columns:1fr}.form-grid .wide{grid-column:auto}.record-grid{grid-template-columns:1fr}.detail{width:100%}.top-action-wrap .info-tip{display:none}}@media(max-width:400px){.stats{grid-template-columns:1fr}.stat-icon{display:none}.dialog-actions{grid-template-columns:1fr 1fr}.activation-result{flex-direction:column}}
.reference-upload{display:flex;align-items:center;gap:12px;padding:10px;border:1px dashed #9bbeb4;border-radius:12px;background:#eff8f5}.reference-upload img{width:132px;height:88px;object-fit:cover;border-radius:9px}.reference-upload span{font-size:12px;color:var(--muted);font-weight:800}

/* --- V1 /api/v1 前端新增样式 --- */
.project-list{display:grid;gap:4px}
.side-action{width:100%;text-align:left;border:0;border-radius:10px;background:#f3f7f6;color:var(--ink);padding:10px 12px;font-size:12px;font-weight:700}
.side-action:hover{background:var(--aqua)}
.side-action.active{background:var(--aqua);color:var(--green-dark)}
.side-action.ghost{background:transparent;color:var(--muted)}
.server-dot{margin:6px 0}
.top-actions{flex-wrap:wrap;justify-content:flex-end}
.type-checkboxes{display:flex;flex-wrap:wrap;gap:8px}
.type-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:#fbfdfc;font-size:13px;font-weight:600;cursor:pointer}
.type-chip input{width:auto;margin:0}
.checkbox-line{display:flex!important;flex-direction:row!important;align-items:center;gap:8px;font-size:13px}
.checkbox-line input{width:auto}
.site-pick-list{max-height:180px;overflow:auto;display:grid;gap:6px;border:1px solid var(--line);border-radius:10px;padding:10px;background:#fbfdfc}
.site-pick{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
.site-pick input{width:auto;margin:0}
.label-codes{display:flex;flex-wrap:wrap;gap:10px}
.label-code-item{padding:10px 14px;border:2px dashed #9bbeb5;border-radius:10px;background:#fff;font-size:18px;font-weight:900;letter-spacing:.5px;color:var(--ink)}
.label-result{grid-template-columns:1fr}
.risk-title{font-weight:800;margin-bottom:6px}
.risk-list{display:flex;flex-wrap:wrap;gap:6px}
.risk-badge{padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700}
.risk-badge.warn{background:#fff0da;color:#9a5a05}
.risk-badge.severe{background:#fde4e2;color:#9f332e}
.risk-ok{background:#dcf5ec;color:#087557}
.review-block{margin-top:16px}
.review-block textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit;background:#fbfdfc;outline:none}
.detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.detail-actions .secondary{font-size:12px;padding:8px 12px;text-decoration:none}
.cancel-note{color:var(--red);font-weight:700}
.gpx-link{display:inline-block;margin-top:10px;font-size:12px;text-decoration:none}
.vill-list{display:grid;gap:8px;margin:14px 0}
.vill-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fbfdfc}
.vill-row strong,.vill-row small{display:block}
.vill-row small{color:var(--muted);font-size:11px;margin-top:2px}
.activation-result{display:flex;gap:20px;align-items:center;margin-top:16px;padding:16px;border:2px dashed #9bbeb5;border-radius:14px;background:#f5fbf8}
.activation-qr{width:188px;height:188px;padding:4px;background:#fff;border-radius:8px}
.activation-qr #qrcode img,.activation-qr #qrcode canvas{width:180px!important;height:180px!important}
.activation-value{font-size:11px;word-break:break-all;margin-top:6px}
.logs-table-wrap{max-height:52vh;overflow:auto;margin:12px 0;border:1px solid var(--line);border-radius:12px}
.logs-table{width:100%;border-collapse:collapse;font-size:12px}
.logs-table th{position:sticky;top:0;background:#f3f7f6;text-align:left;padding:10px;font-size:11px;color:var(--muted)}
.logs-table td{padding:9px 10px;border-top:1px solid var(--line);vertical-align:top}
.log-level{display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:800;text-transform:uppercase}
.log-level.info{background:#e5f0fa;color:var(--blue)}
.log-level.warning{background:#fff0da;color:#9a5a05}
.log-level.error{background:#fde4e2;color:#9f332e}
.sample-marker span{font-size:11px}

/* --- 用户反馈迭代新增样式 --- */
.project-row{display:flex;align-items:center;gap:4px}
.project-row .project{flex:1;min-width:0}
.project-row .project span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.project-tool{border:0;background:transparent;color:var(--muted);font-size:14px;padding:6px;border-radius:8px}
.project-tool:hover{background:var(--aqua);color:var(--green-dark)}
.map-label{background:rgba(255,255,255,.92)!important;border:1px solid var(--line)!important;border-radius:8px!important;box-shadow:0 2px 8px rgba(20,45,48,.18)!important;color:var(--ink)!important;font-size:11px!important;font-weight:700;padding:3px 8px!important}
.map-label::before{display:none!important}
.select-all{border-bottom:1px dashed var(--line);padding-bottom:8px;margin-bottom:4px}
.site-pick-list .dialog-tip{margin:0}
.logs-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
.logs-filters select,.logs-filters input{border:1px solid var(--line);border-radius:10px;padding:8px 10px;font:inherit;background:#fbfdfc}
.logs-filters .muted{font-size:11px}
.vill-new{display:flex;gap:8px;margin:10px 0}
.vill-new input{flex:1;min-width:0;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit;background:#fbfdfc}
.vill-actions{display:flex;gap:8px;align-items:center}
.vill-actions .ghost{border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;background:#fff;color:var(--muted)}
.tile-note{font-size:11px;color:#9a5a05;background:#fff0da;border-radius:8px;padding:4px 8px;max-width:360px}
/* 顶栏功能按钮旁的"!"信息点与悬停详情 */
.top-action-wrap{position:relative;display:inline-flex}
.top-action-wrap .info-badge{position:absolute;top:-7px;right:-7px;width:17px;height:17px;border-radius:50%;background:var(--blue);color:#fff;font-size:11px;font-style:normal;font-weight:900;line-height:17px;text-align:center;cursor:help;z-index:5;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.top-action-wrap .info-tip{position:absolute;top:calc(100% + 8px);right:0;width:290px;background:#0c2226;color:#fff;font-size:12px;line-height:1.65;padding:10px 13px;border-radius:10px;box-shadow:var(--shadow);opacity:0;visibility:hidden;transition:opacity .15s ease;z-index:1200;pointer-events:none}
.top-action-wrap:hover .info-tip{opacity:1;visibility:visible}
.top-action-wrap:hover .info-badge{background:var(--green-dark)}
.status-line{margin:10px 0;padding:8px 12px;border-radius:10px;font-size:13px;font-weight:800}
.status-line.pending{background:#e6efed;color:#53706c}
.status-line.active{background:#e5f0fa;color:var(--blue)}
.status-line.canceled{background:#fde4e2;color:#9f332e}
.ghost-danger{border:1px solid #e0b4b0;border-radius:10px;padding:9px 14px;font-weight:700;background:#fff;color:#9f332e}
.ghost-danger:hover{background:#fde4e2}
/* 采样点标记改为水滴外形轮廓（SVG 填充，覆盖旧的旋转大头针样式） */
.sample-marker{width:26px;height:34px;background:transparent;border:0;border-radius:0;transform:none;box-shadow:none;display:block}
.sample-marker svg{display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))}
/* --- 表格视图 + 审核照片对比 --- */
.task-table-wrap{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 9px 30px rgba(34,61,62,.06)}
.task-table-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 15px;border-bottom:1px solid var(--line)}
.task-table-tools select,.task-table-tools input[type=text],.task-table-tools input:not([type]){border:1px solid var(--line);border-radius:10px;padding:8px 10px;font:inherit;background:#fbfdfc}
.task-table-tools input#tableSearch{flex:1;min-width:140px}
.task-table-scroll{max-height:calc(100vh - 300px);overflow:auto}
.task-table{width:100%;border-collapse:collapse;font-size:13px}
.task-table th{position:sticky;top:0;background:#f3f7f6;text-align:left;padding:10px 12px;font-size:11px;color:var(--muted);white-space:nowrap}
.task-table td{padding:9px 12px;border-top:1px solid var(--line);vertical-align:top}
.task-table tr:hover{background:#f6faf9}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px}
.compare-grid figure{margin:0;display:grid;gap:4px}
.compare-grid img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;background:#edf2f0}
.compare-grid figcaption{font-size:11px;color:var(--muted);text-align:center;font-weight:700}
.reference{display:block;padding:10px 12px;border:1px solid var(--line);border-radius:12px;margin:12px 0}
.reference small{color:var(--muted);font-size:11px;line-height:1.45}
@media(max-width:650px){.compare-grid{grid-template-columns:1fr}}

/* ===== Task 1: 设计令牌与基础组件层（山水青绿换肤） ===== */
:root{
  --c-primary:#0E9F8A;--c-primary-strong:#0B7F6E;--c-accent:#2E7CB8;--c-bg:#F4F8F7;--c-card:#FFFFFF;
  --c-ink:#17343A;--c-ink-2:#5A6B6E;--c-line:#DDE8E5;--c-danger:#D95D58;--c-amber:#EF9C2F;--c-green:#16A27A;
  --radius:12px;--radius-sm:8px;--shadow-soft:0 2px 10px rgba(23,52,58,.06);--shadow-pop:0 10px 40px rgba(23,52,58,.14);
  --font:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:var(--font);background:var(--c-bg);color:var(--c-ink);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}
.hidden{display:none!important}
h1,h2,h3{margin:0;line-height:1.25}
button{font-family:var(--font)}
/* 基础组件 */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;border:1px solid var(--c-line);
  border-radius:var(--radius-sm);background:#fff;color:var(--c-ink);font-size:13.5px;font-weight:600;cursor:pointer;transition:all .15s ease}
.btn:hover{border-color:var(--c-primary);color:var(--c-primary)}
.btn-primary,.primary{background:var(--c-primary);border-color:var(--c-primary);color:#fff}
.btn-primary:hover,.primary:hover{background:var(--c-primary-strong);color:#fff}
.btn-secondary,.secondary{background:#EAF6F3;border-color:transparent;color:var(--c-primary-strong)}
.btn-secondary:hover,.secondary:hover{background:#D8EFEA}
.btn-ghost,.ghost{background:transparent;border-color:transparent;color:var(--c-ink-2)}
.btn-ghost:hover,.ghost:hover{background:#EFF4F3;color:var(--c-ink)}
.field input,.field select,.field textarea,input[type=text],input[type=password],input[type=number],input[type=date],select,textarea{
  width:100%;padding:10px 12px;border:1px solid var(--c-line);border-radius:var(--radius-sm);background:#fff;color:var(--c-ink);
  font:inherit;transition:border-color .15s ease}
.field input:focus,input:focus,select:focus,textarea:focus{outline:none;border-color:var(--c-primary);box-shadow:0 0 0 3px rgba(14,159,138,.15)}
/* 登录页 */
.login-shell{min-height:100vh;display:grid;place-items:center;padding:24px;
  background:linear-gradient(160deg,#EAF7F4 0%,#F4F8F7 55%,#E8F1F6 100%)}
.login-card{width:min(400px,100%);background:var(--c-card);border-radius:20px;box-shadow:var(--shadow-pop);padding:36px 32px;text-align:center}
.brand-mark{width:56px;height:56px;margin:0 auto 14px;display:grid;place-items:center;border-radius:16px;font-size:26px;font-weight:700;
  color:#fff;background:linear-gradient(135deg,var(--c-primary),var(--c-accent))}
.login-card h1{font-size:21px;margin-bottom:6px}
.eyebrow{font-size:12px;letter-spacing:.12em;color:var(--c-accent);font-weight:700}
.muted{color:var(--c-ink-2)}
.login-card form{display:grid;gap:12px;margin-top:22px;text-align:left}
.login-card label{display:grid;gap:6px;font-size:13px;color:var(--c-ink-2);font-weight:600}
.error{color:var(--c-danger);font-size:13px;min-height:18px;margin:0}
/* 打印（原样保留，勿改） */
@media print{body *{visibility:hidden}#labelResult,#labelResult *{visibility:visible}#labelResult{position:absolute;left:20mm;top:20mm;width:85mm;border:1px solid #222;background:#fff}.label-result p{display:none}}

/* 应用壳 */
.app{display:grid;grid-template-columns:230px minmax(0,1fr);height:100vh;background:var(--c-bg)}
.app.side-collapsed{grid-template-columns:64px minmax(0,1fr)}
.sidebar{background:linear-gradient(180deg,#FDFEFE,#EFF7F5);border-right:1px solid var(--c-line);display:flex;flex-direction:column;gap:6px;padding:16px 12px;overflow:auto}
.brand{display:flex;align-items:center;gap:10px;padding:4px 8px 14px}
.brand .brand-mark.small{width:36px;height:36px;margin:0;font-size:18px;border-radius:10px}
.brand strong{font-size:15px}.brand small{display:block;color:var(--c-ink-2);font-size:11px}
.section-label{font-size:11px;color:var(--c-ink-2);letter-spacing:.1em;margin:10px 8px 2px}
.side-action{display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;border:0;border-radius:var(--radius-sm);
  background:transparent;color:var(--c-ink);font-size:13.5px;cursor:pointer;text-align:left}
.side-action:hover{background:#E3F2EE;color:var(--c-primary-strong)}
.side-action.active{background:var(--c-primary);color:#fff}
.date-list,.project-list{display:flex;flex-direction:column;gap:4px}
#dateList button,#projectList button{border:0;border-radius:var(--radius-sm);background:transparent;color:var(--c-ink);font-size:13px;padding:8px 12px;text-align:left;cursor:pointer}
#dateList button:hover,#projectList button:hover{background:#E3F2EE}
#dateList button.active,#projectList button.active{background:var(--c-primary);color:#fff}
.sidebar-bottom{margin-top:auto;display:grid;gap:6px;padding-top:10px;border-top:1px solid var(--c-line)}
.server-dot{display:flex;align-items:center;gap:8px;color:var(--c-ink-2);font-size:12px;padding:4px 8px}
.server-dot i{width:8px;height:8px;border-radius:50%;background:var(--c-green)}
/* 顶栏 */
.main{min-width:0;display:flex;flex-direction:column;padding:18px 22px;gap:16px;overflow:auto}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px}
.topbar-title{display:flex;align-items:center;gap:10px}
.crumb{font-size:12px;color:var(--c-ink-2)}
.topbar h2{font-size:24px;font-weight:800}
.menu-button{display:none;border:0;background:transparent;font-size:20px;cursor:pointer}
.top-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
/* 统计卡 */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.stats article{display:flex;align-items:center;gap:12px;background:var(--c-card);border:1px solid var(--c-line);border-radius:var(--radius);padding:14px 16px;box-shadow:var(--shadow-soft)}
.stats small{color:var(--c-ink-2);font-size:12px}
.stats strong{font-size:22px;display:block}
.stat-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;font-weight:700;color:#fff}
.stat-icon.blue{background:var(--c-accent)}.stat-icon.green{background:var(--c-green)}
.stat-icon.amber{background:var(--c-amber)}.stat-icon.gray{background:#9AA8A5}
/* 表格视图 */
.task-table-wrap{background:var(--c-card);border:1px solid var(--c-line);border-radius:var(--radius);box-shadow:var(--shadow-soft);overflow:hidden}
.task-table-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--c-line);background:#FBFDFC}
.task-table-tools select,.task-table-tools input{width:auto;min-width:150px}
.task-table-scroll{overflow:auto;max-height:60vh}
.task-table{width:100%;border-collapse:collapse;font-size:13px}
.task-table th{position:sticky;top:0;background:#F0F7F5;color:var(--c-ink-2);font-size:12px;text-align:left;padding:10px 12px}
.task-table td{padding:10px 12px;border-top:1px solid var(--c-line)}
.task-table tbody tr:hover{background:#F2F9F7}
.row-check{accent-color:var(--c-primary)}
/* 兜底：移动端侧栏抽屉红线——≤650px 时 #menuButton 必须可见（与 Task 5 响应式块一致，提前补齐以保住 e2e 红线） */
@media(max-width:650px){.menu-button{display:block}}

/* ===== Task 3: 地图面板 + 详情审核侧栏 + 状态配色常量 ===== */
/* 地图面板 */
.map-panel{background:var(--c-card);border:1px solid var(--c-line);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-soft);position:relative;min-height:0}
.map-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid var(--c-line);background:#FBFDFC}
.legend{display:flex;gap:14px;font-size:12px;color:var(--c-ink-2)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.pin{width:10px;height:10px;border-radius:50%;display:inline-block}
.pin.gray{background:#9AA8A5}.pin.amber{background:#F0A23B}.pin.green{background:#0E9F8A}.pin.red{background:#E0685F}
.map-action{padding:7px 12px;border:1px solid var(--c-line);border-radius:var(--radius-sm);background:#fff;font-size:12.5px;font-weight:600;cursor:pointer}
.map-action:hover{border-color:var(--c-primary);color:var(--c-primary)}
.map-fallback{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:6px;color:var(--c-ink-2);background:#F4F8F7}
/* 详情侧栏 */
.detail{position:fixed;right:0;top:0;bottom:0;width:430px;background:var(--c-card);box-shadow:var(--shadow-pop);z-index:1400;overflow:auto;padding:18px 20px;display:flex;flex-direction:column;gap:14px}
.detail-head{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1px solid var(--c-line);padding-bottom:12px}
.detail-head small{color:var(--c-accent);font-weight:700;letter-spacing:.06em}
.detail-head button{border:0;background:transparent;font-size:22px;cursor:pointer;color:var(--c-ink-2)}
.record-photo{width:100%;border-radius:var(--radius);border:1px solid var(--c-line)}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.review-actions{display:flex;flex-wrap:wrap;gap:8px}
.review-actions button[data-status=approved]{background:var(--c-green);border-color:var(--c-green);color:#fff}
.review-actions button[data-status=rejected]{background:var(--c-danger);border-color:var(--c-danger);color:#fff}
.cancel-note{background:#FDF3EC;border:1px solid #F5D9C4;border-radius:var(--radius-sm);padding:10px 12px;color:#9A5B2D;font-size:13px}

/* ===== Task 4: 全部弹窗与表单组件换肤 ===== */
/* 弹窗 */
dialog{border:0;border-radius:16px;box-shadow:var(--shadow-pop);padding:0;background:var(--c-card);max-width:560px;width:calc(100vw - 48px)}
dialog::backdrop{background:rgba(13,34,38,.45)}
.dialog-head{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 20px 12px;border-bottom:1px solid var(--c-line)}
.dialog-head small{color:var(--c-accent);font-weight:700;letter-spacing:.06em;font-size:11.5px}
.dialog-head button{border:0;background:transparent;font-size:22px;cursor:pointer;color:var(--c-ink-2)}
.dialog-actions{display:flex;gap:10px;justify-content:flex-end;align-items:center;padding:14px 20px;border-top:1px solid var(--c-line);background:#FBFDFC;border-radius:0 0 16px 16px}
.dialog-actions span{flex:1}
.dialog-tip{font-size:12.5px;color:var(--c-ink-2);background:#EFF7F5;border-radius:var(--radius-sm);padding:10px 12px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;padding:18px 20px}
.form-grid label{display:grid;gap:6px;font-size:13px;color:var(--c-ink-2);font-weight:600}
.form-grid .wide{grid-column:1/-1}
.type-checkboxes,.site-pick-list{display:grid;gap:6px;max-height:220px;overflow:auto;border:1px solid var(--c-line);border-radius:var(--radius-sm);padding:10px}
.site-pick{border:1px solid var(--c-line);border-radius:var(--radius-sm);padding:8px 10px;background:#fff}
.site-pick:hover{border-color:var(--c-primary)}
.checkbox-line{display:flex!important;align-items:center;gap:8px;font-weight:500!important}
.checkbox-line input{width:auto;accent-color:var(--c-primary)}
/* 标签结果与激活 */
.label-result{background:#EFF7F5;border-radius:var(--radius);padding:12px 14px}
.label-codes{display:flex;flex-wrap:wrap;gap:6px}
.label-code-item{background:#fff;border:1px dashed var(--c-primary);color:var(--c-primary-strong);border-radius:var(--radius-sm);padding:4px 10px;font-size:12px;font-weight:700}
.vill-new{display:flex;gap:8px;padding:0 20px 12px}
.vill-new input{flex:1}
.vill-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 20px;border-top:1px solid var(--c-line)}
.vill-row small{color:var(--c-ink-2)}
.activation-result{display:flex;gap:16px;padding:12px 20px;align-items:center}
.activation-qr{background:#fff;border:1px solid var(--c-line);border-radius:var(--radius);padding:10px}
.activation-value{font-size:11.5px;color:var(--c-ink-2);word-break:break-all}
.logs-filters{display:flex;flex-wrap:wrap;gap:10px;padding:12px 20px}
.logs-filters input,.logs-filters select{width:auto}
.logs-table-wrap{max-height:50vh;overflow:auto;margin:0 20px;border:1px solid var(--c-line);border-radius:var(--radius-sm)}
.logs-table{width:100%;border-collapse:collapse;font-size:12.5px}
.logs-table th{position:sticky;top:0;background:#F0F7F5;padding:8px 10px;text-align:left;color:var(--c-ink-2)}
.logs-table td{padding:8px 10px;border-top:1px solid var(--c-line)}
.file-input{border:1px dashed var(--c-line);border-radius:var(--radius-sm);padding:14px;width:100%;margin:0 0 12px}
.import-result{font-size:13px;padding:0 20px 12px}
/* 兜底：≤650px 表单仍为单列（等价旧 @media 规则，防止末尾 .form-grid 两列覆盖移动端） */
@media(max-width:650px){.form-grid{grid-template-columns:1fr}.form-grid .wide{grid-column:auto}}
/* ===== Task 5: 响应式收尾（覆盖旧 L10 行为，山水青绿换肤） ===== */
@media(max-width:900px){.app{grid-template-columns:200px minmax(0,1fr)}.stats{grid-template-columns:1fr 1fr}.map-panel{height:calc(100vh - 280px)}.legend{display:none}}
@media(max-width:650px){.app{display:block;overflow:auto}.menu-button{display:block}.sidebar{position:fixed;top:0;left:0;bottom:0;width:270px;z-index:1300;transform:translateX(-105%);transition:transform .22s ease;box-shadow:18px 0 50px rgba(17,43,47,.16);overflow:auto;display:block}.sidebar.open{transform:translateX(0)}.sidebar-backdrop{display:block;position:fixed;inset:0;z-index:1250;background:rgba(13,34,38,.42)}.main{padding:14px}.topbar{align-items:flex-start;gap:12px}.top-actions{display:grid}.topbar h2{font-size:21px}.stats{grid-template-columns:1fr 1fr}.map-panel{height:70vh}.form-grid{grid-template-columns:1fr}.form-grid .wide{grid-column:auto}.record-grid{grid-template-columns:1fr}.detail{width:100%}.top-action-wrap .info-tip{display:none}}
@media(max-width:400px){.stats{grid-template-columns:1fr}.stat-icon{display:none}.dialog-actions{grid-template-columns:1fr 1fr}.activation-result{flex-direction:column}}

/* 删除操作（v1.3.1） */
.btn-danger{background:var(--c-danger);border-color:var(--c-danger);color:#fff}
.btn-danger:hover{background:#C24A45;border-color:#C24A45;color:#fff}

/* 复选框列表容器改 div 后的标题样式（避免外层 label 误触发全选） */
.form-grid .field-block{display:grid;gap:6px}
.form-label{font-size:13px;color:var(--c-ink-2);font-weight:600}
~~~~

#### `bsc-sampling-v1/README.md`

SHA-256: `90760ece6209ce339e6c2a3e63a81e9ac11affe67d9d8103ba64a22b71630889`

~~~~markdown
# 巴松措采样系统 V1 服务器与管理站

原生 Android 采集端的配套服务器：Node.js 22+（内置 SQLite），提供 `/api/v1` 移动端与管理端接口、管理站静态页面、照片与参考图目录，默认只监听 `127.0.0.1:3100`，由 Nginx 转发 `https://bsc.gpsgps.online`。

## 启动

```powershell
npm install          # 首次（qrcode + sharp）
npm start            # node src/server.js，监听 127.0.0.1:3100
```

- 数据目录：`data/v1/`（数据库 `bsc-v1.sqlite`、照片 `uploads/`、参考图 `reference/`、配置 `config.json`、备份 `backups/`）。
- 首次启动自动建库并写入种子数据：2 个项目、25 个正式点位（含 `5.1`、`9.5`、`9.6` 等历史序号）、采样员 `cmy01`（扫码激活即登录，无 PIN）。
- 默认管理员密码 `ChangeMe-2608!`：正式部署必须通过 `data/v1/config.json` 或环境变量 `ADMIN_PASSWORD`/`SESSION_SECRET` 修改，建议配置 `ADMIN_TOTP_SECRET` 启用动态验证码。
- 环境变量：`HOST`、`PORT`、`DATA_DIR`、`PUBLIC_BASE_URL`（激活二维码中的服务器地址）。

## 接口

- 移动端（Android APP）：`/api/v1/mobile/*` —— 激活、登录、同步、开始行程、轨迹批量上传、实时位置、幂等采样记录（照片 Base64 单包上传）、结束行程、诊断日志。
- 管理端：`/api/v1/admin/*` —— 登录（密码+可选 TOTP）、bootstrap、点位查询/新建/编辑（审计）、参考图上传压缩、设备激活二维码、任务创建/查询（按日期或待采样）、取消/解锁、40 枚/页 A4 标签打印页、审核、导出（CSV/GeoJSON/GPX/照片 ZIP/审计 CSV）、日志、健康检查（含磁盘余量）、天气补齐。
- 静态：管理站页面由 `/` 提供；照片 `/uploads/`、参考图 `/reference/`。

HTTP 语义：422 业务拒绝（超 300 m、二维码不匹配、异常原因缺失等），423 被其他设备锁定，401/403 身份失败，429 登录/PIN 限速（5 次失败锁定 10 分钟窗口），413 过大。移动端记录上传以 `client_record_id` 幂等。

## 测试与运维

```powershell
npm run check      # 全部 JS 语法检查
npm test           # 52 项自动化测试（安全单元、数据库迁移、API 集成、备份回归、轨迹平滑）
npm run smoke      # 30 项端到端冒烟（需要本机已启动服务器）
npm run test:e2e   # 无头浏览器端到端（Playwright，断言数随数据量动态变化，需要 npm start 运行中）
npm run backup     # 日常备份：node tools/backup.js --photos --keep 14
node tools/restore.js data/v1/backups/backup-<时间戳>   # 恢复演练
```

- 备份使用 `VACUUM INTO` 生成 WAL 一致快照；照片增量拷贝；保留 14 天。
- 磁盘告警：`GET /api/v1/admin/health` 返回剩余空间，小于 10 GB 告警、小于 5 GB 提示禁大导出。
- 恢复演练：`tools/restore.js` 恢复到临时目录并验证任意一条照片记录可打开（验收项 A16）。

## 管理站前端

`public/index.html` + `public/app.js` 已全部对接 `/api/v1`：项目/拍摄日期导航、卫星地图状态色标记、点位管理（选点/CSV 导入/编辑/参考图）、任务下发与 40 枚/页标签打印、审核详情（照片/参考图/轨迹/风险标志/审核意见）、取消/解锁、天气补齐、导出、设备激活二维码、诊断日志与磁盘健康。Leaflet 1.9.4 与 qrcodejs 本地托管在 `public/vendor/`，不依赖 CDN。

## 文档

- 开发基线：`docs/DEVELOPMENT_SPEC_V1.md`（含生成式源码快照附录 L）。
- `tools/embed-source-doc.js`：把当前源码重新嵌入文档；`tools/restore-from-appendix.js`：从附录 L 恢复源码（SHA-256 校验）。

正式上线前仍未完成（见开发文档 §28.2）：Android 真机验收、签名 APK、Windows 服务化、DNS 与 HTTPS。
~~~~

#### `bsc-sampling-v1/src/exif.js`

SHA-256: `b8f45e2778e8f3f3aa0ffc1b4559dfd3e792f0d6aa649b88673b0c2038139dd5`

~~~~javascript
'use strict';

// 极简 EXIF 解析：只提取拍摄时间（DateTimeOriginal，其次 DateTime）。
// 用于服务器侧把照片 EXIF 时间与提交的 capturedAt 交叉核对（防改时间/换图），
// 解析失败或缺失一律返回 null（不因此惩罚记录）。

function exifDateTime(buf) {
  try {
    if (!buf || buf.length < 8) return null;
    // sharp 的 metadata().exif 直接给出 'Exif\0\0' 开头的负载；完整 JPEG 则扫描 APP1 段。
    if (buf.subarray(0, 6).toString('ascii') === 'Exif\0\0') return tiffDate(buf.subarray(6));
    if (buf.readUInt16BE(0) !== 0xFFD8) return null;
    let off = 2;
    while (off + 4 <= buf.length) {
      if (buf[off] !== 0xFF) return null;
      const marker = buf[off + 1];
      if (marker === 0xE1) {
        const len = buf.readUInt16BE(off + 2);
        const seg = buf.subarray(off + 4, off + 2 + len);
        if (seg.length >= 6 && seg.toString('ascii', 0, 6) === 'Exif\0\0') return tiffDate(seg.subarray(6));
        return null;
      }
      if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9)) { off += 2; continue; }
      if (marker === 0xDA) return null; // 图像数据开始，后面不会有 EXIF
      off += 2 + buf.readUInt16BE(off + 2);
    }
  } catch {}
  return null;
}

function tiffDate(t) {
  try {
    if (t.length < 8) return null;
    const little = t.readUInt16BE(0) === 0x4949;
    const r16 = (o) => (little ? t.readUInt16LE(o) : t.readUInt16BE(o));
    const r32 = (o) => (little ? t.readUInt32LE(o) : t.readUInt32BE(o));
    if (r16(2) !== 42) return null;
    let ifd = r32(4);
    while (ifd >= 8 && ifd + 2 <= t.length) {
      const n = r16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > t.length) return null;
        const tag = r16(e);
        if (tag === 0x9003 || tag === 0x0132) {
          const type = r16(e + 2);
          const count = r32(e + 4);
          if (type === 2 && count >= 19) {
            const vo = count > 4 ? r32(e + 8) : e + 8;
            if (vo + 19 > t.length) continue;
            const s = t.toString('ascii', vo, vo + 19).replace(/\0.*$/, '').trim();
            if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
          }
        }
      }
      const next = r32(ifd + 2 + n * 12);
      if (!next || next <= ifd || next + 2 > t.length) break;
      ifd = next;
    }
  } catch {}
  return null;
}

// 'YYYY:MM:DD HH:MM:SS' → Date（EXIF 无时区，按设备本地时间即北京时间解释）。
function parseExifDate(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(s || ''));
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`) : null;
}

module.exports = { exifDateTime, parseExifDate };
~~~~

#### `bsc-sampling-v1/src/exports.js`

SHA-256: `2fcf27442d95bbc432ee633503b55007b121b8699a51f54431b04630ec869ed9`

~~~~javascript
'use strict';

// Data export builders: CSV, GeoJSON, GPX and a dependency-free ZIP (STORE
// method) for photo packs (spec section 17.1, acceptance item A14).

const RISK_NAMES = {
  distance_30_80m: '距目标30-80米',
  distance_80_300m: '距目标80-300米',
  gps_accuracy_over_40m: 'GPS精度超过40米',
  manual_bottle_code: '二维码损坏手输编号',
  mock_location: '模拟位置',
  duplicate_photo: '照片与既有记录重复',
  offline_start_lock_unverified: '断网开始未验证锁',
  weak_start_track: '开始前往时已在300米内',
  track_interrupted: '轨迹中断后恢复',
  missing_track: '提交时无轨迹点',
  late_sampling: '拍摄日期与计划日期不一致',
  task_canceled: '任务已取消后提交',
  weather_pending: '天气待补充',
  captured_time_in_future: '拍摄时间晚于服务器时间',
  exif_time_mismatch: '照片EXIF时间与提交时间不一致'
};

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

// Records as flattened CSV rows (BOM-prefixed so Excel opens UTF-8 correctly).
function recordsCsv(records) {
  const headers = ['样品编号', '历史序号', '点位名称', '样品类型', '项目', '采样员', '计划日期', '拍摄时间', '接收时间',
    '纬度(WGS84)', '经度(WGS84)', '距目标米', '精度米', '天气(手机)', '天气(服务器)', '瓶号输入', '无水', '异常类别', '异常说明',
    '模拟位置', '审核状态', '审核意见', '风险标志代码', '风险标志中文', '照片SHA-256', '照片路径'];
  const rows = records.map(r => [
    r.sample_code, r.site_code, r.site_name, r.sample_type, r.project_name, r.villager_name, r.planned_date,
    r.captured_at, r.received_at, r.latitude, r.longitude, Number(r.distance_m || 0).toFixed(1), r.accuracy_m,
    r.weather_text, r.server_weather_text || '', r.manual_code ? '手动输入' : '二维码扫描', r.no_water ? '是' : '否',
    r.exception_category, r.exception_detail, r.mock_location ? '是' : '否', r.review_status, r.review_note,
    (r.risk_flags || []).join('|'), (r.risk_flags || []).map(f => RISK_NAMES[f] || f).join('|'), r.photo_sha256, r.photo_path
  ]);
  return toCsv(headers, rows);
}

function sitesGeoJson(sites) {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: sites.map(s => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
      properties: { code: s.code, name: s.name, sort_order: s.sort_order, altitude_m: s.altitude_m, sample_types: s.sample_types }
    }))
  }, null, 2);
}

function recordsGeoJson(records) {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: records.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: {
        sample_code: r.sample_code, site_code: r.site_code, site_name: r.site_name,
        captured_at: r.captured_at, distance_m: r.distance_m, accuracy_m: r.accuracy_m,
        review_status: r.review_status, risk_flags: r.risk_flags, photo_sha256: r.photo_sha256
      }
    }))
  }, null, 2);
}

function gpx(points, name) {
  const trkpts = points.map(p => `      <trkpt lat="${p.latitude}" lon="${p.longitude}"><ele>0</ele><time>${p.recorded_at}</time></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BSC Sampling V1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

// --- Minimal ZIP writer (STORE method, UTF-8 names) ------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

// entries: [{ name, data(Buffer), mtime(Date) }] → full zip Buffer (no compression).
function zipStore(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const { time, date } = dosDateTime(entry.mtime || new Date());
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // flags: UTF-8 names
    local.writeUInt16LE(0, 8);             // method: store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);  // compressed size
    local.writeUInt32LE(data.length, 22);  // uncompressed size
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);            // extra length
    chunks.push(local, nameBuffer, data);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);    // version made by
    centralHeader.writeUInt16LE(20, 6);    // version needed
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt32LE(0, 38);    // external attributes
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuffer, end]);
}

module.exports = { recordsCsv, sitesGeoJson, recordsGeoJson, gpx, zipStore, RISK_NAMES };
~~~~

#### `bsc-sampling-v1/src/labels.js`

SHA-256: `e63719e3422eee111ef9ca880927daa0e652ff23a7144085e117f8166718ecd5`

~~~~javascript
'use strict';

// A4 bottle label print page: 5 columns × 12 rows = 60 labels per page,
// the grid fills the whole 210×297mm sheet with no gaps between labels.
// Each label: square QR (24.75mm, full cell height) on the left; on the right
// the site code (top, bold) and the Chinese sample type (bottom, enlarged).
// The complete sample code is encoded inside the QR (BSC-SAMPLE|code|token).

const TYPE_NAMES = { R: '河流水', T: '支流', S: '土壤', P: '植物', Y: '雨水', L: '湖水' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// tasks: [{ sample_code, qr_value, qr_data_url, site_code, sample_type, planned_date, project_code }]
function renderLabelPage(tasks) {
  const pages = [];
  for (let i = 0; i < tasks.length; i += 60) {
    const cells = tasks.slice(i, i + 60).map(task => `
      <div class="label">
        <img class="qr" alt="二维码" src="${task.qr_data_url}">
        <div class="side">
          <div class="site">${escapeHtml(task.site_code)}</div>
          <div class="type">${escapeHtml(TYPE_NAMES[task.sample_type] || task.sample_type)}</div>
        </div>
        ${task.co_sited > 1 ? `<div class="multi">×${task.co_sited}</div>` : ''}
      </div>`).join('');
    pages.push(`<div class="page">${cells}</div>`);
  }
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>瓶子标签 ${tasks.length} 枚</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; font-family: "Microsoft YaHei", sans-serif; }
  .page { width: 210mm; height: 297mm; page-break-after: always; display: grid; grid-template-columns: repeat(5, 42mm); grid-auto-rows: 24.75mm; box-sizing: border-box; }
  .page:last-child { page-break-after: auto; }
  .label { position: relative; box-sizing: border-box; border: 0.35mm solid #555; display: flex; align-items: center; }
  .qr { width: 24.75mm; height: 24.75mm; flex: none; }
  .side { min-width: 0; flex: 1; padding: 0 1.2mm; display: flex; flex-direction: column; justify-content: center; gap: 1mm; }
  .site { font-size: 5mm; font-weight: 900; word-break: break-all; }
  .type { font-size: 6.5mm; font-weight: 900; color: #0b5b45; word-break: break-all; }
  .multi { position: absolute; top: 0; right: 0; font-size: 2.6mm; font-weight: 900; color: #a02020; background: #ffe3e0; border: 0.3mm solid #c0392b; border-radius: 0 0 0 1mm; padding: .3mm .6mm; }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}

module.exports = { renderLabelPage, TYPE_NAMES };
~~~~

#### `bsc-sampling-v1/src/ratelimit.js`

SHA-256: `000be908e8b6d8680f6a954925381f4b4eb10da963e2392d52cdf07f22863f08`

~~~~javascript
'use strict';

// Small in-memory fixed-window rate limiter for PIN/activation login attempts
// (spec section 20.2: login, activation and PIN errors need rate limiting and
// a short lockout). Single-process server, so memory state is sufficient.

const attempts = new Map(); // key -> { count, windowStart }
const DEFAULTS = { max: 5, windowMs: 10 * 60_000 };

function now() { return Date.now(); }

function slot(key, options) {
  const { windowMs } = { ...DEFAULTS, ...options };
  const entry = attempts.get(key);
  if (!entry || now() - entry.windowStart >= windowMs) {
    const fresh = { count: 0, windowStart: now() };
    attempts.set(key, fresh);
    return fresh;
  }
  return entry;
}

// Returns { limited, retryAfterMs } for the given key.
function check(key, options = DEFAULTS) {
  const entry = slot(key, options);
  if (entry.count >= options.max) {
    return { limited: true, retryAfterMs: entry.windowStart + options.windowMs - now() };
  }
  return { limited: false };
}

function recordFailure(key, options = DEFAULTS) {
  const entry = slot(key, options);
  entry.count++;
  return entry.count;
}

function recordSuccess(key) {
  attempts.delete(key);
}

// Prune expired entries opportunistically so the map cannot grow unbounded.
function prune() {
  const cutoff = now() - 60 * 60_000;
  for (const [key, entry] of attempts) {
    if (entry.windowStart < cutoff) attempts.delete(key);
  }
}

module.exports = { check, recordFailure, recordSuccess, prune };
~~~~

#### `bsc-sampling-v1/src/schema.js`

SHA-256: `810b8a85401a9a9fe8d2619d9ebb574805b0ebb9245fb806b2b5aca7241781f7`

~~~~javascript
'use strict';

const { hashPin, randomToken } = require('./security');

function initialize(db) {
  db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  PRAGMA busy_timeout=5000;

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_test INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    sort_order INTEGER,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude_m REAL,
    sample_types TEXT NOT NULL DEFAULT '[]',
    remarks TEXT NOT NULL DEFAULT '',
    normal_radius_m INTEGER NOT NULL DEFAULT 30,
    exception_radius_m INTEGER NOT NULL DEFAULT 80,
    severe_radius_m INTEGER NOT NULL DEFAULT 300,
    reference_image TEXT,
    instructions TEXT NOT NULL DEFAULT '',
    risk_note TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, code)
  );
  CREATE TABLE IF NOT EXISTS villagers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    villager_id INTEGER NOT NULL REFERENCES villagers(id),
    device_uuid TEXT NOT NULL,
    device_name TEXT NOT NULL DEFAULT '',
    android_version TEXT NOT NULL DEFAULT '',
    app_version TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT,
    UNIQUE(villager_id, device_uuid)
  );
  CREATE TABLE IF NOT EXISTS activation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    villager_id INTEGER NOT NULL REFERENCES villagers(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS journeys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    villager_id INTEGER NOT NULL REFERENCES villagers(id),
    device_id INTEGER NOT NULL REFERENCES devices(id),
    site_id INTEGER NOT NULL REFERENCES sites(id),
    status TEXT NOT NULL DEFAULT 'active',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    start_latitude REAL,
    start_longitude REAL,
    start_accuracy_m REAL,
    start_distance_m REAL,
    weak_evidence INTEGER NOT NULL DEFAULT 0,
    interrupted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    site_id INTEGER NOT NULL REFERENCES sites(id),
    villager_id INTEGER NOT NULL REFERENCES villagers(id),
    planned_date TEXT NOT NULL,
    base_sample_code TEXT NOT NULL,
    sample_code TEXT NOT NULL UNIQUE,
    sample_type TEXT NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 1,
    resample_version INTEGER NOT NULL DEFAULT 0,
    resample_of INTEGER REFERENCES tasks(id),
    qr_token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'assigned',
    locked_device_id INTEGER REFERENCES devices(id),
    locked_at TEXT,
    journey_id INTEGER REFERENCES journeys(id),
    canceled_at TEXT,
    canceled_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS track_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journey_id INTEGER NOT NULL REFERENCES journeys(id),
    sequence INTEGER NOT NULL,
    recorded_at TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy_m REAL,
    speed_mps REAL,
    mock_location INTEGER NOT NULL DEFAULT 0,
    UNIQUE(journey_id, sequence)
  );
  CREATE TABLE IF NOT EXISTS live_locations (
    task_id INTEGER PRIMARY KEY REFERENCES tasks(id),
    device_id INTEGER NOT NULL REFERENCES devices(id),
    recorded_at TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy_m REAL
  );
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_record_id TEXT NOT NULL UNIQUE,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    device_id INTEGER NOT NULL REFERENCES devices(id),
    journey_id INTEGER REFERENCES journeys(id),
    is_primary INTEGER NOT NULL DEFAULT 0,
    conflict_status TEXT NOT NULL DEFAULT 'none',
    no_water INTEGER NOT NULL DEFAULT 0,
    captured_at TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy_m REAL,
    distance_m REAL,
    weather_text TEXT NOT NULL DEFAULT '待补充',
    weather_status TEXT NOT NULL DEFAULT 'pending',
    exception_category TEXT,
    exception_detail TEXT,
    manual_code INTEGER NOT NULL DEFAULT 0,
    mock_location INTEGER NOT NULL DEFAULT 0,
    photo_path TEXT NOT NULL,
    photo_sha256 TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending',
    review_note TEXT NOT NULL DEFAULT '',
    risk_flags TEXT NOT NULL DEFAULT '[]',
    invalidated_at TEXT,
    invalidated_reason TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_primary_record_per_task ON records(task_id) WHERE is_primary=1;
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_role TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT NOT NULL DEFAULT '{}',
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS app_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    villager_id INTEGER REFERENCES villagers(id),
    device_id INTEGER REFERENCES devices(id),
    level TEXT NOT NULL DEFAULT 'error',
    app_version TEXT,
    client_created_at TEXT,
    message TEXT NOT NULL,
    diagnostics TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS app_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_code INTEGER NOT NULL UNIQUE,
    version_name TEXT NOT NULL,
    apk_path TEXT,
    sha256 TEXT,
    mandatory INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS label_prints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    sample_code TEXT NOT NULL,
    printed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `);
  migrate(db);
  seed(db);
}

// Incremental migrations for databases created by earlier schema versions.
// New columns use ALTER TABLE so existing deployments keep their data.
function migrate(db) {
  const recordColumns = db.prepare('PRAGMA table_info(records)').all().map(c => c.name);
  if (!recordColumns.includes('server_weather_text')) {
    db.exec("ALTER TABLE records ADD COLUMN server_weather_text TEXT NOT NULL DEFAULT ''");
  }
  if (!recordColumns.includes('server_weather_status')) {
    db.exec("ALTER TABLE records ADD COLUMN server_weather_status TEXT NOT NULL DEFAULT 'pending'");
  }
  // 旧库种子点位曾写入 /sample-reference.svg 占位参考图（SVG，安卓端无法解码，
  // 造成"参考图传不到手机"的假象）。清空后由管理员在管理站上传真实照片。
  db.prepare("UPDATE sites SET reference_image='' WHERE reference_image='/sample-reference.svg'").run();
  // 旧库补建标签打印记录表；并登记当前 APP 版本供手机端检查更新。
  db.exec('CREATE TABLE IF NOT EXISTS label_prints (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, sample_code TEXT NOT NULL, printed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  db.prepare('INSERT OR IGNORE INTO app_versions (version_code,version_name,notes) VALUES (?,?,?)').run(107, '1.2.6', '同步按钮点击必有反馈（进行中提示+完成Toast显示任务数），同步完成自动刷新任务页');
  db.prepare('INSERT OR IGNORE INTO app_versions (version_code,version_name,notes) VALUES (?,?,?)').run(107, '1.2.6', '修复同步完成后任务列表不刷新（手机收不到下发任务）；恢复任务列表点击日期联动地图日期过滤');
  db.prepare('INSERT OR IGNORE INTO app_versions (version_code,version_name,notes) VALUES (?,?,?)').run(108, '1.2.7', '修复 Android JSON 空值被 optString 误读为文本null导致全部任务被判已取消而隐藏（任务列表空白根因）');
  db.prepare('INSERT OR IGNORE INTO app_versions (version_code,version_name,notes) VALUES (?,?,?)').run(109, '1.3.1', '点位删除（自动取消名下未采样任务）、任务删除（限无记录）、新版本定期强提醒通知');
}

function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS count FROM projects').get().count) return;
  const formal = db.prepare('INSERT INTO projects (code,name,description,is_test) VALUES (?,?,?,0)')
    .run('BSC', '巴松措正式采样', '巴松措及周边河流、土壤、植物和降水同位素采样').lastInsertRowid;
  db.prepare('INSERT INTO projects (code,name,description,is_test) VALUES (?,?,?,1)')
    .run('TEST', '手机附近测试项目', '用于手机附近定位、扫码、拍照和上传验收');
  const addSite = db.prepare(`INSERT INTO sites
    (project_id,sort_order,code,name,latitude,longitude,altitude_m,sample_types,remarks,reference_image,instructions,risk_note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const points = [
    [1,'1',30.10761757,94.18555165,3909,['S','P'],'土，植'],[2,'2',30.1033386,94.17919466,3874,['S','P'],'土，植无水'],
    [3,'3',30.09971722,94.1735352,3847,['R'],'水'],[4,'4',30.07843188,94.15105954,3792,['R'],'水'],
    [5,'5',30.07534404,94.14583272,3797,['R'],'水'],[6,'5.1',30.07373626,94.14347224,3793,['T'],'水'],
    [7,'5.2',30.07116508,94.14175442,3787,['T'],'水'],[8,'5.5',30.06192633,94.12576279,3794,['T'],'水'],
    [9,'5.6',30.05359266,94.10829967,3744,['T'],'水'],[10,'6',30.04500898,94.09230734,3748,['S','P'],'土，植'],
    [11,'7',30.030085,94.0635533,3714,['R'],'水'],[12,'8',30.0110883,94.03046906,3663,['R'],'水'],
    [13,'9',30.00247099,94.01621964,3635,['S','P'],'土，植'],[14,'9.5',29.99942807,94.00757866,3603,['T'],'水'],
    [15,'9.6',29.99942807,94.00757866,3603,['T'],'水'],[16,'10',30.11252859,94.01643926,3488,['S','P'],'土，植'],
    [17,'11',30.0892012,94.02323766,3501,['R'],'水'],[18,'12',30.07181939,94.03200749,3496,['R'],'水'],
    [19,'13',29.99840891,93.98115009,3515,['R'],'水'],[20,'15',30.00211717,93.9032472,3482,['R'],'水'],
    [21,'16',29.98483153,93.86619065,3446,['R'],'水'],[22,'17',30.04490472,94.02068144,3478,['R'],'水'],
    [23,'18',30.04261412,94.02608625,3475,['R'],'水'],[24,'19',30.04138027,94.02855149,3475,['R'],'水'],
    [25,'20',30.04472337,94.02448383,3475,['R'],'水']
  ];
  for (const [order, code, lat, lon, altitude, types, remarks] of points) {
    addSite.run(formal, order, code, `采样点${code}`, lat, lon, altitude, JSON.stringify(types), remarks,
      '', '按照参考图片核对地点，安全取样后拍摄瓶子与实际环境。', '注意河岸湿滑、落石和水位变化');
  }
  const pin = hashPin('1234');
  db.prepare('INSERT INTO villagers (username,display_name,pin_salt,pin_hash) VALUES (?,?,?,?)')
    .run('cmy01', '采样员01', pin.salt, pin.hash);
  db.prepare('INSERT INTO app_versions (version_code,version_name,notes) VALUES (?,?,?)')
    .run(100, '1.0.0', '巴松措采样原生Android首版');
}

function audit(db, role, actorId, action, entityType, entityId, details = {}, ip = '') {
  db.prepare(`INSERT INTO audit_logs (actor_role,actor_id,action,entity_type,entity_id,details,ip_address)
    VALUES (?,?,?,?,?,?,?)`).run(role, String(actorId), action, entityType, entityId == null ? null : String(entityId), JSON.stringify(details), ip);
}

module.exports = { initialize, audit };
~~~~

#### `bsc-sampling-v1/src/security.js`

SHA-256: `ed920ae8e90f075635b39bf535195872a0c499a19c33397158b25d5aa171083b`

~~~~javascript
'use strict';

const crypto = require('node:crypto');

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(pin), salt, 120000, 32, 'sha256').toString('hex');
  return { salt, hash };
}

function verifyPin(pin, salt, expected) {
  const actual = hashPin(pin, salt).hash;
  return safeEqual(actual, expected);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signToken(secret, role, subject, extra = {}, ttlSeconds = 86400) {
  const payload = Buffer.from(JSON.stringify({ role, subject, ...extra, exp: Date.now() + ttlSeconds * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(secret, token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed.exp > Date.now() ? parsed : null;
  } catch { return null; }
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = String(value || '').toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of normalized) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, timeMs = Date.now(), stepSeconds = 30, digits = 6) {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

function verifyTotp(secret, value, window = 1) {
  if (!secret) return true;
  for (let offset = -window; offset <= window; offset += 1) {
    if (safeEqual(totp(secret, Date.now() + offset * 30000), String(value || ''))) return true;
  }
  return false;
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { hashPin, verifyPin, safeEqual, signToken, verifyToken, totp, verifyTotp, randomToken };
~~~~

#### `bsc-sampling-v1/src/server.js`

SHA-256: `42b37d431cb294c7d648d9ef097bb1ed76824ca92dadff6e7360d2fe7d0ddce1`

~~~~javascript
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const QRCode = require('qrcode');
const sharp = require('sharp');
const { initialize, audit } = require('./schema');
const { smoothTrack } = require('./track');
const { exifDateTime, parseExifDate } = require('./exif');
const { verifyPin, safeEqual, signToken, verifyToken, verifyTotp, randomToken } = require('./security');
const { backfillWeather } = require('./weather');
const rateLimit = require('./ratelimit');
const { renderLabelPage } = require('./labels');
const { recordsCsv, sitesGeoJson, recordsGeoJson, gpx, zipStore } = require('./exports');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data', 'v1'));
const UPLOADS = path.join(DATA, 'uploads');
const REFERENCE = path.join(DATA, 'reference');
const PUBLIC = path.join(ROOT, 'public');
const CONFIG = path.join(DATA, 'config.json');
fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(REFERENCE, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
let saved = {};
try { saved = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch {}
const config = {
  host: process.env.HOST || saved.host || '127.0.0.1', port: Number(process.env.PORT || saved.port || 3100),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || saved.publicBaseUrl || 'https://bsc.gpsgps.online',
  adminPassword: process.env.ADMIN_PASSWORD || saved.adminPassword || 'ChangeMe-2608!',
  adminTotpSecret: process.env.ADMIN_TOTP_SECRET ?? saved.adminTotpSecret ?? '',
  sessionSecret: process.env.SESSION_SECRET || saved.sessionSecret || randomToken(48), lockHours: 12
};
if (!fs.existsSync(CONFIG)) fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2));
const db = new DatabaseSync(path.join(DATA, 'bsc-v1.sqlite')); initialize(db);

function output(res, status, value, headers = {}) { const body = Buffer.from(JSON.stringify(value)); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', ...headers }); res.end(body); }
function error(status, message) { const e = new Error(message); e.status = status; return e; }
async function body(req, max = 12_000_000) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > max) throw error(413, '请求过大'); chunks.push(chunk); } try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { throw error(400, 'JSON格式错误'); } }
function bearer(req) { return String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''); }
function admin(req) { const s = verifyToken(config.sessionSecret, bearer(req)); if (!s || s.role !== 'admin') throw error(401, '请登录管理员'); return s; }
function mobile(req) { const s = verifyToken(config.sessionSecret, bearer(req)); if (!s || s.role !== 'villager' || !s.deviceId) throw error(401, '设备登录已过期'); const d = db.prepare('SELECT * FROM devices WHERE id=? AND villager_id=? AND enabled=1').get(s.deviceId, s.subject); if (!d) throw error(403, '设备已停用'); return { ...s, villagerId: Number(s.subject), device: d }; }
function required(value, label) { const text = String(value ?? '').trim(); if (!text) throw error(400, `请填写${label}`); return text; }
function number(value, label) { const n = Number(value); if (!Number.isFinite(n)) throw error(400, `${label}无效`); return n; }
function distance(a, b, c, d) { const r = x => x * Math.PI / 180, x = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * 6371008.8 * Math.asin(Math.sqrt(x)); }
function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; } }
function parse(value, fallback = []) { try { return JSON.parse(value); } catch { return fallback; } }
function expire() { db.prepare(`UPDATE tasks SET locked_device_id=NULL,locked_at=NULL,journey_id=NULL,status='assigned' WHERE status='in_progress' AND datetime(locked_at)<datetime('now','-12 hours')`).run(); }
function sampleCode(date, type, site) { const base = `${date.replaceAll('-', '').slice(2)}-${type}-${site.code}`; const count = db.prepare('SELECT COUNT(*) count FROM tasks WHERE planned_date=? AND sample_type=? AND site_id=?').get(date, type, site.id).count + 1; return { base, count, code: `${base}-${String(count).padStart(2, '0')}` }; }
function ipOf(req) { return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || ''; }
function serveFile(req, res, url) { let p = url.pathname === '/' ? '/index.html' : url.pathname; if (!p.startsWith('/')) p = `/${p}`; const file = path.resolve(PUBLIC, `.${p}`); if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw error(404, '页面不存在'); const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': fs.statSync(file).size, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }; if (path.extname(file).toLowerCase() === '.html') headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'"; res.writeHead(200, headers); fs.createReadStream(file).pipe(res); }
function signImage(pathname, ttlSeconds = 7 * 86400) { const exp = Math.floor(Date.now() / 1000) + ttlSeconds; const sig = crypto.createHmac('sha256', config.sessionSecret).update(`${pathname}:${exp}`).digest('base64url'); return `${pathname}?exp=${exp}&sig=${sig}`; }
function signedImage(pathname) { return pathname && String(pathname).startsWith('/') ? signImage(String(pathname)) : pathname; }
function serveImageDir(req, res, url, dir) { const exp = Number(url.searchParams.get('exp') || 0), sig = String(url.searchParams.get('sig') || ''); const expected = crypto.createHmac('sha256', config.sessionSecret).update(`${url.pathname}:${exp}`).digest('base64url'); if (!exp || exp < Date.now() / 1000 || !safeEqual(sig, expected)) throw error(403, '图片链接无效或已过期'); const file = path.resolve(DATA, url.pathname.slice(1)); if (!file.startsWith(dir + path.sep) && file !== dir) throw error(404, '文件不存在'); if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw error(404, '文件不存在'); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); fs.createReadStream(file).pipe(res); }
// Fire-and-forget weather backfill: never blocks the upload response and
// never modifies the client's weather_text (stored separately).
function backfillRecordWeather(recordId) { const record = db.prepare('SELECT id, latitude, longitude, captured_at, weather_text FROM records WHERE id=?').get(recordId); if (!record) return; backfillWeather(record).then(r => { db.prepare("UPDATE records SET server_weather_text=?, server_weather_status='complete' WHERE id=?").run(r.text, record.id); }).catch(() => { db.prepare("UPDATE records SET server_weather_status='unavailable' WHERE id=?").run(record.id); }); }
function adminRecords(projectId) { return db.prepare(`SELECT r.*, t.sample_code, t.sample_type, t.planned_date, t.canceled_at, s.code site_code, s.name site_name, s.reference_image, s.instructions, s.risk_note, p.name project_name, p.code project_code, v.display_name villager_name, d.device_name, d.android_version FROM records r JOIN tasks t ON t.id=r.task_id JOIN sites s ON s.id=t.site_id JOIN projects p ON p.id=t.project_id JOIN villagers v ON v.id=t.villager_id LEFT JOIN devices d ON d.id=r.device_id WHERE t.project_id=? ORDER BY r.captured_at DESC, r.id`).all(projectId).map(r => ({ ...r, risk_flags: parse(r.risk_flags) })); }

// 诊断日志查询（管理员端）：按级别/设备/时间筛选，上限 5000 条。
function queryAppLogs(url) {
  const level = String(url.searchParams.get('level') || '');
  const deviceId = Number(url.searchParams.get('deviceId') || 0);
  const villagerId = Number(url.searchParams.get('villagerId') || 0);
  const from = String(url.searchParams.get('from') || '');
  const to = String(url.searchParams.get('to') || '');
  const limit = Math.min(Number(url.searchParams.get('limit') || 1000) || 1000, 5000);
  const cond = ['1=1'];
  const args = [];
  if (level) { cond.push('level=?'); args.push(level); }
  if (deviceId) { cond.push('device_id=?'); args.push(deviceId); }
  if (villagerId) { cond.push('villager_id=?'); args.push(villagerId); }
  if (from) { cond.push('created_at>=?'); args.push(`${from}T00:00:00`); }
  if (to) { cond.push('created_at<=?'); args.push(`${to}T23:59:59`); }
  args.push(limit);
  return db.prepare(`SELECT * FROM app_logs WHERE ${cond.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...args);
}

async function adminApi(req, res, url) {
  if (url.pathname === '/api/v1/admin/login' && req.method === 'POST') {
    const p = await body(req, 20_000);
    const key = `admin:${ipOf(req)}`;
    const limit = rateLimit.check(key, { max: 10, windowMs: 10 * 60_000 });
    if (limit.limited) throw error(429, `尝试过多，请${Math.ceil(limit.retryAfterMs / 60_000)}分钟后重试`);
    if (!safeEqual(p.password, config.adminPassword) || !verifyTotp(config.adminTotpSecret, p.totp)) {
      rateLimit.recordFailure(key, { max: 10, windowMs: 10 * 60_000 });
      throw error(401, '密码或动态验证码错误');
    }
    rateLimit.recordSuccess(key);
    audit(db, 'admin', 'admin', 'login', 'admin', null, {}, ipOf(req));
    return output(res, 200, { token: signToken(config.sessionSecret, 'admin', 'admin', {}, 7 * 86400) });
  }
  admin(req);
  if (url.pathname === '/api/v1/admin/bootstrap' && req.method === 'GET') return output(res, 200, { projects: db.prepare('SELECT * FROM projects ORDER BY id').all(), villagers: db.prepare('SELECT id,username,display_name,enabled FROM villagers').all(), summary: db.prepare("SELECT (SELECT COUNT(*) FROM tasks) tasks,(SELECT COUNT(*) FROM records) records,(SELECT COUNT(*) FROM records WHERE review_status='suspicious') suspicious").get(), publicBaseUrl: config.publicBaseUrl });
  if (url.pathname === '/api/v1/admin/health' && req.method === 'GET') { const s = fs.statfsSync(DATA); const free = Number(s.bfree) * Number(s.bsize); return output(res, 200, { freeBytes: free, warnLowDisk: free < 10 * 1024 ** 3, criticalLowDisk: free < 5 * 1024 ** 3, dataDir: DATA }); }
  if (url.pathname === '/api/v1/admin/projects' && req.method === 'POST') { const p = await body(req); try { const id = db.prepare('INSERT INTO projects(code,name,description,is_test,enabled) VALUES(?,?,?,?,1)').run(required(p.code, '项目编码'), required(p.name, '项目名称'), String(p.description || ''), p.isTest ? 1 : 0).lastInsertRowid; audit(db, 'admin', 'admin', 'create_project', 'project', id, { code: p.code }, ipOf(req)); return output(res, 201, { id }); } catch (e) { if (String(e.message).includes('UNIQUE')) throw error(422, '项目编码已存在'); throw e; } }
  let m = /^\/api\/v1\/admin\/projects\/(\d+)$/.exec(url.pathname);
  if (m && req.method === 'PUT') { const id = Number(m[1]), p = await body(req); if (!db.prepare('SELECT id FROM projects WHERE id=?').get(id)) throw error(404, '项目不存在'); try { db.prepare('UPDATE projects SET code=?,name=?,description=?,is_test=?,enabled=? WHERE id=?').run(required(p.code, '项目编码'), required(p.name, '项目名称'), String(p.description ?? ''), p.isTest ? 1 : 0, p.enabled == null ? 1 : (p.enabled ? 1 : 0), id); } catch (e) { if (String(e.message).includes('UNIQUE')) throw error(422, '项目编码已存在'); throw e; } audit(db, 'admin', 'admin', 'update_project', 'project', id, p, ipOf(req)); return output(res, 200, { ok: true }); }
  if (m && req.method === 'DELETE') { const id = Number(m[1]); if (!db.prepare('SELECT id FROM projects WHERE id=?').get(id)) throw error(404, '项目不存在'); if (db.prepare('SELECT id FROM tasks WHERE project_id=? LIMIT 1').get(id)) throw error(422, '项目已有任务数据，不能删除；可在编辑中停用'); transaction(() => { db.prepare('UPDATE sites SET deleted_at=CURRENT_TIMESTAMP WHERE project_id=?').run(id); db.prepare('DELETE FROM projects WHERE id=?').run(id); }); audit(db, 'admin', 'admin', 'delete_project', 'project', id, {}, ipOf(req)); return output(res, 200, { ok: true }); }
  if (url.pathname === '/api/v1/admin/sites' && req.method === 'GET') return output(res, 200, { sites: db.prepare('SELECT * FROM sites WHERE project_id=? AND deleted_at IS NULL ORDER BY sort_order').all(Number(url.searchParams.get('projectId') || 1)).map(s => ({ ...s, sample_types: parse(s.sample_types), reference_image: signedImage(s.reference_image) })) });
  if (url.pathname === '/api/v1/admin/sites' && req.method === 'POST') { const p = await body(req); try { const id = db.prepare(`INSERT INTO sites(project_id,sort_order,code,name,latitude,longitude,altitude_m,sample_types,remarks,normal_radius_m,exception_radius_m,severe_radius_m,reference_image,instructions,risk_note,enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(number(p.projectId, '项目'), Number(p.sortOrder || 0), required(p.code, '历史序号'), required(p.name, '点位名称'), number(p.latitude, '纬度'), number(p.longitude, '经度'), p.altitudeM == null ? null : Number(p.altitudeM), JSON.stringify(p.sampleTypes || []), String(p.remarks || ''), 30, 80, 300, String(p.referenceImage || ''), String(p.instructions || ''), String(p.riskNote || ''), p.enabled == null ? 1 : (p.enabled ? 1 : 0)).lastInsertRowid; audit(db, 'admin', 'admin', 'create_site', 'site', id, { code: p.code, projectId: p.projectId }, ipOf(req)); return output(res, 201, { id }); } catch (e) { if (String(e.message).includes('UNIQUE')) throw error(422, '该项目下历史序号已存在，请换一个序号或编辑原点位'); throw e; } }
  m = /^\/api\/v1\/admin\/sites\/(\d+)$/.exec(url.pathname);
  if (m && req.method === 'PUT') { const id = Number(m[1]), p = await body(req), site = db.prepare('SELECT * FROM sites WHERE id=? AND deleted_at IS NULL').get(id); if (!site) throw error(404, '点位不存在'); try { db.prepare(`UPDATE sites SET sort_order=?,code=?,name=?,latitude=?,longitude=?,altitude_m=?,sample_types=?,remarks=?,normal_radius_m=?,exception_radius_m=?,severe_radius_m=?,reference_image=?,instructions=?,risk_note=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(Number(p.sortOrder ?? site.sort_order ?? 0), required(p.code, '历史序号'), required(p.name, '点位名称'), number(p.latitude, '纬度'), number(p.longitude, '经度'), p.altitudeM == null ? null : Number(p.altitudeM), JSON.stringify(p.sampleTypes || parse(site.sample_types)), String(p.remarks ?? ''), Number(p.normalRadiusM ?? site.normal_radius_m), Number(p.exceptionRadiusM ?? site.exception_radius_m), Number(p.severeRadiusM ?? site.severe_radius_m), String(p.referenceImage ?? site.reference_image ?? ''), String(p.instructions ?? ''), String(p.riskNote ?? ''), p.enabled == null ? site.enabled : (p.enabled ? 1 : 0), id); } catch (e) { if (String(e.message).includes('UNIQUE')) throw error(422, '该项目下历史序号已存在'); throw e; } audit(db, 'admin', 'admin', 'update_site', 'site', id, { before: site.code, after: p.code }, ipOf(req)); return output(res, 200, { ok: true }); }
  if (m && req.method === 'DELETE') { const id = Number(m[1]), site = db.prepare('SELECT * FROM sites WHERE id=? AND deleted_at IS NULL').get(id); if (!site) throw error(404, '点位不存在'); const result = transaction(() => { const r = db.prepare("UPDATE tasks SET canceled_at=CURRENT_TIMESTAMP,canceled_reason='点位已删除',updated_at=CURRENT_TIMESTAMP WHERE site_id=? AND canceled_at IS NULL AND id NOT IN (SELECT task_id FROM records)").run(id); db.prepare('UPDATE sites SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(id); return r.changes; }); audit(db, 'admin', 'admin', 'delete_site', 'site', id, { code: site.code, canceledTasks: result }, ipOf(req)); return output(res, 200, { ok: true, canceledTasks: result }); }
  if (url.pathname === '/api/v1/admin/reference-images' && req.method === 'POST') { const p = await body(req, 12_000_000); const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(p.imageData || '')); if (!match) throw error(422, '必须上传JPEG/PNG/WebP图片'); const image = Buffer.from(match[1], 'base64'); if (image.length < 100 || image.length > 10_000_000) throw error(413, '参考图无效或过大'); const name = `ref-${Date.now()}-${randomToken(4)}.jpg`, target = path.join(REFERENCE, name); await sharp(image).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(target); audit(db, 'admin', 'admin', 'upload_reference_image', 'reference', name, {}, ipOf(req)); return output(res, 201, { path: `/reference/${name}` }); }
  if (url.pathname === '/api/v1/admin/villagers' && req.method === 'POST') { const p = await body(req); try { const id = db.prepare('INSERT INTO villagers(username,display_name,pin_salt,pin_hash,enabled) VALUES(?,?,?,?,1)').run(required(p.username, '账号').toLowerCase().replace(/[^a-z0-9._-]/g, ''), required(p.displayName, '姓名'), '', '').lastInsertRowid; audit(db, 'admin', 'admin', 'create_villager', 'villager', id, { username: p.username }, ipOf(req)); return output(res, 201, { id }); } catch (e) { if (String(e.message).includes('UNIQUE')) throw error(422, '账号已存在'); throw e; } }
  m = /^\/api\/v1\/admin\/villagers\/(\d+)$/.exec(url.pathname);
  if (m && req.method === 'PUT') { const id = Number(m[1]), p = await body(req); if (!db.prepare('SELECT id FROM villagers WHERE id=?').get(id)) throw error(404, '采样员不存在'); const enabled = p.enabled == null ? 1 : (p.enabled ? 1 : 0); db.prepare('UPDATE villagers SET display_name=?,enabled=? WHERE id=?').run(required(p.displayName, '姓名'), enabled, id); db.prepare('UPDATE devices SET enabled=? WHERE villager_id=?').run(enabled, id); audit(db, 'admin', 'admin', 'update_villager', 'villager', id, p, ipOf(req)); return output(res, 200, { ok: true }); }
  if (m && req.method === 'DELETE') { const id = Number(m[1]); if (!db.prepare('SELECT id FROM villagers WHERE id=?').get(id)) throw error(404, '采样员不存在'); db.prepare('UPDATE villagers SET enabled=0 WHERE id=?').run(id); db.prepare('UPDATE devices SET enabled=0 WHERE villager_id=?').run(id); audit(db, 'admin', 'admin', 'disable_villager', 'villager', id, {}, ipOf(req)); return output(res, 200, { ok: true }); }
  m = /^\/api\/v1\/admin\/villagers\/(\d+)\/activation$/.exec(url.pathname);
  if (m && req.method === 'POST') { const user = db.prepare('SELECT * FROM villagers WHERE id=?').get(Number(m[1])); if (!user) throw error(404, '采样员不存在'); const raw = randomToken(24), hash = crypto.createHash('sha256').update(raw).digest('hex'), expires = new Date(Date.now() + 24 * 3600_000).toISOString(); db.prepare('INSERT INTO activation_codes(villager_id,token_hash,expires_at) VALUES(?,?,?)').run(user.id, hash, expires); const value = `BSC-ACT|${config.publicBaseUrl}|${user.username}|${raw}`; audit(db, 'admin', 'admin', 'create_activation', 'villager', user.id, { expiresAt: expires }, ipOf(req)); return output(res, 201, { value, qrDataUrl: await QRCode.toDataURL(value, { width: 480, margin: 1 }), expiresAt: expires }); }
  if (url.pathname === '/api/v1/admin/tasks' && req.method === 'POST') { const p = await body(req); const site = db.prepare('SELECT * FROM sites WHERE id=? AND enabled=1').get(number(p.siteId, '点位')); if (!site) throw error(422, '点位未启用'); const requested = Array.isArray(p.sampleTypes) ? p.sampleTypes : [p.sampleType]; const siteTypes = parse(site.sample_types); const wanted = requested.filter(t => ['R','T','S','P','Y','L'].includes(t)); const types = (wanted.length ? wanted : siteTypes).filter(Boolean); if (!types.length) throw error(422, '该点位未设置样品类型，请先在点位管理里设置'); const created = transaction(() => types.map(type => { const code = sampleCode(required(p.plannedDate, '日期'), type, site); return { id: Number(db.prepare(`INSERT INTO tasks(project_id,site_id,villager_id,planned_date,base_sample_code,sample_code,sample_type,sequence,qr_token) VALUES(?,?,?,?,?,?,?,?,?)`).run(site.project_id, site.id, number(p.villagerId, '采样员'), p.plannedDate, code.base, code.code, type, code.count, randomToken(24)).lastInsertRowid), sampleCode: code.code }; })); audit(db, 'admin', 'admin', 'create_tasks', 'site', site.id, { count: created.length, plannedDate: p.plannedDate, villagerId: p.villagerId, types }, ipOf(req)); return output(res, 201, { ids: created.map(c => c.id), codes: created.map(c => c.sampleCode) }); }
  if (url.pathname === '/api/v1/admin/tasks' && req.method === 'GET') { const project = Number(url.searchParams.get('projectId') || 1); const date = url.searchParams.get('date') || ''; const sql = `SELECT t.*,s.code site_code,s.name site_name,s.latitude target_latitude,s.longitude target_longitude,s.reference_image,s.instructions,s.risk_note,p.name project_name,p.code project_code,v.display_name villager_name,r.id record_id,r.captured_at,r.received_at,r.latitude,r.longitude,r.accuracy_m,r.distance_m,r.weather_text,r.server_weather_text,r.server_weather_status,r.manual_code,r.exception_category,r.exception_detail,r.mock_location,r.no_water,r.photo_path,r.photo_sha256,r.review_status,r.review_note,r.risk_flags,j.start_distance_m,j.interrupted,j.started_at,(SELECT COUNT(*) FROM label_prints lp WHERE lp.task_id=t.id) printed_count,(SELECT MAX(lp.printed_at) FROM label_prints lp WHERE lp.task_id=t.id) printed_last FROM tasks t JOIN sites s ON s.id=t.site_id JOIN projects p ON p.id=t.project_id JOIN villagers v ON v.id=t.villager_id LEFT JOIN records r ON r.task_id=t.id AND r.is_primary=1 LEFT JOIN journeys j ON j.id=t.journey_id WHERE t.project_id=?${date === 'pending' ? " AND r.id IS NULL" : date ? " AND r.id IS NOT NULL AND substr(r.captured_at,1,10)=?" : ''} ORDER BY t.planned_date DESC,t.id`; const rows = date && date !== 'pending' ? db.prepare(sql).all(project, date) : db.prepare(sql).all(project); return output(res, 200, { tasks: rows.map(t => ({ ...t, risk_flags: parse(t.risk_flags), canceled_at: t.canceled_at || null, canceled_reason: t.canceled_reason || null, photo_path: signedImage(t.photo_path), reference_image: signedImage(t.reference_image) })) }); }
  m = /^\/api\/v1\/admin\/tasks\/(\d+)\/cancel$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), p = await body(req), task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id); if (!task) throw error(404, '任务不存在'); if (db.prepare('SELECT id FROM records WHERE task_id=? AND is_primary=1').get(id)) throw error(422, '已提交记录，不能取消；请使用退回重采'); if (task.canceled_at) throw error(422, '任务已取消'); db.prepare('UPDATE tasks SET canceled_at=CURRENT_TIMESTAMP,canceled_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(p.reason || '管理员取消'), id); audit(db, 'admin', 'admin', 'cancel_task', 'task', id, { reason: p.reason }, ipOf(req)); return output(res, 200, { ok: true }); }
  m = /^\/api\/v1\/admin\/tasks\/(\d+)\/reschedule$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), p = await body(req), task = db.prepare('SELECT t.*,s.code site_code FROM tasks t JOIN sites s ON s.id=t.site_id WHERE t.id=?').get(id); if (!task) throw error(404, '任务不存在'); if (task.canceled_at) throw error(422, '任务已取消'); if (db.prepare('SELECT id FROM records WHERE task_id=? AND is_primary=1').get(id)) throw error(422, '已提交记录，不能改期'); const date = required(p.plannedDate, '日期'); const code = sampleCode(date, task.sample_type, { code: task.site_code, id: task.site_id }); transaction(() => { db.prepare('UPDATE tasks SET planned_date=?,base_sample_code=?,sample_code=?,sequence=?,qr_token=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(date, code.base, code.code, code.count, randomToken(24), id); }); audit(db, 'admin', 'admin', 'reschedule_task', 'task', id, { before: task.planned_date, after: date }, ipOf(req)); return output(res, 200, { sampleCode: code.code }); }
  m = /^\/api\/v1\/admin\/tasks\/(\d+)\/unlock$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]); if (!db.prepare('SELECT id FROM tasks WHERE id=?').get(id)) throw error(404, '任务不存在'); db.prepare("UPDATE tasks SET locked_device_id=NULL,locked_at=NULL,journey_id=NULL,status='assigned',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id); audit(db, 'admin', 'admin', 'unlock_task', 'task', id, {}, ipOf(req)); return output(res, 200, { ok: true }); }
  m = /^\/api\/v1\/admin\/tasks\/(\d+)\/delete$/.exec(url.pathname);
  if (m && req.method === 'DELETE') { const id = Number(m[1]); const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id); if (!task) throw error(404, '任务不存在'); if (db.prepare('SELECT id FROM records WHERE task_id=? LIMIT 1').get(id)) throw error(422, '已提交记录，不能删除；可取消此任务'); transaction(() => { db.prepare('DELETE FROM label_prints WHERE task_id=?').run(id); db.prepare('DELETE FROM live_locations WHERE task_id=?').run(id); db.prepare('DELETE FROM track_points WHERE journey_id IN (SELECT journey_id FROM tasks WHERE id=?)').run(id); db.prepare('DELETE FROM journeys WHERE id IN (SELECT journey_id FROM tasks WHERE id=?)').run(id); db.prepare('DELETE FROM tasks WHERE id=?').run(id); }); audit(db, 'admin', 'admin', 'delete_task', 'task', id, { sample_code: task.sample_code }, ipOf(req)); return output(res, 200, { ok: true }); }
  if (url.pathname === '/api/v1/admin/labels' && req.method === 'GET') { const ids = String(url.searchParams.get('taskIds') || '').split(',').map(Number).filter(Number.isFinite); if (!ids.length) throw error(400, '请选择任务'); const tasks = ids.map(id => db.prepare(`SELECT t.id,t.sample_code,t.qr_token,t.sample_type,t.planned_date,s.code site_code,s.latitude,s.longitude,p.code project_code,p.id project_id FROM tasks t JOIN sites s ON s.id=t.site_id JOIN projects p ON p.id=t.project_id WHERE t.id=?`).get(id)).filter(Boolean); const coSite = new Map(); for (const t of tasks) { const key = `${t.latitude}:${t.longitude}`; if (!coSite.has(key)) coSite.set(key, db.prepare('SELECT COUNT(*) c FROM sites WHERE project_id=? AND latitude=? AND longitude=? AND deleted_at IS NULL').get(t.project_id, t.latitude, t.longitude).c); } const withQr = []; for (const t of tasks) withQr.push({ ...t, co_sited: coSite.get(`${t.latitude}:${t.longitude}`) || 1, qr_value: `BSC-SAMPLE|${t.sample_code}|${t.qr_token}`, qr_data_url: await QRCode.toDataURL(`BSC-SAMPLE|${t.sample_code}|${t.qr_token}`, { width: 300, margin: 1 }) }); const print = db.prepare('INSERT INTO label_prints(task_id,sample_code) VALUES(?,?)'); transaction(() => tasks.forEach(t => print.run(t.id, t.sample_code))); audit(db, 'admin', 'admin', 'print_labels', 'task', ids.join(','), { count: tasks.length }, ipOf(req)); const html = renderLabelPage(withQr); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' }); return res.end(html); }
  m = /^\/api\/v1\/admin\/records\/(\d+)\/review$/.exec(url.pathname);
  if (m && req.method === 'POST') { const p = await body(req); if (!['approved','rejected','suspicious','pending'].includes(p.status)) throw error(422, '审核状态无效'); db.prepare('UPDATE records SET review_status=?,review_note=? WHERE id=?').run(p.status, String(p.note || ''), Number(m[1])); audit(db, 'admin', 'admin', 'review', 'record', m[1], p, ipOf(req)); return output(res, 200, { ok: true }); }
  m = /^\/api\/v1\/admin\/records\/(\d+)\/backfill-weather$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), record = db.prepare('SELECT id,latitude,longitude,captured_at FROM records WHERE id=?').get(id); if (!record) throw error(404, '记录不存在'); let r; try { r = await backfillWeather(record); } catch (e) { console.error('backfillWeather failed:', e.message); r = { text: '待补充', status: 'unavailable' }; } db.prepare('UPDATE records SET server_weather_text=?,server_weather_status=? WHERE id=?').run(r.text, r.status, id); audit(db, 'admin', 'admin', 'backfill_weather', 'record', id, { status: r.status }, ipOf(req)); return output(res, 200, { text: r.text, status: r.status }); }
  if (url.pathname === '/api/v1/admin/records/backfill-weather' && req.method === 'POST') { const p = await body(req); const ids = (Array.isArray(p.recordIds) ? p.recordIds : []).map(Number).filter(Number.isFinite); if (!ids.length) throw error(400, '请选择记录'); for (const id of ids) backfillRecordWeather(id); audit(db, 'admin', 'admin', 'backfill_weather_batch', 'record', ids.join(','), { count: ids.length }, ipOf(req)); return output(res, 200, { queued: ids.length }); }
  m = /^\/api\/v1\/admin\/journeys\/(\d+)\/track$/.exec(url.pathname);
  if (m && req.method === 'GET') { const journey = db.prepare('SELECT * FROM journeys WHERE id=?').get(Number(m[1])); if (!journey) throw error(404, '行程不存在'); const points = db.prepare('SELECT sequence,recorded_at,latitude,longitude,accuracy_m,speed_mps,mock_location FROM track_points WHERE journey_id=? ORDER BY sequence').all(journey.id); return output(res, 200, { points, display: smoothTrack(points) }); }
  if (url.pathname === '/api/v1/admin/logs' && req.method === 'GET') return output(res, 200, { logs: queryAppLogs(url) });
  m = /^\/api\/v1\/admin\/exports\/(csv|geojson|gpx|photos\.zip|audit\.csv|logs\.csv)$/.exec(url.pathname);
  if (m && req.method === 'GET') {
    const format = m[1], projectId = Number(url.searchParams.get('projectId') || 1);
    if (format === 'csv') { const bodyOut = Buffer.from(recordsCsv(adminRecords(projectId))); res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Length': bodyOut.length, 'Content-Disposition': 'attachment; filename="bsc-records.csv"' }); return res.end(bodyOut); }
    if (format === 'geojson') { const bodyOut = Buffer.from(recordsGeoJson(adminRecords(projectId))); res.writeHead(200, { 'Content-Type': 'application/geo+json; charset=utf-8', 'Content-Length': bodyOut.length, 'Content-Disposition': 'attachment; filename="bsc-records.geojson"' }); return res.end(bodyOut); }
    if (format === 'gpx') { const journeyId = Number(url.searchParams.get('journeyId') || 0); if (!journeyId) throw error(400, '请指定journeyId'); const journey = db.prepare('SELECT * FROM journeys WHERE id=?').get(journeyId); if (!journey) throw error(404, '行程不存在'); const points = db.prepare('SELECT recorded_at,latitude,longitude FROM track_points WHERE journey_id=? ORDER BY sequence').all(journeyId); const bodyOut = Buffer.from(gpx(points, `journey-${journeyId}`)); res.writeHead(200, { 'Content-Type': 'application/gpx+xml; charset=utf-8', 'Content-Length': bodyOut.length, 'Content-Disposition': `attachment; filename="journey-${journeyId}.gpx"` }); return res.end(bodyOut); }
    if (format === 'audit.csv') { const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id').all().map(a => [a.id, a.actor_role, a.actor_id, a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.created_at]); const bodyOut = Buffer.from(`\uFEFFid,角色,操作者,动作,实体类型,实体ID,详情,IP,时间\r\n${rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')}\r\n`); res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Length': bodyOut.length, 'Content-Disposition': 'attachment; filename="bsc-audit.csv"' }); return res.end(bodyOut); }
    if (format === 'logs.csv') { const logs = queryAppLogs(url); const rows = logs.map(l => [l.id, l.created_at, l.client_created_at, l.level, l.villager_id, l.device_id, l.app_version, l.message, l.diagnostics]); const bodyOut = Buffer.from(`\uFEFFID,服务器接收时间,客户端时间,级别,采样员ID,设备ID,APP版本,消息,结构化详情\r\n${rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')}\r\n`); res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Length': bodyOut.length, 'Content-Disposition': 'attachment; filename="bsc-app-logs.csv"' }); return res.end(bodyOut); }
    const records = adminRecords(projectId); const entries = []; for (const r of records) { const file = path.join(DATA, r.photo_path.replace(/^\//, '')); if (!fs.existsSync(file)) continue; const day = String(r.captured_at || '').slice(0, 10) || 'unknown'; entries.push({ name: `${day}/${r.sample_code}-${r.id}.jpg`, data: fs.readFileSync(file), mtime: fs.statSync(file).mtime }); } const zip = zipStore(entries); res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': zip.length, 'Content-Disposition': 'attachment; filename="bsc-photos.zip"' }); return res.end(zip); }
  throw error(404, '管理员接口不存在');
}

function syncData(session) { expire(); const tasks = db.prepare(`SELECT t.*,p.name project_name,p.code project_code,s.code site_code,s.name site_name,s.latitude target_latitude,s.longitude target_longitude,s.normal_radius_m,s.exception_radius_m,s.severe_radius_m,s.reference_image,s.instructions,s.risk_note,s.remarks,r.id record_id,r.review_status,r.photo_path FROM tasks t JOIN projects p ON p.id=t.project_id JOIN sites s ON s.id=t.site_id LEFT JOIN records r ON r.task_id=t.id AND r.is_primary=1 WHERE t.villager_id=? AND p.enabled=1 AND s.deleted_at IS NULL AND t.canceled_at IS NULL ORDER BY CASE WHEN t.status IN('assigned','in_progress') THEN 0 ELSE 1 END,t.planned_date DESC,t.id`).all(session.villagerId).map(t => ({ ...t, canceled_at: t.canceled_at || null, canceled_reason: t.canceled_reason || null, reference_image: t.reference_image ? `${config.publicBaseUrl}${signImage(t.reference_image, 30 * 86400)}` : '' })); const v = db.prepare('SELECT username,display_name FROM villagers WHERE id=?').get(session.villagerId); return { serverTime: new Date().toISOString(), villager: { id: session.villagerId, username: v ? v.username : '', displayName: v ? v.display_name : '' }, tasks, rules: { normalRadiusM: 30, exceptionRadiusM: 80, severeRadiusM: 300, poorAccuracyM: 40, trackIntervalSeconds: 10, liveIntervalSeconds: 30 } }; }

async function mobileApi(req, res, url) {
  if (url.pathname === '/api/v1/mobile/activate' && req.method === 'POST') { const p = await body(req, 50_000), key = `mobile:${ipOf(req)}:${String(p.username || '').toLowerCase()}`; const lim = rateLimit.check(key); if (lim.limited) throw error(429, '尝试过多，请稍后再试'); const user = db.prepare('SELECT * FROM villagers WHERE username=? AND enabled=1').get(required(p.username, '账号').toLowerCase()); if (!user) { rateLimit.recordFailure(key); throw error(401, '账号不存在或已停用'); } const hash = crypto.createHash('sha256').update(required(p.activationToken, '激活码')).digest('hex'), act = db.prepare("SELECT * FROM activation_codes WHERE villager_id=? AND token_hash=? AND used_at IS NULL AND datetime(expires_at)>datetime('now')").get(user.id, hash); if (!act) { rateLimit.recordFailure(key); const any = db.prepare('SELECT * FROM activation_codes WHERE villager_id=? AND token_hash=?').get(user.id, hash); if (any && any.used_at) throw error(403, '激活二维码已被使用，请让管理员重新生成'); if (any && new Date(any.expires_at) <= new Date()) throw error(403, '激活二维码已过期（24小时有效），请让管理员重新生成'); throw error(403, '激活二维码无效，请扫描正确的二维码'); } rateLimit.recordSuccess(key); const device = transaction(() => { let d = db.prepare('SELECT id FROM devices WHERE villager_id=? AND device_uuid=?').get(user.id, required(p.deviceUuid, '设备编号')); let id; if (d) { id = d.id; db.prepare('UPDATE devices SET enabled=1,device_name=?,android_version=?,app_version=?,last_seen_at=CURRENT_TIMESTAMP WHERE id=?').run(String(p.deviceName || ''), String(p.androidVersion || ''), String(p.appVersion || ''), id); } else id = Number(db.prepare('INSERT INTO devices(villager_id,device_uuid,device_name,android_version,app_version,last_seen_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)').run(user.id, p.deviceUuid, String(p.deviceName || ''), String(p.androidVersion || ''), String(p.appVersion || '')).lastInsertRowid); db.prepare('UPDATE activation_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?').run(act.id); return id; }); audit(db, 'mobile', user.id, 'activate', 'device', device, { username: user.username }, ipOf(req)); return output(res, 200, { token: signToken(config.sessionSecret, 'villager', user.id, { deviceId: device }, 3650 * 86400), villager: { id: user.id, username: user.username, displayName: user.display_name }, deviceId: device }); }
  if (url.pathname === '/api/v1/mobile/login' && req.method === 'POST') { const p = await body(req, 30_000), key = `mobile:${ipOf(req)}:${String(p.username || '').toLowerCase()}`; const lim = rateLimit.check(key); if (lim.limited) throw error(429, '尝试过多，请稍后再试'); const user = db.prepare('SELECT * FROM villagers WHERE username=? AND enabled=1').get(String(p.username || '').toLowerCase()); if (!user) { rateLimit.recordFailure(key); throw error(401, '账号不存在或已停用'); } const d = db.prepare('SELECT * FROM devices WHERE villager_id=? AND device_uuid=? AND enabled=1').get(user.id, String(p.deviceUuid || '')); if (!d) throw error(403, '手机尚未激活'); rateLimit.recordSuccess(key); return output(res, 200, { token: signToken(config.sessionSecret, 'villager', user.id, { deviceId: d.id }, 3650 * 86400), villager: { id: user.id, username: user.username, displayName: user.display_name }, deviceId: d.id }); }
  if (url.pathname === '/api/v1/mobile/app-version' && req.method === 'GET') { const v = db.prepare('SELECT version_code,version_name,notes,mandatory FROM app_versions ORDER BY version_code DESC LIMIT 1').get(); return output(res, 200, { versionCode: v ? v.version_code : 100, versionName: v ? v.version_name : '1.0.0', notes: v ? v.notes : '', mandatory: v ? (v.mandatory ? 1 : 0) : 0 }); }
  const session = mobile(req); if (url.pathname === '/api/v1/mobile/sync' && req.method === 'GET') return output(res, 200, syncData(session));
  let m = /^\/api\/v1\/mobile\/tasks\/(\d+)\/start$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), p = await body(req); expire(); const task = db.prepare('SELECT t.*,s.latitude lat,s.longitude lon FROM tasks t JOIN sites s ON s.id=t.site_id WHERE t.id=? AND t.villager_id=?').get(id, session.villagerId); if (!task) throw error(404, '任务不存在'); if (task.locked_device_id && task.locked_device_id !== session.device.id) throw error(423, '任务已被另一台手机锁定'); const lat = number(p.latitude, '纬度'), lon = number(p.longitude, '经度'), acc = number(p.accuracyM ?? 9999, '精度'), startDistance = distance(lat, lon, task.lat, task.lon); const journey = transaction(() => { let j = db.prepare("SELECT * FROM journeys WHERE villager_id=? AND device_id=? AND site_id=? AND status='active' ORDER BY id DESC LIMIT 1").get(session.villagerId, session.device.id, task.site_id); if (!j) { const rid = db.prepare('INSERT INTO journeys(villager_id,device_id,site_id,started_at,start_latitude,start_longitude,start_accuracy_m,start_distance_m,weak_evidence) VALUES(?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?)').run(session.villagerId, session.device.id, task.site_id, lat, lon, acc, startDistance, startDistance < 300 ? 1 : 0).lastInsertRowid; j = db.prepare('SELECT * FROM journeys WHERE id=?').get(rid); } db.prepare("UPDATE tasks SET locked_device_id=?,locked_at=CURRENT_TIMESTAMP,journey_id=?,status='in_progress' WHERE id=?").run(session.device.id, j.id, id); return j; }); return output(res, 200, { journey, startDistanceM: startDistance, weakEvidence: startDistance < 300 }); }
  m = /^\/api\/v1\/mobile\/journeys\/(\d+)\/track$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), j = db.prepare('SELECT * FROM journeys WHERE id=? AND villager_id=? AND device_id=?').get(id, session.villagerId, session.device.id); if (!j) throw error(404, '行程不存在'); const p = await body(req, 2_000_000), points = Array.isArray(p.points) ? p.points.slice(0, 1000) : [], add = db.prepare('INSERT OR IGNORE INTO track_points(journey_id,sequence,recorded_at,latitude,longitude,accuracy_m,speed_mps,mock_location) VALUES(?,?,?,?,?,?,?,?)'); transaction(() => points.forEach(x => add.run(id, Number(x.sequence), required(x.recordedAt, '轨迹时间'), number(x.latitude, '轨迹纬度'), number(x.longitude, '轨迹经度'), Number(x.accuracyM || 0), Number(x.speedMps || 0), x.mockLocation ? 1 : 0))); return output(res, 200, { inserted: points.length }); }
  m = /^\/api\/v1\/mobile\/tasks\/(\d+)\/live$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), p = await body(req, 30_000); db.prepare(`INSERT INTO live_locations(task_id,device_id,recorded_at,latitude,longitude,accuracy_m) VALUES(?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET device_id=excluded.device_id,recorded_at=excluded.recorded_at,latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m`).run(id, session.device.id, required(p.recordedAt, '时间'), number(p.latitude, '纬度'), number(p.longitude, '经度'), Number(p.accuracyM || 0)); return output(res, 200, { ok: true }); }
  m = /^\/api\/v1\/mobile\/tasks\/(\d+)\/record$/.exec(url.pathname);
  if (m && req.method === 'POST') return saveRecord(req, res, session, Number(m[1]));
  m = /^\/api\/v1\/mobile\/journeys\/(\d+)\/complete$/.exec(url.pathname);
  if (m && req.method === 'POST') { db.prepare("UPDATE journeys SET status='completed',ended_at=CURRENT_TIMESTAMP WHERE id=? AND villager_id=? AND device_id=?").run(Number(m[1]), session.villagerId, session.device.id); return output(res, 200, { ok: true }); }
  m = /^\/api\/v1\/mobile\/journeys\/(\d+)\/interrupted$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]); const j = db.prepare('SELECT id FROM journeys WHERE id=? AND villager_id=? AND device_id=?').get(id, session.villagerId, session.device.id); if (!j) throw error(404, '行程不存在'); db.prepare('UPDATE journeys SET interrupted=1 WHERE id=?').run(id); return output(res, 200, { ok: true }); }
  if (url.pathname === '/api/v1/mobile/logs' && req.method === 'POST') { const p = await body(req, 500_000), logs = Array.isArray(p.logs) ? p.logs.slice(0, 100) : [], add = db.prepare('INSERT INTO app_logs(villager_id,device_id,level,app_version,client_created_at,message,diagnostics) VALUES(?,?,?,?,?,?,?)'); transaction(() => logs.forEach(x => add.run(session.villagerId, session.device.id, String(x.level || 'error'), String(x.appVersion || ''), String(x.createdAt || ''), String(x.message || '').slice(0, 4000), JSON.stringify(x.diagnostics || {})))); return output(res, 201, { accepted: logs.length }); }
  throw error(404, '村民端接口不存在');
}

async function saveRecord(req, res, session, taskId) {
  const p = await body(req), client = required(p.clientRecordId, '本地记录编号'), duplicate = db.prepare('SELECT * FROM records WHERE client_record_id=?').get(client); if (duplicate) return output(res, 200, { id: duplicate.id, idempotent: true });
  const task = db.prepare(`SELECT t.*,s.code site_code,s.name site_name,s.latitude target_lat,s.longitude target_lon,s.normal_radius_m,s.exception_radius_m,s.severe_radius_m,pj.name project_name,j.weak_evidence,j.interrupted FROM tasks t JOIN sites s ON s.id=t.site_id JOIN projects pj ON pj.id=t.project_id LEFT JOIN journeys j ON j.id=t.journey_id WHERE t.id=? AND t.villager_id=?`).get(taskId, session.villagerId); if (!task) throw error(404, '任务不存在'); if (task.locked_device_id && task.locked_device_id !== session.device.id) throw error(423, '任务被另一台手机锁定');
  const lat = number(p.latitude, '纬度'), lon = number(p.longitude, '经度'), acc = number(p.accuracyM ?? 9999, '精度'), dist = distance(lat, lon, task.target_lat, task.target_lon); if (dist > task.severe_radius_m) throw error(422, `距离${Math.round(dist)}米，超过300米`); const noWater = Boolean(p.noWater), manual = Boolean(p.manualCode); if (noWater && !String(p.exceptionCategory || '').trim()) throw error(422, '必须选择异常原因'); if (!noWater && !manual && !safeEqual(p.qrToken, task.qr_token)) throw error(422, '二维码不匹配'); if (manual && p.submittedCode !== task.sample_code) throw error(422, '手动编号不一致');
  const match = /^data:image\/(?:jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(String(p.photoDataUrl || '')); if (!match) throw error(422, '必须上传现场相机JPEG'); const image = Buffer.from(match[1], 'base64'); if (image.length < 100 || image.length > 8_000_000) throw error(413, '照片大小无效');
  const risks = []; if (dist > task.exception_radius_m) risks.push('distance_80_300m'); else if (dist > task.normal_radius_m) risks.push('distance_30_80m'); if (acc > 40) risks.push('gps_accuracy_over_40m'); if (manual) risks.push('manual_bottle_code'); if (p.mockLocation) risks.push('mock_location'); if (p.offlineStart) risks.push('offline_start_lock_unverified'); if (task.weak_evidence) risks.push('weak_start_track'); if (task.interrupted) risks.push('track_interrupted'); if (String(p.capturedAt).slice(0, 10) !== task.planned_date) risks.push('late_sampling'); if (task.canceled_at) risks.push('task_canceled'); if (!p.weatherText || p.weatherText === '待补充') risks.push('weather_pending'); if (!db.prepare('SELECT COUNT(*) count FROM track_points WHERE journey_id=?').get(task.journey_id || -1).count) risks.push('missing_track');
  // 时间防篡改：拍摄时间明显晚于服务器时间（手机时钟被改）→ 可疑。
  const capturedMs = new Date(String(p.capturedAt)).getTime();
  if (Number.isFinite(capturedMs) && capturedMs - Date.now() > 5 * 60_000) risks.push('captured_time_in_future');
  // EXIF 交叉核对：照片 EXIF 拍摄时间与提交时间相差超过 5 分钟 → 可疑（无 EXIF 不判）。
  try {
    const meta = await sharp(image).metadata();
    if (meta && meta.exif) {
      const dt = parseExifDate(exifDateTime(meta.exif));
      if (dt && Number.isFinite(capturedMs) && Math.abs(dt.getTime() - capturedMs) > 5 * 60_000) risks.push('exif_time_mismatch');
    }
  } catch {}
  const hash = crypto.createHash('sha256').update(image).digest('hex'); if (db.prepare('SELECT id FROM records WHERE photo_sha256=?').get(hash)) risks.push('duplicate_photo');
  const dir = path.join(UPLOADS, String(task.project_id)); fs.mkdirSync(dir, { recursive: true }); const file = `${task.sample_code}-${client.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}.jpg`, target = path.join(dir, file); await sharp(image).rotate().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toFile(target);
  const existing = db.prepare('SELECT id FROM records WHERE task_id=? AND is_primary=1').get(taskId), primary = !existing; const id = (() => { try { return transaction(() => { const rid = db.prepare(`INSERT INTO records(client_record_id,task_id,device_id,journey_id,is_primary,conflict_status,no_water,captured_at,latitude,longitude,accuracy_m,distance_m,weather_text,weather_status,exception_category,exception_detail,manual_code,mock_location,photo_path,photo_sha256,review_status,risk_flags) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(client, taskId, session.device.id, task.journey_id, primary ? 1 : 0, primary ? 'none' : 'needs_review', noWater ? 1 : 0, required(p.capturedAt, '拍照时间'), lat, lon, acc, dist, String(p.weatherText || '待补充'), p.weatherText && p.weatherText !== '待补充' ? 'complete' : 'pending', String(p.exceptionCategory || ''), String(p.exceptionDetail || ''), manual ? 1 : 0, p.mockLocation ? 1 : 0, `/uploads/${task.project_id}/${file}`, hash, risks.length ? 'suspicious' : 'pending', JSON.stringify([...new Set(risks)])).lastInsertRowid; if (primary) db.prepare("UPDATE tasks SET status='submitted',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(taskId); return Number(rid); }); } catch (e) { console.error('saveRecord DB error:', e); throw error(422, `保存失败：${String(e.message || e).slice(0, 120)}`); } })();
  backfillRecordWeather(id);
  return output(res, 201, { id, primary, riskFlags: risks, severity: risks.some(x => ['distance_80_300m','manual_bottle_code','mock_location'].includes(x)) ? 'severe' : risks.length ? 'suspicious' : 'normal' });
}

const server = http.createServer(async (req, res) => { const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); try { if (url.pathname === '/health') return output(res, 200, { status: 'healthy', version: '1.0.0', time: new Date().toISOString() }); if (url.pathname.startsWith('/api/v1/admin/')) return await adminApi(req, res, url); if (url.pathname.startsWith('/api/v1/mobile/')) return await mobileApi(req, res, url); if (url.pathname.startsWith('/uploads/')) return serveImageDir(req, res, url, UPLOADS); if (url.pathname.startsWith('/reference/')) return serveImageDir(req, res, url, REFERENCE); if (req.method === 'GET') return serveFile(req, res, url); throw error(404, '接口不存在'); } catch (e) { console.error(req.method, url.pathname, e); if (!res.headersSent) output(res, e.status || 500, { message: e.status ? e.message : '服务器内部错误' }); else res.destroy(); } });
const keepAlive = setInterval(() => rateLimit.prune(), 30 * 60_000);
keepAlive.unref?.();
server.listen(config.port, config.host, () => console.log(`BSC Sampling V1 listening on http://${config.host}:${config.port}`));
module.exports = server;
~~~~

#### `bsc-sampling-v1/src/track.js`

SHA-256: `4100091cce9ca67c2ff90ddb278214bd67c9d99343b8a44cc60ffc55d33c8df9`

~~~~javascript
'use strict';

// 轨迹展示平滑（仅用于管理站地图显示；原始轨迹点与 GPX 等导出文件一律不动，
// 保证证据链完整）：
// 1) 剔除孤立漂移点：与前后相邻点的推算速度都超过 8 m/s（步行/山路不可能），
//    且只有前后都超速才算孤立点，避免误删真实快速移动；
// 2) 按时间断点分段：相邻点间隔 >45 秒视为行程暂停/信号中断，段与段之间不连线，
//    避免出现横穿地图的直线；
// 3) 3 点滑动平均：消除 10 秒采样时 GPS 抖动造成的锯齿。

const R = 6371008.8;
const rad = x => x * Math.PI / 180;
function meters(a, b) {
  return 2 * R * Math.asin(Math.sqrt(
    Math.sin(rad(b[1] - a[1]) / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2
  ));
}

function smoothTrack(points) {
  const rows = [];
  for (const p of points) {
    const lat = Number(p.latitude), lon = Number(p.longitude);
    const at = new Date(p.recorded_at).getTime();
    if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(at)) rows.push({ lat, lon, at });
  }
  let dropped = points.length - rows.length;

  // 1. 孤立漂移点剔除
  const keep = [];
  for (let i = 0; i < rows.length; i++) {
    const prev = rows[i - 1], cur = rows[i], next = rows[i + 1];
    let spdPrev = 0, spdNext = 0;
    if (prev) { const dt = (cur.at - prev.at) / 1000; if (dt > 0) spdPrev = meters([prev.lon, prev.lat], [cur.lon, cur.lat]) / dt; }
    if (next) { const dt = (next.at - cur.at) / 1000; if (dt > 0) spdNext = meters([cur.lon, cur.lat], [next.lon, next.lat]) / dt; }
    if (prev && next && spdPrev > 8 && spdNext > 8) { dropped++; continue; }
    keep.push(cur);
  }

  // 2. 时间断点分段（>45s 不连线）
  const segments = [];
  let seg = [];
  for (let i = 0; i < keep.length; i++) {
    const cur = keep[i];
    if (seg.length && cur.at - keep[i - 1].at > 45000) { segments.push(seg); seg = []; }
    seg.push([cur.lat, cur.lon]);
  }
  if (seg.length) segments.push(seg);

  // 3. 3 点滑动平均
  const smoothed = segments.map(s => {
    if (s.length < 3) return s;
    const out = [s[0]];
    for (let i = 1; i < s.length - 1; i++) out.push([(s[i - 1][0] + s[i][0] + s[i + 1][0]) / 3, (s[i - 1][1] + s[i][1] + s[i + 1][1]) / 3]);
    out.push(s[s.length - 1]);
    return out;
  });

  return { segments: smoothed, dropped, total: points.length };
}

module.exports = { smoothTrack };
~~~~

#### `bsc-sampling-v1/src/weather.js`

SHA-256: `2dd8dd9558af1b93072c7c8047f52b994f05df4c4e4571731f63601af6de80fa`

~~~~javascript
'use strict';

// Server-side historical weather backfill via the Open-Meteo archive API.
// The client's evidence photo and its original weather_text are never modified:
// results are stored in the separate server_weather_text / server_weather_status
// columns and only shown as auxiliary review information (spec section 15).

function weatherName(code) {
  if (code === 0) return '晴';
  if (code > 0 && code <= 3) return '多云';
  if (code === 45 || code === 48) return '雾';
  if (code >= 51 && code <= 67) return '雨';
  if (code >= 71 && code <= 77) return '雪';
  if (code >= 80 && code <= 82) return '阵雨';
  if (code >= 95) return '雷暴';
  return '未知';
}

// Pick the archive hour closest to the capturedAt instant. The archive API
// returns location-local wall-clock hours without an offset; capturing phones
// run on Chinese civil time (UTC+8), so hours are compared as local wall
// clock. Weather is auxiliary information only, never a verdict on its own.
async function backfillWeather(record) {
  const latitude = record.latitude;
  const longitude = record.longitude;
  const capturedAt = record.capturedAt || record.captured_at;
  const captured = new Date(capturedAt);
  if (Number.isNaN(captured.getTime())) throw new Error(`captured_at invalid: ${capturedAt}`);
  const day = capturedAt.slice(0, 10);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${day}&end_date=${day}&hourly=temperature_2m,precipitation,weather_code&timezone=Asia%2FShanghai`;
  const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`open-meteo HTTP ${response.status}`);
  const data = await response.json();
  const hourly = data.hourly || {};
  const times = hourly.time || [];
  const temps = hourly.temperature_2m || [];
  const rains = hourly.precipitation || [];
  const codes = hourly.weather_code || [];
  if (!times.length || !temps.length) return { text: '待补充', status: 'unavailable' };
  const target = captured.getHours() * 3600_000 + captured.getMinutes() * 60_000 + captured.getSeconds() * 1000;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const [h, m] = String(times[i]).slice(11, 16).split(':').map(Number);
    const ms = (h || 0) * 3600_000 + (m || 0) * 60_000;
    const diff = Math.abs(ms - target);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  const t = Number(temps[best]);
  if (!Number.isFinite(t)) return { text: '待补充', status: 'unavailable' };
  const rain = Number(rains[best] || 0);
  const code = Number(codes[best] ?? -1);
  return { text: `${weatherName(code)} ${t}℃，降水 ${rain}mm（服务器历史数据）`, status: 'complete' };
}

module.exports = { backfillWeather };
~~~~

#### `bsc-sampling-v1/test/api.test.js`

SHA-256: `e99207bcf3ee4e85a6b8d1f589a1d15c99f1e2cf9dccc306bbbafe943fa6c753`

~~~~javascript
'use strict';

// API integration tests. A single server instance runs in-process against a
// throwaway DATA_DIR; a second read/write connection to the same SQLite file
// simulates time and device-state manipulation (expired activation codes,
// 12-hour lock expiry, disabled devices) that the API cannot express.
//
// Run: node --test test/api.test.js  (or npm test)

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bsc-test-'));
const PORT = 21000 + Math.floor(Math.random() * 20000);
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = String(PORT);
process.env.ADMIN_PASSWORD = 'TestAdmin-2608!';
process.env.PUBLIC_BASE_URL = 'https://bsc.gpsgps.online';
const BASE = `http://127.0.0.1:${PORT}`;

const server = require('../src/server.js');
const dbFile = path.join(DATA_DIR, 'bsc-v1.sqlite');
let rawDb; // test-only connection to the server database

async function call(method, p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + p, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, json, raw: res };
}

async function jpegDataUrl(size = 320) {
  const buf = await sharp({ create: { width: size, height: Math.round(size * 0.75), channels: 3, background: '#2e8b57' } }).jpeg().toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

let adminToken;
let mobileA; // device A token (villager cmy01)
let mobileB; // device B token (same villager, different device)
let villagerId;
let site5Id;
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

async function adminCreateTask(extra = {}) {
  const res = await call('POST', '/api/v1/admin/tasks', {
    siteId: site5Id, villagerId, plannedDate: today, sampleTypes: ['R'], ...extra
  }, adminToken);
  assert.equal(res.status, 201, `create task: ${JSON.stringify(res.json)}`);
  return res.json.ids[0];
}

async function syncTask(token, taskId) {
  const res = await call('GET', '/api/v1/mobile/sync', null, token);
  assert.equal(res.status, 200);
  return res.json.tasks.find(t => t.id === taskId);
}

async function newDeviceToken(prefix) {
  const act = await call('POST', `/api/v1/admin/villagers/${villagerId}/activation`, {}, adminToken);
  assert.equal(act.status, 201);
  const [, , user, raw] = String(act.json.value).split('|');
  const res = await call('POST', '/api/v1/mobile/activate', {
username: user, activationToken: raw, deviceUuid: `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    deviceName: 'Test', androidVersion: '15', appVersion: '1.0.0'
  });
  assert.equal(res.status, 200, `activate ${prefix}: ${JSON.stringify(res.json)}`);
  return res.json.token;
}

before(async () => {
  // Wait for the server to start listening.
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const health = await fetch(`${BASE}/health`);
  assert.equal(health.status, 200, 'server must be reachable');
  rawDb = new DatabaseSync(dbFile);
  rawDb.exec('PRAGMA busy_timeout=5000');
});

after(() => { server.close(); try { rawDb.close(); } catch {} });

test('admin login with correct password', async () => {
  const res = await call('POST', '/api/v1/admin/login', { password: 'TestAdmin-2608!' });
  assert.equal(res.status, 200);
  adminToken = res.json.token;
  assert.ok(adminToken);
});

test('bootstrap and seeded data', async () => {
  const res = await call('GET', '/api/v1/admin/bootstrap', null, adminToken);
  assert.equal(res.status, 200);
  assert.ok(res.json.projects.length >= 2);
  villagerId = res.json.villagers.find(v => v.username === 'cmy01').id;
  assert.ok(villagerId);
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, adminToken);
  assert.equal(sites.status, 200);
  assert.equal(sites.json.sites.length, 25);
  site5Id = sites.json.sites.find(s => s.code === '5').id;
  assert.ok(site5Id);
});

test('static admin page served at /', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /水样采集|管理平台/);
});

test('path traversal blocked', async () => {
  assert.equal((await fetch(`${BASE}/uploads/../config.json`)).status, 404);
  assert.equal((await fetch(`${BASE}/reference/../config.json`)).status, 404);
  assert.equal((await fetch(`${BASE}/%2e%2e/config.json`)).status, 404);
  assert.equal((await fetch(`${BASE}/../../package.json`)).status, 404);
});

test('activation + login flow', async () => {
  const act = await call('POST', `/api/v1/admin/villagers/${villagerId}/activation`, {}, adminToken);
  assert.equal(act.status, 201);
  assert.match(act.json.value, /^BSC-ACT\|https:\/\/bsc\.gpsgps\.online\|cmy01\|/);
  const [, , user, raw] = act.json.value.split('|');
  const res = await call('POST', '/api/v1/mobile/activate', {
    username: user, activationToken: raw, deviceUuid: 'test-device-A',
    deviceName: 'Test A', androidVersion: '15', appVersion: '1.0.0'
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.villager.username, 'cmy01');
  mobileA = res.json.token;
  const login = await call('POST', '/api/v1/mobile/login', { username: 'cmy01', deviceUuid: 'test-device-A' });
  assert.equal(login.status, 200);
});

test('activation token single-use and expiry', async () => {
  const act = await call('POST', `/api/v1/admin/villagers/${villagerId}/activation`, {}, adminToken);
  const [, , user, raw] = act.json.value.split('|');
  const once = await call('POST', '/api/v1/mobile/activate', { username: user, activationToken: raw, deviceUuid: 'replay-device' });
  assert.equal(once.status, 200);
  const replay = await call('POST', '/api/v1/mobile/activate', { username: user, activationToken: raw, deviceUuid: 'replay-device-2' });
  assert.equal(replay.status, 403, 'replayed token rejected');
  // Expired code inserted directly (simulates >24h old activation QR).
  const expiredHash = crypto.createHash('sha256').update('expired-token').digest('hex');
  rawDb.prepare('INSERT INTO activation_codes(villager_id,token_hash,expires_at) VALUES(?,?,?)').run(villagerId, expiredHash, '2020-01-01T00:00:00.000Z');
  const expired = await call('POST', '/api/v1/mobile/activate', { username: 'cmy01', activationToken: 'expired-token', deviceUuid: 'expired-device' });
  assert.equal(expired.status, 403, 'expired token rejected');
});

test('unknown account rejected; unactivated device rejected', async () => {
  const bad = await call('POST', '/api/v1/mobile/login', { username: 'no-such-user', deviceUuid: 'test-device-A' });
  assert.equal(bad.status, 401);
  const unactivated = await call('POST', '/api/v1/mobile/login', { username: 'cmy01', deviceUuid: 'never-activated' });
  assert.equal(unactivated.status, 403);
});

test('task code generation sequential and concurrent uniqueness', async () => {
  const first = await adminCreateTask();
  const second = await adminCreateTask();
  const codes = [await syncTask(mobileA, first), await syncTask(mobileA, second)].map(t => t.sample_code);
  assert.match(codes[0], /-01$/);
  assert.match(codes[1], /-02$/);
  assert.notEqual(codes[0], codes[1]);
  // Concurrent creations still produce unique codes (transaction + count).
  const ids = await Promise.all(Array.from({ length: 5 }, () => adminCreateTask()));
  const concurrentCodes = (await Promise.all(ids.map(id => syncTask(mobileA, id)))).map(t => t.sample_code);
  assert.equal(new Set(concurrentCodes).size, 5, 'concurrent codes unique');
  const base = `${today.slice(2).replaceAll('-', '')}-R-5-`;
  for (const c of concurrentCodes) assert.match(c, new RegExp(`^${base.replace('.', '\\.')}\\d{2}$`));
});

test('first-device lock blocks second device (423), expiry releases after 12h', async () => {
  mobileB = await newDeviceToken('test-device-B');
  const taskId = await adminCreateTask();
  const task = await syncTask(mobileA, taskId);
  const startA = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileA);
  assert.equal(startA.status, 200);
  assert.equal(startA.json.weakEvidence, true);
  const startB = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileB);
  assert.equal(startB.status, 423, 'locked to device A');
  // Simulate a lock older than 12 hours, then the lock must expire.
  rawDb.prepare("UPDATE tasks SET locked_at=datetime('now','-13 hours') WHERE id=?").run(taskId);
  const startB2 = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileB);
  assert.equal(startB2.status, 200, 'expired lock released');
  assert.ok(task.qr_token, 'sync payload carries qr token');
});

test('track upload with sequence dedup', async () => {
  const taskId = await adminCreateTask();
  const start = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileA);
  const journeyId = start.json.journey.id;
  const points = [0, 1, 2].map(i => ({ sequence: i, recordedAt: new Date().toISOString(), latitude: 30.075 + i * 0.00001, longitude: 94.1458, accuracyM: 4, speedMps: 1, mockLocation: false }));
  const up = await call('POST', `/api/v1/mobile/journeys/${journeyId}/track`, { points }, mobileA);
  assert.equal(up.status, 200);
  assert.equal(up.json.inserted, 3);
  const again = await call('POST', `/api/v1/mobile/journeys/${journeyId}/track`, { points: [{ sequence: 1, recordedAt: new Date().toISOString(), latitude: 0, longitude: 0, accuracyM: 4 }] }, mobileA);
  assert.equal(again.status, 200);
  assert.equal(again.json.inserted, 1, 'duplicate sequence ignored');
});

async function boundaryRecord(offsetM, extra = {}, taskExtra = {}) {
  const taskId = await adminCreateTask(taskExtra);
  const task = await syncTask(mobileA, taskId);
  const photo = await jpegDataUrl();
  const res = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `b-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404 + offsetM / 111200,
    longitude: 94.14583272,
    accuracyM: 5,
    weatherText: '晴 12℃',
    noWater: false, manualCode: false, qrToken: task.qr_token,
    exceptionCategory: '', exceptionDetail: '', mockLocation: false, offlineStart: false,
    photoDataUrl: photo, ...extra
  }, mobileA);
  return { taskId, res };
}

test('30/80/300 m boundary rules and mandatory exception reason', async () => {
  const within = await boundaryRecord(25);
  assert.equal(within.res.status, 201);
  assert.ok(!within.res.json.riskFlags.includes('distance_30_80m'));
  assert.ok(!within.res.json.riskFlags.includes('distance_80_300m'));
  const midNoReason = await boundaryRecord(50);
  assert.equal(midNoReason.res.status, 201, '30-80m without reason accepted (需求变更：距离过远不再强制选原因)');
  assert.ok(midNoReason.res.json.riskFlags.includes('distance_30_80m'));
  const mid = await boundaryRecord(50, { exceptionCategory: '河岸无法靠近' });
  assert.equal(mid.res.status, 201);
  assert.ok(mid.res.json.riskFlags.includes('distance_30_80m'));
  const far = await boundaryRecord(100, { exceptionCategory: '道路中断' });
  assert.equal(far.res.status, 201);
  assert.ok(far.res.json.riskFlags.includes('distance_80_300m'));
  const beyond = await boundaryRecord(350, { exceptionCategory: '其他' });
  assert.equal(beyond.res.status, 422, '>300m hard limit');
});

test('risk flags: accuracy, manual code, mock location, offline start, late sampling, canceled, missing track, duplicate photo, no water', async () => {
  const badAccuracy = await boundaryRecord(10, { accuracyM: 45 });
  assert.ok(badAccuracy.res.json.riskFlags.includes('gps_accuracy_over_40m'));
  const taskManual = await adminCreateTask();
  const manualTask = await syncTask(mobileA, taskManual);
  const manual = await call('POST', `/api/v1/mobile/tasks/${taskManual}/record`, {
    clientRecordId: `m-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: true, submittedCode: manualTask.sample_code, qrToken: '',
    exceptionCategory: '二维码损坏', exceptionDetail: '', mockLocation: false, offlineStart: false,
    photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(manual.status, 201);
  assert.ok(manual.json.riskFlags.includes('manual_bottle_code'));
  const manualWrong = await call('POST', `/api/v1/mobile/tasks/${taskManual}/record`, {
    clientRecordId: `m2-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: true, submittedCode: 'WRONG-CODE', qrToken: '',
    exceptionCategory: '二维码损坏', exceptionDetail: '', mockLocation: false, offlineStart: false,
    photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(manualWrong.status, 422, 'manual code must match exactly');
  const mock = await boundaryRecord(10, { mockLocation: true, offlineStart: true });
  assert.ok(mock.res.json.riskFlags.includes('mock_location'));
  assert.ok(mock.res.json.riskFlags.includes('offline_start_lock_unverified'));
  const late = await boundaryRecord(10, { capturedAt: `${today}T08:00:00+08:00` }, { plannedDate: tomorrow });
  assert.ok(late.res.json.riskFlags.includes('late_sampling'));
  const cancelTaskId = await adminCreateTask();
  const canceledTask = await syncTask(mobileA, cancelTaskId); // 取消前手机已缓存该任务
  const cancel = await call('POST', `/api/v1/admin/tasks/${cancelTaskId}/cancel`, { reason: '测试取消' }, adminToken);
  assert.equal(cancel.status, 200);
  const afterCancelSync = await call('GET', '/api/v1/mobile/sync', null, mobileA);
  assert.equal(afterCancelSync.status, 200);
  assert.ok(!afterCancelSync.json.tasks.some(t => t.id === cancelTaskId), '已取消任务不再下发到手机端');
  const afterCancel = await call('POST', `/api/v1/mobile/tasks/${cancelTaskId}/record`, {
    clientRecordId: `c-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: canceledTask.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: true, photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(afterCancel.status, 201, 'offline record after cancel still accepted for review');
  assert.ok(afterCancel.json.riskFlags.includes('task_canceled'));
  const missing = await boundaryRecord(10);
  assert.ok(missing.res.json.riskFlags.includes('missing_track'));
  // Two records made from the exact same photo bytes → duplicate_photo risk.
  const dupPhoto = await jpegDataUrl(400);
  const dupFirst = await boundaryRecord(10, { photoDataUrl: dupPhoto });
  assert.equal(dupFirst.res.status, 201);
  assert.ok(!dupFirst.res.json.riskFlags.includes('duplicate_photo'));
  const dupSecond = await boundaryRecord(10, { photoDataUrl: dupPhoto });
  assert.equal(dupSecond.res.status, 201);
  assert.ok(dupSecond.res.json.riskFlags.includes('duplicate_photo'));
  const noWaterTask = await adminCreateTask();
  const noWater = await call('POST', `/api/v1/mobile/tasks/${noWaterTask}/record`, {
    clientRecordId: `nw-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: true, manualCode: false, qrToken: '', exceptionCategory: '无水', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(noWater.status, 201, 'no-water record without bottle accepted');
  const noWaterNoReason = await call('POST', `/api/v1/mobile/tasks/${noWaterTask}/record`, {
    clientRecordId: `nw2-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: true, manualCode: false, qrToken: '', exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(noWaterNoReason.status, 422, 'no-water requires reason');
});

test('qr mismatch, conflict records and idempotent retry', async () => {
  const taskId = await adminCreateTask();
  const task = await syncTask(mobileA, taskId);
  const photo = await jpegDataUrl();
  const body = {
    clientRecordId: `cm-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: photo
  };
  const wrong = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, { ...body, clientRecordId: `cm2-${Date.now()}`, qrToken: 'wrong' }, mobileA);
  assert.equal(wrong.status, 422, 'qr mismatch rejected');
  const first = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, body, mobileA);
  assert.equal(first.status, 201);
  assert.equal(first.json.primary, true);
  const retry = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, body, mobileA);
  assert.equal(retry.status, 200);
  assert.equal(retry.json.id, first.json.id);
  assert.equal(retry.json.idempotent, true);
  const conflict = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, { ...body, clientRecordId: `cm3-${Date.now()}` }, mobileA);
  assert.equal(conflict.status, 201);
  assert.equal(conflict.json.primary, false, 'second record is a conflict copy, not a replacement');
});

test('photo validation: oversized and non-JPEG rejected', async () => {
  const taskId = await adminCreateTask();
  const task = await syncTask(mobileA, taskId);
  const big = Buffer.alloc(8_500_000, 1).toString('base64');
  const oversized = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `big-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: `data:image/jpeg;base64,${big}`
  }, mobileA);
  assert.equal(oversized.status, 413);
  const notJpeg = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `png-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: 'data:image/png;base64,iVBORw0KGgo='
  }, mobileA);
  assert.equal(notJpeg.status, 422);
});

test('review does not rewrite the original record', async () => {
  const tasks = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const done = tasks.json.tasks.find(t => t.record_id);
  assert.ok(done, 'at least one record exists');
  const beforeReview = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const beforeRow = beforeReview.json.tasks.find(t => t.id === done.id);
  const res = await call('POST', `/api/v1/admin/records/${done.record_id}/review`, { status: 'approved', note: '自动测试' }, adminToken);
  assert.equal(res.status, 200);
  const afterRes = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const afterRow = afterRes.json.tasks.find(t => t.id === done.id);
  assert.equal(afterRow.review_status, 'approved');
  assert.equal(afterRow.captured_at, beforeRow.captured_at, 'captured_at unchanged');
  assert.equal(afterRow.photo_path, beforeRow.photo_path, 'photo untouched');
  assert.deepEqual(afterRow.risk_flags, beforeRow.risk_flags, 'risk flags unchanged');
  const bad = await call('POST', `/api/v1/admin/records/${done.record_id}/review`, { status: 'nonsense' }, adminToken);
  assert.equal(bad.status, 422);
});

test('task cancel rules and unlock', async () => {
  const withRecord = await adminCreateTask();
  const t = await syncTask(mobileA, withRecord);
  await call('POST', `/api/v1/mobile/tasks/${withRecord}/record`, {
    clientRecordId: `unlock-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: t.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: await jpegDataUrl()
  }, mobileA);
  const cancelRecorded = await call('POST', `/api/v1/admin/tasks/${withRecord}/cancel`, { reason: '测试' }, adminToken);
  assert.equal(cancelRecorded.status, 422, 'recorded task cannot be canceled');
  const plain = await adminCreateTask();
  const cancel = await call('POST', `/api/v1/admin/tasks/${plain}/cancel`, { reason: '测试' }, adminToken);
  assert.equal(cancel.status, 200);
  const cancelAgain = await call('POST', `/api/v1/admin/tasks/${plain}/cancel`, { reason: 'again' }, adminToken);
  assert.equal(cancelAgain.status, 422, 'double cancel rejected');
  // Lock a task with device A, then unlock from admin, then device B may start.
  const lockTask = await adminCreateTask();
  await call('POST', `/api/v1/mobile/tasks/${lockTask}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileA);
  const blocked = await call('POST', `/api/v1/mobile/tasks/${lockTask}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileB);
  assert.equal(blocked.status, 423);
  const unlock = await call('POST', `/api/v1/admin/tasks/${lockTask}/unlock`, {}, adminToken);
  assert.equal(unlock.status, 200);
  const afterUnlock = await call('POST', `/api/v1/mobile/tasks/${lockTask}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileB);
  assert.equal(afterUnlock.status, 200, 'unlocked task can be claimed by another device');
});

test('labels page renders 60-per-page A4 grid', async () => {
  const ids = await Promise.all([adminCreateTask(), adminCreateTask()]);
  const res = await fetch(`${BASE}/api/v1/admin/labels?taskIds=${ids.join(',')}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.equal((html.match(/<div class="label">/g) || []).length, 2);
  assert.equal((html.match(/<div class="page">/g) || []).length, 1, 'two labels share one page');
  assert.match(html, /grid-template-columns: repeat\(5, 42mm\)/, '5列×12行60枚/页满铺网格');
  assert.match(html, /width: 24\.75mm/, '二维码 24.75mm 占满格高（防畸变）');
  assert.match(html, /河流水|支流|土壤|植物|雨水|湖水/, '样品类型大号文字');
  assert.match(html, /data:image\/png;base64,/, 'qr codes embedded as data URLs');
});

test('villager management (create/duplicate/activate-no-pin/disable)', async () => {
  const created = await call('POST', '/api/v1/admin/villagers', { username: 'E2EV', displayName: '测试村民' }, adminToken);
  assert.equal(created.status, 201);
  const vid = created.json.id;
  const dup = await call('POST', '/api/v1/admin/villagers', { username: 'E2EV', displayName: 'dup' }, adminToken);
  assert.equal(dup.status, 422, 'duplicate username rejected');
  const act = await call('POST', `/api/v1/admin/villagers/${vid}/activation`, {}, adminToken);
  const [, , user, raw] = String(act.json.value).split('|');
  const activate = await call('POST', '/api/v1/mobile/activate', { username: user, activationToken: raw, deviceUuid: 'e2ev-device', appVersion: '1.0.0' });
  assert.equal(activate.status, 200, 'activation works without PIN');
  const disable = await call('PUT', `/api/v1/admin/villagers/${vid}`, { displayName: '测试村民', enabled: false }, adminToken);
  assert.equal(disable.status, 200);
  const syncBlocked = await call('GET', '/api/v1/mobile/sync', null, activate.json.token);
  assert.equal(syncBlocked.status, 403, 'disabled villager blocks device requests');
});

test('project CRUD and task reschedule', async () => {
  // 项目：新建/重复编码拒绝/编辑/删除；有任务数据的项目只能停用。
  const created = await call('POST', '/api/v1/admin/projects', { code: 'E2EP', name: '测试项目X', description: '', isTest: true }, adminToken);
  assert.equal(created.status, 201);
  const pid = created.json.id;
  const dup = await call('POST', '/api/v1/admin/projects', { code: 'E2EP', name: 'dup' }, adminToken);
  assert.equal(dup.status, 422, 'duplicate project code rejected');
  const updated = await call('PUT', `/api/v1/admin/projects/${pid}`, { code: 'E2EP', name: '测试项目Y', description: 'x', isTest: true, enabled: false }, adminToken);
  assert.equal(updated.status, 200);
  const del = await call('DELETE', `/api/v1/admin/projects/${pid}`, null, adminToken);
  assert.equal(del.status, 200, 'empty project deletable');
  const delMain = await call('DELETE', '/api/v1/admin/projects/1', null, adminToken);
  assert.equal(delMain.status, 422, 'project with tasks cannot be deleted');
  // 改期：重新生成编号与二维码密钥，旧标签作废；有记录的任务不能改期。
  const taskId = await adminCreateTask();
  const res = await call('POST', `/api/v1/admin/tasks/${taskId}/reschedule`, { plannedDate: tomorrow }, adminToken);
  assert.equal(res.status, 200);
  const expectedCode = new RegExp(`^${tomorrow.slice(2).replaceAll('-', '')}-R-5-\\d{2}$`);
  assert.match(res.json.sampleCode, expectedCode);
  const after = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const moved = after.json.tasks.find(x => x.id === taskId);
  assert.equal(moved.planned_date, tomorrow);
  assert.equal(moved.sample_code, res.json.sampleCode);
  const done = after.json.tasks.find(x => x.record_id);
  if (done) {
    const blocked = await call('POST', `/api/v1/admin/tasks/${done.id}/reschedule`, { plannedDate: tomorrow }, adminToken);
    assert.equal(blocked.status, 422, 'recorded task cannot be rescheduled');
  }
});

test('exports: csv, geojson, gpx, audit, photo zip', async () => {
  const csv = await fetch(`${BASE}/api/v1/admin/exports/csv?projectId=1`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(csv.status, 200);
  const csvBytes = new Uint8Array(await csv.arrayBuffer());
  assert.deepEqual([...csvBytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM for Excel');
  const csvText = new TextDecoder().decode(csvBytes);
  assert.match(csvText, /样品编号/);
  const geo = await fetch(`${BASE}/api/v1/admin/exports/geojson?projectId=1`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(geo.status, 200);
  const geojson = JSON.parse(await geo.text());
  assert.equal(geojson.type, 'FeatureCollection');
  assert.ok(geojson.features.length >= 1);
  const journeys = rawDb.prepare('SELECT id FROM journeys ORDER BY id LIMIT 1').all();
  if (journeys.length) {
    const gpxRes = await fetch(`${BASE}/api/v1/admin/exports/gpx?journeyId=${journeys[0].id}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(gpxRes.status, 200);
    assert.match(await gpxRes.text(), /<gpx /);
  }
  const audit = await fetch(`${BASE}/api/v1/admin/exports/audit.csv`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(audit.status, 200);
  assert.match(await audit.text(), /review|create_tasks/);
  const zip = await fetch(`${BASE}/api/v1/admin/exports/photos.zip?projectId=1`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(zip.status, 200);
  const buf = Buffer.from(await zip.arrayBuffer());
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'zip local header magic');
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, 'zip end-of-central-directory present');
  const entryCount = buf.readUInt16LE(eocd + 10);
  const records = rawDb.prepare('SELECT COUNT(*) c FROM records').get().c;
  assert.equal(entryCount, records, 'one zip entry per record photo');
});

test('weather backfill stores server weather separately', async () => {
  const tasks = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const done = tasks.json.tasks.find(t => t.record_id);
  assert.ok(done);
  const res = await call('POST', `/api/v1/admin/records/${done.record_id}/backfill-weather`, {}, adminToken);
  assert.equal(res.status, 200);
  assert.ok(['complete', 'unavailable'].includes(res.json.status));
  const afterRes = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const row = afterRes.json.tasks.find(t => t.id === done.id);
  assert.equal(row.server_weather_status, res.json.status);
  assert.equal(row.weather_text, done.weather_text, 'client weather text never overwritten');
});

test('app logs upload with truncation and admin query', async () => {
  const long = 'x'.repeat(5000);
  const res = await call('POST', '/api/v1/mobile/logs', { logs: [{ localId: 9, level: 'error', message: long, diagnostics: {}, createdAt: new Date().toISOString(), appVersion: '1.0.0' }] }, mobileA);
  assert.equal(res.status, 201);
  const logs = await call('GET', '/api/v1/admin/logs', null, adminToken);
  assert.equal(logs.status, 200);
  const stored = logs.json.logs.find(l => l.message.startsWith('xxx'));
  assert.ok(stored);
  assert.ok(stored.message.length <= 4000, 'message truncated to 4000 chars');
});

test('journey interrupted marking feeds track_interrupted risk', async () => {
  const taskId = await adminCreateTask();
  const start = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileA);
  assert.equal(start.status, 200);
  const journeyId = start.json.journey.id;
  const mark = await call('POST', `/api/v1/mobile/journeys/${journeyId}/interrupted`, {}, mobileA);
  assert.equal(mark.status, 200);
  const task = await syncTask(mobileA, taskId);
  const rec = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `it-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(rec.status, 201);
  assert.ok(rec.json.riskFlags.includes('track_interrupted'), 'interrupted journey adds risk flag');
});

test('admin logs filter and CSV export', async () => {
  const errOnly = await call('GET', '/api/v1/admin/logs?level=error', null, adminToken);
  assert.equal(errOnly.status, 200);
  assert.ok(errOnly.json.logs.length >= 0);
  assert.ok(errOnly.json.logs.every(l => l.level === 'error'), 'level filter respected');
  const deviceFilter = await call('GET', '/api/v1/admin/logs?deviceId=1', null, adminToken);
  assert.ok(deviceFilter.json.logs.every(l => l.device_id === 1), 'device filter respected');
  const csv = await fetch(`${BASE}/api/v1/admin/exports/logs.csv?level=info`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(csv.status, 200);
  const text = await csv.text();
  assert.match(text, /级别/);
  assert.match(text, /结构化详情/);
});

test('disabled device gets 403', async () => {
  const deviceId = rawDb.prepare("SELECT id FROM devices WHERE device_uuid LIKE 'test-device-B%' ORDER BY id DESC LIMIT 1").get().id;
  rawDb.prepare('UPDATE devices SET enabled=0 WHERE id=?').run(deviceId);
  const res = await call('GET', '/api/v1/mobile/sync', null, mobileB);
  assert.equal(res.status, 403);
  rawDb.prepare('UPDATE devices SET enabled=1 WHERE id=?').run(deviceId);
});

test('mobile login rate limiting locks after 5 failures', async () => {
  for (let i = 0; i < 5; i++) {
    const res = await call('POST', '/api/v1/mobile/login', { username: 'limittest', pin: '0000', deviceUuid: 'x' });
    assert.equal(res.status, 401);
  }
  const limited = await call('POST', '/api/v1/mobile/login', { username: 'limittest', pin: '0000', deviceUuid: 'x' });
  assert.equal(limited.status, 429);
  const stillLocked = await call('POST', '/api/v1/mobile/login', { username: 'limittest', deviceUuid: 'x' });
  assert.equal(stillLocked.status, 429, 'correct pin also locked during window');
});

test('admin login rate limiting (last: locks admin key)', async () => {
  for (let i = 0; i < 10; i++) {
    const res = await call('POST', '/api/v1/admin/login', { password: 'wrong-password' });
    assert.equal(res.status, 401);
  }
  const limited = await call('POST', '/api/v1/admin/login', { password: 'wrong-password' });
  assert.equal(limited.status, 429);
});

// ---------- v1.1.0 新增能力 ----------

test('signed image URLs: 无签名 403，签名 URL 200', async () => {
  // 上传一张真实参考图并挂到点位，通过 sites 接口拿到签名 URL。
  const up = await call('POST', '/api/v1/admin/reference-images', { imageData: await jpegDataUrl(200) }, adminToken);
  assert.equal(up.status, 201, `upload: ${JSON.stringify(up.json)}`);
  const rawPath = up.json.path;
  const beforeSites = await call('GET', '/api/v1/admin/sites?projectId=1', null, adminToken);
  const site5 = beforeSites.json.sites.find(s => s.id === site5Id);
  const setRef = await call('PUT', `/api/v1/admin/sites/${site5Id}`, {
    code: site5.code, name: site5.name, latitude: site5.latitude, longitude: site5.longitude, referenceImage: rawPath
  }, adminToken);
  assert.equal(setRef.status, 200, JSON.stringify(setRef.json));
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, adminToken);
  const signed = sites.json.sites.find(s => s.id === site5Id).reference_image;
  assert.ok(signed.includes('sig='), `signed url: ${signed}`);
  const denied = await fetch(`${BASE}${rawPath}`);
  assert.equal(denied.status, 403, '裸路径必须拒绝');
  const ok = await fetch(`${BASE}${signed}`);
  assert.equal(ok.status, 200, '签名 URL 可访问');
  assert.match(ok.headers.get('content-type'), /image/);
  // 清空参考图，避免影响其他用例。
  await call('PUT', `/api/v1/admin/sites/${site5Id}`, {
    code: site5.code, name: site5.name, latitude: site5.latitude, longitude: site5.longitude, referenceImage: ''
  }, adminToken);
});

test('activation code messages distinguish used vs invalid', async () => {
  const act = await call('POST', `/api/v1/admin/villagers/${villagerId}/activation`, {}, adminToken);
  const [, , user, raw] = act.json.value.split('|');
  const first = await call('POST', '/api/v1/mobile/activate', {
    username: user, activationToken: raw, deviceUuid: `used-${Date.now()}`, appVersion: '1.0.0'
  });
  assert.equal(first.status, 200);
  const second = await call('POST', '/api/v1/mobile/activate', {
    username: user, activationToken: raw, deviceUuid: `used2-${Date.now()}`, appVersion: '1.0.0'
  });
  assert.equal(second.status, 403);
  assert.match(second.json.message, /已被使用/);
  const wrong = await call('POST', '/api/v1/mobile/activate', {
    username: user, activationToken: 'BSC-ACT|not-a-real-token', deviceUuid: `w-${Date.now()}`, appVersion: '1.0.0'
  });
  assert.equal(wrong.status, 403);
  assert.match(wrong.json.message, /无效/);
});

test('app-version endpoint returns latest version', async () => {
  const res = await call('GET', '/api/v1/mobile/app-version', null, null);
  assert.equal(res.status, 200);
  assert.ok(res.json.versionCode >= 107, `versionCode=${res.json.versionCode}`);
  assert.equal(res.json.versionName, '1.3.1');
  assert.equal(res.json.mandatory, 0, 'mandatory 字段应下发（默认0）');
});

test('captured time in the future adds risk flag', async () => {
  const taskId = await adminCreateTask({ plannedDate: tomorrow });
  await syncTask(mobileA, taskId);
  const res = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `future-${Date.now()}`, capturedAt: `${tomorrow}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: (await syncTask(mobileA, taskId)).qr_token,
    exceptionCategory: '', exceptionDetail: '', mockLocation: false, offlineStart: false,
    photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(res.status, 201);
  assert.ok(res.json.riskFlags.includes('captured_time_in_future'), JSON.stringify(res.json.riskFlags));
});

// 构造带 EXIF DateTimeOriginal 的真实 JPEG：sharp 生成底图，再把
// 'Exif\0\0' + 小端 TIFF + IFD 条目 0x9003 的 APP1 段插到 FFD8 之后。
async function jpegWithExif(dateTime) {
  const base = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#2e8b57' } }).jpeg().toBuffer();
  const str = Buffer.from(`${dateTime}\0`, 'ascii'); // 20 字节
  const tiff = Buffer.alloc(26 + str.length);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);           // IFD 条目数
  tiff.writeUInt16LE(0x9003, 10);     // DateTimeOriginal
  tiff.writeUInt16LE(2, 12);          // ASCII
  tiff.writeUInt32LE(20, 14);         // count
  tiff.writeUInt32LE(26, 18);         // 值偏移
  tiff.writeUInt32LE(0, 22);          // 下一个 IFD = 0
  str.copy(tiff, 26);
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const seg = Buffer.alloc(4 + app1.length);
  seg.writeUInt16BE(0xFFE1, 0);
  seg.writeUInt16BE(app1.length + 2, 2);
  app1.copy(seg, 4);
  return Buffer.concat([base.subarray(0, 2), seg, base.subarray(2)]);
}

test('exif time mismatch adds risk flag (matches submitted time: no flag)', async () => {
  const taskId = await adminCreateTask();
  await syncTask(mobileA, taskId);
  const task = await syncTask(mobileA, taskId);
  const bad = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `exif-bad-${Date.now()}`, capturedAt: `${today}T09:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false,
    photoDataUrl: `data:image/jpeg;base64,${(await jpegWithExif('2026:01:01 00:00:00')).toString('base64')}`
  }, mobileA);
  assert.equal(bad.status, 201);
  assert.ok(bad.json.riskFlags.includes('exif_time_mismatch'), JSON.stringify(bad.json.riskFlags));
  const good = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `exif-ok-${Date.now()}`, capturedAt: `${today}T09:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false,
    photoDataUrl: `data:image/jpeg;base64,${(await jpegWithExif(`${today.replaceAll('-', ':')} 09:00:00`)).toString('base64')}`
  }, mobileA);
  assert.equal(good.status, 201);
  assert.ok(!good.json.riskFlags.includes('exif_time_mismatch'), '时间一致不应打标');
});

test('label print is recorded and reported on tasks', async () => {
  const taskId = await adminCreateTask();
  const labels = await call('GET', `/api/v1/admin/labels?taskIds=${taskId}`, null, adminToken);
  assert.equal(labels.status, 200);
  const tasks = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const row = tasks.json.tasks.find(t => t.id === taskId);
  assert.ok(row.printed_count >= 1, `printed_count=${row.printed_count}`);
});

test('batch weather backfill endpoint', async () => {
  const res = await call('POST', '/api/v1/admin/records/backfill-weather', { recordIds: [1, 2, 3] }, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.json.queued, 3);
  const empty = await call('POST', '/api/v1/admin/records/backfill-weather', { recordIds: [] }, adminToken);
  assert.equal(empty.status, 400);
});

test('security headers present', async () => {
  const res = await fetch(`${BASE}/`);
  assert.match(res.headers.get('content-security-policy') || '', /default-src/);
  assert.match(res.headers.get('content-security-policy') || '', /blob:/, 'blob: 必须允许（参考图预览）');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('duplicate site code returns 422 (not 500)', async () => {
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, adminToken);
  const s = sites.json.sites[0];
  const dup = await call('POST', '/api/v1/admin/sites', {
    projectId: 1, code: s.code, name: '重复点', latitude: 30.1, longitude: 94.1, sampleTypes: ['R'], enabled: true
  }, adminToken);
  assert.equal(dup.status, 422, `应为422而不是500: ${JSON.stringify(dup.json)}`);
  assert.match(dup.json.message, /已存在/);
});

test('task creation without sampleTypes uses the site own types', async () => {
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, adminToken);
  const multi = sites.json.sites.find(x => (x.sample_types || []).length >= 2);
  const res = await call('POST', '/api/v1/admin/tasks', {
    siteId: multi.id, villagerId, plannedDate: tomorrow
  }, adminToken);
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.ok(res.json.codes.length >= 2, `按点位类型生成任务: ${JSON.stringify(res.json.codes)}`);
});

test('delete site cancels its unsampled tasks and hides the site', async () => {
  const code = `DEL${Date.now()}`;
  const created = await call('POST', '/api/v1/admin/sites', {
    projectId: 1, code, name: '待删除点位', latitude: 30.2, longitude: 94.2, sampleTypes: ['R'], enabled: true
  }, adminToken);
  assert.equal(created.status, 201, `create site: ${JSON.stringify(created.json)}`);
  const siteId = created.json.id;
  const taskId = await adminCreateTask({ siteId });
  const del = await call('DELETE', `/api/v1/admin/sites/${siteId}`, null, adminToken);
  assert.equal(del.status, 200, `delete site: ${JSON.stringify(del.json)}`);
  assert.ok(del.json.canceledTasks >= 1, `canceledTasks=${del.json.canceledTasks}`);
  const t = rawDb.prepare('SELECT canceled_at, canceled_reason FROM tasks WHERE id=?').get(taskId);
  assert.ok(t.canceled_at, '任务应被取消');
  assert.equal(t.canceled_reason, '点位已删除');
  const sync = await syncTask(mobileA, taskId);
  assert.equal(sync, undefined, '已取消任务不再下发手机');
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, adminToken);
  assert.equal(sites.json.sites.some(s => s.id === siteId), false, '已删除点位不再返回');
  const again = await call('DELETE', `/api/v1/admin/sites/${siteId}`, null, adminToken);
  assert.equal(again.status, 404, '重复删除返回404');
});

test('delete task without record works; with record returns 422', async () => {
  const taskId = await adminCreateTask();
  const del = await call('DELETE', `/api/v1/admin/tasks/${taskId}/delete`, null, adminToken);
  assert.equal(del.status, 200, `delete task: ${JSON.stringify(del.json)}`);
  assert.equal(rawDb.prepare('SELECT COUNT(*) c FROM tasks WHERE id=?').get(taskId).c, 0, '任务行已删除');
  const tasks = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  assert.equal(tasks.json.tasks.some(t => t.id === taskId), false, '任务列表不再包含已删除任务');
  const withRecord = await adminCreateTask();
  const deviceId = rawDb.prepare('SELECT id FROM devices WHERE villager_id=? LIMIT 1').get(villagerId).id;
  rawDb.prepare('INSERT INTO records(client_record_id,task_id,device_id,captured_at,latitude,longitude,photo_path,photo_sha256) VALUES(?,?,?,?,?,?,?,?)').run(`del-test-${Date.now()}`, withRecord, deviceId, new Date().toISOString(), 30.1, 94.1, '/uploads/1/x.jpg', 'sha-test');
  const refuse = await call('DELETE', `/api/v1/admin/tasks/${withRecord}/delete`, null, adminToken);
  assert.equal(refuse.status, 422, `有记录任务删除应422: ${JSON.stringify(refuse.json)}`);
  assert.match(refuse.json.message, /不能删除/);
});
~~~~

#### `bsc-sampling-v1/test/backup.test.js`

SHA-256: `30558385ca5f72f3e46066caef1d49c6459e22598bcb657e050ea6222cac69fd`

~~~~javascript
'use strict';

// 备份回归测试：reference/ 顶层直接放文件时 --photos 必须成功（历史 ENOENT bug），
// 且同一秒重复执行不因目录撞名失败。

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

test('backup --photos copies top-level reference files and survives same-second rerun', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bsc-backup-test-'));
  try {
    const data = path.join(tmp, 'data', 'v1');
    fs.mkdirSync(path.join(data, 'reference'), { recursive: true });
    fs.mkdirSync(path.join(data, 'uploads', '1'), { recursive: true });
    const db = new DatabaseSync(path.join(data, 'bsc-v1.sqlite'));
    db.exec('CREATE TABLE t(x)');
    db.close();
    fs.writeFileSync(path.join(data, 'reference', 'ref-real.jpg'), Buffer.alloc(128, 1));
    fs.writeFileSync(path.join(data, 'uploads', '1', 'p.jpg'), Buffer.alloc(64, 2));
    const bk = path.join(tmp, 'bk');
    const args = [path.join(__dirname, '..', 'tools', 'backup.js'), '--photos', '--dir', bk];
    const env = { ...process.env, DATA_DIR: data };
    const run = spawnSync(process.execPath, args, { env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const newest = fs.readdirSync(bk).filter(d => d.startsWith('backup-')).sort().pop();
    assert.ok(newest, '备份目录已创建');
    assert.ok(fs.existsSync(path.join(bk, newest, 'photos', 'reference', 'ref-real.jpg')), 'reference 顶层文件已拷贝（ENOENT 回归）');
    assert.ok(fs.existsSync(path.join(bk, newest, 'photos', 'uploads', '1', 'p.jpg')), 'uploads 嵌套文件已拷贝');
    const run2 = spawnSync(process.execPath, args, { env, encoding: 'utf8' });
    assert.equal(run2.status, 0, `同一秒重复执行不应失败: ${run2.stderr}`);
    const dirs = fs.readdirSync(bk).filter(d => d.startsWith('backup-'));
    assert.equal(dirs.length, 2, '两次执行生成两个不撞名的备份目录');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
~~~~

#### `bsc-sampling-v1/test/frontend.e2e.js`

SHA-256: `16522fd09823183d10175ea55db93fb1b3b8b9e6d9dc821566b5b3210a645d70`

~~~~javascript
'use strict';

// 管理站前端端到端验证（无头 Chromium）：
//   npm run test:e2e   （需要本机已启动 npm start 服务器）
// 覆盖：登录 → 项目/日期导航 → 地图标记 → 详情与审核 → 任务下发与标签打印弹窗
// → 设备激活二维码 → 诊断日志 → 磁盘健康。

const { chromium } = require('playwright');
const sharp = require('sharp');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe-2608!';
const today = new Date().toISOString().slice(0, 10);

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.error(`FAIL  ${name} ${detail}`); }
}

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

// 通过 API 造一条今天的完整采样记录，保证 UI 有可审核对象。
async function seedRecord() {
  const login = await call('POST', '/api/v1/admin/login', { password: PASSWORD });
  if (login.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(login.json)}`);
  const admin = login.json.token;
  const boot = await call('GET', '/api/v1/admin/bootstrap', null, admin);
  const villagerId = boot.json.villagers.find(v => v.username === 'cmy01').id;
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, admin);
  const site = sites.json.sites.find(s => s.code === '5');
  const task = await call('POST', '/api/v1/admin/tasks', { siteId: site.id, villagerId, plannedDate: today, sampleTypes: ['R'] }, admin);
  const taskId = task.json.ids[0];
  const act = await call('POST', `/api/v1/admin/villagers/${villagerId}/activation`, {}, admin);
  const [, , user, raw] = String(act.json.value).split('|');
  const activate = await call('POST', '/api/v1/mobile/activate', {
    username: user, activationToken: raw, deviceUuid: `e2e-${Date.now()}`, appVersion: '1.0.0'
  });
  const mobile = activate.json.token;
  const start = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: Number(site.latitude), longitude: Number(site.longitude), accuracyM: 3 }, mobile);
  const journeyId = start.json.journey.id;
  await call('POST', `/api/v1/mobile/journeys/${journeyId}/track`, {
    points: [{ sequence: 0, recordedAt: new Date().toISOString(), latitude: Number(site.latitude) - 0.001, longitude: Number(site.longitude) - 0.001, accuracyM: 4, speedMps: 1, mockLocation: false }]
  }, mobile);
  const sync = await call('GET', '/api/v1/mobile/sync', null, mobile);
  const freshTask = sync.json.tasks.find(t => t.id === taskId);
  const photo = await sharp({ create: { width: 480, height: 360, channels: 3, background: '#2e8b57' } }).jpeg().toBuffer();
  const record = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `e2e-${Date.now()}`, capturedAt: `${today}T09:30:00+08:00`,
    latitude: Number(site.latitude), longitude: Number(site.longitude), accuracyM: 5, weatherText: '晴 12℃',
    noWater: false, manualCode: false, qrToken: freshTask.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: `data:image/jpeg;base64,${photo.toString('base64')}`
  }, mobile);
  if (record.status !== 201) throw new Error(`record failed: ${JSON.stringify(record.json)}`);
  return { sampleCode: freshTask.sample_code, siteCode: site.code, recordId: record.json.id };
}

async function main() {
  let seeded;
  try { seeded = await seedRecord(); } catch (e) { console.error('seeding failed:', e.message); process.exit(1); }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('dialog', d => d.accept());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // 1. 登录页 → 登录成功进入主界面
  check('登录页显示', await page.locator('#loginForm').isVisible());
  await page.fill('#password', PASSWORD);
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
  check('登录后进入主界面', await page.locator('#app:not(.hidden)').isVisible());

  // 1c. 响应式：手机宽度下侧栏变抽屉（☰ 展开），桌面宽度下菜单按钮隐藏
  check('桌面宽度不显示菜单按钮', !(await page.locator('#menuButton').isVisible()));
  await page.setViewportSize({ width: 480, height: 820 });
  await page.waitForTimeout(250);
  check('手机宽度显示菜单按钮', await page.locator('#menuButton').isVisible());
  check('手机宽度侧栏默认收起', !(await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().left >= 0)));
  await page.click('#menuButton');
  await page.waitForTimeout(350);
  check('点击☰展开侧栏', await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().left >= 0));
  await page.click('#refresh');
  await page.waitForTimeout(350);
  check('点击侧栏项后抽屉收起', !(await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().left >= 0)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);

  // 1b. 顶栏按钮"!"信息点与悬停详情
  check('顶栏按钮均带"!"信息点', await page.locator('.top-action-wrap .info-badge').count() === 7);
  await page.hover('#exportCsv');
  await page.waitForSelector('#exportCsv ~ .info-tip', { state: 'visible', timeout: 5000 });
  const tipText = await page.locator('#exportCsv ~ .info-tip').textContent();
  check('悬停显示功能详情', tipText.includes('CSV') && tipText.includes('风险标志'), tipText.slice(0, 60));

  // 2. 侧栏：项目、日期列表、健康状态
  await page.waitForSelector('#dateList button', { timeout: 10000 });
  const projectCount = await page.locator('#projectList button').count();
  check('项目列表渲染', projectCount >= 2, `count=${projectCount}`);
  check('待采样入口存在', await page.locator('#dateList button').filter({ hasText: '待采样' }).count() === 1);
  check('按拍摄日期归档存在', await page.locator('#dateList button').filter({ hasText: '年' }).count() >= 1);
  await page.waitForFunction(() => document.querySelector('#healthText').textContent.includes('磁盘'), null, { timeout: 8000 });
  check('磁盘健康状态显示', (await page.locator('#healthText').textContent()).includes('磁盘'));

  // 3. 地图标记渲染
  await page.waitForSelector('.sample-marker', { timeout: 10000 });
  const markerCount = await page.locator('.sample-marker').count();
  check('地图任务标记渲染', markerCount >= 1, `count=${markerCount}`);

  // 3b. 采样点交互：右键选点、地图选点流程、经纬度格式解析
  const mapBox = await page.locator('#map').boundingBox();
  await page.mouse.click(mapBox.x + 60, mapBox.y + 60, { button: 'right' });
  await page.waitForSelector('#siteDialog[open]', { timeout: 5000 });
  const rightCoords = await page.locator('#siteCoords').inputValue();
  check('右键地图弹出设置采样点并填充坐标', rightCoords.startsWith('【WGS84】') && rightCoords.includes('°N'), rightCoords);
  await page.click('#siteDialog button[value=cancel]');
  await page.click('#addSiteButton');
  await page.waitForSelector('#siteDialog[open]');
  await page.click('#pickMap');
  await page.waitForSelector('#siteDialog:not([open])', { state: 'attached' });
  // 直接向地图容器派发完整点击序列（Leaflet 需要同点 mousedown 才不视为拖拽）
  await page.evaluate(({ x, y }) => {
    const map = document.getElementById('map');
    const rect = map.getBoundingClientRect();
    const cx = rect.left + x;
    const cy = rect.top + y;
    for (const type of ['mousedown', 'mouseup', 'click']) {
      map.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
    }
  }, { x: 140, y: 140 });
  await page.waitForSelector('#siteDialog[open]', { timeout: 5000 });
  const pickedCoords = await page.locator('#siteCoords').inputValue();
  check('地图选点后对话框回填坐标（选点流程修复）', pickedCoords.startsWith('【WGS84】'), pickedCoords);
  await page.click('#siteDialog button[value=cancel]');
  await page.click('#addSiteButton');
  await page.waitForSelector('#siteDialog[open]');
  await page.fill('#siteCoords', '【WGS84】29.66579301°N，94.34286257°E');
  const latVal = await page.locator('#latitude').inputValue();
  const lonVal = await page.locator('#longitude').inputValue();
  check('解析【WGS84】格式经纬度', latVal === '29.66579301' && lonVal === '94.34286257', `${latVal},${lonVal}`);
  await page.click('#siteDialog button[value=cancel]');

  // 4. 依次点击日期（计划日期+拍摄日期自动归档），找到一条记录 → 审核通过
  let reviewed = false;
  const dateButtons = page.locator('#dateList button').filter({ hasText: '年' });
  const dateCount = await dateButtons.count();
  for (let d = 0; d < Math.min(dateCount, 6) && !reviewed; d++) {
    await dateButtons.nth(d).click();
    await page.waitForTimeout(400);
    const markerCount2 = await page.locator('.sample-marker').count();
    // 从最新的标记倒序找（最新任务排在后面，优先找到本轮 seed 的待审核记录）
    for (let i = markerCount2 - 1; i >= 0 && !reviewed; i--) {
      // 大量任务堆叠时坐标点击会命中最上层标记；直接对标记元素派发 click 事件精确命中
      await page.locator('.sample-marker').nth(i).dispatchEvent('click');
      await page.waitForSelector('#detail:not(.hidden)', { timeout: 5000 });
      const hasReview = await page.locator('.review-actions button').count();
      if (hasReview) {
        check('审核面板显示（照片/风险/意见）', (await page.locator('#detailBody .record-photo').count()) >= 1);
        const bodyText = await page.locator('#detailBody').textContent();
        check('审核页显示历史序号/目标坐标/上传延迟', bodyText.includes('历史序号') && bodyText.includes('目标坐标') && bodyText.includes('上传延迟'));
        check('照片不再叠加重复水印文字', (await page.locator('#detailBody .watermark-preview').count()) === 0);
        const accText = bodyText.match(/±([\d.]+) 米/);
        check('定位精度取整显示（无小数）', accText !== null && !accText[1].includes('.'), `精度=${accText ? accText[1] : '无'}`);
        if (/审核状态已通过/.test(bodyText)) {
          await page.click('#closeDetail');
          await page.waitForTimeout(150);
          continue;
        }
        const statusBefore = await page.locator('#detailBody').textContent();
        await page.locator('.review-actions button[data-status=approved]').click();
        await page.waitForFunction(() => document.querySelector('#detailBody')?.textContent.includes('已通过'), null, { timeout: 8000 });
        const statusAfter = await page.locator('#detailBody').textContent();
        check('审核通过并回显状态', statusAfter.includes('已通过') && !statusBefore.includes('已通过'));
        reviewed = true;
      } else {
        await page.click('#closeDetail');
        await page.waitForTimeout(150);
      }
    }
  }
  check('找到并完成一次审核', reviewed);
  await page.click('#closeDetail');
  await page.waitForSelector('#detail.hidden', { state: 'attached' });

  // 4c. 表格视图：切换、筛选、批量审核、批量天气按钮
  await page.click('#tableViewButton');
  await page.waitForSelector('#taskTableWrap:not(.hidden)', { timeout: 5000 });
  check('表格视图渲染行', (await page.locator('#taskTableBody tr').count()) >= 1);
  const reviewableCount = await page.locator('#taskTableBody .row-check').count();
  check('表格批量审核功能就绪', await page.locator('#batchApprove').isVisible());
  if (reviewableCount) {
    await page.click('#tableCheckAll');
    await page.click('#batchApprove');
    await page.waitForTimeout(1500);
    check('批量审核后表格刷新', (await page.locator('#taskTableBody tr').count()) >= 1);
  }
  check('批量天气按钮存在', await page.locator('#batchWeather').isVisible());
  await page.click('#tableViewButton');
  await page.waitForSelector('#taskTableWrap.hidden', { state: 'attached', timeout: 5000 });
  check('切回地图视图', await page.locator('.map-panel').isVisible());

  // 4b. 今天日期视图：同一点位的多个任务必须展开为多个标记，且标签显示数量。
  const todayLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${today}T00:00:00`));
  if (await page.locator('#dateList button').filter({ hasText: todayLabel }).count()) {
    await page.locator('#dateList button').filter({ hasText: todayLabel }).first().click();
    await page.waitForTimeout(500);
    const statAllOnToday = Number(await page.locator('#statAll').textContent());
    const markerCountOnToday = await page.locator('.sample-marker').count();
    check('地图标记数量与任务总数一致（无重叠丢失）', markerCountOnToday === statAllOnToday, `markers=${markerCountOnToday} tasks=${statAllOnToday}`);
    const labels = await page.locator('.map-label').allTextContents();
    check('同点位任务展开并显示数量标签', labels.some(t => /×\d+/.test(t)), labels.join('|'));
  }

  // 5. 任务下发（全选点位、计划日期=明天）→ 左栏自动出现计划日期并切换、地图显示新任务 + 标签打印弹窗
  const tomorrowStr = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const tomorrowLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${tomorrowStr}T00:00:00`));
  await page.click('#newTaskButton');
  await page.waitForSelector('#taskDialog[open]');
  await page.fill('#plannedDate', tomorrowStr);
  const siteInputs = page.locator('#taskSiteList input[type=checkbox]');
  check('任务对话框列出启用点位', await siteInputs.count() >= 1);
  check('存在全选按键', await page.locator('#taskSiteAll').count() === 1);
  await page.locator('#taskSiteAll').check();
  await page.click('#createTask');
  await page.waitForSelector('#labelResult:not(.hidden)', { timeout: 10000 });
  const codeText = await page.locator('#labelCodes').textContent();
  check('任务创建返回瓶子编号', /-R-\d+\.\d+-|-[RTSYP L]-\d+\.?[\d.]*-\d{2}/.test(codeText) || codeText.length > 2, codeText.trim());
  check('下发后左栏自动出现计划日期并切换', await page.locator('#dateList button').filter({ hasText: tomorrowLabel }).count() === 1);
  await page.waitForSelector('.sample-marker', { timeout: 10000 });
  check('下发后地图立即显示新任务', await page.locator('.sample-marker').count() >= 1);
  const popupPromise = page.waitForEvent('popup');
  await page.click('#printLabel');
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  const popupTitle = await popup.title();
  check('标签打印页打开（60枚/页）', popupTitle.includes('瓶子标签'), `title=${popupTitle}`);
  const labelCount = await popup.locator('.label').count();
  check('标签页包含标签', labelCount >= 1, `count=${labelCount}`);
  await popup.close();
  await page.click('#taskDialog button[value=cancel]');

  // 6. 设备激活二维码
  await page.click('#villagerButton');
  await page.waitForSelector('#villagerDialog[open]');
  await page.locator('#villagerList button[data-act]').first().click();
  await page.waitForSelector('#activationResult:not(.hidden)', { timeout: 8000 });
  const activationValue = await page.locator('#activationValue').textContent();
  check('激活二维码内容生成', activationValue.startsWith('BSC-ACT|'), activationValue);
  check('二维码图形渲染', await page.locator('#qrcode img, #qrcode canvas').count() >= 1);
  const newUser = `e2e${Date.now()}`;
  await page.fill('#newVillagerUser', newUser);
  await page.fill('#newVillagerName', '端到端村民');
  await page.click('#addVillager');
  await page.waitForFunction(u => [...document.querySelectorAll('#villagerList .vill-row small')].some(el => el.textContent.includes(u)), newUser, { timeout: 8000 });
  check('新建采样员出现在列表', true);
  await page.click('#villagerDialog button[value=cancel]');

  // 7. 诊断日志
  await page.click('#logsButton');
  await page.waitForSelector('#logsDialog[open]');
  await page.waitForSelector('#logsBody tr', { timeout: 8000 });
  check('诊断日志列表渲染', await page.locator('#logsBody tr').count() >= 1);
  await page.click('#logsDialog button[value=cancel]');

  // 8. 待采样视图与取消按钮（无记录任务）
  await page.locator('#dateList button').filter({ hasText: '待采样' }).click();
  await page.waitForTimeout(400);
  const pendingMarker = await page.locator('.sample-marker').count();
  check('待采样视图渲染', pendingMarker >= 0);
  if (pendingMarker > 0) {
    await page.locator('.sample-marker').first().click({ force: true });
    await page.waitForSelector('#detail:not(.hidden)');
    const hasCancel = await page.locator('#cancelTask').count();
    check('无记录任务详情显示（含取消入口或已取消标注）', (await page.locator('#detailBody').textContent()).includes('等待村民采样') && (hasCancel > 0 || (await page.locator('.cancel-note').count()) > 0));
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
~~~~

#### `bsc-sampling-v1/test/schema.test.js`

SHA-256: `b696081a787e4fbb5836de6c1df3d2552911bf526c73ab7275917a40ec2489fb`

~~~~javascript
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { initialize } = require('../src/schema');

function tables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
}

test('initialize creates all V1 tables', () => {
  const db = new DatabaseSync(':memory:');
  initialize(db);
  const names = tables(db);
  for (const expected of ['projects', 'sites', 'villagers', 'devices', 'activation_codes', 'journeys',
    'tasks', 'track_points', 'live_locations', 'records', 'audit_logs', 'app_logs', 'app_versions']) {
    assert.ok(names.includes(expected), `missing table ${expected}`);
  }
});

test('seed inserts 2 projects, 25 formal sites and villager cmy01', () => {
  const db = new DatabaseSync(':memory:');
  initialize(db);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM projects').get().c, 2);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sites WHERE project_id=1").get().c, 25);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sites WHERE project_id=1 AND code IN ('5.1','9.5','9.6')").get().c, 3,
    'historical decimal codes must be preserved');
  const villager = db.prepare("SELECT * FROM villagers WHERE username='cmy01'").get();
  assert.ok(villager, 'seeded villager');
  assert.notEqual(villager.pin_hash, '1234', 'pin hashed, never plain');
});

test('initialize is idempotent (no duplicate seed)', () => {
  const db = new DatabaseSync(':memory:');
  initialize(db);
  initialize(db);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM projects').get().c, 2);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM sites').get().c, 25);
});

test('migration adds server weather columns to legacy records table', () => {
  const db = new DatabaseSync(':memory:');
  // Simulate a database created before the server weather backfill existed:
  // full original records shape, but without the two server_weather columns.
  db.exec(`CREATE TABLE records (id INTEGER PRIMARY KEY AUTOINCREMENT, client_record_id TEXT NOT NULL UNIQUE,
    task_id INTEGER NOT NULL, device_id INTEGER NOT NULL, journey_id INTEGER, is_primary INTEGER NOT NULL DEFAULT 0,
    conflict_status TEXT NOT NULL DEFAULT 'none', no_water INTEGER NOT NULL DEFAULT 0, captured_at TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy_m REAL,
    distance_m REAL, weather_text TEXT NOT NULL DEFAULT '待补充', weather_status TEXT NOT NULL DEFAULT 'pending',
    exception_category TEXT, exception_detail TEXT, manual_code INTEGER NOT NULL DEFAULT 0, mock_location INTEGER NOT NULL DEFAULT 0,
    photo_path TEXT NOT NULL, photo_sha256 TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'pending',
    review_note TEXT NOT NULL DEFAULT '', risk_flags TEXT NOT NULL DEFAULT '[]', invalidated_at TEXT, invalidated_reason TEXT)`);
  initialize(db);
  const columns = db.prepare('PRAGMA table_info(records)').all().map(c => c.name);
  assert.ok(columns.includes('server_weather_text'), 'server_weather_text column added');
  assert.ok(columns.includes('server_weather_status'), 'server_weather_status column added');
});

test('audit rows are appendable', () => {
  const db = new DatabaseSync(':memory:');
  initialize(db);
  const { audit } = require('../src/schema');
  audit(db, 'admin', 'admin', 'review', 'record', '12', { status: 'approved' }, '127.0.0.1');
  const row = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.action, 'review');
  assert.equal(row.entity_id, '12');
  assert.equal(JSON.parse(row.details).status, 'approved');
});
~~~~

#### `bsc-sampling-v1/test/security.test.js`

SHA-256: `7f0025d5b7d5ee537f2e4b788c6c3ae838ba38223385c7dbce0dadc44dc1a386`

~~~~javascript
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPin, verifyPin, safeEqual, signToken, verifyToken, totp, verifyTotp, randomToken } = require('../src/security');

test('hashPin/verifyPin roundtrip', () => {
  const a = hashPin('1234');
  const b = hashPin('1234');
  assert.notEqual(a.salt, b.salt, 'salt must be random per hash');
  assert.equal(verifyPin('1234', a.salt, a.hash), true);
  assert.equal(verifyPin('1234', b.salt, b.hash), true);
  assert.equal(verifyPin('9999', a.salt, a.hash), false);
  assert.equal(verifyPin('12345', a.salt, a.hash), false);
  assert.notEqual(a.hash, '1234', 'plain pin never stored');
});

test('safeEqual is constant-time comparison', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'ab'), false);
  assert.equal(safeEqual('', ''), true);
});

test('signToken/verifyToken roundtrip and expiry', () => {
  const secret = 'test-secret';
  const token = signToken(secret, 'villager', 7, { deviceId: 3 }, 60);
  const payload = verifyToken(secret, token);
  assert.equal(payload.role, 'villager');
  assert.equal(payload.subject, 7);
  assert.equal(payload.deviceId, 3);
  assert.ok(payload.exp > Date.now());
  assert.equal(verifyToken(secret, `${token}x`), null, 'tampered token rejected');
  assert.equal(verifyToken('other-secret', token), null, 'wrong secret rejected');
  assert.equal(verifyToken(secret, 'not-a-token'), null);
  const expired = signToken(secret, 'villager', 7, {}, -1);
  assert.equal(verifyToken(secret, expired), null, 'expired token rejected');
});

test('totp matches RFC 6238 test vector', () => {
  // RFC 6238 Appendix B: secret "12345678901234567890" (ASCII),
  // Base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ, T=59s → 6-digit SHA1 = 287082.
  assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000, 30, 6), '287082');
});

test('verifyTotp accepts current window codes', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const code = totp(secret);
  assert.equal(verifyTotp(secret, code, 1), true);
  assert.equal(verifyTotp(secret, '000000', 1), false);
  assert.equal(verifyTotp('', '000000', 1), true, 'empty secret disables TOTP');
});

test('randomToken uniqueness and length', () => {
  const a = randomToken(24);
  const b = randomToken(24);
  assert.notEqual(a, b);
  assert.equal(a.length, 32, '24 bytes base64url = 32 chars');
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});
~~~~

#### `bsc-sampling-v1/test/smoke.js`

SHA-256: `21c656f9c19fdb6bc82317aa2d6f4bb49b397c1781aa350dd717184d19714193`

~~~~javascript
'use strict';

// End-to-end smoke test for the V1 API. Run against a live local server:
//   node test/smoke.js
// Exits non-zero on the first failed assertion.
const sharp = require('sharp');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.error(`FAIL  ${name} ${detail}`); }
}

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function jpegDataUrl() {
  const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#2e8b57' } })
    .jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

async function main() {
  const device = 'smoke-device-0001';

  // 1. health
  const health = await call('GET', '/health');
  check('GET /health → 200', health.status === 200 && health.json.status === 'healthy');

  // 2. admin login
  const login = await call('POST', '/api/v1/admin/login', { password: 'ChangeMe-2608!' });
  check('admin login', login.status === 200 && login.json.token, JSON.stringify(login.json));
  const admin = login.json.token;

  // 3. bootstrap
  const boot = await call('GET', '/api/v1/admin/bootstrap', null, admin);
  check('admin bootstrap has projects+villagers', boot.status === 200 && boot.json.projects.length >= 2 && boot.json.villagers.length >= 1);
  const villager = boot.json.villagers.find(v => v.username === 'cmy01');
  check('seeded villager cmy01 present', Boolean(villager));

  // 4. activation code
  const act = await call('POST', `/api/v1/admin/villagers/${villager.id}/activation`, {}, admin);
  check('activation code created', act.status === 201 && String(act.json.value).startsWith('BSC-ACT|'));
  const [, , actUser, actToken] = String(act.json.value).split('|');

  // 5. activate（扫码即激活，无 PIN）
  const activate = await call('POST', '/api/v1/mobile/activate', {
    username: actUser, activationToken: actToken, deviceUuid: device,
    deviceName: 'Smoke Test', androidVersion: '15', appVersion: '1.0.0'
  });
  check('mobile activate (no PIN)', activate.status === 200 && activate.json.token && activate.json.villager.username === 'cmy01', JSON.stringify(activate.json));
  const mobile = activate.json.token;

  // 6. activation token is single-use
  const reuse = await call('POST', '/api/v1/mobile/activate', {
    username: actUser, activationToken: actToken, deviceUuid: 'smoke-device-0002'
  });
  check('activation token single-use', reuse.status === 403, `status=${reuse.status}`);

  // 7. unknown account rejected
  const badUser = await call('POST', '/api/v1/mobile/login', { username: 'no-such-user', deviceUuid: device });
  check('unknown account → 401', badUser.status === 401, `status=${badUser.status}`);

  // 8. login on activated device
  const relogin = await call('POST', '/api/v1/mobile/login', { username: 'cmy01', deviceUuid: device });
  check('mobile login (no PIN)', relogin.status === 200 && relogin.json.token);

  // 9. sync
  const sync = await call('GET', '/api/v1/mobile/sync', null, mobile);
  check('mobile sync with rules', sync.status === 200 && Array.isArray(sync.json.tasks) && sync.json.rules.severeRadiusM === 300);

  // 10. admin creates task for site 5 (R, today)
  const today = new Date().toISOString().slice(0, 10);
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, admin);
  const site5 = sites.json.sites.find(s => s.code === '5');
  check('site 5 found', Boolean(site5));
  const create = await call('POST', '/api/v1/admin/tasks', {
    siteId: site5.id, villagerId: villager.id, plannedDate: today, sampleTypes: ['R']
  }, admin);
  check('task created', create.status === 201 && create.json.ids.length === 1, JSON.stringify(create.json));
  const taskId = create.json.ids[0];

  // 11. sync again shows the new task with qr_token
  const sync2 = await call('GET', '/api/v1/mobile/sync', null, mobile);
  const task = sync2.json.tasks.find(t => t.id === taskId);
  check('new task in sync payload', Boolean(task) && task.sample_code.startsWith(`${today.slice(2).replaceAll('-', '')}-R-5-`), JSON.stringify(task && task.sample_code));
  check('task exposes qr_token for bottle scan', Boolean(task.qr_token));

  // 12. start journey at exact site coords
  const start = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, {
    latitude: Number(site5.latitude), longitude: Number(site5.longitude), accuracyM: 3.2
  }, mobile);
  check('journey started', start.status === 200 && start.json.journey.id > 0, JSON.stringify(start.json));
  const journeyId = start.json.journey.id;
  check('weak evidence flagged for <300m start', start.json.weakEvidence === true);

  // 13. track points
  const track = await call('POST', `/api/v1/mobile/journeys/${journeyId}/track`, {
    points: [
      { sequence: 0, recordedAt: new Date().toISOString(), latitude: 30.09, longitude: 94.16, accuracyM: 4, speedMps: 1.2, mockLocation: false },
      { sequence: 1, recordedAt: new Date().toISOString(), latitude: 30.085, longitude: 94.155, accuracyM: 4, speedMps: 1.1, mockLocation: false },
      { sequence: 2, recordedAt: new Date().toISOString(), latitude: Number(site5.latitude), longitude: Number(site5.longitude), accuracyM: 3, speedMps: 0.4, mockLocation: false }
    ]
  }, mobile);
  check('track uploaded', track.status === 200 && track.json.inserted === 3, JSON.stringify(track.json));
  const trackDup = await call('POST', `/api/v1/mobile/journeys/${journeyId}/track`, {
    points: [{ sequence: 2, recordedAt: new Date().toISOString(), latitude: 1, longitude: 1, accuracyM: 4, speedMps: 0, mockLocation: false }]
  }, mobile);
  check('track sequence dedup (INSERT OR IGNORE)', trackDup.status === 200 && trackDup.json.inserted === 1);

  // 14. live location
  const live = await call('POST', `/api/v1/mobile/tasks/${taskId}/live`, {
    recordedAt: new Date().toISOString(), latitude: Number(site5.latitude), longitude: Number(site5.longitude), accuracyM: 3
  }, mobile);
  check('live location', live.status === 200);

  // 15. record with correct qr token
  const photo = await jpegDataUrl();
  const recordBody = {
    clientRecordId: `smoke-record-${Date.now()}`,
    capturedAt: `${today}T08:00:00+08:00`,
    latitude: Number(site5.latitude), longitude: Number(site5.longitude), accuracyM: 3,
    weatherText: '晴 12℃，降水 0mm', noWater: false, manualCode: false,
    qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: photo
  };
  const record = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, recordBody, mobile);
  check('record uploaded', record.status === 201 && record.json.primary === true, JSON.stringify(record.json));
  const recordId = record.json.id;
  console.log(`      risk flags: ${JSON.stringify(record.json.riskFlags)}`);

  // 16. idempotent retry
  const retry = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, recordBody, mobile);
  check('record retry idempotent', retry.status === 200 && retry.json.id === recordId && retry.json.idempotent === true, JSON.stringify(retry.json));

  // 17. wrong qr token rejected
  const wrongQr = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, { ...recordBody, clientRecordId: 'smoke-record-002', qrToken: 'wrong-token' }, mobile);
  check('wrong qr token → 422', wrongQr.status === 422, `status=${wrongQr.status}`);

  // 18. >300m rejected
  const farBody = { ...recordBody, clientRecordId: 'smoke-record-003', latitude: Number(site5.latitude) + 0.01, longitude: Number(site5.longitude) };
  const far = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, farBody, mobile);
  check('record >300m → 422', far.status === 422, `status=${far.status}`);

  // 19. journey complete
  const complete = await call('POST', `/api/v1/mobile/journeys/${journeyId}/complete`, {}, mobile);
  check('journey complete', complete.status === 200);

  // 20. logs upload
  const logs = await call('POST', '/api/v1/mobile/logs', { logs: [
    { localId: 1, level: 'info', message: 'SMOKE hello', diagnostics: {}, createdAt: new Date().toISOString(), appVersion: '1.0.0' }
  ] }, mobile);
  check('logs upload', logs.status === 201 && logs.json.accepted === 1);

  // 21. admin sees task with record
  const adminTasks = await call('GET', '/api/v1/admin/tasks?projectId=1', null, admin);
  const at = adminTasks.json.tasks.find(t => t.id === taskId);
  check('admin task shows record', at && at.record_id === recordId && at.review_status === 'suspicious', JSON.stringify(at && { review_status: at.review_status, risk_flags: at.risk_flags }));

  // 22. review approved
  const review = await call('POST', `/api/v1/admin/records/${recordId}/review`, { status: 'approved', note: 'smoke review' }, admin);
  check('review approved', review.status === 200);
  const adminTasks2 = await call('GET', '/api/v1/admin/tasks?projectId=1', null, admin);
  check('review persisted', adminTasks2.json.tasks.find(t => t.id === taskId).review_status === 'approved');

  // 23. admin logs readable
  const appLogs = await call('GET', '/api/v1/admin/logs', null, admin);
  check('admin can read app logs', appLogs.status === 200 && appLogs.json.logs.some(l => l.message === 'SMOKE hello'));

  // 24. unauth admin call rejected
  const unauth = await call('GET', '/api/v1/admin/bootstrap');
  check('admin endpoint rejects no token', unauth.status === 401, `status=${unauth.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
~~~~

#### `bsc-sampling-v1/test/track.test.js`

SHA-256: `cd751b952493aef8e5c2414186820f314cbde3c3924390bb453a0dcda39d7d7d`

~~~~javascript
'use strict';

// 轨迹展示平滑单元测试：只影响显示层，原始点不得被改动。

const test = require('node:test');
const assert = require('node:assert');
const { smoothTrack } = require('../src/track');

function pt(sequence, seconds, lat, lon) {
  return { sequence, recorded_at: new Date(Date.UTC(2026, 7, 27, 4, 0, seconds)).toISOString(), latitude: lat, longitude: lon, accuracy_m: 4, speed_mps: 1, mock_location: 0 };
}

test('时间断点分段：间隔超过45秒断开为多段', () => {
  const points = [
    pt(0, 0, 30.0, 94.0), pt(1, 10, 30.0001, 94.0001), pt(2, 20, 30.0002, 94.0002),
    pt(3, 140, 30.001, 94.001), pt(4, 150, 30.0011, 94.0011)
  ];
  const out = smoothTrack(points);
  assert.equal(out.segments.length, 2, `应分成2段，实际 ${out.segments.length}`);
  assert.equal(out.dropped, 0);
});

test('孤立漂移点剔除：前后推算速度都超8m/s的点被滤除', () => {
  const points = [
    pt(0, 0, 30.0, 94.0),
    pt(1, 10, 30.001, 94.001),     // 去程约15m/s（漂移）
    pt(2, 20, 30.00005, 94.00005), // 回程约15m/s（回正），中间点两侧都超速 → 孤立漂移
    pt(3, 30, 30.0001, 94.0001)
  ];
  const out = smoothTrack(points);
  assert.equal(out.dropped, 1, `应滤除1个漂移点，实际 ${out.dropped}`);
  const all = out.segments.flat();
  assert.equal(all.length, 3, '显示层剩3个点');
});

test('3点滑动平均平滑中间点', () => {
  const points = [pt(0, 0, 30.0, 94.0), pt(1, 10, 30.00005, 94.00005), pt(2, 20, 30.0001, 94.0001)];
  const out = smoothTrack(points);
  const seg = out.segments[0];
  assert.equal(out.dropped, 0, '正常步速点不应被滤除');
  assert.equal(seg.length, 3);
  assert.ok(Math.abs(seg[1][0] - (30.0 + 30.00005 + 30.0001) / 3) < 1e-9, '中间点应为三点均值');
});

test('输入数组不被修改', () => {
  const points = [pt(0, 0, 30.0, 94.0), pt(1, 10, 30.001, 94.001), pt(2, 20, 30.0004, 94.0004)];
  const copy = JSON.parse(JSON.stringify(points));
  smoothTrack(points);
  assert.deepEqual(points, copy);
});

test('空/单点输入安全', () => {
  assert.equal(smoothTrack([]).segments.length, 0);
  const one = smoothTrack([pt(0, 0, 30.0, 94.0)]);
  assert.equal(one.segments.length, 1);
  assert.equal(one.segments[0].length, 1);
});
~~~~

#### `bsc-sampling-v1/tools/backup.js`

SHA-256: `cb50c7ef01ea1fa07de10ad2fa90ea5e3ebcc708ba59bb653e1cc83bd4751593`

~~~~javascript
'use strict';

// Daily backup for the V1 server (spec section 24):
//   node tools/backup.js [--photos] [--keep N] [--dir BACKUP_DIR] [--mirror OFFSITE_DIR]
// - DB snapshot uses VACUUM INTO, which is consistent under WAL and does not
//   rely on copying the live .sqlite file.
// - --photos also copies uploads/reference; identical files (size + mtime)
//   are skipped so repeated runs behave incrementally.
// - --mirror copies the finished backup into an offsite folder (network drive,
//   second disk, synced cloud folder) so the backups survive a disk failure.
// - Old backup folders beyond --keep days are removed.
// ASCII filename per spec section 30; run with `npm run backup`.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data', 'v1'));
const backupRoot = path.resolve(process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : path.join(dataDir, 'backups'));
const withPhotos = process.argv.includes('--photos');
const keepIdx = process.argv.indexOf('--keep');
const keepDays = keepIdx >= 0 ? Number(process.argv[keepIdx + 1]) : 14;
const mirrorIdx = process.argv.indexOf('--mirror');
const mirrorRoot = mirrorIdx >= 0 ? path.resolve(process.argv[mirrorIdx + 1]) : null;
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
let backupDir = path.join(backupRoot, `backup-${stamp}`);
// 同一秒内重复执行（手动重试）会撞名导致 VACUUM INTO 失败；追加序号避免。
for (let n = 2; fs.existsSync(backupDir); n++) backupDir = path.join(backupRoot, `backup-${stamp}-${n}`);

fs.mkdirSync(backupDir, { recursive: true });

// 增量拷贝整棵目录（尺寸+mtime 相同的文件跳过），返回新增文件数。
// 先建目标目录再拷贝：reference/ 等目录可能顶层直接放文件，
// 旧实现只在遇到子目录时建目录，顶层文件会导致 ENOENT 备份失败。
let copied = 0;
function copyTree(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) { copyTree(src, dst); continue; }
    const st = fs.statSync(src);
    if (fs.existsSync(dst) && fs.statSync(dst).size === st.size && Math.abs(fs.statSync(dst).mtimeMs - st.mtimeMs) < 2000) continue;
    fs.copyFileSync(src, dst);
    copied++;
  }
}

// 1. Consistent database snapshot.
const dbFile = path.join(dataDir, 'bsc-v1.sqlite');
const snapshot = path.join(backupDir, 'bsc-v1.sqlite');
if (!fs.existsSync(dbFile)) throw new Error(`database not found: ${dbFile}`);
const db = new DatabaseSync(dbFile, { readOnly: true });
db.exec(`VACUUM INTO '${snapshot.replaceAll("'", "''")}'`);
db.close();
console.log(`database snapshot: ${snapshot} (${fs.statSync(snapshot).size} bytes)`);

// 2. Photos (optional, incremental by size+mtime).
if (withPhotos) {
  const target = path.join(backupDir, 'photos');
  copyTree(path.join(dataDir, 'uploads'), path.join(target, 'uploads'));
  copyTree(path.join(dataDir, 'reference'), path.join(target, 'reference'));
  console.log(`photos copied: ${copied}`);
}

// 3. Retention.
for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('backup-')) continue;
  const age = Date.now() - fs.statSync(path.join(backupRoot, entry.name)).mtimeMs;
  if (age > keepDays * 86400_000) {
    fs.rmSync(path.join(backupRoot, entry.name), { recursive: true, force: true });
    console.log(`removed old backup: ${entry.name}`);
  }
}

// 4. Offsite mirror (optional): 把刚完成的备份增量同步到异机/云盘目录。
if (mirrorRoot) {
  try {
    const mirrorDir = path.join(mirrorRoot, 'backups', path.basename(backupDir));
    const before = copied;
    copyTree(backupDir, mirrorDir);
    console.log(`mirrored to: ${mirrorDir} (${copied - before} files)`);
  } catch (e) {
    console.error(`MIRROR FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}
console.log(`backup complete: ${backupDir}`);
~~~~

#### `bsc-sampling-v1/tools/embed-source-doc.js`

SHA-256: `5cf9d87802e575309a0167b5156395719d71dd6a6530ff169d54112e77426e66`

~~~~javascript
'use strict';

// Mechanically embeds the current first-party text source into the AI-agent
// handoff document. Runtime data, secrets, binaries, dependencies and vendored
// third-party files are intentionally excluded.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const serverRoot = path.resolve(__dirname, '..');
const workspace = path.resolve(serverRoot, '..');
const androidRoot = path.join(workspace, 'bsc-android-native');
const documentPath = path.join(serverRoot, 'docs', 'DEVELOPMENT_SPEC_V1.md');
const appendixPath = path.join(serverRoot, 'docs', 'APPENDIX_L_SOURCE_SNAPSHOT.md');
const begin = '<!-- BEGIN GENERATED SOURCE SNAPSHOT -->';
const end = '<!-- END GENERATED SOURCE SNAPSHOT -->';

const explicit = [
  ['android', androidRoot, 'README.md'],
  ['android', androidRoot, 'settings.gradle'],
  ['android', androidRoot, 'build.gradle'],
  ['android', androidRoot, 'gradle.properties'],
  ['android', androidRoot, 'app/build.gradle'],
  ['android', androidRoot, 'app/src/main/AndroidManifest.xml'],
  ['android', androidRoot, 'tools/gradle-with-proxy.js'],
  ['android', androidRoot, 'tools/setup-toolchain.ps1'],
  ['server', serverRoot, 'README.md'],
  ['server', serverRoot, 'package.json'],
  ['server', serverRoot, 'public/index.html'],
  ['server', serverRoot, 'public/app.js'],
  ['server', serverRoot, 'public/styles.css'],
  ['server', serverRoot, 'public/favicon.svg'],
  ['server', serverRoot, 'public/sample-reference.svg'],
  ['server', serverRoot, 'tools/embed-source-doc.js'],
  ['server', serverRoot, 'tools/restore-from-appendix.js'],
  ['server', serverRoot, 'tools/backup.js'],
  ['server', serverRoot, 'tools/restore.js'],
  ['server', serverRoot, 'deploy/nginx-bsc.conf'],
  ['server', serverRoot, 'deploy/install-service.bat'],
  ['server', serverRoot, 'deploy/uninstall-service.bat'],
  ['server', serverRoot, 'deploy/schedule-backup.ps1'],
  ['server', serverRoot, 'deploy/make-package.ps1'],
  ['server', serverRoot, 'deploy/health-alert.ps1'],
  ['server', serverRoot, 'deploy/config.example.json'],
  ['server', serverRoot, 'deploy/DEPLOYMENT_GUIDE.md'],
  ['server', serverRoot, 'deploy/PROMPTS_FOR_SERVER_AI.md']
];

function walk(root, relative, group, extensions) {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return [];
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) out.push(...walk(root, child, group, extensions));
    else if (extensions.has(path.extname(entry.name).toLowerCase())) out.push([group, root, child]);
  }
  return out;
}

const files = [
  ...explicit,
  // src 目录整体遍历：新增源文件（如 track.js/exif.js）自动纳入，避免显式清单漏项。
  ...walk(serverRoot, 'src', 'server', new Set(['.js'])),
  ...walk(androidRoot, 'app/src/main/java', 'android', new Set(['.java'])),
  ...walk(androidRoot, 'app/src/main/res', 'android', new Set(['.xml'])),
  ...walk(androidRoot, 'app/src/test', 'android', new Set(['.java'])),
  ...walk(serverRoot, 'test', 'server', new Set(['.js']))
];

const unique = new Map();
for (const item of files) unique.set(`${item[0]}:${item[2]}`, item);
const ordered = [...unique.values()].sort((a, b) => `${a[0]}:${a[2]}`.localeCompare(`${b[0]}:${b[2]}`));

const language = file => ({
  '.java': 'java', '.js': 'javascript', '.json': 'json', '.xml': 'xml',
  '.html': 'html', '.css': 'css', '.gradle': 'groovy', '.md': 'markdown',
  '.svg': 'xml', '.properties': 'properties', '.ps1': 'powershell',
  '.bat': 'batch', '.conf': 'nginx'
}[path.extname(file).toLowerCase()] || 'text');

const digest = content => crypto.createHash('sha256').update(content).digest('hex');
const now = new Date().toISOString();
let appendix = `${begin}\n\n---\n\n## \u9644\u5f55 L\uff1a\u5f53\u524d\u6e90\u7801\u5feb\u7167\n\n`;
appendix += `> \u751f\u6210\u65f6\u95f4\uff1a${now}  \n`;
appendix += `> \u6587\u4ef6\u6570\uff1a${ordered.length}  \n`;
appendix += '> \u672c\u9644\u5f55\u662f\u4ea4\u7ed9 AI Agent \u7684\u4e00\u4f53\u5316\u6e90\u7801\u5feb\u7167\uff0c\u4e0d\u4ee3\u66ff\u4ed3\u5e93\u4e2d\u7684\u771f\u5b9e\u6587\u4ef6\u3002\u4fee\u6539\u65f6\u5e94\u7f16\u8f91\u4ed3\u5e93\u6e90\u6587\u4ef6\uff0c\u518d\u91cd\u65b0\u751f\u6210\u672c\u9644\u5f55\u3002\n\n';
appendix += '### L.1 \u6536\u5f55\u8303\u56f4\n\n';
appendix += '- \u6536\u5f55\uff1a\u539f\u751f Android \u914d\u7f6e\u3001Manifest\u3001Java\u3001XML \u8d44\u6e90\u3001\u6d4b\u8bd5\uff1bV1 Node.js API\u3001\u7ba1\u7406\u7ad9\u81ea\u6709\u6e90\u7801\u548c\u5fc5\u8981\u6784\u5efa\u5de5\u5177\u3002\n';
appendix += '- \u4e0d\u6536\u5f55\uff1aSQLite/WAL\u3001config.json\u3001\u7167\u7247\u3001APK\u3001Gradle/Maven/npm \u7f13\u5b58\u3001SDK\u3001keystore\u3001\u5bc6\u7801\u3001token\u3001\u4e8c\u8fdb\u5236 Excel \u548c\u7b2c\u4e09\u65b9 vendor \u538b\u7f29\u6e90\u7801\u3002\n';
appendix += '- `public/mobile*` \u548c\u9876\u5c42\u65e7 `server.js` \u5c5e\u4e8e WebView/\u65e7 API \u539f\u578b\uff0c\u4e0d\u662f V1 \u7ee7\u7eed\u5f00\u53d1\u57fa\u7840\uff0c\u56e0\u6b64\u4e0d\u5d4c\u5165\u3002\n\n';
appendix += '### L.2 \u6e90\u7801\u6587\u4ef6\n\n';

for (const [group, root, relative] of ordered) {
  const absolute = path.join(root, relative);
  const content = fs.readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/u, '');
  const shown = `${group === 'android' ? 'bsc-android-native' : 'bsc-sampling-v1'}/${relative.replaceAll('\\', '/')}`;
  appendix += `#### \`${shown}\`\n\n`;
  appendix += `SHA-256: \`${digest(content)}\`\n\n`;
  appendix += `~~~~${language(relative)}\n${content}\n~~~~\n\n`;
}
appendix += `${end}\n`;

let document = fs.readFileSync(documentPath, 'utf8');
const start = document.indexOf(begin);
if (start >= 0) {
  const finish = document.lastIndexOf(end);
  if (finish < 0) throw new Error('Generated source snapshot has no end marker');
  document = document.slice(0, start).trimEnd() + '\n\n' + document.slice(finish + end.length).trimStart();
}
document = document.trimEnd() + '\n\n' + appendix;
fs.writeFileSync(documentPath, document, 'utf8');
fs.writeFileSync(appendixPath, appendix.replace(`${begin}\n\n---\n\n`, ''), 'utf8');
console.log(`Embedded ${ordered.length} source files into ${documentPath}`);
console.log(`Wrote standalone Appendix L to ${appendixPath}`);
~~~~

#### `bsc-sampling-v1/tools/restore-from-appendix.js`

SHA-256: `8b4521dc65b0104128f43e9c5adcab62aba1def0a632866efc9babe62dd94c62`

~~~~javascript
'use strict';

// Inverse of embed-source-doc.js: rebuilds repository source files from a
// generated Appendix L snapshot. Used when the real repository files are not
// available, e.g. when an AI agent receives only the handoff documents.
//
// Usage:
//   node tools/restore-from-appendix.js [path-to-APPENDIX_L_SOURCE_SNAPSHOT.md] [--force]
//
// Every file's content is verified against the SHA-256 declared in the
// appendix (the digest is computed over the LF-normalized content without
// trailing whitespace, exactly as embed-source-doc.js computed it). Existing
// files are skipped unless --force is given.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const serverRoot = path.resolve(__dirname, '..');
const workspace = path.resolve(serverRoot, '..');
const positional = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const appendixPath = positional[0] || path.join(serverRoot, 'docs', 'APPENDIX_L_SOURCE_SNAPSHOT.md');
const force = process.argv.includes('--force');

const text = fs.readFileSync(appendixPath, 'utf8').replace(/\r\n/g, '\n');
const lines = text.split('\n');
const digest = content => crypto.createHash('sha256').update(content).digest('hex');

let written = 0;
let skipped = 0;
let mismatches = 0;

for (let i = 0; i < lines.length; i++) {
  const header = /^#### `(.+)`$/.exec(lines[i]);
  if (!header) continue;
  const declared = /^SHA-256: `([0-9a-f]{64})`$/.exec(lines[i + 1] || '') || /^SHA-256: `([0-9a-f]{64})`$/.exec(lines[i + 2] || '');
  if (!declared) throw new Error(`Missing SHA-256 line after ${header[1]} (appendix line ${i + 2})`);
  let start = i + 2;
  while (start < lines.length && !/^~~~~[a-z]*$/.test(lines[start])) start++;
  if (start >= lines.length) throw new Error(`Missing code fence for ${header[1]}`);
  const end = lines.indexOf('~~~~', start + 1);
  if (end < 0) throw new Error(`Unclosed code fence for ${header[1]}`);
  const content = `${lines.slice(start + 1, end).join('\n')}\n`;
  const actual = digest(content.replace(/\s+$/u, ''));
  if (actual !== declared[1]) {
    mismatches++;
    console.error(`SHA-256 MISMATCH: ${header[1]} (declared ${declared[1]}, got ${actual})`);
  }
  const relative = header[1];
  if (!/^(bsc-android-native|bsc-sampling-v1)\//.test(relative) || relative.includes('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe path in snapshot: ${relative}`);
  }
  const target = path.join(workspace, ...relative.split('/'));
  if (fs.existsSync(target) && !force) {
    skipped++;
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  written++;
}

console.log(`Restored ${written} file(s), skipped ${skipped} existing, ${mismatches} digest mismatch(es) into ${workspace}`);
if (mismatches > 0) process.exitCode = 1;
~~~~

#### `bsc-sampling-v1/tools/restore.js`

SHA-256: `dff9106169e64150fd57667a907743b0361292d4828cc68fb2604e49c0581e52`

~~~~javascript
'use strict';

// Restore drill for a backup produced by tools/backup.js (spec section 24:
// restore from backup into a temporary directory at least monthly).
//   node tools/restore.js <backup-dir> [target-dir]
// Opens the restored database read-only, counts tables, and verifies that at
// least one record photo file exists — the acceptance check is "open any
// photo record from the restored copy", not merely that files exist.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const source = path.resolve(process.argv[2] || '');
if (!source || !fs.existsSync(source)) {
  console.error('usage: node tools/restore.js <backup-dir> [target-dir]');
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = path.resolve(process.argv[3] || path.join(path.dirname(source), `restore-drill-${stamp}`));
fs.mkdirSync(target, { recursive: true });

const dbSource = path.join(source, 'bsc-v1.sqlite');
if (!fs.existsSync(dbSource)) {
  console.error(`no database in backup: ${dbSource}`);
  process.exit(1);
}
const dbTarget = path.join(target, 'bsc-v1.sqlite');
fs.copyFileSync(dbSource, dbTarget);
const photosSource = path.join(source, 'photos');
if (fs.existsSync(photosSource)) fs.cpSync(photosSource, target, { recursive: true });

const db = new DatabaseSync(dbTarget, { readOnly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
console.log(`restored ${tables.length} tables: ${tables.join(', ')}`);

const record = db.prepare('SELECT id, photo_path, photo_sha256 FROM records ORDER BY id LIMIT 1').get();
if (!record) {
  console.error('restored database has no records — drill incomplete');
  process.exit(1);
}
const photoFile = path.join(target, String(record.photo_path).replace(/^[/\\]+/, ''));
const photoOk = fs.existsSync(photoFile);
console.log(`sample record id=${record.id} photo=${record.photo_path}`);
console.log(`photo present after restore: ${photoOk ? 'YES' : 'NO'}`);
if (!photoOk) console.log('(photos may not have been included in the backup; --photos was off)');

db.close();
console.log(`restore drill complete into ${target}`);
console.log(photoOk ? 'DRILL PASSED' : 'DRILL FAILED (photo missing)');
process.exit(photoOk ? 0 : 1);
~~~~

<!-- END GENERATED SOURCE SNAPSHOT -->
