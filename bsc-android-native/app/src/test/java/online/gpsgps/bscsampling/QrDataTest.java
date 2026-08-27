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
