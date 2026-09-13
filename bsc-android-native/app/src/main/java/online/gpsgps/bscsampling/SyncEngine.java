package online.gpsgps.bscsampling;

import android.content.Context;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.nio.file.Files;

final class SyncEngine {
  static final class Result{int tasks,uploaded,errors;String message;boolean deviceRevoked;}
  private final Context c;private final Store d;private final Api a;
  SyncEngine(Context c){this.c=c.getApplicationContext();d=new Store(c);a=new Api(c);}
  Result run(){Result out=new Result();if(!Util.online(c)){out.message="当前离线，数据已保存在手机";d.log("info","SYNC_SKIP_OFFLINE",detail());return out;}d.log("info","SYNC_BEGIN",detail());
    JSONArray t=null;
    try{t=a.sync().optJSONArray("tasks");}
    catch(Exception e){if(isDeviceRevoked(e)){markRevoked(out,e);return out;}boolean auth=e instanceof Api.ApiError&&((Api.ApiError)e).status==401;if(!auth){fail("SYNC_TASKS",e);out.errors++;out.message=e.getMessage();d.log("info","SYNC_END",detail());return out;}
      // 设备已绑定：令牌过期/失效时用已存账号+设备编号静默重新登录（无需再扫码），一次绑定终身免登录。
      try{String tok=new Api(c).login().getString("token");new Prefs(c).token(tok);d.log("info","AUTO_RELOGIN 绑定设备自动重新登录");t=a.sync().optJSONArray("tasks");}
      catch(Exception e2){if(isDeviceRevoked(e2)){markRevoked(out,e2);return out;}fail("SYNC_TASKS",e2);out.errors++;out.message=e2.getMessage();d.log("info","SYNC_END",detail());return out;}}
    if(t!=null){d.tasks(t);out.tasks=t.length();d.log("info","SYNC_TASKS","{\"tasks\":"+t.length()+"}");}
    // 离线开始的行程（含已在本地完成的）都要先补报服务器 start，拿到 serverId 后
    // 轨迹与记录才能上传；旧实现只处理 status='active'，导致离线完成的行程永远卡住。
    for(JSONObject j:d.journeys("server_id IS NULL AND (status='active' OR (status='completed' AND server_done=0))")){try{JSONObject r=a.start(j.optLong("taskId"),j.optDouble("latitude"),j.optDouble("longitude"),j.optDouble("accuracyM"));d.serverJourney(j.optString("localId"),r.getJSONObject("journey").getLong("id"));}catch(Exception e){if(isDeviceRevoked(e)){markRevoked(out,e);return out;}fail("SYNC_START task="+j.optLong("taskId"),e);out.errors++;}}
    for(JSONObject j:d.journeys("server_id IS NOT NULL")){JSONArray points=d.tracks(j.optString("localId"));if(points.length()>0)try{a.tracks(j.optLong("serverId"),points);d.tracksDone(j.optString("localId"),points.optJSONObject(points.length()-1).optInt("sequence"));}catch(Exception e){if(isDeviceRevoked(e)){markRevoked(out,e);return out;}fail("SYNC_TRACK",e);out.errors++;}}
    for(JSONObject p:d.progress()){try{a.progress(p.optLong("taskId"),new JSONArray().put(p.getJSONObject("event")));d.progressResult(p.optString("clientId"),true,null);}catch(Exception e){if(isDeviceRevoked(e)){markRevoked(out,e);return out;}d.progressResult(p.optString("clientId"),false,e.getMessage());fail("SYNC_PROGRESS task="+p.optLong("taskId"),e);out.errors++;}}
    for(JSONObject r:d.records()){try{JSONObject j=d.journey(r.optString("journeyId"));File f=new File(r.optString("photo"));if(!f.isFile())throw new IllegalStateException("本地照片不存在");JSONObject p=r.getJSONObject("payload");if(p.optString("weatherText").isEmpty()||p.optString("weatherText").equals("待补充"))p.put("weatherText","待服务器补充");p.put("journeyId",j!=null&&j.has("serverId")?j.optLong("serverId"):0);p.put("offlineStart",j!=null&&j.optBoolean("offlineStart"));p.put("photoDataUrl","data:image/jpeg;base64,"+Base64.encodeToString(Files.readAllBytes(f.toPath()),Base64.NO_WRAP));a.record(r.optLong("taskId"),p);d.recordResult(r.optString("clientId"),true,null);out.uploaded++;}catch(Exception e){if(isDeviceRevoked(e)){markRevoked(out,e);return out;}if(e instanceof Api.ApiError&&"STALE_ASSIGNMENT".equals(((Api.ApiError)e).code)){d.recordResult(r.optString("clientId"),true,"接管前证据已合并保存，不作为最终记录");d.abort(r.optString("journeyId"));out.uploaded++;d.log("warning","STALE_EVIDENCE_MERGED task="+r.optLong("taskId"));continue;}d.recordResult(r.optString("clientId"),false,e.getMessage());fail("SYNC_RECORD task="+r.optLong("taskId"),e);out.errors++;}}
    for(JSONObject j:d.journeys("status='completed' AND server_id IS NOT NULL AND server_done=0"))try{a.complete(j.optLong("serverId"));d.serverDone(j.optString("localId"));}catch(Exception e){fail("SYNC_COMPLETE",e);out.errors++;}
    try{a.deviceStatus(d.tracksPending(),d.count("status!='uploaded'"),out.errors==0);}catch(Exception e){if(isDeviceRevoked(e)){markRevoked(out,e);return out;}}
    JSONArray logs=d.logs();if(logs.length()>0)try{a.logs(logs);d.logsDone(logs);}catch(Exception ignored){}
    out.message=out.errors==0?"同步完成":"部分数据仍待上传";d.log("info","SYNC_END",detail());return out;}
  // 结构化详情：网络类型、各队列数量、同步结果（规格 §21 诊断日志要求）。
  private String detail(){try{return new JSONObject().put("network",Util.networkType(c)).put("pendingRecords",d.count("status!='uploaded'")).put("pendingTracks",d.tracksPending()).put("pendingLogs",d.logs().length()).put("online",Util.online(c)).toString();}catch(Exception e){return"{}";}}
  private boolean isDeviceRevoked(Exception e){return e instanceof Api.ApiError&&(((Api.ApiError)e).status==403||"DEVICE_REVOKED".equals(((Api.ApiError)e).code)||"VILLAGER_DISABLED".equals(((Api.ApiError)e).code));}
  private void markRevoked(Result out,Exception e){boolean disabled=e instanceof Api.ApiError&&"VILLAGER_DISABLED".equals(((Api.ApiError)e).code);if(disabled)new Prefs(c).disabled();else new Prefs(c).revoked();out.deviceRevoked=true;out.message=disabled?"采样员账号已停用，请联系管理员启用":"本设备已失效，请联系管理员重新激活";d.log("error",disabled?"VILLAGER_DISABLED "+e.getMessage():"DEVICE_REVOKED "+e.getMessage());}
  private void fail(String where,Exception e){String http=e instanceof Api.ApiError?" HTTP"+((Api.ApiError)e).status:"";d.log("error",where+" "+e.getClass().getSimpleName()+":"+e.getMessage()+http);}
}
