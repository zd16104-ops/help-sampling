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
