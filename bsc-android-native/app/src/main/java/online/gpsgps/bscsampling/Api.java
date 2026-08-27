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
  private final Context c; private final Prefs p; private final OkHttpClient h=new OkHttpClient.Builder().connectTimeout(12,TimeUnit.SECONDS).readTimeout(35,TimeUnit.SECONDS).writeTimeout(60,TimeUnit.SECONDS).build();
  Api(Context c){this.c=c.getApplicationContext();p=new Prefs(c);}
  JSONObject activate(String server,String user,String code)throws Exception{JSONObject b=new JSONObject().put("username",user).put("activationToken",code).put("deviceUuid",Util.uuid(c)).put("deviceName",android.os.Build.MANUFACTURER+" "+android.os.Build.MODEL).put("androidVersion",android.os.Build.VERSION.RELEASE).put("appVersion",BuildConfig.VERSION_NAME);return call(Prefs.normalize(server),"POST","/api/v1/mobile/activate",b,"");}
  JSONObject login()throws Exception{return call(p.server(),"POST","/api/v1/mobile/login",new JSONObject().put("username",p.user()).put("deviceUuid",Util.uuid(c)).put("appVersion",BuildConfig.VERSION_NAME),"");}
  JSONObject sync()throws Exception{return auth("GET","/api/v1/mobile/sync",null);} JSONObject start(long id,double lat,double lon,double acc)throws Exception{return auth("POST","/api/v1/mobile/tasks/"+id+"/start",new JSONObject().put("latitude",lat).put("longitude",lon).put("accuracyM",acc));}
  JSONObject tracks(long id,JSONArray a)throws Exception{return auth("POST","/api/v1/mobile/journeys/"+id+"/track",new JSONObject().put("points",a));} JSONObject live(long id,JSONObject b)throws Exception{return auth("POST","/api/v1/mobile/tasks/"+id+"/live",b);} JSONObject record(long id,JSONObject b)throws Exception{return auth("POST","/api/v1/mobile/tasks/"+id+"/record",b);} JSONObject complete(long id)throws Exception{return auth("POST","/api/v1/mobile/journeys/"+id+"/complete",new JSONObject());} JSONObject interrupted(long id)throws Exception{return auth("POST","/api/v1/mobile/journeys/"+id+"/interrupted",new JSONObject());} JSONObject logs(JSONArray a)throws Exception{return auth("POST","/api/v1/mobile/logs",new JSONObject().put("logs",a));}
  String weather(double lat,double lon,String at)throws Exception{String day=at.substring(0,10);String u="https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+"&hourly=temperature_2m,precipitation,weather_code&start_date="+day+"&end_date="+day+"&timezone=auto";try(Response r=h.newCall(new Request.Builder().url(u).build()).execute()){if(!r.isSuccessful()||r.body()==null)return"待补充";JSONObject j=new JSONObject(r.body().string()).optJSONObject("hourly");if(j==null)return"待补充";JSONArray times=j.optJSONArray("time"),temp=j.optJSONArray("temperature_2m"),rain=j.optJSONArray("precipitation"),codes=j.optJSONArray("weather_code");if(times==null||temp==null)return"待补充";long target;try{target=OffsetDateTime.parse(at).toInstant().toEpochMilli();}catch(Exception e){target=System.currentTimeMillis();}int n=0;long best=Long.MAX_VALUE;for(int i=0;i<times.length();i++){try{long x=LocalDateTime.parse(times.optString(i)).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();if(Math.abs(x-target)<best){best=Math.abs(x-target);n=i;}}catch(Exception ignored){}}double t=temp.optDouble(n,Double.NaN);if(Double.isNaN(t))return"待补充";return weatherName(codes==null?-1:codes.optInt(n))+" "+t+"℃，降水 "+(rain==null?0:rain.optDouble(n))+"mm";}}
  private String weatherName(int x){if(x==0)return"晴";if(x<=3&&x>0)return"多云";if(x==45||x==48)return"雾";if(x>=51&&x<=67)return"雨";if(x>=71&&x<=77)return"雪";if(x>=80&&x<=82)return"阵雨";if(x>=95)return"雷暴";return"未知";}
  private JSONObject auth(String m,String path,JSONObject b)throws Exception{return call(p.server(),m,path,b,p.token());}
  private JSONObject call(String server,String method,String path,JSONObject body,String token)throws Exception{Request.Builder q=new Request.Builder().url(server+path).header("Accept","application/json");if(!token.isEmpty())q.header("Authorization","Bearer "+token);if(method.equals("GET"))q.get();else q.method(method,RequestBody.create(body==null?"{}":body.toString(),MediaType.get("application/json; charset=utf-8")));try(Response r=h.newCall(q.build()).execute()){String text=r.body()==null?"":r.body().string();JSONObject j;try{j=text.isEmpty()?new JSONObject():new JSONObject(text);}catch(Exception e){j=new JSONObject().put("message",text);}if(!r.isSuccessful())throw new ApiError(r.code(),j.optString("message","服务器错误"));return j;}catch(IOException e){throw new IOException("无法连接服务器："+e.getMessage(),e);}}
  static final class ApiError extends IOException{final int status;ApiError(int s,String m){super(m);status=s;}}
}
