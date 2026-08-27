package online.gpsgps.bscsampling;

final class QrData {
  final boolean activation; final String server,user,code,token;
  private QrData(boolean a,String s,String u,String c,String t){activation=a;server=s;user=u;code=c;token=t;}
  static QrData parse(String raw){String[] p=raw==null?new String[0]:raw.trim().split("\\|",-1);if(p.length==4&&p[0].equals("BSC-ACT"))return new QrData(true,p[1],p[2],"",p[3]);if(p.length==3&&p[0].equals("BSC-SAMPLE"))return new QrData(false,"","",p[1],p[2]);throw new IllegalArgumentException("不是本系统生成的二维码");}
}
