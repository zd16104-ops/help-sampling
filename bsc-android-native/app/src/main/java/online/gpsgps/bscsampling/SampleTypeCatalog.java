package online.gpsgps.bscsampling;

import android.graphics.drawable.Drawable;
import java.util.LinkedHashMap;
import java.util.Map;

/** One source of truth for the seven sample types used by APP, server and labels. */
final class SampleTypeCatalog {
    static final class Type {
        final String code, bo, zh, icon;
        final int color;
        Type(String code, String bo, String zh, String icon, int color) {
            this.code = code; this.bo = bo; this.zh = zh; this.icon = icon; this.color = color;
        }
        CharSequence label() { return Bilingual.text(bo, zh); }
        String inline() { return Bilingual.inline(bo, zh); }
        Drawable drawable() { return MaterialSymbols.drawable(icon, color); }
    }

    private static final Map<String, Type> TYPES = new LinkedHashMap<>();
    static {
        add("R", "ཆུ་བོའི་ཆུ།", "河水", "waves", 0xff1976d2);
        add("T", "ཆུ་ལག", "支流", "alt_route", 0xff00897b);
        add("L", "མཚོ་ཆུ།", "湖水", "landscape", 0xff0288d1);
        add("Y", "ཆར་ཆུ།", "雨水", "rainy", 0xff5e35b1);
        add("S", "ས་རྒྱུ།", "土壤", "compost", 0xff795548);
        add("P", "རྩི་ཤིང་།", "植物", "potted_plant", 0xff2e7d32);
        add("G", "ས་འོག་ཆུ།", "地下水", "water_pump", 0xff006994);
    }
    private SampleTypeCatalog() {}
    private static void add(String code, String bo, String zh, String icon, int color) {
        TYPES.put(code, new Type(code, bo, zh, icon, color));
    }
    static Type get(String code) { return TYPES.getOrDefault(code, new Type(code, "དཔེ་ཚད།", "样本", "waves", 0xff444444)); }
    static int size() { return TYPES.size(); }
}
