package online.gpsgps.bscsampling;

import org.json.JSONObject;

final class Task {
    final JSONObject j;
    final long id;
    Task(JSONObject j) { this.j = j; id = j.optLong("id"); }
    String title() { return j.optString("site_name", "采样点"); }
    String titleBo() { return j.optString("site_name_bo", ""); }
    String instructionsBo() { return j.optString("instructions_bo", ""); }
    String code() { return j.optString("sample_code", ""); }
    String siteCode() { return j.optString("site_code", ""); }
    String sampleType() { return j.optString("sample_type", ""); }
    SampleTypeCatalog.Type typeUi() { return SampleTypeCatalog.get(sampleType()); }
    String plannedDate() { return j.optString("planned_date", "未定日期"); }
    String plannedTime() { return j.optString("planned_time", ""); }
    String villagerName() { return j.optString("villager_name", "采样员"); }
    String primaryVillagerName() { return j.optString("primaryVillagerName", villagerName()); }
    String backupVillagerName() { return j.optString("backupVillagerName", ""); }
    String activeVillagerName() { return j.optString("activeVillagerName", primaryVillagerName()); }
    String finalVillagerName() { return j.optString("finalVillagerName", ""); }
    String viewerRole() { return j.optString("viewerRole", "primary"); }
    int assignmentVersion() { return Math.max(1, j.optInt("assignmentVersion", 1)); }
    boolean canSample() { return !j.has("canSample") || j.optBoolean("canSample"); }
    boolean canTakeover() { return j.optBoolean("canTakeover"); }
    int handoverCount() { return j.optInt("handoverCount", 0); }
    String deviceName() { String s = j.optString("device_name", ""); return s.isEmpty() ? android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL : s; }
    String status() { return j.optString("status", "assigned"); }
    String statusLabel() { return submitted() ? "已采样" : !canSample() ? "查看进度" : status().equals("in_progress") ? "采样中" : "待采样"; }
    String statusBo() { return submitted() ? "དཔེ་ཚད་བླངས་ཟིན།" : !canSample() ? "འཕེལ་རིམ་ལྟ་བ།" : status().equals("in_progress") ? "ལས་ཀ་བྱེད་བཞིན་པ།" : "དཔེ་ཚད་ལེན་རྒྱུ།"; }
    double lat() { return j.optDouble("target_latitude"); }
    double lon() { return j.optDouble("target_longitude"); }
    boolean submitted() { return status().equals("submitted") || j.optString("local_status").equals("queued") || j.optLong("record_id") > 0; }
    boolean canceled() { String s = j.optString("canceled_at"); return !j.isNull("canceled_at") && !s.isEmpty() && !"null".equalsIgnoreCase(s); }
}
