package online.gpsgps.bscsampling;

import android.graphics.Color;
import android.text.Spannable;
import android.text.SpannableStringBuilder;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.widget.TextView;

/** Central Tibetan-primary, Chinese-secondary presentation helper. */
final class Bilingual {
    private static final int SECONDARY = Color.rgb(85, 112, 109);

    private Bilingual() {}

    static CharSequence text(String bo, String zh) {
        return text(bo, zh, SECONDARY);
    }

    private static CharSequence text(String bo, String zh, int secondaryColor) {
        String primary = bo == null || bo.isBlank() ? "བོད་ཡིག་ཁ་སྐོང་དགོས།" : bo.trim();
        String secondary = zh == null ? "" : zh.trim();
        SpannableStringBuilder value = new SpannableStringBuilder(primary);
        if (!secondary.isEmpty()) {
            int start = value.length();
            value.append('\n').append(secondary);
            value.setSpan(new RelativeSizeSpan(0.72f), start, value.length(), Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
            value.setSpan(new ForegroundColorSpan(secondaryColor), start, value.length(), Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        return value;
    }

    static void apply(TextView view, String bo, String zh) {
        int secondary = view instanceof com.google.android.material.button.MaterialButton
                ? Color.rgb(216, 243, 235) : SECONDARY;
        view.setText(text(bo, zh, secondary));
        view.setLineSpacing(0f, 1.18f);
        view.setContentDescription((bo == null ? "" : bo) + "，" + (zh == null ? "" : zh));
    }

    static void applyOnColor(TextView view, String bo, String zh) {
        view.setText(text(bo, zh, Color.rgb(216, 243, 235)));
        view.setLineSpacing(0f, 1.18f);
        view.setContentDescription((bo == null ? "" : bo) + "，" + (zh == null ? "" : zh));
    }

    static String inline(String bo, String zh) {
        return (bo == null || bo.isBlank() ? "བོད་ཡིག་ཁ་སྐོང་དགོས།" : bo.trim()) + " / " + (zh == null ? "" : zh.trim());
    }
}
