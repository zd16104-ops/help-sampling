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
