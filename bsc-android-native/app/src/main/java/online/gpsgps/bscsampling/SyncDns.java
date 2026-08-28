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
