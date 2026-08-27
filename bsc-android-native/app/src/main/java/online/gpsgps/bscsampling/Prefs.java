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
