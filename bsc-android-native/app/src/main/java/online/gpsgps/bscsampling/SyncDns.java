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

// 移动网络下运营商 DNS 经常解析不了 bsc.gpsgps.online（日志里出现
// "Unable to resolve host"），导致手机在 4G/5G 下无法同步。
// 这里先走阿里公共 DNS over HTTPS（223.5.5.5，IP 直连不依赖运营商 DNS），
// 失败再回退系统 DNS；两种都失败才报域名无法解析。
final class SyncDns implements Dns {
  private static final String DOH = "https://223.5.5.5/resolve?name=%s&type=A";
  private static final OkHttpClient dohClient = new OkHttpClient.Builder()
      .connectTimeout(8, TimeUnit.SECONDS).readTimeout(8, TimeUnit.SECONDS).build();

  @Override public List<InetAddress> lookup(String host) throws UnknownHostException {
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
    } catch (Exception ignored) { /* 回退系统 DNS */ }
    return Dns.SYSTEM.lookup(host);
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
