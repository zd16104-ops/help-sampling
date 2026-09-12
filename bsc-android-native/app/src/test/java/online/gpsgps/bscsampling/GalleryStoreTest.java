package online.gpsgps.bscsampling;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class GalleryStoreTest {
    @Test
    public void displayNameIsDeterministicAndSafeForGallery() {
        String id = "12345678-1234-1234-1234-123456789abc";
        assertEquals("BSC-260901_P_01-12345678.jpg",
                GalleryStore.displayName("260901/P/01", id));
        assertEquals(GalleryStore.displayName("采样点", id),
                GalleryStore.displayName("采样点", id));
    }
}
