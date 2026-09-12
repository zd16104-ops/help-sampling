package online.gpsgps.bscsampling;

import static org.junit.Assert.*;
import org.junit.Test;

public class SampleTypeCatalogTest {
    @Test public void sevenTypesUsePinnedMaterialSymbols() {
        assertEquals(7, SampleTypeCatalog.size());
        String[][] expected = {
                {"R", "河水", "waves"}, {"T", "支流", "alt_route"},
                {"L", "湖水", "landscape"}, {"Y", "雨水", "rainy"},
                {"S", "土壤", "compost"}, {"P", "植物", "potted_plant"},
                {"G", "地下水", "water_pump"}
        };
        for (String[] row : expected) {
            SampleTypeCatalog.Type type = SampleTypeCatalog.get(row[0]);
            assertEquals(row[1], type.zh);
            assertEquals(row[2], type.icon);
            assertFalse(type.bo.isBlank());
            assertTrue(MaterialSymbols.exists(type.icon));
        }
    }

    @Test public void coreActionsHaveOfflineIcons() {
        for (String name : new String[]{"map", "assignment", "cloud_upload", "person", "sync", "my_location", "arrow_back", "chevron_right", "route", "qr_code_2", "photo_camera", "save", "hourglass_top", "cloud_done", "warning"}) {
            assertTrue(name, MaterialSymbols.exists(name));
        }
    }

    @Test public void unknownTypeUsesSafeBilingualFallback() {
        SampleTypeCatalog.Type type = SampleTypeCatalog.get("X");
        assertEquals("样本", type.zh);
        assertFalse(type.bo.isBlank());
        assertTrue(MaterialSymbols.exists(type.icon));
    }
}
