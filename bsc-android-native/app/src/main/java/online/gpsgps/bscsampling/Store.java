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
